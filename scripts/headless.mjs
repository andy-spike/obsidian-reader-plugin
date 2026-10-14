// Runs a private, windowless Obsidian on this checkout's development vault and drives it over the Chrome DevTools Protocol.
// It never opens a window, so checks don't take focus from the desktop or touch the Obsidian you are using.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, openSync } from "node:fs";
import { copyFile, link, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { root, setupVault, vaultPath } from "./dev-vault.mjs";

const dataDir = join(root, ".dev-vault", "headless-obsidian");
const pidFile = join(dataDir, "headless.pid");
const WIDTH = 1600, HEIGHT = 1000;

const USAGE = `Usage: pnpm headless <command>

  start                  Launch the windowless Obsidian on this checkout's dev vault (no-op if running)
  stop                   Quit it
  status                 Show whether it is running
  reload                 Reload Reader Plugin after a build
  eval <expression>      Evaluate JavaScript in Obsidian (awaits promises) and print the result
  screenshot <file.png>  Save a screenshot
  hover <target>         Move the pointer to a CSS selector or x,y (real events: tooltips and :hover work)
  click <target>         Click a CSS selector or x,y
  drag <from> <to>       Press at one target, move to the other in small steps, and release
  press <key>            Press a key, such as Escape, Enter, ArrowDown, a, or Shift+Enter
  type <text>            Insert text at the focus

Add --window=<text> to target a window whose title contains <text>, such as --window=Settings.
Set OBSIDIAN_APP to the Obsidian executable or AppImage if it is not found automatically.`;

const args = process.argv.slice(2);
const windowArg = args.find(arg => arg.startsWith("--window="))?.slice("--window=".length);
const [command, ...rest] = args.filter(arg => !arg.startsWith("--window="));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function findObsidian() {
  const candidates = [
    process.env.OBSIDIAN_APP,
    join(homedir(), "AppImages", "obsidian.appimage"),
    join(homedir(), "Applications", "Obsidian.AppImage"),
    "/opt/Obsidian/obsidian",
    "/opt/obsidian/obsidian",
    "/usr/lib/obsidian/obsidian",
    "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  ].filter(Boolean);
  const found = candidates.find(path => existsSync(path));
  if (!found) throw new Error(`Could not find Obsidian. Set OBSIDIAN_APP to its executable or AppImage.\nTried: ${candidates.join(", ")}`);
  return found;
}

async function running() {
  try {
    const pid = Number(await readFile(pidFile, "utf8"));
    process.kill(pid, 0);
    const port = Number((await readFile(join(dataDir, "DevToolsActivePort"), "utf8")).split("\n")[0]);
    return port ? { pid, port } : null;
  } catch { return null; }
}

/** Obsidian installs app updates into its data folder. Sharing the newest one from the everyday install keeps both on the same version.
 * Obsidian skips symbolic links there, so it is hard-linked, or copied across file systems. */
async function linkLatestApp() {
  const config = process.platform === "darwin" ? join(homedir(), "Library", "Application Support", "obsidian") : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "obsidian");
  const version = name => (name.match(/^obsidian-(\d+)\.(\d+)\.(\d+)\.asar$/) ?? []).slice(1).map(Number);
  const newer = (a, b) => { for (let i = 0; i < 3; i++) if (version(a)[i] !== version(b)[i]) return version(a)[i] > version(b)[i] ? a : b; return a; };
  const asars = (await readdir(config).catch(() => [])).filter(name => version(name).length === 3);
  if (!asars.length) return;
  const latest = asars.reduce(newer);
  for (const name of await readdir(dataDir)) if (version(name).length === 3 && name !== latest) await rm(join(dataDir, name), { force: true });
  if (!existsSync(join(dataDir, latest))) await link(join(config, latest), join(dataDir, latest)).catch(() => copyFile(join(config, latest), join(dataDir, latest)));
}

async function start() {
  const existing = await running();
  if (existing) return existing;
  await setupVault();
  await mkdir(dataDir, { recursive: true });
  await rm(join(dataDir, "DevToolsActivePort"), { force: true });
  // A separate data folder makes this its own Obsidian, with only the development vault registered and open.
  const id = createHash("sha256").update(vaultPath).digest("hex").slice(0, 16);
  await writeFile(join(dataDir, "obsidian.json"), JSON.stringify({ vaults: { [id]: { path: vaultPath, ts: Date.now(), open: true } } }));
  await linkLatestApp();
  const log = openSync(join(dataDir, "obsidian.log"), "a");
  const child = spawn(findObsidian(), [
    "--no-sandbox", "--ozone-platform=headless", `--user-data-dir=${dataDir}`, "--remote-debugging-port=0",
  ], { detached: true, stdio: ["ignore", log, log] });
  child.unref();
  await writeFile(pidFile, String(child.pid));
  let state = null;
  for (let i = 0; i < 100 && !state; i++) { await wait(200); state = await running(); }
  if (!state) throw new Error(`Obsidian did not start. See ${join(dataDir, "obsidian.log")}.`);
  // The first launch asks whether to trust the vault's plugins. This vault is the project's own fixture.
  const ready = `(async () => {
    for (let i = 0; i < 150; i++) {
      document.querySelectorAll(".modal button").forEach(button => { if (button.textContent.includes("Trust author")) button.click(); });
      if (window.app?.workspace?.layoutReady && app.plugins.plugins["reader-plugin"]) {
        require("@electron/remote").getCurrentWindow().setSize(${WIDTH}, ${HEIGHT});
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  })()`;
  // Accepting the prompt reloads the window, which drops the connection; try again until the plugin is loaded.
  for (let attempt = 0; attempt < 5; attempt++) {
    const ok = await withPage(state.port, page => page.evaluate(ready)).catch(() => false);
    if (ok) return state;
    await wait(1000);
  }
  throw new Error(`Obsidian started, but Reader Plugin did not load. See ${join(dataDir, "obsidian.log")}.`);
}

async function stop() {
  const state = await running();
  if (!state) return false;
  try { process.kill(-state.pid); } catch { process.kill(state.pid); }
  await rm(pidFile, { force: true });
  return true;
}

/** Connects to the main window, or the one whose title contains --window. Settings opens in its own window. */
async function withPage(port, use) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pages = targets.filter(target => target.type === "page");
  const target = windowArg ? pages.find(page => page.title.includes(windowArg)) : pages.find(page => !page.title.startsWith("Settings")) ?? pages[0];
  if (!target) throw new Error(windowArg ? `No window title contains "${windowArg}". Open: ${pages.map(page => page.title).join(", ")}` : "Obsidian has no window yet.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let next = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  socket.addEventListener("close", () => pending.forEach(resolve => resolve({ error: { message: "The window closed or reloaded." } })));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++next, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  /** A CSS selector resolves to the center of the first match; "x,y" is used as is. */
  const point = async target => {
    const match = target.match(/^(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)$/);
    if (match) return { x: Number(match[1]), y: Number(match[2]) };
    const box = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(target)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!box) throw new Error(`Nothing matches ${target}`);
    return box;
  };
  try {
    return await use({ send, evaluate, point });
  } finally {
    socket.close();
  }
}

