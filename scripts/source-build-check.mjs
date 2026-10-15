// Reproduce the directory scanner's source archive, which has no Git metadata or installed dependencies.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = await mkdtemp(join(tmpdir(), "reading-desk-source-"));
const inputs = ["src", "scripts", "tests", "docs", "licenses", "contributing", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "manifest.json", "versions.json", "styles.css", "LICENSE", "esbuild.config.mjs", "eslint.config.mjs", "tsconfig.json"];
try {
  for (const input of inputs) await cp(join(root, input), join(directory, input), { recursive: true });
  for (const args of [["install", "--frozen-lockfile"], ["build"]]) {
    execFileSync("pnpm", args, { cwd: directory, stdio: "inherit" });
  }
  const files = await readdir(directory);
  assert.ok(!files.includes(".git"));
  assert.ok(!files.includes(".dev-vault"), "Production build must not create a development vault");
  assert.deepEqual(await readFile(join(directory, "main.js")), await readFile(join(root, "main.js")), "Source-archive build must reproduce the release bundle");
  console.log("Source-archive build passed without Git metadata or development-vault access.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
