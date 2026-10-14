import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { MarkdownView, Notice, Plugin, TFile, FuzzySuggestModal, App, FileSystemAdapter, Platform, WorkspaceLeaf } from "obsidian";

import { ANNOTATION_FOLDER, AnnotationStore, LEGACY_ANNOTATION_FOLDER } from "./annotations";
import { BookNotes } from "./book-notes";
import { BookNoteFollowing } from "./book-note-following";
import { ObsidianBookNoteWorkspace } from "./book-note-workspace";
import { ReaderView, READER_VIEW, type ReadingPosition } from "./reader-view";
import { AnnotationsView, ANNOTATIONS_VIEW } from "./annotations-view";
import { stopPdfWorker } from "./pdf-engine";
import { colorOf, loadSettings, NotePlace, ReaderSettings, ReaderSettingTab, SettingsHost } from "./settings";

export default class ReaderPlugin extends Plugin implements SettingsHost {
  settings!: ReaderSettings;
  private routing = true;
  private nativeTabs = new WeakMap<WorkspaceLeaf, string>();
  private redirecting = new WeakSet<WorkspaceLeaf>();
  private following!: BookNoteFollowing;
  private store!: AnnotationStore;
  /** Where each PDF was last read, by vault path, so it reopens there in a new tab or after Obsidian restarts. Oldest first. */
  private positions = new Map<string, ReadingPosition>();
  private positionTimer: ReturnType<typeof setTimeout> | undefined;
  /** Positions recorded here since the last write, kept when another Obsidian changes the data file first. */
  private unsavedPositions = new Set<string>();
  private settingTab!: ReaderSettingTab;
  private bookNotes!: BookNotes;
  /** Redraws the highlight colors of quotes in book notes. */
  private paintQuotes: (() => void) | null = null;
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
    const workspace = this.app.workspace;
    const following = this.following = new BookNoteFollowing(new ObsidianBookNoteWorkspace(this.app, bookNotes), bookNotes, () => this.settings);
    this.register(() => following.dispose());
    const reportNoteError = (error: unknown) => new Notice(`Could not show the book note: ${String(error)}`);
    const toggleAnnotations = (place?: NotePlace) => following.toggle(place).catch(reportNoteError);
    const ready = (reader: ReaderView) => {
      paintQuotes();
      void following.ready(reader).catch(reportNoteError);
    };
    this.registerView(ANNOTATIONS_VIEW, leaf => new AnnotationsView(leaf, () => following.current));
    /** Book note quotes take their highlight's color, matched by the highlight ID in the quote's link, without changing the note. */
    const quoteStyle = document.head.createEl("style", { attr: { id: "reader-plugin-quote-colors" } });
    this.register(() => quoteStyle.remove());
    let paintFrame = 0;
    const paintQuotes = () => {
      if (paintFrame) return;
      paintFrame = requestAnimationFrame(() => {
        paintFrame = 0;
        quoteStyle.textContent = store.loaded().flatMap(record => record.annotations).map(annotation => {
          const hex = colorOf(this.settings, annotation.color).value.slice(1);
          const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(", ");
          return `.callout[data-callout="quote"]:has(a[href*="annotation=${annotation.id}"]) { --callout-color: ${rgb}; --reader-color: rgb(${rgb}); }`;
        }).join("\n");
      });
    };
    this.register(() => cancelAnimationFrame(paintFrame));
    this.paintQuotes = paintQuotes;
    this.register(store.subscribe(() => paintQuotes()));
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
      if (native) leaf.view.containerEl.addClass("reader-native-pdf");
      await this.app.workspace.revealLeaf(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      return leaf.view instanceof ReaderView ? leaf.view : null;
    };
    const toggleHighlightMode = () => {
      this.settings.highlightMode = !this.settings.highlightMode;
      void this.saveSettings();
    };
    const openNote = (reader: ReaderView, annotationId: string | null, place?: NotePlace) => {
      void following.open(reader, annotationId, place).catch(reportNoteError);
    };
    this.registerView(READER_VIEW, leaf => new ReaderView(leaf, {
      store, ready, settings: () => this.settings, toggleAnnotations: place => void toggleAnnotations(place),
      toggleHighlightMode,
      chooseHighlightModeColor: id => {
        this.settings.highlightModeColor = id;
        this.settings.highlightMode = true;
        void this.saveSettings();
      }, openNative: file => void open(file, undefined, true), openNote,
      writing: (record, annotationId) => bookNotes.writing(record, annotationId),
      lastPosition: path => this.positions.get(path),
      rememberPosition: (path, position) => this.rememberPosition(path, position),
    }));
    // What you wrote in a book note shows as dots on highlights, so redraw them when it changes.
    // A PDF's first highlight creates its note; the sidebar tab then switches from its placeholder to the note.
    this.register(bookNotes.subscribe(documentId => {
      this.readers().forEach(reader => { if (reader.getRecord()?.documentId === documentId) reader.refreshAnnotations(); });
      void following.changed(documentId).catch(reportNoteError);
    }));
    this.addSettingTab(this.settingTab = new ReaderSettingTab(this.app, this));
    // Earlier versions kept records in a visible folder by default; move them to the hidden one once. A chosen folder stays.
    if (this.settings.folder === LEGACY_ANNOTATION_FOLDER) workspace.onLayoutReady(() => void this.moveAnnotations(ANNOTATION_FOLDER, moved =>
      moved ? `Highlight data for ${moved} ${moved === 1 ? "PDF" : "PDFs"} moved to the hidden folder ${ANNOTATION_FOLDER}.` : ""));
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
        const active = this.app.workspace.getActiveFile() ?? following.current?.file;
        if (active?.extension === "pdf") void open(active, undefined, native);
        else new PdfPicker(this.app, file => void open(file, undefined, native)).open();
      },
    });
    this.addCommand({ id: "show-annotations", name: "Toggle book note", callback: () => void toggleAnnotations() });
    const routeNow = () => {
      if (!this.routing) return;
      for (const leaf of this.app.workspace.getLeavesOfType("pdf")) {
        const state = leaf.getViewState().state;
        const path = state?.file;
        if (typeof path !== "string" || this.redirecting.has(leaf)) continue;
        // Obsidian's viewer stays hidden in tabs about to move to Reader; a tab meant to show it is marked.
        if (this.nativeTabs.get(leaf) === path) { leaf.view.containerEl.addClass("reader-native-pdf"); continue; }
        this.nativeTabs.delete(leaf);
        this.redirecting.add(leaf);
        void leaf.setViewState({ type: READER_VIEW, state: { file: path } })
          .catch(error => {
            // Show Obsidian's viewer rather than an empty tab.
            leaf.view.containerEl.addClass("reader-native-pdf");
            new Notice(`Could not open Reader: ${String(error)}`);
          })
          .finally(() => this.redirecting.delete(leaf));
      }
    };
    let routeTimer: ReturnType<typeof setTimeout> | undefined;
    // Events often come in bursts; one pass right after them is enough, and soon enough that Obsidian's viewer does little work first.
    const routePdfs = () => {
      clearTimeout(routeTimer);
      routeTimer = setTimeout(routeNow, 0);
    };
    this.register(() => clearTimeout(routeTimer));
    // PDF is reserved by Obsidian. Route file tabs via public workspace events instead of patching its viewer or registry.
    this.registerEvent(this.app.workspace.on("layout-change", routePdfs));
    this.registerEvent(this.app.workspace.on("file-open", routePdfs));
    this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
      routePdfs();
      this.readers().forEach(reader => { if (reader.leaf !== leaf) reader.hidePopup(); });
      if (leaf && leaf.view.getViewType() !== "pdf") this.nativeTabs.delete(leaf);
      // Switching to another PDF switches the sidebar to its note. Writing in a book note keeps that book as the active PDF;
      // other notes leave the sidebar on the last PDF's note.
      const notePath = leaf?.view instanceof MarkdownView ? leaf.view.file?.path : undefined;
      void following.activate(leaf?.view instanceof ReaderView ? leaf.view : null, notePath).catch(reportNoteError);
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
    /**
     * The passage address under the pointer: a rendered link's address, or, where the editor shows a link as raw text (as it
     * does for the block holding the cursor), the passage link at that spot of the line.
     */
    const passageAt = (target: Element | null): string | null => {
      const rendered = target?.closest?.("a[href^='obsidian://reader-plugin?']");
      if (rendered) return rendered.getAttribute("href");
      if (!target?.closest?.(".cm-link, .cm-url")) return null;
      const view = this.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view).find((view): view is MarkdownView => view instanceof MarkdownView && view.contentEl.contains(target));
      // Obsidian's editor is CodeMirror, which finds the text position of an element on screen.
      const cm = (view?.editor as { cm?: { posAtDOM(node: Node): number } } | undefined)?.cm;
      if (!view || !cm) return null;
      const at = view.editor.offsetToPos(cm.posAtDOM(target));
      for (const match of view.editor.getLine(at.line).matchAll(/\[[^\]]*\]\((obsidian:\/\/reader-plugin\?[^)\s]+)\)/g)) {
        if (at.ch >= match.index && at.ch <= match.index + match[0].length) return match[1]!;
      }
      return null;
    };
    // A passage link opens on press, before the editor moves its cursor into the block and redraws the link as raw text, which
    // Obsidian would then try to open as an empty address. Opening here also avoids handing the obsidian:// address to the
    // operating system, which may not send it back to this Obsidian.
    const openPassageLink = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const href = passageAt(event.target as Element | null);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      void openPassage(Object.fromEntries(new URL(href).searchParams));
    };
    const openPdfLink = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Element | null;
      // The press already opened it; keep Obsidian from following the link as well.
      if (passageAt(target)) {
        event.preventDefault();
        event.stopPropagation();
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
    const listen = (doc: Document) => {
      this.registerDomEvent(doc, "mousedown", openPassageLink, { capture: true });
      this.registerDomEvent(doc, "click", openPdfLink, { capture: true });
    };
    listen(document);
    this.registerEvent(this.app.workspace.on("window-open", win => listen(win.doc)));
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
    this.addCommand({ id: "toggle-highlight-mode", name: "Toggle highlight mode", callback: toggleHighlightMode });
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
    this.paintQuotes?.();
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
      await this.persist();
      // Remove the previous folder only when the disk shows nothing else lives there.
      // Obsidian's non-recursive rmdir fails on empty folders under current Electron, so check first and remove the empty folder.
      const left = await this.app.vault.adapter.list(from).catch(() => null);
      if (left && !left.files.length && !left.folders.length) await this.app.vault.adapter.rmdir(from, true).catch(() => {});
      const message = done ? done(moved) : moved ? `Moved annotations for ${moved} ${moved === 1 ? "PDF" : "PDFs"} to ${folder}.` : `Annotations will be saved in ${folder}.`;
      if (message) new Notice(message);
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
