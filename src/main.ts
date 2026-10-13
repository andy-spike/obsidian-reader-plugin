import { MarkdownView, Notice, Plugin, TFile, FuzzySuggestModal, PluginSettingTab, Setting, App } from "obsidian";

import { AnnotationStore, COLORS, HighlightColor } from "./annotations";
import { ReaderView, READER_VIEW } from "./reader-view";
import { stopPdfWorker } from "./pdf-engine";

export default class ReaderPlugin extends Plugin {
  labels: Record<HighlightColor, string> = { yellow: "Yellow", green: "Green", blue: "Blue", pink: "Pink" };
  async onload(): Promise<void> {
    const saved = await this.loadData();
    for (const color of COLORS) if (typeof saved?.labels?.[color] === "string") this.labels[color] = saved.labels[color];
    const store = new AnnotationStore(this.app.vault.adapter);
    const refresh = () => this.app.workspace.getLeavesOfType(READER_VIEW).forEach(leaf => (leaf.view as ReaderView).refreshAnnotations());
    this.registerView(READER_VIEW, leaf => new ReaderView(leaf, store, refresh, () => this.labels));
    this.addSettingTab(new ReaderSettings(this.app, this));
    const open = async (file: TFile, page = 1) => {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: READER_VIEW, state: { file: file.path } });
      await this.app.workspace.revealLeaf(leaf);
      if (page !== 1) await (leaf.view as ReaderView).showPage(page);
    };
    this.addCommand({ id: "open-pdf-reader", name: "Open PDF in Reader", callback: () => {
      const active = this.app.workspace.getActiveFile();
      if (active?.extension === "pdf") void open(active);
      else new PdfPicker(this.app, file => void open(file)).open();
    }});
    for (const withComment of [false, true]) this.addCommand({
      id: withComment ? "highlight-with-comment" : "highlight-selection",
      name: withComment ? "Highlight selected PDF passage with comment" : "Highlight selected PDF passage",
      checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(ReaderView);
        if (!view) return false;
        if (!checking) view.addHighlight(withComment);
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFile && file.extension === "pdf") menu.addItem(item => item.setTitle("Open in Reader").setIcon("book-open").onClick(() => void open(file)));
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      void store.rename(oldPath, file.path).catch(error => new Notice(`Could not update annotation source: ${error.message}`));
    }));
    this.registerObsidianProtocolHandler("reader-plugin", async params => {
      try {
        const record = await store.find(params.document ?? "");
        const file = record && this.app.vault.getAbstractFileByPath(record.sourcePath);
        if (!(file instanceof TFile)) { new Notice("The annotated PDF could not be found in this vault."); return; }
        await open(file, Number(params.page) || 1);
      } catch (error) { new Notice(`Could not open annotation: ${String(error)}`); }
    });
    this.addCommand({
      id: "check-development-setup",
      name: "Check development setup",
      callback: () => {
        new Notice("Reader Plugin is loaded. The development setup is ready.");
      },
    });

    this.addCommand({
      id: "inspect-reading-context",
      name: "Inspect reading context",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
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
  }
  onunload(): void { this.app.workspace.detachLeavesOfType(READER_VIEW); stopPdfWorker(); }
}

class PdfPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private choose: (file: TFile) => void) { super(app); this.setPlaceholder("Choose a PDF from your vault"); }
  getItems(): TFile[] { return this.app.vault.getFiles().filter(file => file.extension === "pdf"); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}
class ReaderSettings extends PluginSettingTab {
  constructor(app: App, private reader: ReaderPlugin) { super(app, reader); }
  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Highlight categories" });
    this.containerEl.createEl("p", { text: "Give each highlight color a meaning for your reading notes. Changes apply when you reopen a Reader tab." });
    for (const color of COLORS) new Setting(this.containerEl).setName(color.charAt(0).toUpperCase() + color.slice(1)).addText(text =>
      text.setValue(this.reader.labels[color]).onChange(async value => {
        this.reader.labels[color] = value.trim() || color;
        await this.reader.saveData({ labels: this.reader.labels });
      }));
  }
}
