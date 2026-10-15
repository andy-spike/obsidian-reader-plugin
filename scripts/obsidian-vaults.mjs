// Reads and extends the everyday Obsidian's list of known vaults, obsidian.json in its data folder.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The everyday Obsidian's data folder, which holds obsidian.json and downloaded app updates. */
export function obsidianConfigDir() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "obsidian");
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "obsidian");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "obsidian");
}

const vaultListPath = () => join(obsidianConfigDir(), "obsidian.json");

async function readVaultList() {
  try { return JSON.parse(await readFile(vaultListPath(), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

/** Obsidian's ID for the vault at this folder, or null when Obsidian doesn't know the folder yet. */
export async function findVaultId(vaultPath) {
  const { vaults = {} } = await readVaultList();
  const target = resolve(vaultPath);
  return Object.keys(vaults).find(id => vaults[id]?.path && resolve(vaults[id].path) === target) ?? null;
}

/**
 * Adds a folder to obsidian.json and returns its new ID. Only safe while Obsidian is closed:
 * a running Obsidian keeps the list in memory and overwrites the file on its next change.
 */
export async function addVaultWhileObsidianIsClosed(vaultPath) {
  const vaultList = await readVaultList();
  // Obsidian's own vault IDs are 16 random hexadecimal characters.
  const id = randomBytes(8).toString("hex");
  vaultList.vaults = { ...vaultList.vaults, [id]: { path: resolve(vaultPath), ts: Date.now() } };
  await mkdir(obsidianConfigDir(), { recursive: true });
  const temporaryPath = `${vaultListPath()}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(vaultList));
  await rename(temporaryPath, vaultListPath());
  return id;
}