const KEYS = { Escape: 27, Enter: 13, Tab: 9, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, PageUp: 33, PageDown: 34, Home: 36, End: 35, " ": 32 };

async function drive(state) {
  const [argument] = rest;
  return withPage(state.port, async ({ send, evaluate, point }) => {
    switch (command) {
      case "reload":
        await evaluate(`(async () => { await app.plugins.disablePlugin("reader-plugin"); await app.plugins.enablePlugin("reader-plugin"); })()`);
        return "Reloaded Reader Plugin.";
      case "eval": {
        const value = await evaluate(argument);
        return typeof value === "string" ? value : JSON.stringify(value, null, 2);
      }
      case "screenshot": {
        if (!argument) throw new Error("Give a file path for the screenshot.");
        const { data } = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(argument, Buffer.from(data, "base64"));
        return argument;
      }
      case "hover": case "click": {
        const { x, y } = await point(argument);
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        if (command === "click") for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
        return `${command === "click" ? "Clicked" : "Hovering"} at ${Math.round(x)},${Math.round(y)}`;
      }
      case "drag": {
        const from = await point(argument), to = await point(rest[1] ?? "");
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
          await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, button: "left", buttons: 1 });
          await wait(16);
        }
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 });
        return `Dragged from ${Math.round(from.x)},${Math.round(from.y)} to ${Math.round(to.x)},${Math.round(to.y)}`;
      }
      case "press": {
        // "Shift+Enter" or "Ctrl+a": modifiers before the key, joined with +.
        const parts = argument.split(/\+(?=.)/);
        const key = parts.pop();
        const modifiers = parts.reduce((bits, name) => bits | ({ Alt: 1, Ctrl: 2, Control: 2, Meta: 4, Cmd: 4, Shift: 8 }[name] ?? 0), 0);
        const code = KEYS[key] ?? key.toUpperCase().charCodeAt(0);
        const text = modifiers & ~8 ? undefined : key.length === 1 ? key : key === "Enter" ? "\r" : undefined;
        await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, windowsVirtualKeyCode: code, text, modifiers });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code, modifiers });
        return `Pressed ${argument}`;
      }
      case "type":
        await send("Input.insertText", { text: argument ?? "" });
        return "Typed";
    }
  });
}

try {
  if (command === "start") {
    const { pid, port } = await start();
    console.log(`Headless Obsidian is running on ${vaultPath} (pid ${pid}, DevTools port ${port}).`);
  } else if (command === "stop") {
    console.log(await stop() ? "Stopped headless Obsidian." : "Headless Obsidian was not running.");
  } else if (command === "status") {
    const state = await running();
    console.log(state ? `Running (pid ${state.pid}, DevTools port ${state.port}).` : "Not running.");
  } else if (["reload", "eval", "screenshot", "hover", "click", "drag", "press", "type"].includes(command)) {
    console.log(await drive(await start()));
  } else {
    console.log(USAGE);
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
