import { MarkdownView, Notice, Plugin, TFile, FuzzySuggestModal, App } from "obsidian";

import { ANNOTATION_FOLDER, AnnotationStore, LEGACY_ANNOTATION_FOLDER } from "./annotations";
import { BookNotes } from "./book-notes";
import { QuoteNotes } from "./quote-notes";
import { BookNoteFollowing } from "./book-note-following";
import { ObsidianBookNoteWorkspace } from "./book-note-workspace";
import { ReaderView, READER_VIEW } from "./reader-view";
import { AnnotationsView, ANNOTATIONS_VIEW } from "./annotations-view";
import { SavedReadingState } from "./reading-state";
import { stopPdfWorker } from "./pdf-engine";
import { forgetPdfPageColors, renamePdfPageColors } from "./page-colors";
import { colorOf, loadSettings, NotePlace, ReaderSettings, ReaderSettingTab, SettingsHost } from "./settings";
import { errorMessage } from "./errors";
import { PdfRouting } from "./pdf-routing";
import { QuoteColors } from "./quote-colors";
import { passageLinkAt } from "./passage-links";

const pdfCount = (count: number): string => `${count} ${count === 1 ? "PDF" : "PDFs"}`;

export default class ReaderPlugin extends Plugin implements SettingsHost {
  private saved!: SavedReadingState<ReaderSettings>;
  settings!: ReaderSettings;
  private pdfRouting!: PdfRouting;
  private following!: BookNoteFollowing;
  private store!: AnnotationStore;
  private settingTab!: ReaderSettingTab;
  private bookNotes!: BookNotes;
  private quoteNotes!: QuoteNotes;
  private quoteColors!: QuoteColors;

  async onload(): Promise<void> {
    const data: unknown = await this.loadData();
    this.saved = new SavedReadingState(data, { read: () => this.loadData(), write: data => this.saveData(data) }, loadSettings,
      error => console.error("Reading Desk: could not save reading state.", error));
    this.settings = this.saved.settings;
    this.store = new AnnotationStore(this.app.vault.adapter, { folder: this.settings.folder });
    this.quoteNotes = new QuoteNotes(this.app);
    this.bookNotes = new BookNotes(this.app, this.store, this.quoteNotes, () => this.settings);
    this.pdfRouting = new PdfRouting(this.app.workspace);
    this.quoteColors = new QuoteColors(this.app.workspace, () => this.highlightColors());

    this.registerNoteSync();
    this.following = new BookNoteFollowing(new ObsidianBookNoteWorkspace(this.app, this.bookNotes), this.bookNotes, () => this.settings);
    this.register(() => this.following.dispose());
    this.registerAnnotationsView();
    this.registerQuoteColors();
    this.registerReaderView();
    this.registerHighlightRedraws();
    this.addSettingTab(this.settingTab = new ReaderSettingTab(this.app, this));
    // Earlier versions kept records in a visible folder by default; move them to the hidden one once. A chosen folder stays.
    if (this.settings.folder === LEGACY_ANNOTATION_FOLDER) this.app.workspace.onLayoutReady(() => void this.moveAnnotations(ANNOTATION_FOLDER, moved =>
      moved ? `Highlight data for ${pdfCount(moved)} moved to the hidden folder ${ANNOTATION_FOLDER}.` : ""));
    this.registerSaveNotices();
    this.addOpenCommands();
    this.registerPdfRouting();
    this.registerLinkHandling();
    this.addReaderCommands();
    this.registerPdfFileEvents();
    this.registerObsidianProtocolHandler("reader-plugin", params => void this.openPassage(params));
    if (__DEV__) {
      const { setupDevelopment } = await import("./development");
      setupDevelopment(this);
    }
  }

  // ---- Setup ----

