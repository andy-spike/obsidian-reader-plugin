// Install only the public release assets in a fresh disposable vault, then run the full workflow suite.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { root } from "./dev-vault.mjs";

const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const bundle = await readFile(join(root, "main.js"), "utf8");
for (const text of ["check-development-setup", "inspect-reading-context", ".dev-reload"]) {
  assert.ok(!bundle.includes(text), `Production bundle contains development code: ${text}`);
}
const wasmLicenses = ["pdfjs-openjpeg", "openjpeg", "pdfjs-jbig2", "jbig2", "pdfjs-qcms", "qcms"].map(name => `docs/licenses/pdfjs-wasm/${name}.txt`);
for (const file of ["LICENSE", "docs/licenses/pdfjs.txt", "docs/licenses/pdfjs-notice.txt", ...wasmLicenses, "docs/licenses/svelte.txt", "docs/licenses/clsx.txt", "docs/licenses/esm-env.txt"]) {
  assert.ok(bundle.includes(await readFile(join(root, file), "utf8")), `Missing bundled license: ${file}`);
}
// Reviewers see inline WebAssembly in main.js. Prove it is exactly PDF.js's published decoders.
for (const file of ["openjpeg.wasm", "jbig2.wasm", "qcms_bg.wasm"]) {
  const base64 = (await readFile(join(root, "node_modules/pdfjs-dist/wasm", file))).toString("base64");
  assert.ok(bundle.includes(`"${base64}"`), `main.js does not embed the pdfjs-dist copy of ${file}`);
}

await mkdir(join(root, ".dev-vault"), { recursive: true });
const vaultPath = await mkdtemp(join(root, ".dev-vault", "release-check-"));
const config = join(vaultPath, ".obsidian");
const pluginPath = join(config, "plugins", manifest.id);
await mkdir(pluginPath, { recursive: true });
const assets = ["main.js", "manifest.json", "styles.css"];
for (const file of assets) await copyFile(join(root, file), join(pluginPath, file));
assert.deepEqual((await readdir(pluginPath)).sort(), assets.sort());
await writeFile(join(config, "community-plugins.json"), JSON.stringify([manifest.id]));
await writeFile(join(config, "core-plugins.json"), JSON.stringify(["file-explorer", "global-search", "switcher", "command-palette", "outline"]));
await writeFile(join(config, "app.json"), JSON.stringify({ legacyEditor: false }));

const env = { ...process.env, READING_DESK_TEST_VAULT: vaultPath };
const headless = (...args) => execFileSync(process.execPath, [join(root, "scripts/headless.mjs"), ...args], { cwd: root, env, encoding: "utf8", timeout: 60000 });
console.log(`Clean release installation: ${vaultPath}`);
try {
  headless("start");
  const state = JSON.parse(headless("eval", `JSON.stringify({version: app.plugins.plugins[${JSON.stringify(manifest.id)}].manifest.version, commands: Object.keys(app.commands.commands).filter(id => /check-development-setup|inspect-reading-context/.test(id))})`));
  assert.equal(state.version, manifest.version);
  assert.deepEqual(state.commands, []);
  execFileSync(process.execPath, [join(root, "scripts/e2e.mjs")], { cwd: root, env, stdio: "inherit" });
  console.log(`Release ${manifest.version} passed clean-install and workflow verification.`);
} finally {
  process.stdout.write(headless("stop"));
}
