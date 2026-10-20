import { createHash, randomUUID } from "node:crypto";
import { isSameOrInside } from "./paths";

/** A hidden folder: Obsidian leaves it out of the file list, search, and graph. Sync tools that copy hidden files still carry it. */
export const ANNOTATION_FOLDER = ".reader-annotations";
/** The visible default of earlier versions. Records there move to the hidden folder once. */
export const LEGACY_ANNOTATION_FOLDER = "Reader annotations";
export interface Rect { x: number; y: number; width: number; height: number }
export interface Annotation {
  id: string;
  page: number;
  /** Palette entry ID from plugin settings. Unknown IDs render in a neutral color. */
  color: string;
  quote: { exact: string; prefix: string; suffix: string };
  position: { start: number; end: number };
  rects: Rect[];
  comment: string;
  createdAt: string;
}
export interface AnnotationRecord {
  version: 1;
  documentId: string;
  sourcePath: string;
  fingerprint: string;
  /** The book note for this PDF, once one exists. */
  notePath?: string;
  /** Set once the Markdown file that versions before book notes generated beside the record has been handled. */
  exportRetired?: boolean;
  annotations: Annotation[];
}
export interface Storage {
  list(path: string): Promise<{ files: string[] }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}
export function fingerprint(data: ArrayBuffer): string {
  return createHash("sha256").update(new Uint8Array(data)).digest("hex");
}
export function parseRecord(text: string): AnnotationRecord {
  const r = JSON.parse(text) as AnnotationRecord;
  if (r.version !== 1 || typeof r.documentId !== "string" || !/^[\w-]+$/.test(r.documentId) || typeof r.sourcePath !== "string" ||
      !/^[a-f0-9]{64}$/.test(r.fingerprint) || !Array.isArray(r.annotations) || (r.notePath !== undefined && typeof r.notePath !== "string") ||
      (r.exportRetired !== undefined && typeof r.exportRetired !== "boolean")) throw new Error("Unsupported annotation record.");
  const ids = new Set<string>();
  for (const a of r.annotations) {
    if (typeof a.id !== "string" || !/^[\w-]+$/.test(a.id) || ids.has(a.id) || !Number.isInteger(a.page) || a.page < 1 ||
        typeof a.color !== "string" || !/^[\w-]+$/.test(a.color) || typeof a.comment !== "string" || typeof a.createdAt !== "string" ||
        typeof a.quote?.exact !== "string" || typeof a.quote.prefix !== "string" || typeof a.quote.suffix !== "string" ||
        !Number.isInteger(a.position?.start) || !Number.isInteger(a.position.end) || a.position.start < 0 || a.position.end <= a.position.start ||
        !Array.isArray(a.rects) || !a.rects.length || a.rects.some(rect =>
          ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.001 || rect.y + rect.height > 1.001)) {
      throw new Error("Invalid annotation record. The original file has been preserved.");
    }
    ids.add(a.id);
  }
  return r;
}

