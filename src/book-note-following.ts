import type { WorkspaceLeaf } from "obsidian";
import type { AnnotationRecord } from "./annotations";
import type { BookNotes } from "./book-notes";
import type { ReaderView } from "./reader-view";
import type { NotePlace, ReaderSettings } from "./settings";

/** Tab operations only. Following and opening policy belong to BookNoteFollowing. */
export interface BookNoteWorkspace {
  isCurrent(reader: ReaderView): boolean;
  readers(): ReaderView[];
  find(place: NotePlace): WorkspaceLeaf | null;
  create(place: NotePlace, reader: ReaderView | null): WorkspaceLeaf | null;
  display(leaf: WorkspaceLeaf, record: AnnotationRecord | null): Promise<void>;
  visible(leaf: WorkspaceLeaf): boolean;
  dismiss(leaf: WorkspaceLeaf): void;
  reveal(leaf: WorkspaceLeaf): Promise<void>;
}

/** Keeps existing note tabs following a PDF, and remembers when automatic opening was dismissed. */
export class BookNoteFollowing {
  private reader: ReaderView | null = null;
  private dismissed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    private workspace: BookNoteWorkspace,
    private notes: Pick<BookNotes, "load" | "schedule" | "open">,
    private settings: () => Pick<ReaderSettings, "notePlace" | "showAnnotationsOnOpen">,
  ) {}

  get current(): ReaderView | null { return this.reader; }

  async ready(reader: ReaderView): Promise<void> {
    if (this.closed) return;
    const record = reader.getRecord();
    const current = this.reader === reader || this.workspace.isCurrent(reader);
    if (current) this.reader = record ? reader : null;
    if (record) {
      // Load first, so restored note tabs can be recognized by the workspace adapter.
      await this.notes.load(record);
      if (this.closed) return;
      if (record.annotations.length || !record.exportRetired) this.notes.schedule(record);
    }
    if (!current || this.reader !== reader || this.closed) return;
    if (!this.dismissed && this.settings().showAnnotationsOnOpen && record) await this.show(reader, true, this.settings().notePlace);
    else await this.update();
  }

  /** Editing a book note retains its PDF; unrelated notes leave the previous PDF selected. */
  activate(reader: ReaderView | null, notePath?: string): Promise<void> {
    if (this.closed) return Promise.resolve();
    const next = reader ?? (notePath ? this.workspace.readers().find(candidate => candidate.getRecord()?.notePath === notePath) : null);
    if (!next || next === this.reader) return Promise.resolve();
    this.reader = next;
    return this.update();
  }

  changed(documentId: string): Promise<void> {
    return this.reader?.getRecord()?.documentId === documentId ? this.update() : Promise.resolve();
  }

  toggle(place: NotePlace = this.settings().notePlace): Promise<void> {
    return this.serial(async () => {
      const leaf = this.workspace.find(place);
      if (leaf && this.workspace.visible(leaf)) {
        this.dismissed = true;
        this.workspace.dismiss(leaf);
      } else {
        this.dismissed = false;
        await this.display(this.reader, true, place);
      }
    });
  }

  async open(reader: ReaderView, annotationId: string | null, place: NotePlace = this.settings().notePlace): Promise<void> {
    const record = reader.getRecord();
    if (!record || this.closed) return;
    this.reader = reader;
    this.dismissed = false;
    // Keep this explicit request tied to its PDF even if another PDF becomes active during the note write.
    await this.notes.open(record, annotationId, () => this.show(reader, true, place));
  }

  dispose(): void { this.closed = true; }

  private update(): Promise<void> {
    return this.serial(async () => {
      for (const place of ["sidebar", "beside"] as const) {
        if (this.workspace.find(place)) await this.display(this.reader, false, place);
      }
    });
  }

  private show(reader: ReaderView, reveal: boolean, place: NotePlace): Promise<WorkspaceLeaf | null> {
    return this.serial(() => this.display(reader, reveal, place), null);
  }

  private async display(reader: ReaderView | null, reveal: boolean, place: NotePlace): Promise<WorkspaceLeaf | null> {
    if (this.closed) return null;
    const leaf = this.workspace.find(place) ?? this.workspace.create(place, reader);
    if (!leaf) return null;
    await this.workspace.display(leaf, reader?.getRecord() ?? null);
    if (reveal && !this.closed) await this.workspace.reveal(leaf);
    return this.closed ? null : leaf;
  }

  private serial<T>(action: () => Promise<T>, closed: T): Promise<T>;
  private serial(action: () => Promise<void>): Promise<void>;
  private serial<T>(action: () => Promise<T>, closed?: T): Promise<T | undefined> {
    const next = this.queue.catch(() => {}).then(() => this.closed ? closed : action());
    this.queue = next;
    return next;
  }
}
