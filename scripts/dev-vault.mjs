import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { samplePdf } from "./sample-pdf.mjs";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const vaultName = `Reader Plugin Dev - ${basename(root)}`;
export const vaultPath = join(root, ".dev-vault", vaultName);
export const pluginPath = join(vaultPath, ".obsidian", "plugins", "reader-plugin");

async function seed(relativePath, content) {
  const destination = join(vaultPath, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  try { await writeFile(destination, content, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
}

export async function setupVault() {
  await mkdir(pluginPath, { recursive: true });
  await seed(".obsidian/app.json", JSON.stringify({ legacyEditor: false }, null, 2));
  await seed(".obsidian/community-plugins.json", '["reader-plugin"]\n');
  await seed(".obsidian/core-plugins.json", '["file-explorer", "global-search", "switcher", "command-palette", "outline"]\n');
  await seed("Welcome.md", `# Reader Plugin development\n\nThis is a disposable vault for ${basename(root)}. Keep personal books and notes in your own vault.\n\nOpen the command palette and run **Reader Plugin: Check development setup**.\n\nOpen [[Books/Sample book]], select a passage in editing mode, then run **Reader Plugin: Inspect reading context**.\n\nAfter a rebuild, disable and enable Reader Plugin in Settings → Community plugins, or run the Obsidian CLI plugin:reload command described in the project README.\n\n[[Notes/Sample reading note]]\n`);
  await seed("Books/Sample reading book.pdf", samplePdf());
  await seed("Books/Sample book.md", "---\ntitle: Sample book\nauthor: Development fixture\n---\n\n# Sample book\n\n## Chapter 1\n\nA reader stops at a passage and writes a question in the margin. The question connects the author's argument to an experience from the reader's own life.\n\n## Chapter 2\n\nGood reading notes preserve the passage, its location, and the reader's interpretation. A citation should bring the reader back to the evidence.\n");
  await seed("Notes/Sample reading note.md", "# Sample reading note\n\nSource: [[Books/Sample book#Chapter 2]]\n\nQuestion: How do source locations make reading notes useful?\n\nThis fixture is original development text.\n");
  return vaultPath;
}

export async function deployPlugin() {
  await setupVault();
  for (const name of ["main.js", "manifest.json", "styles.css"]) {
    await copyFile(join(root, name), join(pluginPath, name));
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