/** One shared record per document and one write queue across all Reader leaves. */
export type SaveState = { saving: boolean; error: string | null };
export class AnnotationStore {
  private records = new Map<string, AnnotationRecord>();
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<(record: AnnotationRecord) => void>();
  private states = new Map<string, SaveState>();
  private revisions = new Map<string, number>();
  private retries = new Map<string, number>();
  private closed = false;
  folder: string;
  constructor(private storage: Storage, options: { folder?: string } = {}) {
    this.folder = options.folder ?? ANNOTATION_FOLDER;
  }
  subscribe(listener: (record: AnnotationRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  state(record: AnnotationRecord): SaveState { return this.states.get(record.documentId) ?? { saving: false, error: null }; }
  private notify(record: AnnotationRecord): void { this.listeners.forEach(listener => listener(record)); }
  dispose(): void {
    this.closed = true;
    this.retries.forEach(timer => window.clearTimeout(timer));
    this.retries.clear();
    this.listeners.clear();
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
  /** Moves every record to a new folder before later writes use it, with any Markdown file older versions generated beside it. */
  relocate(folder: string, move: (from: string, to: string) => Promise<void>): Promise<number> {
    return this.serial(async () => {
      const from = this.folder;
      if (folder === from) return 0;
      let moved = 0;
      if (await this.storage.exists(from)) {
        const records = (await this.storage.list(from)).files.filter(path => /\/[\w-]+\.json$/.test(path));
        if (records.length && !await this.storage.exists(folder)) await this.storage.mkdir(folder);
        for (const path of records) {
          const id = parseRecord(await this.storage.read(path)).documentId;
          for (const extension of [".json", ".md"]) {
            const source = `${from}/${id}${extension}`, target = `${folder}/${id}${extension}`;
            if (!await this.storage.exists(source)) continue;
            if (await this.storage.exists(target)) throw new Error(`${target} already exists.`);
            await move(source, target);
          }
          moved++;
        }
      }
      this.folder = folder;
      return moved;
    });
  }
  open(sourcePath: string, hash: string): Promise<AnnotationRecord> {
    return this.serial(async () => {
      if (!await this.storage.exists(this.folder)) await this.storage.mkdir(this.folder);
      for (const path of (await this.storage.list(this.folder)).files.filter(path => path.endsWith(".json"))) {
        const loaded = parseRecord(await this.storage.read(path));
        if (!this.records.has(loaded.documentId)) this.records.set(loaded.documentId, loaded);
      }
      const records = [...this.records.values()];
      const samePath = records.find(r => r.sourcePath === sourcePath);
      if (samePath && samePath.fingerprint !== hash) throw new Error("This PDF has changed since it was annotated. Restore the original PDF or move the new edition to a different vault path.");
      let moved: AnnotationRecord | undefined;
      for (const candidate of records) {
        if (candidate.fingerprint === hash && !await this.storage.exists(candidate.sourcePath)) { moved = candidate; break; }
      }
      const record = samePath ?? moved ?? {
        version: 1 as const, documentId: randomUUID(), sourcePath, fingerprint: hash, annotations: [],
      };
      record.sourcePath = sourcePath;
      this.records.set(record.documentId, record);
      await this.write(record);
      return record;
    });
  }
  save(record: AnnotationRecord): Promise<void> {
    const id = record.documentId;
    const revision = (this.revisions.get(id) ?? 0) + 1;
    this.revisions.set(id, revision);
    window.clearTimeout(this.retries.get(id));
    this.retries.delete(id);
    this.states.set(id, { saving: true, error: null });
    this.notify(record);
    return this.serial(async () => {
      if (this.revisions.get(id) !== revision) return;
      try {
        // Freeze one revision, so edits made during the write go into the next one.
        const snapshot = JSON.parse(JSON.stringify(record)) as AnnotationRecord;
        await this.write(snapshot);
        if (this.revisions.get(id) === revision) {
          this.states.set(id, { saving: false, error: null });
          this.notify(record);
        }
      } catch (error) {
        if (this.revisions.get(id) === revision) {
          this.states.set(id, { saving: false, error: error instanceof Error ? error.message : String(error) });
          this.notify(record);
          if (!this.closed) this.retries.set(id, window.setTimeout(() => {
            this.retries.delete(id);
            void this.save(record).catch(() => {});
          }, 2000));
        }
        throw error;
      }
    });
  }
  private async write(record: AnnotationRecord): Promise<void> {
    const path = `${this.folder}/${record.documentId}`;
    await this.storage.write(`${path}.json`, JSON.stringify(record, null, 2) + "\n");
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.serial(async () => {
      if (!await this.storage.exists(this.folder)) return;
      for (const path of (await this.storage.list(this.folder)).files.filter(path => path.endsWith(".json"))) {
        const loaded = parseRecord(await this.storage.read(path));
        const record = this.records.get(loaded.documentId) ?? loaded;
        const moves = (path: string | undefined) => !!path && isSameOrInside(path, oldPath);
        if (moves(record.sourcePath) || moves(record.notePath)) {
          if (moves(record.sourcePath)) record.sourcePath = newPath + record.sourcePath.slice(oldPath.length);
          if (moves(record.notePath)) record.notePath = newPath + record.notePath!.slice(oldPath.length);
          this.records.set(record.documentId, record);
          await this.write(record);
          this.notify(record);
        }
      }
    });
  }
  /** Records opened so far, such as for coloring their quotes in book notes. */
  loaded(): AnnotationRecord[] { return [...this.records.values()]; }

  async find(id: string): Promise<AnnotationRecord | null> {
    const path = `${this.folder}/${id}.json`;
    if (!/^[\w-]+$/.test(id) || !await this.storage.exists(path)) return null;
    return parseRecord(await this.storage.read(path));
  }
}
