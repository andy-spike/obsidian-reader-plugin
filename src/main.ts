import { MarkdownView, Notice, Plugin, TFile, FuzzySuggestModal, PluginSettingTab, Setting, App, WorkspaceLeaf } from "obsidian";

import { AnnotationStore, COLORS, HighlightColor } from "./annotations";
import { ReaderView, READER_VIEW } from "./reader-view";
import { AnnotationsView, ANNOTATIONS_VIEW } from "./annotations-view";
import { stopPdfWorker } from "./pdf-engine";

export default class ReaderPlugin extends Plugin {
  labels: Record<HighlightColor, string> = { yellow: "Yellow", green: "Green", blue: "Blue", pink: "Pink" };
  private routing = true;
  private nativeTabs = new WeakMap<WorkspaceLeaf, string>();
  private redirecting = new WeakSet<WorkspaceLeaf>();
  private reader: ReaderView | null = null;
  private store!: AnnotationStore;
  async onload(): Promise<void> {
    const saved = await this.loadData();
    for (const color of COLORS) if (typeof saved?.labels?.[color] === "string") this.labels[color] = saved.labels[color];
    const store = this.store = new AnnotationStore(this.app.vault.adapter);
    const refreshSidebar = () => this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW).forEach(leaf => (leaf.view as AnnotationsView).refresh());
    let sidebarOpening: Promise<void> | null = null;
    const showAnnotations = (): Promise<void> => {
      if (sidebarOpening) return sidebarOpening;
      sidebarOpening = (async () => {
        const existing = this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW)[0];
        const leaf = existing ?? this.app.workspace.getRightLeaf(false);
        if (!leaf) return;
        if (!existing) await leaf.setViewState({ type: ANNOTATIONS_VIEW, active: false });
        refreshSidebar();
        await this.app.workspace.revealLeaf(leaf);
      })().finally(() => { sidebarOpening = null; });
      return sidebarOpening;
    };
    const ready = (reader: ReaderView) => {
      if (this.reader === reader || this.app.workspace.getMostRecentLeaf() === reader.leaf || this.app.workspace.getActiveViewOfType(ReaderView) === reader) {
        this.reader = reader.getRecord() ? reader : null;
        refreshSidebar();
        if (this.reader) void showAnnotations();
      }
    };
    this.registerView(ANNOTATIONS_VIEW, leaf => new AnnotationsView(leaf, store, () => this.reader, () => this.labels));
    this.registerView(READER_VIEW, leaf => new ReaderView(leaf, store, ready, () => void showAnnotations(), () => this.labels));
    this.addSettingTab(new ReaderSettings(this.app, this));
    const open = async (file: TFile, page = 1, native = false) => {
      const leaf = this.app.workspace.getLeaf("tab");
      if (native) this.nativeTabs.set(leaf, file.path);
      await leaf.setViewState({ type: native ? "pdf" : READER_VIEW, state: { file: file.path } });
      await this.app.workspace.revealLeaf(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      if (!native && page !== 1) await (leaf.view as ReaderView).showPage(page);
    };
    for (const native of [false, true]) this.addCommand({
      id: native ? "open-native-pdf" : "open-pdf-reader",
      name: native ? "Open PDF in Obsidian's normal viewer" : "Open PDF in Reader",
      callback: () => {
        const active = this.app.workspace.getActiveFile() ?? this.reader?.file;
        if (active?.extension === "pdf") void open(active, 1, native);
        else new PdfPicker(this.app, file => void open(file, 1, native)).open();
      },
    });
    this.addCommand({ id: "show-annotations", name: "Show PDF annotations", callback: () => void showAnnotations() });
    const routeNow = () => {
      if (!this.routing) return;
      for (const leaf of this.app.workspace.getLeavesOfType("pdf")) {
        const state = leaf.getViewState().state;
        const path = state?.file;
        if (typeof path !== "string" || this.nativeTabs.get(leaf) === path || this.redirecting.has(leaf)) continue;
        this.nativeTabs.delete(leaf);
        this.redirecting.add(leaf);
        void leaf.setViewState({ type: READER_VIEW, state: { file: path } })
          .catch(error => new Notice(`Could not open Reader: ${String(error)}`))
          .finally(() => this.redirecting.delete(leaf));
      }
    };
    let routeTimer: ReturnType<typeof setTimeout> | undefined;
    const routePdfs = () => {
      clearTimeout(routeTimer);
      routeTimer = setTimeout(routeNow, 100);
    };
    this.register(() => clearTimeout(routeTimer));
    // PDF is reserved by Obsidian. Route file tabs via public workspace events instead of patching its viewer or registry.
    this.registerEvent(this.app.workspace.on("layout-change", routePdfs));
    this.registerEvent(this.app.workspace.on("file-open", routePdfs));
    this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
      routePdfs();
      this.app.workspace.getLeavesOfType(READER_VIEW).forEach(readerLeaf => {
        if (readerLeaf !== leaf) (readerLeaf.view as ReaderView).hideSelectionPopup();
      });
      if (leaf && leaf.view.getViewType() !== "pdf") this.nativeTabs.delete(leaf);
      if (leaf?.view instanceof ReaderView) {
        this.reader = leaf.view;
        refreshSidebar();
      } else if (leaf && leaf.view.getViewType() !== ANNOTATIONS_VIEW && this.app.workspace.getMostRecentLeaf() === leaf) {
        this.reader = null;
        refreshSidebar();
      }
    }));
    this.app.workspace.onLayoutReady(routePdfs);
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
      if (file instanceof TFile && file.extension === "pdf") {
        menu.addItem(item => item.setTitle("Open in Reader").setIcon("book-open").onClick(() => void open(file)));
        menu.addItem(item => item.setTitle("Open in Obsidian's normal PDF viewer").setIcon("file-text").onClick(() => void open(file, 1, true)));
      }
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
  onunload(): void {
    this.routing = false;
    this.store?.dispose();
    this.app.workspace.detachLeavesOfType(READER_VIEW);
    this.app.workspace.detachLeavesOfType(ANNOTATIONS_VIEW);
    stopPdfWorker();
  }
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
    this.containerEl.createEl("p", { text: "Give each highlight color a meaning for your reading notes. Names appear in the selection popup and annotations sidebar." });
    for (const color of COLORS) new Setting(this.containerEl).setName(color.charAt(0).toUpperCase() + color.slice(1)).addText(text =>
      text.setValue(this.reader.labels[color]).onChange(async value => {
        this.reader.labels[color] = value.trim() || color;
        await this.reader.saveData({ labels: this.reader.labels });
        this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW).forEach(leaf => (leaf.view as AnnotationsView).refresh());
      }));
  }
}
