import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { FileSystemAdapter, MarkdownView, Notice, Platform, Plugin } from "obsidian";

/** Development diagnostics and rebuild watching are excluded from production bundles. */
export function setupDevelopment(plugin: Plugin): void {
  plugin.addCommand({
    id: "check-development-setup",
    name: "Check development setup",
    callback: () => {
      new Notice("Reading Desk is loaded. The development setup is ready.");
    },
  });

  plugin.addCommand({
    id: "inspect-reading-context",
    name: "Inspect reading context",
    checkCallback: (checking) => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file) return false;
      if (!checking) {
        const selection = view.editor.getSelection();
        new Notice(
          selection
            ? `${view.file.basename}: selected ${selection.length} characters.`
            : `${view.file.basename}: select a passage to inspect reading context.`,
        );
      }
      return true;
    },
  });
  const adapter = plugin.app.vault.adapter;
  if (!Platform.isDesktopApp || !(adapter instanceof FileSystemAdapter) || !plugin.manifest.dir) return;
  const folder = join(adapter.getBasePath(), plugin.manifest.dir);
  if (!existsSync(join(folder, ".dev-reload"))) return;
  const plugins = (plugin.app as unknown as { plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<boolean> } }).plugins;
  const id = plugin.manifest.id;
  let timer: number | undefined;
  // A build copies several files; reload once they have all landed.
  const watcher = watch(folder, (_, name) => {
    if (name !== "main.js" && name !== "styles.css" && name !== "manifest.json") return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void plugins.disablePlugin(id).then(() => plugins.enablePlugin(id)), 300);
  });
  plugin.register(() => { window.clearTimeout(timer); watcher.close(); });
}
