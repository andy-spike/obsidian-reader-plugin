import { spawnSync } from "node:child_process";
import { setupVault, vaultPath } from "./dev-vault.mjs";

await setupVault();
console.log(`Development vault: ${vaultPath}`);
const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
const result = spawnSync(opener, [`obsidian://open?vault=${encodeURIComponent(vaultPath)}`], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
