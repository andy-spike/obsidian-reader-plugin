import { App, normalizePath, TFile } from "obsidian";
import type { Annotation, AnnotationRecord } from "./annotations";
import { quoteNoteComment, quoteNoteIds, quoteNoteName, quoteNoteText, withComment } from "./quote-note";

/** Where a PDF's new quote notes go, and the PDF link they carry. */
export interface QuoteNotePlace { folder: string; source: string }

/**
 * Creates, finds, and removes quote notes, and reads and writes the comments in them.
 * Quote notes are found by the highlight ID in their properties, so renaming or moving one keeps it paired.
 */
export class QuoteNotes {
  /** Quote notes by highlight ID. Obsidian keeps a file's object when it is renamed or moved. */
  private files = new Map<string, TFile>();
  /** The PDF of each highlight with a quote note, by highlight ID. */
  private documents = new Map<string, string>();
  /** Comments by highlight ID, for the Reader's dots and the sidebar's cards. */
  private comments = new Map<string, string>();
  /**
   * Highlight IDs that each PDF had at its last update. Only quote notes of these highlights are removed when the
   * highlight is gone, so a record read before another window's changes never removes a note.
   */
  private known = new Map<string, Set<string>>();
  /** Comments from quote notes removed with their highlight, so undoing the delete brings them back. */
  private removed = new Map<string, string>();
  private listeners = new Set<(documentId: string) => void>();
  private indexed = false;

  constructor(private app: App) {}

