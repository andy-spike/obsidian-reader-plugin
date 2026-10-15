// Opens this checkout's development vault in the everyday Obsidian, adding it to Obsidian's vault list the first time.
// Obsidian only opens vaults it already knows, and a new worktree's vault is always unknown.
import { spawnSync } from "node:child_process";
import { setupVault, vaultPath } from "./dev-vault.mjs";
import { addVaultWhileObsidianIsClosed, findVaultId } from "./obsidian-vaults.mjs";

const OPEN_FOLDER_STEPS = `Add it once by hand: in Obsidian, open the vault switcher at the bottom left, choose "Manage vaults…",
then "Open folder as vault", and pick:
  ${vaultPath}`;

/** Hands an obsidian:// URI to the system, which starts Obsidian if needed. Returns the exit status. */
function openUri(uri) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
  const result = spawnSync(opener, [uri], { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/**
 * Asks the running Obsidian to open the folder as a vault. This is the request its own "Open folder as vault"
 * button makes, and Obsidian adds the folder to its vault list. The official CLI runs it in the most recently
 * focused vault window.
 */
function openFolderInRunningObsidian() {
  const code = `require("electron").ipcRenderer.sendSync("vault-open", ${JSON.stringify(vaultPath)}, false)`;
  const result = spawnSync("obsidian", ["eval", `code=${code}`], { encoding: "utf8", timeout: 30_000 });
  if (result.error?.code === "ENOENT") return { outcome: "failed", reason: "The Obsidian CLI (`obsidian`) is not installed or not on PATH." };
  if (result.error) return { outcome: "failed", reason: `The Obsidian CLI failed: ${result.error.message}` };
  const output = `${result.stdout}${result.stderr}`.trim();
  if (/unable to find Obsidian|unable to connect to main process/i.test(output)) return { outcome: "obsidian-closed" };
  if (output === "=> true") return { outcome: "opened" };
  return { outcome: "failed", reason: `Obsidian did not open the folder. The CLI replied: ${output || "(nothing)"}` };
}

await setupVault();
console.log(`Development vault: ${vaultPath}`);

const knownId = await findVaultId(vaultPath);
if (knownId) process.exit(openUri(`obsidian://open?vault=${knownId}`));

const attempt = openFolderInRunningObsidian();
if (attempt.outcome === "opened") {
  console.log("Added the vault to Obsidian and opened it.");
  process.exit(0);
}
if (attempt.outcome === "obsidian-closed") {
  const newId = await addVaultWhileObsidianIsClosed(vaultPath);
  console.log("Obsidian is closed, so the vault was added to its vault list directly. Opening it now.");
  process.exit(openUri(`obsidian://open?vault=${newId}`));
}
console.error(`${attempt.reason}\n${OPEN_FOLDER_STEPS}\nAfter that, \`pnpm dev:open\` opens it directly.`);
process.exit(1);
