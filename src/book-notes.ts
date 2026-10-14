import { App, MarkdownView, normalizePath, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type { Annotation, AnnotationRecord, AnnotationStore } from "./annotations";
import { defaultNoteHeader, dropPdfLinks, fillTemplate, findSections, insertSection, noteFileName, placeComments, placedComments, quoteText, removeSection, type MovedComment, type SectionInput } from "./book-note";
import type { ReaderSettings } from "./settings";

const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const byPosition = (a: Annotation, b: Annotation) => a.page - b.page || a.position.start - b.position.start;
/** Comments still in the record from before book notes, in reading order. */
const comments = (record: AnnotationRecord): MovedComment[] =>
  [...record.annotations].sort(byPosition).filter(annotation => annotation.comment.trim()).map(annotation => ({ id: annotation.id, comment: annotation.comment }));

/**
 * Keeps each PDF's book note in step with its highlights. The note belongs to the reader: this class creates it, adds a
 * quote section for each new highlight, and removes the section of a deleted highlight only when nothing is written
 * under it. It reads the note to show what the reader wrote, and never edits that writing.
 *
 * Changes run after saves made in this window, so two Obsidian windows on one vault don't both add the same section.
 */
export class BookNotes {
  private queues = new Map<string, Promise<unknown>>();
  private timers = new Map<string, number>();
  /** What the reader wrote under each passage, by document ID and then annotation ID. */
  private writings = new Map<string, Map<string, string>>();
  /** Book note paths that have been read, mapped to their document IDs, to refresh previews when a note changes. */
  private paths = new Map<string, string>();
  private listeners = new Set<(documentId: string) => void>();
  /**
   * The quotes of each PDF's highlights at its last update, by document ID and then annotation ID. A deleted highlight is
   * no longer in its record, so this is how an untouched section is told apart from one whose quote the reader edited.
   */
  private quotes = new Map<string, Map<string, string>>();

  constructor(private app: App, private store: AnnotationStore, private settings: () => ReaderSettings) {}

  subscribe(listener: (documentId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The book note, if it exists. */
  file(record: AnnotationRecord): TFile | null {
    const file = record.notePath ? this.app.vault.getAbstractFileByPath(record.notePath) : null;
    return file instanceof TFile ? file : null;
  }

  /** What the reader wrote under a passage in the book note, or an empty string. */
  writing(record: AnnotationRecord, annotationId: string): string {
    return this.writings.get(record.documentId)?.get(annotationId) ?? "";
  }

  /** Reads the book note so previews can show it. Doesn't create or change anything. */
  async load(record: AnnotationRecord): Promise<void> {
    const file = this.file(record);
    if (file) this.read(record.documentId, file.path, await this.app.vault.cachedRead(file));
  }

  /** Call when a file in the vault changes; a book note's previews are read again. */
  async changed(file: TFile): Promise<void> {
    const documentId = this.paths.get(file.path);
    if (documentId) this.read(documentId, file.path, await this.app.vault.cachedRead(file));
  }

  /** Call while a note is being edited, before Obsidian saves it; a book note's previews follow the editor after a short pause. */
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
      void this.sync(record).catch(error => console.error("Reader Plugin: could not update the book note.", error));
    }, 400));
  }

  dispose(): void {
    this.timers.forEach(timer => window.clearTimeout(timer));
    this.timers.clear();
    this.listeners.clear();
  }

  /** Creates the book note if needed and adds or removes sections to match the highlights. Runs one at a time per PDF. */
  sync(record: AnnotationRecord): Promise<TFile | null> {
    const previous = this.queues.get(record.documentId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.update(record));
    this.queues.set(record.documentId, next);
    return next;
  }

  private async update(record: AnnotationRecord): Promise<TFile | null> {
    let file = this.file(record);
    if (file) await this.app.vault.process(file, text => this.reconcile(text, record));
    else if (record.annotations.length) file = await this.create(record);
    let changed = false;
    if (file) {
      const text = await this.app.vault.read(file);
      this.read(record.documentId, file.path, text);
      this.quotes.set(record.documentId, new Map(record.annotations.map(annotation => [annotation.id, quoteText(annotation.quote.exact)])));
      // Comments from before book notes are cleared from the record only once the note on disk holds them.
      const placed = placedComments(text, comments(record));
      for (const annotation of record.annotations) if (placed.has(annotation.id)) { annotation.comment = ""; changed = true; }
      if (record.notePath !== file.path) { record.notePath = file.path; changed = true; }
    }
    if (!record.exportRetired && !comments(record).length) {
      await this.retireExport(record);
      record.exportRetired = true;
      changed = true;
    }
    if (changed) await this.store.save(record);
    return file;
  }

  /**
   * Before book notes, the plugin wrote a Markdown file of passages and comments next to each record. The book note replaces
   * it, so it goes to the trash, unless a note links to it; then it stays and a notice says so.
   */
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

  private input(record: AnnotationRecord, annotation: Annotation): SectionInput {
    return { documentId: record.documentId, annotationId: annotation.id, page: annotation.page, quote: annotation.quote.exact };
  }

  /**
   * Adds missing sections in reading order. Removes the section of a highlight deleted since the last update, only when nothing
   * is written under it and its quote is unchanged; sections of highlights this window never saw are left alone.
   */
  private reconcile(text: string, record: AnnotationRecord): string {
    text = dropPdfLinks(text);
    const ids = new Set(record.annotations.map(annotation => annotation.id));
    const known = this.quotes.get(record.documentId);
    for (const section of findSections(text).reverse()) {
      if (!ids.has(section.id) && !section.writing && known?.get(section.id) === quoteText(section.quote)) text = removeSection(text, section);
    }
    const sorted = [...record.annotations].sort(byPosition);
    for (const annotation of sorted) {
      const sections = findSections(text);
      if (sections.some(section => section.id === annotation.id)) continue;
      // The first section of a highlight that comes later in the book, so the note keeps reading order.
      const later = sections.find(section => {
        const other = record.annotations.find(candidate => candidate.id === section.id);
        return other && byPosition(annotation, other) < 0;
      }) ?? null;
      text = insertSection(text, this.input(record, annotation), later);
    }
    return placeComments(text, comments(record));
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
    const file = await this.app.vault.create(path, this.reconcile(header.endsWith("\n") ? header : header + "\n", record));
    if (template instanceof TFile) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => { frontmatter.source ??= source; });
    }
    return file;
  }

  private async isNoteFor(file: TFile, record: AnnotationRecord): Promise<boolean> {
    return (await this.app.vault.cachedRead(file)).includes(`document=${record.documentId}&`);
  }

  private async adopt(file: TFile, record: AnnotationRecord): Promise<TFile> {
    await this.app.vault.process(file, text => this.reconcile(text, record));
    return file;
  }

  /**
   * Opens the book note, creating it if needed, beside `near` or in a new tab. With an annotation, the cursor goes to the
   * end of what is written under that passage, leaving a blank line to type on when nothing is written yet.
   */
  async open(record: AnnotationRecord, annotationId: string | null, near: WorkspaceLeaf | null): Promise<void> {
    const file = await this.sync(record);
    if (!file) return;
    let leaf: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves(candidate => {
      if (!leaf && candidate.view instanceof MarkdownView && candidate.view.file === file) leaf = candidate;
    });
    if (!leaf) {
      leaf = this.settings().noteOpening === "split" && near ? this.app.workspace.createLeafBySplit(near, "vertical") : this.app.workspace.getLeaf("tab");
      await leaf.openFile(file, { state: { mode: "source" } });
    }
    const target: WorkspaceLeaf = leaf;
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
