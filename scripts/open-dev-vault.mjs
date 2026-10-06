import { spawnSync } from "node:child_process";
import { setupVault, vaultPath } from "./dev-vault.mjs";

await setupVault();
console.log(`Development vault: ${vaultPath}`);
console.log("For a new checkout, first register this folder with Obsidian's Open folder as vault. The URI opens it once registered.");
const result = spawnSync("xdg-open", [`obsidian://open?path=${encodeURIComponent(vaultPath)}`], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
