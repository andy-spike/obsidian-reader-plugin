import { App, MarkdownView, normalizePath, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type { AnnotationRecord, AnnotationStore } from "./annotations";
import { BookNoteReconciler, defaultNoteHeader, fillTemplate, findSections, noteFileName } from "./book-note";
import type { ReaderSettings } from "./settings";

function localDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
/**
 * Reads and writes book notes while the reconciler protects the reader's writing.
 * Local annotation saves trigger updates; other windows handle their own changes.
 */
export class BookNotes {
  private queues = new Map<string, Promise<unknown>>();
  private timers = new Map<string, number>();
  /** What the reader wrote under each passage, by document ID and then annotation ID. */
  private writings = new Map<string, Map<string, string>>();
  /** Book note paths that have been read, mapped to their document IDs, to refresh previews when a note changes. */
  private paths = new Map<string, string>();
  private listeners = new Set<(documentId: string) => void>();
  private reconciler = new BookNoteReconciler();

  constructor(private app: App, private store: AnnotationStore, private settings: () => ReaderSettings) {}

  /** Recognizes note paths already loaded by this window. */
  isNote(path: unknown): boolean {
    return typeof path === "string" && this.paths.has(path);
  }

  subscribe(listener: (documentId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  file(record: AnnotationRecord): TFile | null {
    const file = record.notePath ? this.app.vault.getAbstractFileByPath(record.notePath) : null;
    return file instanceof TFile ? file : null;
  }

  /** What the reader wrote under a passage in the book note, or an empty string. */
  writing(record: AnnotationRecord, annotationId: string): string {
    return this.writings.get(record.documentId)?.get(annotationId) ?? "";
  }

  /** Read writing previews without creating or changing a note. */
  async load(record: AnnotationRecord): Promise<void> {
    const file = this.file(record);
    if (file) this.read(record.documentId, file.path, await this.app.vault.cachedRead(file));
  }

  /** Refresh previews after a vault edit. */
  async changed(file: TFile): Promise<void> {
    const documentId = this.paths.get(file.path);
    if (documentId) this.read(documentId, file.path, await this.app.vault.cachedRead(file));
  }

  /** Follow unsaved editor text after a short pause. */
  edited(path: string, text: () => string): void {
    const documentId = this.paths.get(path);
    if (!documentId) return;
    window.clearTimeout(this.timers.get(`edit:${path}`));
    this.timers.set(`edit:${path}`, window.setTimeout(() => {
      this.timers.delete(`edit:${path}`);
      if (this.paths.get(path) === documentId) this.read(documentId, path, text());
    }, 300));
  }

  renamed(file: TFile, oldPath: string): void {
    const documentId = this.paths.get(oldPath);
    if (!documentId) return;
    this.paths.delete(oldPath);
    this.paths.set(file.path, documentId);
  }

  deleted(path: string): void {
    const documentId = this.paths.get(path);
    if (!documentId) return;
    this.paths.delete(path);
    this.writings.delete(documentId);
    this.listeners.forEach(listener => listener(documentId));
  }

  private read(documentId: string, path: string, text: string): void {
    this.paths.set(path, documentId);
    const previous = this.writings.get(documentId);
    const next = new Map(findSections(text).map(section => [section.id, section.writing]));
    this.writings.set(documentId, next);
    if (!previous || previous.size !== next.size || [...next].some(([id, writing]) => previous.get(id) !== writing)) {
      this.listeners.forEach(listener => listener(documentId));
    }
  }

  /** Brings the note up to date shortly after a save, once a burst of edits settles. */
  schedule(record: AnnotationRecord): void {
    window.clearTimeout(this.timers.get(record.documentId));
    this.timers.set(record.documentId, window.setTimeout(() => {
      this.timers.delete(record.documentId);
      void this.sync(record).catch(error => console.error("Reading Desk: could not update the book note.", error));
    }, 400));
  }

  dispose(): void {
    this.timers.forEach(timer => window.clearTimeout(timer));
    this.timers.clear();
    this.listeners.clear();
  }

  /** Create or reconcile a note, one update at a time per PDF. */
  sync(record: AnnotationRecord): Promise<TFile | null> {
    const previous = this.queues.get(record.documentId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.update(record));
    this.queues.set(record.documentId, next);
    return next;
  }

  private async update(record: AnnotationRecord): Promise<TFile | null> {
    let file = this.file(record);
    if (file) await this.app.vault.process(file, text => this.reconciler.reconcile(text, record));
    else if (record.annotations.length) file = await this.create(record);
    let changed = false;
    if (file) {
      const text = await this.app.vault.read(file);
      this.read(record.documentId, file.path, text);
      // Comments from before book notes are cleared from the record only once the note on disk holds them.
      const placed = this.reconciler.confirm(record, text);
      for (const annotation of record.annotations) if (placed.has(annotation.id)) { annotation.comment = ""; changed = true; }
      if (record.notePath !== file.path) { record.notePath = file.path; changed = true; }
    }
    if (!record.exportRetired && !record.annotations.some(annotation => annotation.comment.trim())) {
      await this.retireExport(record);
      record.exportRetired = true;
      changed = true;
    }
    if (changed) await this.store.save(record);
    return file;
  }

  /** Trash the legacy Markdown export unless other notes still link to it. */
  private async retireExport(record: AnnotationRecord): Promise<void> {
    const path = normalizePath(`${this.store.folder}/${record.documentId}.md`);
    const old = this.app.vault.getAbstractFileByPath(path);
    if (!(old instanceof TFile)) return;
    // Links to it contain its name, the document ID. Passage links in book notes contain `document=<ID>` and don't count.
    // Reading notes doesn't depend on Obsidian's link index, which may still be building at startup.
    const mention = new RegExp(`(?<!document=)${record.documentId}`);
    for (const note of this.app.vault.getMarkdownFiles()) {
      if (note.path !== path && mention.test(await this.app.vault.cachedRead(note))) {
        new Notice(`Kept ${path}, the old annotation file for ${record.sourcePath.split("/").pop()}, because other notes link to it. Its passages and comments are now in the book note.`, 10000);
        return;
      }
    }
    await this.app.fileManager.trashFile(old);
  }

  private async create(record: AnnotationRecord): Promise<TFile> {
    const pdf = this.app.vault.getAbstractFileByPath(record.sourcePath);
    const title = pdf instanceof TFile ? pdf.basename : record.sourcePath.split("/").pop()!.replace(/\.pdf$/i, "");
    const folder = this.settings().notesFolder;
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder).catch(() => {});
    const name = noteFileName(title);
    let path = normalizePath(`${folder}/${name}.md`);
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) {
      // A note left from before, such as one whose record was lost, is used again if it is about the same PDF.
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile && await this.isNoteFor(existing, record)) return this.adopt(existing, record);
      path = normalizePath(`${folder}/${name} (${n}).md`);
    }
    const source = pdf instanceof TFile ? `[[${this.app.metadataCache.fileToLinktext(pdf, path, false)}]]` : `[[${record.sourcePath}]]`;
    let header = defaultNoteHeader(source);
    const template = this.settings().noteTemplate ? this.app.vault.getAbstractFileByPath(this.settings().noteTemplate) : null;
    if (template instanceof TFile) header = fillTemplate(await this.app.vault.read(template), { title, source, date: localDate() });
    const file = await this.app.vault.create(path, this.reconciler.reconcile(header.endsWith("\n") ? header : header + "\n", record));
    if (template instanceof TFile) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => { frontmatter.source ??= source; });
    }
    return file;
  }

  private async isNoteFor(file: TFile, record: AnnotationRecord): Promise<boolean> {
    return (await this.app.vault.cachedRead(file)).includes(`document=${record.documentId}&`);
  }

  private async adopt(file: TFile, record: AnnotationRecord): Promise<TFile> {
    await this.app.vault.process(file, text => this.reconciler.reconcile(text, record));
    return file;
  }

  /** Open the note in the supplied tab, with the cursor ready to write under the requested passage. */
  async open(record: AnnotationRecord, annotationId: string | null, show: (file: TFile) => Promise<WorkspaceLeaf | null>): Promise<void> {
    const file = await this.sync(record);
    if (!file) return;
    const target = await show(file);
    if (!target) return;
    await this.app.workspace.revealLeaf(target);
    this.app.workspace.setActiveLeaf(target, { focus: true });
    if (annotationId && target.view instanceof MarkdownView) this.placeCursor(target.view, annotationId);
  }

  private placeCursor(view: MarkdownView, annotationId: string): void {
    const editor = view.editor;
    const section = findSections(editor.getValue()).find(candidate => candidate.id === annotationId);
    if (!section) return;
    let line: number;
    if (section.writing) {
      line = section.writingEnd - 1;
      while (line > section.writingStart && !editor.getLine(line).trim()) line--;
    } else {
      // A blank line after the block ID, one to type on, and one before whatever follows.
      const anchor = (section.idLine >= 0 ? section.idLine : section.calloutEnd - 1) + 1;
      const atEnd = section.writingEnd >= editor.lineCount();
      const needed = atEnd ? 2 : 3;
      const blank = section.writingEnd - anchor;
      if (blank < needed) editor.replaceRange("\n".repeat(needed - blank), { line: anchor, ch: 0 });
      line = anchor + 1;
    }
    editor.setCursor({ line, ch: editor.getLine(line).length });
    editor.scrollIntoView({ from: { line: section.start, ch: 0 }, to: { line, ch: 0 } }, true);
    editor.focus();
  }
}
