import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { MarkdownView, Notice, Plugin, TFile, FuzzySuggestModal, App, FileSystemAdapter, Platform, WorkspaceLeaf, WorkspaceSidedock } from "obsidian";

import { AnnotationStore } from "./annotations";
import { BookNotes } from "./book-notes";
import { ReaderView, READER_VIEW, type ReadingPosition } from "./reader-view";
import { AnnotationsView, ANNOTATIONS_VIEW } from "./annotations-view";
import { stopPdfWorker } from "./pdf-engine";
import { loadSettings, ReaderSettings, ReaderSettingTab, SettingsHost } from "./settings";

export default class ReaderPlugin extends Plugin implements SettingsHost {
  settings!: ReaderSettings;
  private routing = true;
  private nativeTabs = new WeakMap<WorkspaceLeaf, string>();
  private redirecting = new WeakSet<WorkspaceLeaf>();
  private reader: ReaderView | null = null;
  private store!: AnnotationStore;
  /** Where each PDF was last read, by vault path, so it reopens there in a new tab or after Obsidian restarts. Oldest first. */
  private positions = new Map<string, ReadingPosition>();
  private positionTimer: ReturnType<typeof setTimeout> | undefined;
  /** Positions recorded here since the last write, kept when another Obsidian changes the data file first. */
  private unsavedPositions = new Set<string>();
  private settingTab!: ReaderSettingTab;
  private bookNotes!: BookNotes;
  async onload(): Promise<void> {
    const data = await this.loadData();
    this.settings = loadSettings(data);
    this.positions = loadPositions(data);
    const store = this.store = new AnnotationStore(this.app.vault.adapter, { folder: this.settings.folder });
    const bookNotes = this.bookNotes = new BookNotes(this.app, store, () => this.settings);
    // Saves made in this window bring the book note up to date; another window's saves are left to that window.
    this.register(store.subscribe(record => bookNotes.schedule(record)));
    this.register(() => bookNotes.dispose());
    this.registerEvent(this.app.vault.on("modify", file => { if (file instanceof TFile) void bookNotes.changed(file); }));
    this.registerEvent(this.app.vault.on("delete", file => bookNotes.deleted(file.path)));
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => { if (info.file) bookNotes.edited(info.file.path, () => editor.getValue()); }));
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
        // revealLeaf brings a background Obsidian window to the front. A reader also loads without the user,
        // such as when Obsidian restores tabs or the plugin reloads, so then only open a collapsed sidebar.
        if (leaf.view.containerEl.doc.hasFocus()) await this.app.workspace.revealLeaf(leaf);
        else {
          const root = leaf.getRoot();
          if ((root === this.app.workspace.rightSplit || root === this.app.workspace.leftSplit) && (root as WorkspaceSidedock).collapsed) (root as WorkspaceSidedock).expand();
        }
      })().finally(() => { sidebarOpening = null; });
      return sidebarOpening;
    };
    /** Set when the reader closes the panel with the toggle, so opening another PDF doesn't bring it straight back. */
    let sidebarDismissed = false;
    const toggleAnnotations = async (): Promise<void> => {
      const leaf = this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW)[0];
      const root = leaf?.getRoot();
      const inSidebar = root === this.app.workspace.rightSplit || root === this.app.workspace.leftSplit;
      const visible = !!leaf && leaf.view.containerEl.isShown() && !(inSidebar && (root as WorkspaceSidedock).collapsed);
      if (!visible) {
        sidebarDismissed = false;
        await showAnnotations();
        return;
      }
      sidebarDismissed = true;
      // In a sidebar, collapse it like Obsidian's own sidebar toggle; elsewhere, close the tab.
      if (inSidebar) (root as WorkspaceSidedock).collapse();
      else leaf.detach();
    };
    const ready = (reader: ReaderView) => {
      const record = reader.getRecord();
      if (record) void bookNotes.load(record).then(() => { if (record.annotations.length || !record.exportRetired) bookNotes.schedule(record); });
      const noteActive = !!record?.notePath && this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path === record.notePath;
      if (this.reader === reader || this.app.workspace.getMostRecentLeaf() === reader.leaf || this.app.workspace.getActiveViewOfType(ReaderView) === reader || noteActive) {
        this.reader = reader.getRecord() ? reader : null;
        refreshSidebar();
        if (this.reader && !sidebarDismissed) void showAnnotations();
      }
    };
    this.registerView(ANNOTATIONS_VIEW, leaf => new AnnotationsView(leaf, store, () => this.reader, () => this.settings));
    /** Opens a PDF, reusing a Reader tab that already shows it. Returns the Reader, if it is one. */
    const open = async (file: TFile, page?: number, native = false): Promise<ReaderView | null> => {
      // A tab not shown since Obsidian started is still a placeholder; its saved state names the file, and revealing it loads it.
      const existing = native ? null : this.app.workspace.getLeavesOfType(READER_VIEW).find(leaf => leaf.getViewState().state?.file === file.path);
      if (existing) {
        await this.app.workspace.revealLeaf(existing);
        this.app.workspace.setActiveLeaf(existing, { focus: true });
        const reader = existing.view instanceof ReaderView ? existing.view : null;
        if (page) reader?.goToPage(page);
        return reader;
      }
      const leaf = this.app.workspace.getLeaf("tab");
      if (native) this.nativeTabs.set(leaf, file.path);
      await leaf.setViewState({ type: native ? "pdf" : READER_VIEW, state: native || !page ? { file: file.path } : { file: file.path, page } });
      await this.app.workspace.revealLeaf(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      return leaf.view instanceof ReaderView ? leaf.view : null;
    };
    const openNote = (reader: ReaderView, annotationId: string | null) => {
      const record = reader.getRecord();
      if (record) void bookNotes.open(record, annotationId, reader.leaf).catch(error => new Notice(`Could not open the book note: ${String(error)}`));
    };
    this.registerView(READER_VIEW, leaf => new ReaderView(leaf, {
      store, ready, settings: () => this.settings, toggleAnnotations: () => void toggleAnnotations(), openNative: file => void open(file, undefined, true), openNote,
      writing: (record, annotationId) => bookNotes.writing(record, annotationId),
      lastPosition: path => this.positions.get(path),
      rememberPosition: (path, position) => this.rememberPosition(path, position),
    }));
    // What you wrote in a book note shows as dots on highlights and previews in the sidebar, so redraw both when it changes.
    this.register(bookNotes.subscribe(documentId => {
      this.readers().forEach(reader => { if (reader.getRecord()?.documentId === documentId) reader.refreshAnnotations(); });
      refreshSidebar();
    }));
    this.addSettingTab(this.settingTab = new ReaderSettingTab(this.app, this));
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
    this.addCommand({ id: "show-annotations", name: "Toggle PDF annotations", callback: () => void toggleAnnotations() });
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
      this.readers().forEach(reader => { if (reader.leaf !== leaf) reader.hidePopup(); });
      if (leaf && leaf.view.getViewType() !== "pdf") this.nativeTabs.delete(leaf);
      // While you write in a book note, the sidebar keeps showing that book's highlights.
      const notePath = leaf?.view instanceof MarkdownView ? leaf.view.file?.path : undefined;
      const noteReader = notePath ? this.readers().find(reader => reader.getRecord()?.notePath === notePath) : undefined;
      if (leaf?.view instanceof ReaderView || noteReader) {
        this.reader = noteReader ?? (leaf!.view as ReaderView);
        refreshSidebar();
      } else if (leaf && leaf.view.getViewType() !== ANNOTATIONS_VIEW && this.app.workspace.getMostRecentLeaf() === leaf) {
        this.reader = null;
        refreshSidebar();
      }
    }));
    this.app.workspace.onLayoutReady(routePdfs);
    /** Opens the PDF of a passage link and scrolls to its highlight, or to its page if the highlight was deleted. */
    const openPassage = async (params: Record<string, string | undefined>) => {
      try {
        const record = await store.find(params.document ?? "");
        const file = record && this.app.vault.getAbstractFileByPath(record.sourcePath);
        if (!record || !(file instanceof TFile)) { new Notice("The annotated PDF could not be found in this vault."); return; }
        const annotation = record.annotations.find(candidate => candidate.id === params.annotation);
        const reader = await open(file, annotation ? undefined : Number(params.page) || 1);
        if (annotation && reader) await reader.showAnnotationWhenReady(annotation.id);
      } catch (error) { new Notice(`Could not open annotation: ${String(error)}`); }
    };
    // A passage link opens its highlight, and a rendered link to a PDF, such as `[[book.pdf#page=2]]`, opens in the Reader at its page,
    // reusing a Reader that already shows the PDF. Left to Obsidian, it would replace the note's tab with the native viewer, and the page would be lost
    // when routing swaps in the Reader. Capturing at the document runs before Obsidian's own link handler.
    const openPdfLink = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Element | null;
      // A passage link is opened here rather than handed to the operating system, which may not send it back to this Obsidian.
      const passage = target?.closest?.("a[href^='obsidian://reader-plugin?']");
      if (passage) {
        event.preventDefault();
        event.stopPropagation();
        void openPassage(Object.fromEntries(new URL(passage.getAttribute("href")!).searchParams));
        return;
      }
      if (!this.routing) return;
      const link = target?.closest?.("a.internal-link");
      const href = link?.getAttribute("data-href") ?? link?.getAttribute("href");
      if (!href) return;
      const [path = "", subpath = ""] = href.split("#", 2);
      const file = this.app.metadataCache.getFirstLinkpathDest(path, this.app.workspace.getActiveFile()?.path ?? "");
      if (file?.extension !== "pdf") return;
      event.preventDefault();
      event.stopPropagation();
      void open(file, Number(/(?:^|&)page=(\d+)/.exec(subpath)?.[1]) || undefined);
    };
    this.registerDomEvent(document, "click", openPdfLink, { capture: true });
    this.registerEvent(this.app.workspace.on("window-open", win => this.registerDomEvent(win.doc, "click", openPdfLink, { capture: true })));
    // The note command keeps its old ID, so hotkeys set for "Highlight selected PDF passage with comment" still work.
    for (const withNote of [false, true]) this.addCommand({
      id: withNote ? "highlight-with-comment" : "highlight-selection",
      name: withNote ? "Highlight selected PDF passage and write about it in the book note" : "Highlight selected PDF passage",
      checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(ReaderView);
        if (!view) return false;
        if (!checking) view.addHighlight(withNote);
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
    readerCommand("open-book-note", "Open book note", view => openNote(view, null));
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFile && file.extension === "pdf") {
        menu.addItem(item => item.setTitle("Open in Reader").setIcon("book-open").onClick(() => void open(file)));
        menu.addItem(item => item.setTitle("Open in Obsidian's normal PDF viewer").setIcon("file-text").onClick(() => void open(file, undefined, true)));
      }
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const position = this.positions.get(oldPath);
      if (position && this.positions.delete(oldPath)) this.rememberPosition(file.path, position);
      if (file instanceof TFile) bookNotes.renamed(file, oldPath);
      void store.rename(oldPath, file.path).catch(error => new Notice(`Could not update annotation source: ${error.message}`));
    }));
    this.registerObsidianProtocolHandler("reader-plugin", params => void openPassage(params));
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
    this.reloadOnRebuild();
  }

  /**
   * In a development vault, reloads the plugin whenever a build replaces its files, so every open Obsidian picks up the change without being touched.
   * The build writes the `.dev-reload` marker there; installed copies don't have it.
   */
  private reloadOnRebuild(): void {
    const adapter = this.app.vault.adapter;
    if (!Platform.isDesktopApp || !(adapter instanceof FileSystemAdapter) || !this.manifest.dir) return;
    const folder = join(adapter.getBasePath(), this.manifest.dir);
    if (!existsSync(join(folder, ".dev-reload"))) return;
    const plugins = (this.app as unknown as { plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<boolean> } }).plugins;
    const id = this.manifest.id;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A build copies several files; reload once they have all landed.
    const watcher = watch(folder, (_, name) => {
      if (name !== "main.js" && name !== "styles.css" && name !== "manifest.json") return;
      clearTimeout(timer);
      timer = setTimeout(() => void plugins.disablePlugin(id).then(() => plugins.enablePlugin(id)), 300);
    });
    this.register(() => { clearTimeout(timer); watcher.close(); });
  }

  /** Settings and reading positions share the plugin's data file. */
  private async persist(): Promise<void> {
    clearTimeout(this.positionTimer);
    this.positionTimer = undefined;
    this.unsavedPositions.clear();
    await this.saveData({ ...this.settings, positions: Object.fromEntries(this.positions) });
  }

  /** Scrolling reports positions continuously, so writes wait until it pauses. */
  private rememberPosition(path: string, position: ReadingPosition): void {
    const previous = this.positions.get(path);
    this.positions.delete(path);
    this.positions.set(path, position);
    while (this.positions.size > MAX_POSITIONS) this.positions.delete(this.positions.keys().next().value!);
    if (previous && previous.page === position.page && previous.offset === position.offset && previous.zoom === position.zoom) return;
    this.unsavedPositions.add(path);
    clearTimeout(this.positionTimer);
    this.positionTimer = setTimeout(() => void this.persist(), 1000);
  }

  async saveSettings(): Promise<void> {
    await this.persist();
    this.applySettings();
  }

  /**
   * Another Obsidian on the same vault, or Obsidian Sync, rewrote the data file. Adopt its settings and positions,
   * so this window's next write doesn't put back the old ones. Positions read here but not yet written still win.
   */
  async onExternalSettingsChange(): Promise<void> {
    const data = await this.loadData();
    this.settings = loadSettings(data);
    this.store.folder = this.settings.folder;
    const positions = loadPositions(data);
    for (const path of this.unsavedPositions) {
      const position = this.positions.get(path);
      if (position) { positions.delete(path); positions.set(path, position); }
    }
    this.positions = positions;
    this.applySettings();
    if (this.settingTab.containerEl.isConnected) this.settingTab.display();
  }

  /** Open Reader views. Tabs not shown since Obsidian started are placeholders without the Reader's methods, so they are skipped. */
  private readers(): ReaderView[] {
    return this.app.workspace.getLeavesOfType(READER_VIEW).map(leaf => leaf.view).filter((view): view is ReaderView => view instanceof ReaderView);
  }

  private applySettings(): void {
    this.readers().forEach(reader => reader.refreshSettings());
    this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW).forEach(leaf => (leaf.view as AnnotationsView).refresh());
  }

  /** Moves existing records with the file manager, so links to Markdown files that older versions generated follow them. */
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
      await this.persist();
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
    // Closing the views below records their final positions; write them before the plugin goes away. The cleanup after it
    // must run even if that fails, or a copy of the plugin stays half-loaded beside the next one.
    try {
      this.readers().forEach(reader => reader.savePosition());
      if (this.positionTimer !== undefined) void this.persist();
    } catch (error) {
      console.error("Reader Plugin: could not save reading positions while unloading.", error);
    }
    this.store?.dispose();
    // Open reader and sidebar tabs stay where they are; Obsidian restores them when the plugin loads again, such as after an update or a rebuild.
    stopPdfWorker();
  }
}

/** Enough for a library; the least recently read books are forgotten first. */
const MAX_POSITIONS = 200;

function loadPositions(data: unknown): Map<string, ReadingPosition> {
  const saved = (data as { positions?: unknown } | null)?.positions;
  const positions = new Map<string, ReadingPosition>();
  if (!saved || typeof saved !== "object") return positions;
  for (const [path, value] of Object.entries(saved as Record<string, unknown>)) {
    const { page, offset, zoom } = (value ?? {}) as Record<string, unknown>;
    if (typeof page !== "number" || typeof offset !== "number" || !(typeof zoom === "number" || zoom === "width" || zoom === "page")) continue;
    positions.set(path, { page, offset, zoom });
  }
  return positions;
}

class PdfPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private choose: (file: TFile) => void) { super(app); this.setPlaceholder("Choose a PDF from your vault"); }
  getItems(): TFile[] { return this.app.vault.getFiles().filter(file => file.extension === "pdf"); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}
