// Worktrunk runs start in the background and captures its output in the hook log.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const [action, worktree, primary] = process.argv.slice(2);
if (!["start", "stop"].includes(action) || !worktree || !primary) {
  console.error("Usage: worktree-dev-server.mjs <start|stop> <worktree-path> <primary-path>");
  process.exit(2);
}
const pidFile = resolve(primary, ".worktrees/.dev-servers", `${basename(worktree)}.pid`);
let group;
try { group = Number(readFileSync(pidFile, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }

if (action === "start") {
  if (group) {
    try {
      process.kill(-group, 0);
      console.log(`Watcher already running for ${worktree}`);
      process.exit(0);
    } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  mkdirSync(dirname(pidFile), { recursive: true });
  const server = spawn("pnpm", ["dev"], { cwd: worktree, stdio: "inherit", detached: true });
  const cleanup = () => rmSync(pidFile, { force: true });
  server.on("error", (error) => { cleanup(); console.error(error); process.exit(1); });
  if (server.pid) writeFileSync(pidFile, String(server.pid));
  server.on("exit", (code) => { cleanup(); process.exit(code ?? 0); });
} else if (group) {
  try { process.kill(-group, "SIGTERM"); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
  rmSync(pidFile, { force: true });
}