  subscribe(listener: (documentId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  find(annotationId: string): TFile | null {
    if (!this.indexed) this.index();
    const file = this.files.get(annotationId);
    return file && this.app.vault.getFileByPath(file.path) === file ? file : null;
  }

  /** The comment in a highlight's quote note, or an empty string. */
  comment(annotationId: string): string {
    return this.comments.get(annotationId) ?? "";
  }

  /** The folder that holds a PDF's quote notes, if it has any. New ones join them there, even after the reader moved them. */
  folderOf(documentId: string): string | null {
    if (!this.indexed) this.index();
    for (const [annotationId, owner] of this.documents) {
      const file = owner === documentId ? this.find(annotationId) : null;
      if (file?.parent) return file.parent.path;
    }
    return null;
  }

  /** Read the comments of a PDF's quote notes without changing anything. */
  async load(record: AnnotationRecord): Promise<void> {
    let changed = false;
    for (const annotation of record.annotations) {
      const file = this.find(annotation.id);
      if (!file) continue;
      changed = this.remember(file, record.documentId, annotation.id, quoteNoteComment(await this.app.vault.cachedRead(file))) || changed;
    }
    if (changed) this.notify(record.documentId);
  }

  /**
   * Creates the missing quote notes of a PDF's highlights and removes those of deleted highlights.
   * A removed note goes to Obsidian's trash; with `keepCommented`, a note with a comment stays.
   * Returns each quote note's link path by highlight ID, for the book note's quote links.
   */
  async sync(record: AnnotationRecord, place: QuoteNotePlace, keepCommented: boolean): Promise<Map<string, string>> {
    const ids = new Set(record.annotations.map(annotation => annotation.id));
    for (const annotationId of this.known.get(record.documentId) ?? []) {
      if (ids.has(annotationId)) continue;
      const file = this.find(annotationId);
      if (!file) continue;
      const comment = quoteNoteComment(await this.app.vault.read(file));
      if (comment && keepCommented) continue;
      if (comment) this.removed.set(annotationId, comment);
      await this.app.fileManager.trashFile(file);
      this.forget(annotationId);
    }
    for (const annotation of record.annotations) {
      if (!this.find(annotation.id)) await this.create(record, annotation, place);
    }
    this.known.set(record.documentId, ids);
    const links = new Map<string, string>();
    for (const annotation of record.annotations) {
      const file = this.find(annotation.id);
      if (file) links.set(annotation.id, file.path.replace(/\.md$/, ""));
    }
    this.notify(record.documentId);
    return links;
  }

  /** Replaces the comment in a highlight's quote note. Cards and dots show it right away, before the write finishes. */
  async write(annotationId: string, comment: string): Promise<void> {
    const file = this.find(annotationId);
    if (!file) throw new Error("This highlight has no quote note yet.");
    const documentId = this.documents.get(annotationId);
    this.comments.set(annotationId, comment.trim());
    if (documentId) this.notify(documentId);
    await this.app.vault.process(file, text => withComment(text, comment));
  }

  /** Follows a note's new text after Obsidian reads it, including notes the reader edits or creates by hand. */
  changed(file: TFile, text: string): void {
    const ids = quoteNoteIds(text);
    const previous = [...this.files].find(([, candidate]) => candidate === file)?.[0];
    if (previous && previous !== ids?.annotationId) {
      const documentId = this.documents.get(previous);
      this.forget(previous);
      if (documentId) this.notify(documentId);
    }
    if (ids && this.remember(file, ids.documentId, ids.annotationId, quoteNoteComment(text))) this.notify(ids.documentId);
  }

  deleted(path: string): void {
    const annotationId = [...this.files].find(([, file]) => file.path === path)?.[0];
    if (!annotationId) return;
    const documentId = this.documents.get(annotationId);
    this.forget(annotationId);
    if (documentId) this.notify(documentId);
  }

  private async create(record: AnnotationRecord, annotation: Annotation, place: QuoteNotePlace): Promise<void> {
    const folder = normalizePath(place.folder);
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder).catch(() => {});
    const name = quoteNoteName(annotation.quote.exact);
    // A second quote that starts the same way gets part of its highlight ID, so its name stays stable.
    const candidates = [name, `${name} (${annotation.id.slice(0, 8)})`, `${name} (${annotation.id})`];
    for (const candidate of candidates) {
      const path = normalizePath(`${folder}/${candidate}.md`);
      const existing = this.app.vault.getFileByPath(path);
      if (existing) {
        // A quote note that Obsidian hasn't indexed yet, such as at startup, is used again rather than duplicated.
        const text = await this.app.vault.read(existing);
        if (quoteNoteIds(text)?.annotationId === annotation.id) {
          this.remember(existing, record.documentId, annotation.id, quoteNoteComment(text));
          return;
        }
        continue;
      }
      const comment = this.removed.get(annotation.id) ?? "";
      const input = { documentId: record.documentId, annotationId: annotation.id, page: annotation.page, quote: annotation.quote.exact, source: place.source };
      const file = await this.app.vault.create(path, quoteNoteText(input, comment));
      this.removed.delete(annotation.id);
      this.remember(file, record.documentId, annotation.id, comment);
      return;
    }
    throw new Error(`Could not find a free name for the quote note in ${folder}.`);
  }

  /** Returns whether the comment changed. */
  private remember(file: TFile, documentId: string, annotationId: string, comment: string): boolean {
    this.files.set(annotationId, file);
    this.documents.set(annotationId, documentId);
    const changed = this.comments.get(annotationId) !== comment;
    this.comments.set(annotationId, comment);
    return changed;
  }

  private forget(annotationId: string): void {
    this.files.delete(annotationId);
    this.documents.delete(annotationId);
    this.comments.delete(annotationId);
  }

  /** Finds quote notes through Obsidian's index of note properties. Notes it hasn't read yet arrive through `changed`. */
  private index(): void {
    // Before the layout is ready, Obsidian may still be loading its index, so look again on the next request.
    this.indexed = this.app.workspace.layoutReady;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const { document, annotation } = (frontmatter ?? {}) as Record<string, unknown>;
      if (typeof document === "string" && typeof annotation === "string" && !this.files.has(annotation)) {
        this.files.set(annotation, file);
        this.documents.set(annotation, document);
      }
    }
  }

  private notify(documentId: string): void {
    this.listeners.forEach(listener => listener(documentId));
  }
}
