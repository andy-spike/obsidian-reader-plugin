/** A page, its visible offset, and either a fixed zoom or a fit mode. Shared by persistence and Reader views. */
export interface ReadingPosition { page: number; offset: number; zoom: number | "width" | "page" }

export interface ReadingStateStorage {
  read(): Promise<unknown>;
  write(data: unknown): Promise<void>;
}

const MAX_POSITIONS = 200;
const WRITE_DELAY = 1000;

/** Settings and positions share one data file, so their writes and external reloads need one owner. */
export class SavedReadingState<Settings extends object> {
  settings: Settings;
  private positions: Map<string, ReadingPosition>;
  /** Includes deleted paths, so an external reload cannot resurrect a pending rename or eviction. */
  private pending = new Map<string, number>();
  private revision = 0;
  private reloadToken = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | null = null;
  private unsaved = false;
  private closed = false;

  constructor(
    data: unknown,
    private storage: ReadingStateStorage,
    private parseSettings: (data: unknown) => Settings,
    private reportError: (error: unknown) => void,
  ) {
    this.settings = parseSettings(data);
    this.positions = loadPositions(data);
  }

  position(path: string): ReadingPosition | undefined {
    const position = this.positions.get(path);
    return position ? { ...position } : undefined;
  }

  remember(path: string, position: ReadingPosition): void {
    if (this.closed) return;
    const previous = this.positions.get(path);
    this.positions.delete(path);
    this.positions.set(path, { ...position });
    if (previous && previous.page === position.page && previous.offset === position.offset && previous.zoom === position.zoom) return;
    this.pending.set(path, ++this.revision);
    while (this.positions.size > MAX_POSITIONS) {
      const oldest = this.positions.keys().next().value!;
      this.positions.delete(oldest);
      this.pending.set(oldest, this.revision);
    }
    this.schedule();
  }

  rename(oldPath: string, newPath: string): void {
    if (this.closed) return;
    for (const [path, position] of [...this.positions]) {
      if (path !== oldPath && !path.startsWith(oldPath + "/")) continue;
      this.positions.delete(path);
      this.pending.set(path, ++this.revision);
      const target = newPath + path.slice(oldPath.length);
      this.positions.delete(target);
      this.positions.set(target, position);
      this.pending.set(target, this.revision);
    }
    if (this.pending.size) this.schedule();
  }

  /** External settings win; local positions not yet saved, including in-flight writes, stay local. */
  async reload(): Promise<void> {
    const token = ++this.reloadToken;
    const data = await this.storage.read();
    if (this.closed || token !== this.reloadToken) return;
    const settings = this.parseSettings(data);
    const positions = loadPositions(data);
    for (const path of this.pending.keys()) {
      positions.delete(path);
      const position = this.positions.get(path);
      if (position) positions.set(path, position);
    }
    trimPositions(positions);
    const changed = JSON.stringify(settings) !== JSON.stringify(this.settings) ||
      JSON.stringify([...positions]) !== JSON.stringify([...this.positions]);
    this.settings = settings;
    this.positions = positions;
    // An in-flight snapshot may now be stale. Its write loop will follow it with the adopted external data.
    if (changed) this.revision++;
  }

  /** Explicit settings saves and position flushes use the same serialized write loop. */
  flush(): Promise<void> {
    this.cancelScheduledWrite();
    ++this.revision;
    this.unsaved = true;
    if (!this.writing) this.writing = Promise.resolve().then(() => this.write()).finally(() => { this.writing = null; });
    return this.writing;
  }

  /** Called after Reader views have recorded their final positions. No debounce or retry survives unloading. */
  close(): Promise<void> {
    this.closed = true;
    this.cancelScheduledWrite();
    return this.pending.size || this.unsaved || this.writing ? this.flush() : Promise.resolve();
  }

  private async write(): Promise<void> {
    try {
      let snapshotRevision: number;
      do {
        snapshotRevision = this.revision;
        const snapshot = JSON.parse(JSON.stringify({ ...this.settings, positions: Object.fromEntries(this.positions) }));
        await this.storage.write(snapshot);
        for (const [path, revision] of this.pending) if (revision <= snapshotRevision) this.pending.delete(path);
      } while (snapshotRevision !== this.revision);
      this.unsaved = false;
      this.cancelScheduledWrite();
    } catch (error) {
      // Keep pending positions through failures and external reloads. Background writes retry after the debounce interval.
      if (!this.closed) this.schedule();
      throw error;
    }
  }

  private cancelScheduledWrite(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(this.reportError); }, WRITE_DELAY);
  }
}

function trimPositions(positions: Map<string, ReadingPosition>): void {
  while (positions.size > MAX_POSITIONS) positions.delete(positions.keys().next().value!);
}

function loadPositions(data: unknown): Map<string, ReadingPosition> {
  const saved = (data as { positions?: unknown } | null)?.positions;
  const positions = new Map<string, ReadingPosition>();
  if (!saved || typeof saved !== "object") return positions;
  for (const [path, value] of Object.entries(saved)) {
    const { page, offset, zoom } = (value ?? {}) as Partial<ReadingPosition>;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1) continue;
    if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0 || offset > 1) continue;
    const validZoom = zoom === "width" || zoom === "page" || typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0;
    if (!validZoom) continue;
    positions.set(path, { page, offset, zoom });
  }
  trimPositions(positions);
  return positions;
}