  /** Keeps book notes and quote notes in step with highlights and with edits made to the notes. */
  private registerNoteSync(): void {
    const { store, bookNotes, quoteNotes } = this;
    // Saves made in this window bring the book note up to date; another window's saves are left to that window.
    this.register(store.subscribe(record => bookNotes.schedule(record)));
    this.register(() => bookNotes.dispose());
    this.registerEvent(this.app.vault.on("modify", file => { if (file instanceof TFile) void bookNotes.changed(file); }));
    this.registerEvent(this.app.vault.on("delete", file => {
      bookNotes.deleted(file.path);
      quoteNotes.deleted(file.path);
    }));
    // Obsidian reports each note it reads, including quote notes edited, created, or synced from elsewhere.
    this.registerEvent(this.app.metadataCache.on("changed", (file, text) => quoteNotes.changed(file, text)));
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => { if (info.file) bookNotes.edited(info.file.path, () => editor.getValue()); }));
  }

  private registerAnnotationsView(): void {
    const { store, bookNotes, quoteNotes, following } = this;
    const workspace = this.app.workspace;
    this.registerView(ANNOTATIONS_VIEW, leaf => new AnnotationsView(leaf, {
      source: () => following.current,
      settings: () => this.settings,
      comment: annotationId => quoteNotes.comment(annotationId),
      quoteNotePath: annotationId => quoteNotes.find(annotationId)?.path ?? "",
      saveComment: (record, annotationId, comment) => bookNotes.comment(record, annotationId, comment),
      openPassage: (reader, annotationId) => {
        void workspace.revealLeaf(reader.leaf).then(() => reader.showAnnotationWhenReady(annotationId)).catch(reportNoteError);
      },
      openQuoteNote: (record, annotationId) => {
        void bookNotes.sync(record).then(() => {
          const file = quoteNotes.find(annotationId);
          if (file) return workspace.getLeaf("tab").openFile(file);
        }).catch(reportNoteError);
      },
      openBookNote: reader => this.openNote(reader, null, "beside"),
      subscribe: listener => {
        const stops = [store.subscribe(listener), quoteNotes.subscribe(listener)];
        return () => stops.forEach(stop => stop());
      },
    }));
  }

  private registerQuoteColors(): void {
    this.registerMarkdownPostProcessor(element => this.quoteColors.paint(element));
    this.register(() => this.quoteColors.dispose());
    this.register(this.store.subscribe(() => this.quoteColors.scheduleRepaint()));
  }

  private registerReaderView(): void {
    this.registerView(READER_VIEW, leaf => new ReaderView(leaf, {
      store: this.store,
      ready: reader => {
        this.quoteColors.scheduleRepaint();
        void this.following.ready(reader).catch(reportNoteError);
      },
      settings: () => this.settings,
      toggleAnnotations: place => void this.toggleAnnotations(place),
      toggleHighlightMode: () => this.toggleHighlightMode(),
      chooseHighlightModeColor: id => {
        this.settings.highlightModeColor = id;
        this.settings.highlightMode = true;
        void this.saveSettings();
      },
      openNative: file => void this.openPdf(file, undefined, true),
      openNote: (reader, annotationId, place) => this.openNote(reader, annotationId, place),
      writing: (record, annotationId) => this.bookNotes.writing(record, annotationId),
      lastPosition: path => this.saved.position(path),
      rememberPosition: (path, position) => this.saved.remember(path, position),
      choosePageColors: (path, choice) => {
        if (choice) this.settings.pdfPageColors[path] = choice;
        else delete this.settings.pdfPageColors[path];
        void this.saveSettings();
      },
    }));
  }

  private registerHighlightRedraws(): void {
    // Comments show as dots on highlights, so redraw them when a quote note changes.
    this.register(this.quoteNotes.subscribe(documentId => this.refreshReadersOf(documentId)));
    // What you wrote in a book note shows as dots on highlights, so redraw them when it changes.
    // A PDF's first highlight creates its note; the sidebar tab then switches from its placeholder to the note.
    this.register(this.bookNotes.subscribe(documentId => {
      this.refreshReadersOf(documentId);
      void this.following.changed(documentId).catch(reportNoteError);
    }));
  }

  /** Saving is silent while it works. Report a failing vault write once, and again when it recovers. */
  private registerSaveNotices(): void {
    const failing = new Set<string>();
    this.register(this.store.subscribe(record => {
      const { error } = this.store.state(record);
      const name = record.sourcePath.split("/").pop();
      if (error && !failing.has(record.documentId)) {
        failing.add(record.documentId);
        new Notice(`Couldn't save annotations for ${name}: ${error}\nRetrying automatically.`, 8000);
      } else if (!error && failing.delete(record.documentId)) new Notice(`Annotations for ${name} are saved.`);
    }));
  }

  private addOpenCommands(): void {
    for (const native of [false, true]) this.addCommand({
      id: native ? "open-native-pdf" : "open-pdf-reader",
      name: native ? "Open PDF in Obsidian's normal viewer" : "Open PDF in Reader",
      callback: () => {
        const active = this.app.workspace.getActiveFile() ?? this.following.current?.file;
        if (active?.extension === "pdf") void this.openPdf(active, undefined, native);
        else new PdfPicker(this.app, file => void this.openPdf(file, undefined, native)).open();
      },
    });
    this.addCommand({ id: "show-annotations", name: "Toggle book note", callback: () => void this.toggleAnnotations() });
  }

  private registerPdfRouting(): void {
    const workspace = this.app.workspace;
    const route = () => this.pdfRouting.schedule();
    this.register(() => this.pdfRouting.stop());
    this.registerEvent(workspace.on("layout-change", route));
    this.registerEvent(workspace.on("file-open", route));
    this.registerEvent(workspace.on("active-leaf-change", leaf => {
      route();
      this.readers().forEach(reader => { if (reader.leaf !== leaf) reader.hidePopup(); });
      this.pdfRouting.leafActivated(leaf);
      const notePath = leaf?.view instanceof MarkdownView ? leaf.view.file?.path : undefined;
      void this.following.activate(leaf?.view instanceof ReaderView ? leaf.view : null, notePath).catch(reportNoteError);
    }));
    workspace.onLayoutReady(route);
  }

  /** Captures passage links and links to PDFs in every window, before Obsidian handles them itself. */
  private registerLinkHandling(): void {
    const listen = (doc: Document) => {
      this.registerDomEvent(doc, "mousedown", event => this.openPassageLink(event), { capture: true });
      this.registerDomEvent(doc, "click", event => this.openPdfLink(event), { capture: true });
    };
    listen(document);
    this.registerEvent(this.app.workspace.on("window-open", win => listen(win.doc)));
  }

  private addReaderCommands(): void {
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
    readerCommand("open-book-note", "Open book note", view => this.openNote(view, null));
    readerCommand("toggle-page-colors", "Toggle dark pages for this PDF", view => view.togglePageColors());
    this.addCommand({ id: "toggle-highlight-mode", name: "Toggle highlight mode", callback: () => this.toggleHighlightMode() });
  }

  /** The file menu entries for PDFs, and the PDF state that follows renames and deletions. */
  private registerPdfFileEvents(): void {
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFile && file.extension === "pdf") {
        menu.addItem(item => item.setTitle("Open in Reader").setIcon("book-open").onClick(() => void this.openPdf(file)));
        menu.addItem(item => item.setTitle("Open in Obsidian's normal PDF viewer").setIcon("file-text").onClick(() => void this.openPdf(file, undefined, true)));
      }
    }));
    // A PDF keeps its own page colors when it or its folder is renamed, and forgets them when deleted.
    this.registerEvent(this.app.vault.on("delete", file => { if (forgetPdfPageColors(this.settings.pdfPageColors, file.path)) void this.saveSettings(); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (renamePdfPageColors(this.settings.pdfPageColors, oldPath, file.path)) void this.saveSettings();
      this.saved.rename(oldPath, file.path);
      if (file instanceof TFile) this.bookNotes.renamed(file, oldPath);
      void this.store.rename(oldPath, file.path).catch((error: unknown) => new Notice(`Could not update annotation source: ${errorMessage(error)}`));
    }));
  }

  // ---- Actions ----

  /** Opens a PDF, reusing a Reader tab that already shows it. Returns the Reader, if it is one. */
  private async openPdf(file: TFile, page?: number, native = false): Promise<ReaderView | null> {
    const workspace = this.app.workspace;
    // A tab not shown since Obsidian started is still a placeholder; its saved state names the file, and revealing it loads it.
    const existing = native ? null : workspace.getLeavesOfType(READER_VIEW).find(leaf => leaf.getViewState().state?.file === file.path);
    if (existing) {
      await workspace.revealLeaf(existing);
      workspace.setActiveLeaf(existing, { focus: true });
      const reader = existing.view instanceof ReaderView ? existing.view : null;
      if (page) reader?.goToPage(page);
      return reader;
    }
    const leaf = workspace.getLeaf("tab");
    if (native) this.pdfRouting.keepNative(leaf, file.path);
    await leaf.setViewState({ type: native ? "pdf" : READER_VIEW, state: native || !page ? { file: file.path } : { file: file.path, page } });
    if (native) this.pdfRouting.showNative(leaf);
    await workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
    return leaf.view instanceof ReaderView ? leaf.view : null;
  }

  /** Opens the PDF of a passage link and scrolls to its highlight, or to its page if the highlight was deleted. */
  private async openPassage(params: Record<string, string | undefined>): Promise<void> {
    try {
      const record = await this.store.find(params.document ?? "");
      const file = record && this.app.vault.getAbstractFileByPath(record.sourcePath);
      if (!record || !(file instanceof TFile)) { new Notice("The annotated PDF could not be found in this vault."); return; }
      const annotation = record.annotations.find(candidate => candidate.id === params.annotation);
      const reader = await this.openPdf(file, annotation ? undefined : Number(params.page) || 1);
      if (annotation && reader) await reader.showAnnotationWhenReady(annotation.id);
    } catch (error) { new Notice(`Could not open annotation: ${String(error)}`); }
  }

  /**
   * Opens passage links on press, before CodeMirror redraws the link as raw text and before Obsidian replaces the note tab
   * with its PDF viewer, which would lose the requested page. Keeps obsidian:// links in this Obsidian instead of handing
   * them to the operating system.
   */
  private openPassageLink(event: MouseEvent): void {
    if (event.button !== 0) return;
    const href = passageLinkAt(this.app.workspace, event.target as Element | null);
    if (!href) return;
    event.preventDefault();
    event.stopPropagation();
    void this.openPassage(Object.fromEntries(new URL(href).searchParams));
  }

  /** Opens links to PDFs in Reader, at the linked page. */
  private openPdfLink(event: MouseEvent): void {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    // The press already opened it; keep Obsidian from following the link as well.
    if (passageLinkAt(this.app.workspace, target)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!this.pdfRouting.active) return;
    const link = target?.closest?.("a.internal-link");
    const href = link?.getAttribute("data-href") ?? link?.getAttribute("href");
    if (!href) return;
    const [path = "", subpath = ""] = href.split("#", 2);
    const file = this.app.metadataCache.getFirstLinkpathDest(path, this.app.workspace.getActiveFile()?.path ?? "");
    if (file?.extension !== "pdf") return;
    event.preventDefault();
    event.stopPropagation();
    void this.openPdf(file, Number(/(?:^|&)page=(\d+)/.exec(subpath)?.[1]) || undefined);
  }

  private toggleAnnotations(place?: NotePlace): Promise<void> {
    return this.following.toggle(place).catch(reportNoteError);
  }

  private openNote(reader: ReaderView, annotationId: string | null, place?: NotePlace): void {
    void this.following.open(reader, annotationId, place).catch(reportNoteError);
  }

  private toggleHighlightMode(): void {
    this.settings.highlightMode = !this.settings.highlightMode;
    void this.saveSettings();
  }

  // ---- Settings and state ----

  async saveSettings(): Promise<void> {
    await this.saved.flush();
    this.applySettings();
  }

  /**
   * Another Obsidian on the same vault, or Obsidian Sync, rewrote the data file. Adopt its settings and positions,
   * so this window's next write doesn't put back the old ones. Positions read here but not yet written still win.
   */
  async onExternalSettingsChange(): Promise<void> {
    await this.saved.reload();
    this.settings = this.saved.settings;
    this.store.folder = this.settings.folder;
    this.applySettings();
    this.settingTab.update();
  }

  /** Open Reader views. Tabs not shown since Obsidian started are placeholders without the Reader's methods, so they are skipped. */
  private readers(): ReaderView[] {
    return this.app.workspace.getLeavesOfType(READER_VIEW).map(leaf => leaf.view).filter((view): view is ReaderView => view instanceof ReaderView);
  }

  /** Redraws the highlights of every Reader showing this document. */
  private refreshReadersOf(documentId: string): void {
    for (const reader of this.readers()) {
      if (reader.getRecord()?.documentId === documentId) reader.refreshAnnotations();
    }
  }

  /** The current color of every highlight in the records opened so far, by highlight ID. */
  private highlightColors(): Map<string, string> {
    const annotations = this.store.loaded().flatMap(record => record.annotations);
    return new Map(annotations.map(annotation => [annotation.id, colorOf(this.settings, annotation.color).value]));
  }

  private applySettings(): void {
    this.readers().forEach(reader => reader.refreshSettings());
    this.quoteColors?.scheduleRepaint();
  }

  /** Moves existing records with the file manager, so links to Markdown files that older versions generated follow them. */
  async moveAnnotations(folder: string, done?: (moved: number) => string): Promise<void> {
    const from = this.store.folder;
    try {
      // Through the adapter, which also handles hidden folders that Obsidian doesn't index.
      if (!await this.app.vault.adapter.exists(folder)) await this.app.vault.adapter.mkdir(folder);
      const moved = await this.store.relocate(folder, async (source, target) => {
        const file = this.app.vault.getAbstractFileByPath(source);
        if (file instanceof TFile) await this.app.fileManager.renameFile(file, target);
        else await this.app.vault.adapter.rename(source, target);
      });
      this.settings.folder = folder;
      await this.saved.flush();
      // Remove the previous folder only when the disk shows nothing else lives there.
      // Obsidian's non-recursive rmdir fails on empty folders under current Electron, so check first and remove the empty folder.
      const left = await this.app.vault.adapter.list(from).catch(() => null);
      if (left && !left.files.length && !left.folders.length) await this.app.vault.adapter.rmdir(from, true).catch(() => {});
      const message = done ? done(moved) : moved ? `Moved annotations for ${pdfCount(moved)} to ${folder}.` : `Annotations will be saved in ${folder}.`;
      if (message) new Notice(message);
    } catch (error) {
      new Notice(`Could not move annotations to ${folder}: ${errorMessage(error)}`);
    }
  }

  onunload(): void {
    this.pdfRouting?.stop();
    // Flush positions and clean up even if a Reader fails to report its final position.
    try {
      this.readers().forEach(reader => reader.savePosition());
    } catch (error) {
      console.error("Reading Desk: could not save reading positions while unloading.", error);
    }
    void this.saved?.close().catch(error => console.error("Reading Desk: could not save reading state while unloading.", error));
    this.store?.dispose();
    // Open reader and sidebar tabs stay where they are; Obsidian restores them when the plugin loads again, such as after an update or a rebuild.
    stopPdfWorker();
  }
}

function reportNoteError(error: unknown): void {
  new Notice(`Could not show the book note: ${String(error)}`);
}

class PdfPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private choose: (file: TFile) => void) { super(app); this.setPlaceholder("Choose a PDF from your vault"); }
  getItems(): TFile[] { return this.app.vault.getFiles().filter(file => file.extension === "pdf"); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}
