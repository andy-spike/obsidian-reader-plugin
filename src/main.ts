import { MarkdownView, Notice, Plugin, TFile, FuzzySuggestModal, App, WorkspaceLeaf } from "obsidian";

import { AnnotationStore } from "./annotations";
import { ReaderView, READER_VIEW } from "./reader-view";
import { AnnotationsView, ANNOTATIONS_VIEW } from "./annotations-view";
import { stopPdfWorker } from "./pdf-engine";
import { colorOf, loadSettings, ReaderSettings, ReaderSettingTab, SettingsHost } from "./settings";

export default class ReaderPlugin extends Plugin implements SettingsHost {
  settings!: ReaderSettings;
  private routing = true;
  private nativeTabs = new WeakMap<WorkspaceLeaf, string>();
  private redirecting = new WeakSet<WorkspaceLeaf>();
  private reader: ReaderView | null = null;
  private store!: AnnotationStore;
  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    const store = this.store = new AnnotationStore(this.app.vault.adapter, { folder: this.settings.folder, colorName: id => colorOf(this.settings, id).name });
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
    this.registerView(ANNOTATIONS_VIEW, leaf => new AnnotationsView(leaf, store, () => this.reader, () => this.settings));
    const open = async (file: TFile, page?: number, native = false) => {
      const leaf = this.app.workspace.getLeaf("tab");
      if (native) this.nativeTabs.set(leaf, file.path);
      await leaf.setViewState({ type: native ? "pdf" : READER_VIEW, state: native || !page ? { file: file.path } : { file: file.path, page } });
      await this.app.workspace.revealLeaf(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    };
    this.registerView(READER_VIEW, leaf => new ReaderView(leaf, {
      store, ready, settings: () => this.settings, showAnnotations: () => void showAnnotations(), openNative: file => void open(file, undefined, true),
    }));
    this.addSettingTab(new ReaderSettingTab(this.app, this));
    // Saving is silent while it works. Report a failing vault write once, and again when it recovers.
    const failing = new Set<string>();
    this.register(store.subscribe(record => {
      const { error } = store.state(record);
      const name = record.sourcePath.split("/").pop();
      if (error && !failing.has(record.documentId)) {
        failing.add(record.documentId);
        new Notice(`Couldn't save annotations for ${name}: ${error}\nRetrying automatically.`, 8000);
      } else if (!error && failing.delete(record.documentId)) new Notice(`Annotations for ${name} are saved.`);
    }));
    for (const native of [false, true]) this.addCommand({
      id: native ? "open-native-pdf" : "open-pdf-reader",
      name: native ? "Open PDF in Obsidian's normal viewer" : "Open PDF in Reader",
      callback: () => {
        const active = this.app.workspace.getActiveFile() ?? this.reader?.file;
        if (active?.extension === "pdf") void open(active, undefined, native);
        else new PdfPicker(this.app, file => void open(file, undefined, native)).open();
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
        if (readerLeaf !== leaf) (readerLeaf.view as ReaderView).hidePopup();
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
    const readerCommand = (id: string, name: string, run: (view: ReaderView) => void) => this.addCommand({
      id, name,
      checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(ReaderView);
        if (!view?.getRecord()) return false;
        if (!checking) run(view);
        return true;
      },
    });
    readerCommand("zoom-in", "Zoom in", view => view.zoomBy(1));
    readerCommand("zoom-out", "Zoom out", view => view.zoomBy(-1));
    readerCommand("reset-zoom", "Reset zoom", view => view.resetZoom());
    readerCommand("table-of-contents", "Show table of contents", view => void view.openOutline());
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFile && file.extension === "pdf") {
        menu.addItem(item => item.setTitle("Open in Reader").setIcon("book-open").onClick(() => void open(file)));
        menu.addItem(item => item.setTitle("Open in Obsidian's normal PDF viewer").setIcon("file-text").onClick(() => void open(file, undefined, true)));
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
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.app.workspace.getLeavesOfType(READER_VIEW).forEach(leaf => (leaf.view as ReaderView).refreshSettings());
    this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW).forEach(leaf => (leaf.view as AnnotationsView).refresh());
  }

  /** Moves existing records with the file manager, so links to the Markdown exports follow them. */
  async moveAnnotations(folder: string): Promise<void> {
    const from = this.store.folder;
    try {
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
      const moved = await this.store.relocate(folder, async (source, target) => {
        const file = this.app.vault.getAbstractFileByPath(source);
        if (file instanceof TFile) await this.app.fileManager.renameFile(file, target);
        else await this.app.vault.adapter.rename(source, target);
      });
      this.settings.folder = folder;
      await this.saveData(this.settings);
      // Remove the previous folder only when the disk shows nothing else lives there.
      // Obsidian's non-recursive rmdir fails on empty folders under current Electron, so check first and remove the empty folder.
      const left = await this.app.vault.adapter.list(from).catch(() => null);
      if (left && !left.files.length && !left.folders.length) await this.app.vault.adapter.rmdir(from, true).catch(() => {});
      new Notice(moved ? `Moved annotations for ${moved} ${moved === 1 ? "PDF" : "PDFs"} to ${folder}.` : `Annotations will be saved in ${folder}.`);
    } catch (error) {
      new Notice(`Could not move annotations to ${folder}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
