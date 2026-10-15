import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { seedDevelopmentBook } from "./dev-book.mjs";

import { samplePdf } from "./sample-pdf.mjs";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const vaultName = `Reader Plugin Dev - ${basename(root)}`;
export const vaultPath = join(root, ".dev-vault", vaultName);
export const pluginPath = join(vaultPath, ".obsidian", "plugins", "reading-desk");
/** The headless Obsidian keeps its own configuration folder, so its tabs and plugin settings stay out of the everyday one. */
export const headlessConfig = ".obsidian-headless";

async function seed(relativePath, content) {
  const destination = join(vaultPath, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  try { await writeFile(destination, content, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
}

async function configurePlugin(configDir) {
  const folder = join(vaultPath, configDir);
  const destination = join(folder, "plugins", "reading-desk");
  await mkdir(destination, { recursive: true });
  // Preserve settings from before the public name was chosen, without replacing newer settings.
  try {
    await copyFile(join(folder, "plugins", "reader-plugin", "data.json"), join(destination, "data.json"), constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "EEXIST") throw error;
  }
  const enabledPath = join(folder, "community-plugins.json");
  let enabled;
  try { enabled = JSON.parse(await readFile(enabledPath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; enabled = []; }
  const plugins = [...new Set([...enabled.filter(id => id !== "reader-plugin"), "reading-desk"])];
  await writeFile(enabledPath, `${JSON.stringify(plugins)}\n`);
}

export async function setupVault() {
  await mkdir(pluginPath, { recursive: true });
  await seed(".obsidian/app.json", JSON.stringify({ legacyEditor: false }, null, 2));
  await configurePlugin(".obsidian");
  if (await access(join(vaultPath, headlessConfig)).then(() => true, () => false)) await configurePlugin(headlessConfig);
  await seed(".obsidian/core-plugins.json", '["file-explorer", "global-search", "switcher", "command-palette", "outline"]\n');
  await seed("Welcome.md", `# Reading Desk development\n\nThis is a disposable vault for ${basename(root)}. Keep personal books and notes in your own vault.\n\nOpen the command palette and run **Reading Desk: Check development setup**.\n\nOpen [[Books/Sample book]], select a passage in editing mode, then run **Reading Desk: Inspect reading context**.\n\nReading Desk reloads itself after each build. If it has an older build loaded, disable and enable it once in Settings → Community plugins.\n\n[[Notes/Sample reading note]]\n`);
  await seed("Books/Sample reading book.pdf", samplePdf());
  await seed("Books/Sample book.md", "---\ntitle: Sample book\nauthor: Development fixture\n---\n\n# Sample book\n\n## Chapter 1\n\nA reader stops at a passage and writes a question in the margin. The question connects the author's argument to an experience from the reader's own life.\n\n## Chapter 2\n\nGood reading notes preserve the passage, its location, and the reader's interpretation. A citation should bring the reader back to the evidence.\n");
  await seed("Notes/Sample reading note.md", "# Sample reading note\n\nSource: [[Books/Sample book#Chapter 2]]\n\nQuestion: How do source locations make reading notes useful?\n\nThis fixture is original development text.\n");
  await seedDevelopmentBook(root, vaultPath);
  return vaultPath;
}

export async function deployPlugin() {
  await setupVault();
  const targets = [pluginPath];
  const headless = join(vaultPath, headlessConfig, "plugins", "reading-desk");
  if (await access(join(vaultPath, headlessConfig)).then(() => true, () => false)) targets.push(headless);
  for (const target of targets) {
    await mkdir(target, { recursive: true });
    for (const name of ["main.js", "manifest.json", "styles.css"]) await copyFile(join(root, name), join(target, name));
    // Tells the plugin it is a development copy, so it reloads itself after each build.
    await writeFile(join(target, ".dev-reload"), "");
  }
  console.log(`Plugin deployed to ${pluginPath}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await setupVault();
  try {
    await readFile(join(root, "main.js"));
    await deployPlugin();
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  console.log(`Development vault: ${vaultPath}`);
}
