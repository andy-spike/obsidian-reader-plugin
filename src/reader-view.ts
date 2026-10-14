import { FileView, Menu, Scope, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { randomUUID } from "node:crypto";
import { Annotation, AnnotationRecord, AnnotationStore, fingerprint, Rect } from "./annotations";
import type { ReadingPosition } from "./reading-state";
import type { NotePlace } from "./settings";
import { AnnotationPopup, PopupAnchor } from "./annotation-popup";
import { loadPdf, PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderingCancelledException, RenderTask, TextLayer } from "./pdf-engine";
import { colorOf, type HighlightColor, ReaderSettings } from "./settings";
import { checkMenu, colorMenu, deleteAnnotation } from "./ui";
import { OutlineModal } from "./outline-modal";
import type { OutlineNode } from "./components/OutlineTree.svelte";
import ReaderControls, { type ControlsState } from "./components/ReaderControls.svelte";
import { mount, unmount } from "svelte";

export const READER_VIEW = "reader-plugin-pdf";
/** PDF points to CSS pixels, so 100% matches the printed page size like other PDF viewers. */
const CSS_UNITS = 96 / 72;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
/** Matches the horizontal padding of `.reader-pages`. */
const PADDING = 24;
/** Space kept clear of the floating page and zoom controls. */
const CONTROLS_CLEARANCE = 72;
const MAX_CANVAS_PIXELS = 2 ** 24;

type Fit = "width" | "page" | null;
type Passage = Pick<Annotation, "page" | "quote" | "position" | "rects">;
interface PageSlot {
  number: number;
  el: HTMLElement;
  /** Unscaled size in PDF points. Pages use the first page's size until they load. */
  width: number;
  height: number;
  proxy: PDFPageProxy | null;
  canvas: HTMLCanvasElement | null;
  task: RenderTask | null;
  renderedZoom: number;
  text: { layer: TextLayer; el: HTMLElement } | null;
  token: number;
  busy: boolean;
}
export interface ReaderHost {
  store: AnnotationStore;
  settings(): ReaderSettings;
  ready(reader: ReaderView): void;
  /** Shows or hides the book note, in the place from settings unless one is given. */
  toggleAnnotations(place?: NotePlace): void;
  /** Turns highlight mode on or off for every Reader. */
  toggleHighlightMode(): void;
  /** Sets the color highlight mode uses and turns the mode on. */
  chooseHighlightModeColor(id: string): void;
  openNative(file: TFile): void;
  /** Opens this PDF's book note, at a passage's section when given. */
  openNote(reader: ReaderView, annotationId: string | null, place?: NotePlace): void;
  /** What the reader wrote under a passage in the book note, or an empty string. */
  writing(record: AnnotationRecord, annotationId: string): string;
  lastPosition(path: string): ReadingPosition | undefined;
  rememberPosition(path: string, position: ReadingPosition): void;
}

const titleOf = (path: unknown): string => typeof path === "string" ? path.split("/").pop()!.replace(/\.pdf$/i, "") : "";

export class ReaderView extends FileView {
  private pdf: PDFDocumentProxy | null = null;
  private loading: PDFDocumentLoadingTask | null = null;
  private record: AnnotationRecord | null = null;
  private slots: PageSlot[] = [];
  private active = new Set<PageSlot>();
  private generation = 0;
  private zoom = 1;
  private fit: Fit = "width";
  private page = 1;
  private restore: { page?: number; offset?: number; zoom?: unknown } | null = null;
  /** Last reading position measured while visible. Hidden tabs have no layout to measure. */
  private position: { page: number; offset: number } | null = null;
  private settling = false;
  private settleTimer: number | undefined;
  private frame = 0;
  private passages: Passage[] = [];
  private lastColor = "";
  private pointer = { x: 0, y: 0, down: false, dismissed: false };
  private hovered: string | null = null;
  private flashing: string | null = null;
  private stage!: HTMLElement;
  private pages!: HTMLElement;
  private message!: HTMLElement;
  /** While a PDF opens, its pages and controls stay invisible until the pages in view are drawn, so they appear at once. */
  private openingTimer: number | undefined;
  private messageTimer: number | undefined;
  private hint!: HTMLElement;
  private toastEl: HTMLElement | null = null;
  private toastTimer: number | undefined;
  private controls!: ReturnType<typeof mount<Record<string, unknown>, { update(state: ControlsState): void }>>;
  private outlineAction!: HTMLElement;
  private modeAction!: HTMLElement;
  private popup!: AnnotationPopup;

  /** The file name to show until the PDF has loaded, so the tab title doesn't change while it opens. */
  private pendingTitle: string;
  constructor(leaf: WorkspaceLeaf, private host: ReaderHost) {
    super(leaf);
    // A tab moved here from Obsidian's PDF viewer still shows that file while this view is created.
    this.pendingTitle = titleOf(leaf.getViewState().state?.file);
  }
  getViewType(): string { return READER_VIEW; }
  getDisplayText(): string { return this.file?.basename ?? this.pendingTitle; }
  getIcon(): string { return "book-open"; }
  canAcceptExtension(extension: string): boolean { return extension === "pdf"; }
  getRecord(): AnnotationRecord | null { return this.record; }

  getState(): Record<string, unknown> {
    const state: Record<string, unknown> = { ...super.getState(), zoom: this.fit ?? this.zoom };
    const pending = this.restore;
    if (pending?.page !== undefined) Object.assign(state, { page: pending.page, offset: pending.offset ?? 0 }, pending.zoom !== undefined ? { zoom: pending.zoom } : {});
    else if (this.position) Object.assign(state, this.measurePosition() ?? this.position);
    return state;
  }

  async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
    this.pendingTitle = titleOf(state.file) || this.pendingTitle;
    const page = typeof state.page === "number" ? state.page : undefined;
    const offset = typeof state.offset === "number" ? state.offset : undefined;
    this.restore = page !== undefined || state.zoom !== undefined ? { page, offset, zoom: state.zoom } : null;
    await super.setState(state, result);
    if (this.pdf) this.applyRestore();
  }

  onPaneMenu(menu: Menu, source: string): void {
    menu.addItem(item => item.setTitle("Open in Obsidian's PDF viewer").setIcon("file-text").setSection("open").onClick(() => {
      if (this.file) this.host.openNative(this.file);
    }));
    super.onPaneMenu(menu, source);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("reader-view");
    // Each action is placed before the previous one, so they show in the reverse of this order.
    const noteAction = this.addAction("notebook-pen", "Toggle book note (A)", () => this.host.toggleAnnotations());
    // Right-click opens the note in either place this once, whatever the setting says.
    noteAction.addEventListener("contextmenu", event => {
      event.preventDefault();
      const current = this.host.settings().notePlace;
      const menu = new Menu();
      for (const [place, title, icon] of [["sidebar", "Open in the right sidebar", "panel-right"], ["beside", "Open beside the PDF", "columns-2"]] as const) {
        menu.addItem(item => item.setTitle(title).setIcon(icon).setChecked(place === current).onClick(() => this.host.openNote(this, null, place)));
      }
      menu.showAtMouseEvent(event);
    });
    this.modeAction = this.addAction("highlighter", "", () => this.host.toggleHighlightMode());
    this.modeAction.addClass("reader-mode-action");
    this.modeAction.addEventListener("contextmenu", event => {
      event.preventDefault();
      colorMenu(this.host.settings().colors, this.modeColor().id, id => this.host.chooseHighlightModeColor(id)).showAtMouseEvent(event);
    });
    this.showHighlightMode();
    this.outlineAction = this.addAction("list", "Table of contents (T)", () => void this.openOutline());
    this.outlineAction.hide();

    this.stage = contentEl.createDiv({ cls: "reader-stage", attr: { tabindex: "-1" } });
    this.pages = this.stage.createDiv({ cls: "reader-pages" });
    this.message = this.stage.createDiv({ cls: "reader-message" });
    this.hint = contentEl.createDiv({ cls: "reader-hint", text: "This PDF has no selectable text. Run OCR on it to highlight passages." });
    this.hint.hide();
    this.popup = new AnnotationPopup(this.pages, this.stage, CONTROLS_CLEARANCE, () => this.previewColor(null));
    this.register(() => this.popup.destroy());
    this.buildControls();

    this.registerDomEvent(this.stage, "scroll", () => this.scheduleUpdate());
    this.registerDomEvent(this.stage, "wheel", event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.0025);
      this.setZoom(this.zoom * factor, null, { x: event.clientX, y: event.clientY });
    }, { passive: false });
    let width = 0, height = 0;
    const observer = new ResizeObserver(() => {
      if (this.stage.clientWidth === width && this.stage.clientHeight === height) return;
      width = this.stage.clientWidth;
      height = this.stage.clientHeight;
      if (this.restore && this.pdf) this.applyRestore();
      else if (this.fit && this.pdf) this.setZoom(this.fitZoom(this.fit), this.fit);
      this.scheduleUpdate();
    });
    observer.observe(this.stage);
    this.register(() => observer.disconnect());
    this.register(() => {
      window.clearTimeout(this.settleTimer);
      window.clearTimeout(this.openingTimer);
      window.clearTimeout(this.messageTimer);
      window.clearTimeout(this.toastTimer);
      if (this.frame) cancelAnimationFrame(this.frame);
    });
    this.register(this.host.store.subscribe(record => { if (record === this.record) this.refreshAnnotations(); }));
    this.bindSelection();
    this.bindKeys();
  }

  private buildControls(): void {
    const toStage = () => this.stage.focus({ preventScroll: true });
    this.controls = mount(ReaderControls, { target: this.contentEl, props: {
      step: delta => this.step(delta),
      goToPage: page => this.goToPage(page),
      done: toStage,
      zoomBy: direction => this.zoomBy(direction),
      reset: () => this.resetZoom(),
      zoomMenu: rect => {
        const menu = checkMenu();
        const option = (title: string, checked: boolean, choose: () => void) => menu.addItem(item => item.setTitle(title).setChecked(checked).onClick(choose));
        option("Fit width", this.fit === "width", () => this.setZoom(this.fitZoom("width"), "width"));
        option("Fit page", this.fit === "page", () => this.setZoom(this.fitZoom("page"), "page"));
        menu.addSeparator();
        for (const zoom of ZOOM_PRESETS) option(`${Math.round(zoom * 100)}%`, !this.fit && Math.abs(this.zoom - zoom) < 0.005, () => this.setZoom(zoom, null));
        // Anchored just above the zoom level: the bar sits at the bottom, so Obsidian flips the menu to open upward from
        // here. Obsidian lines the menu up with the left edge, so it is then moved to sit centered over the zoom level.
        const doc = this.contentEl.ownerDocument;
        doc.querySelectorAll(".tooltip").forEach(tip => tip.remove());
        menu.showAtPosition({ x: rect.left, y: rect.top - 6, width: rect.width, overlap: true }, doc);
        const dom = (menu as Menu & { dom?: HTMLElement }).dom;
        if (dom) {
          const max = doc.documentElement.clientWidth - dom.offsetWidth - 8;
          dom.style.left = `${Math.max(8, Math.min(max, rect.left + (rect.width - dom.offsetWidth) / 2))}px`;
        }
      },
    } });
    this.register(() => void unmount(this.controls));
    this.updateControls();
  }

  async onLoadFile(file: TFile): Promise<void> {
    await this.disposePdf();
    const generation = ++this.generation;
    this.contentEl.addClass("is-opening");
    // Most PDFs open quickly; the message only appears for slow ones, so it doesn't flash.
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => { if (generation === this.generation && !this.pdf) this.showMessage("Opening PDF…"); }, 600);
    try {
      const data = await this.app.vault.readBinary(file);
      if (generation !== this.generation) return;
      this.record = await this.host.store.open(file.path, fingerprint(data));
      if (generation !== this.generation) return;
      this.loading = loadPdf(data);
      const pdf = await this.loading.promise;
      const first = await pdf.getPage(1);
      if (generation !== this.generation) return;
      this.pdf = pdf;
      window.clearTimeout(this.messageTimer);
      this.message.hide();
      // Shown anyway if drawing takes long, such as for a heavy first page.
      window.clearTimeout(this.openingTimer);
      this.openingTimer = window.setTimeout(() => this.reveal(), 1500);
      this.buildPages(first);
      this.ready();
      // A tab restored by Obsidian carries its own position. A newly opened tab continues where this PDF was last read.
      if (!this.restore) this.restore = { ...this.host.lastPosition(file.path) };
      this.applyRestore();
      void this.checkText(generation);
      void pdf.getOutline().then(outline => { if (generation === this.generation) this.outlineAction.toggle(!!outline?.length); }).catch(() => {});
    } catch (error) {
      if (generation !== this.generation) return;
      window.clearTimeout(this.messageTimer);
      this.reveal();
      this.showMessage(`Could not open this PDF. ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }
  async onUnloadFile(): Promise<void> { this.savePosition(); await this.disposePdf(); }
  async onClose(): Promise<void> { this.savePosition(); await this.disposePdf(); }

  /** Records where this PDF is being read. Skipped while a requested position is still waiting to be applied. */
  savePosition(): void {
    if (!this.file || !this.pdf || this.restore) return;
    const position = this.measurePosition() ?? this.position;
    if (position) this.host.rememberPosition(this.file.path, { ...position, zoom: this.fit ?? this.zoom });
  }

  private ready(): void { this.host.ready(this); }

  private reveal(): void {
    window.clearTimeout(this.openingTimer);
    this.contentEl.removeClass("is-opening");
  }

  /** Ends the opening state once every page in view has been drawn at the position the PDF opens at. */
  private revealIfDrawn(): void {
    if (!this.contentEl.hasClass("is-opening") || this.restore || !this.stage.clientHeight) return;
    const top = this.stage.scrollTop, bottom = top + this.stage.clientHeight;
    const inView = this.slots.slice(this.slotAt(top), this.slotAt(bottom) + 1);
    if (inView.every(slot => slot.canvas && slot.renderedZoom === this.zoom)) this.reveal();
  }

  private showMessage(text: string, error = false): void {
    this.message.empty();
    this.message.toggleClass("mod-error", error);
    this.message.setText(text);
    this.message.show();
  }

  private async disposePdf(): Promise<void> {
    ++this.generation;
    this.popup?.hide();
    for (const slot of this.active) this.releasePage(slot);
    this.slots = [];
    this.clearPages();
    this.hint?.hide();
    this.outlineAction?.hide();
    const loading = this.loading;
    this.loading = null;
    this.pdf = null;
    this.record = null;
    this.passages = [];
    this.ready();
    await loading?.destroy();
  }

  private buildPages(first: PDFPageProxy): void {
    const { width, height } = first.getViewport({ scale: 1 });
    this.clearPages();
    this.slots = [];
    for (let number = 1; number <= this.pdf!.numPages; number++) {
      const el = this.pages.createDiv({ cls: "reader-page", attr: { "data-page": String(number) } });
      const slot: PageSlot = { number, el, width, height, proxy: number === 1 ? first : null, canvas: null, task: null, renderedZoom: 0, text: null, token: 0, busy: false };
      this.sizeSlot(slot);
      this.slots.push(slot);
    }
    this.updateControls();
  }

  /** Removes page elements but keeps the popup, which shares their scrolling container. */
  private clearPages(): void {
    this.pages?.querySelectorAll(".reader-page").forEach(page => page.remove());
  }

  private sizeSlot(slot: PageSlot): void {
    slot.el.style.width = `calc(var(--total-scale-factor) * ${slot.width}px)`;
    slot.el.style.height = `calc(var(--total-scale-factor) * ${slot.height}px)`;
  }

  private applyRestore(): void {
    const restore = this.restore;
    // A background tab has no layout yet. Keep the request until the resize observer reports a size.
    if (!restore || !this.slots.length || !this.stage.clientHeight) return;
    this.restore = null;
    const zoom = restore.zoom;
    if (zoom === "page" || zoom === "width" || zoom === "fit") this.setZoom(this.fitZoom(zoom === "page" ? "page" : "width"), zoom === "page" ? "page" : "width", undefined, false);
    else if (typeof zoom === "number") this.setZoom(zoom, null, undefined, false);
    else this.setZoom(this.fit ? this.fitZoom(this.fit) : this.zoom, this.fit, undefined, false);
    if (restore.page !== undefined) this.goToPage(restore.page, restore.offset ?? 0);
    else this.scheduleUpdate();
  }

  // ---- Layout and navigation ----

  private pageTop(slot: PageSlot): number { return this.pages.offsetTop + slot.el.offsetTop; }

  private measurePosition(): { page: number; offset: number } | null {
    if (!this.slots.length || !this.stage.clientHeight) return null;
    const top = this.slots[this.slotAt(this.stage.scrollTop)]!;
    const offset = Math.max(0, (this.stage.scrollTop - this.pageTop(top)) / Math.max(1, top.el.offsetHeight));
    return { page: top.number, offset: Math.round(offset * 1000) / 1000 };
  }

  /** Index of the page at a vertical scroll position. */
  private slotAt(y: number): number {
    let low = 0, high = this.slots.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.pageTop(this.slots[middle]!) <= y) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  goToPage(page: number, offset = 0): void {
    const slot = this.slots[Math.max(1, Math.min(this.slots.length, Math.trunc(page) || 1)) - 1];
    if (!slot) return;
    if (!this.stage.clientHeight) {
      this.restore = { ...this.restore, page: slot.number, offset };
      return;
    }
    this.stage.scrollTop = offset ? this.pageTop(slot) + offset * slot.el.offsetHeight : this.pageTop(slot) - 8;
    this.position = this.measurePosition();
    this.setCurrentPage(slot.number);
    this.scheduleUpdate();
  }

  /** Previous returns to the top of a partly scrolled page before moving to the page above. */
  private step(delta: number): void {
    const current = this.slots[this.page - 1];
    if (!current) return;
    if (delta < 0 && this.stage.scrollTop - this.pageTop(current) > 24) this.goToPage(this.page);
    else this.goToPage(this.page + delta);
  }

  private setCurrentPage(page: number): void {
    if (page === this.page && this.slots.length) return;
    this.page = page;
    this.updateControls();
    this.app.workspace.requestSaveLayout();
  }

  private updateControls(): void {
    this.controls?.update({
      page: this.page, total: this.slots.length, atStart: this.page <= 1 && (this.stage?.scrollTop ?? 0) <= 8,
      zoom: this.zoom, canZoomOut: this.zoom > MIN_ZOOM, canZoomIn: this.zoom < MAX_ZOOM, fitWidth: this.fit === "width",
    });
  }

  // ---- Zoom ----

  private fitZoom(fit: "width" | "page"): number {
    const base = this.slots[0];
    if (!base || !this.stage.clientWidth) return this.zoom;
    // One spare pixel keeps sub-pixel rounding from adding a horizontal scrollbar.
    const width = (this.stage.clientWidth - PADDING * 2 - 1) / (base.width * CSS_UNITS);
    if (fit === "width") return width;
    return Math.min(width, (this.stage.clientHeight - 32) / (base.height * CSS_UNITS));
  }

  zoomBy(direction: 1 | -1): void {
    const current = Math.round(this.zoom * 100) / 100;
    const target = direction > 0 ? ZOOM_STEPS.find(step => step > current + 0.001) ?? MAX_ZOOM : [...ZOOM_STEPS].reverse().find(step => step < current - 0.001) ?? MIN_ZOOM;
    this.setZoom(target, null);
  }

  resetZoom(): void { this.setZoom(this.fitZoom("width"), "width"); }

  /** Rescales every page through one CSS variable, keeping the point under `anchor` (or the top of the view) in place. */
  private setZoom(value: number, fit: Fit, anchor?: { x: number; y: number }, settle = true): void {
    if (!this.slots.length) return;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
    this.fit = fit;
    const unchanged = Math.abs(zoom - this.zoom) < 0.0005 && this.pages.style.getPropertyValue("--total-scale-factor");
    if (!unchanged) {
      this.popup.hide();
      const view = this.stage.getBoundingClientRect();
      const ax = anchor ? anchor.x - view.left : this.stage.clientWidth / 2;
      const ay = anchor ? anchor.y - view.top : 0;
      const slot = this.slots[this.slotAt(this.stage.scrollTop + ay)]!;
      const fy = (this.stage.scrollTop + ay - this.pageTop(slot)) / Math.max(1, slot.el.offsetHeight);
      const fx = (this.stage.scrollLeft + ax - this.pages.offsetLeft - slot.el.offsetLeft) / Math.max(1, slot.el.offsetWidth);
      this.zoom = zoom;
      this.pages.style.setProperty("--total-scale-factor", String(zoom * CSS_UNITS));
      this.pages.style.setProperty("--scale-factor", String(zoom * CSS_UNITS));
      this.stage.scrollTop = this.pageTop(slot) + fy * slot.el.offsetHeight - ay;
      this.stage.scrollLeft = this.pages.offsetLeft + slot.el.offsetLeft + fx * slot.el.offsetWidth - ax;
      if (settle) {
        // Stretch existing canvases while zoom changes, then render sharp pages once it stops.
        this.settling = true;
        window.clearTimeout(this.settleTimer);
        this.settleTimer = window.setTimeout(() => { this.settling = false; this.scheduleUpdate(); }, 180);
      }
    }
    this.updateControls();
    this.app.workspace.requestSaveLayout();
    this.scheduleUpdate();
  }

  // ---- Rendering ----

  private scheduleUpdate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  }

  /** Renders pages within one screen of the view and releases pages far from it. */
  private update(): void {
    if (!this.pdf || !this.slots.length) return;
    const top = this.stage.scrollTop, height = this.stage.clientHeight;
    if (!height) return;
    this.position = this.measurePosition();
    this.savePosition();
    this.setCurrentPage(this.slots[this.slotAt(top + height * 0.3)]!.number);
    this.updateControls();
    const first = this.slotAt(top - height), last = this.slotAt(top + height * 2);
    for (const slot of [...this.active]) if (slot.number - 1 < first - 2 || slot.number - 1 > last + 2) this.releasePage(slot);
    const visible = this.slotAt(top);
    const wanted = this.slots.slice(first, last + 1)
      .filter(slot => !slot.busy && (!slot.canvas || (!this.settling && slot.renderedZoom !== this.zoom)))
      .sort((a, b) => Math.abs(a.number - 1 - visible) - Math.abs(b.number - 1 - visible));
    let running = this.slots.slice(first, last + 1).filter(slot => slot.busy).length;
    for (const slot of wanted) {
      if (running >= 2) break;
      running++;
      void this.render(slot);
    }
  }

  private async render(slot: PageSlot): Promise<void> {
    const token = ++slot.token, generation = this.generation;
    const stale = () => token !== slot.token || generation !== this.generation;
    slot.busy = true;
    this.active.add(slot);
    try {
      const page = slot.proxy ??= await this.pdf!.getPage(slot.number);
      if (stale()) return;
      const natural = page.getViewport({ scale: 1 });
      if (natural.width !== slot.width || natural.height !== slot.height) {
        slot.width = natural.width;
        slot.height = natural.height;
        this.sizeSlot(slot);
      }
      const zoom = this.zoom;
      const viewport = page.getViewport({ scale: zoom * CSS_UNITS });
      const ratio = Math.min(this.contentEl.ownerDocument.defaultView?.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
      const canvas = createEl("canvas", { attr: { "aria-hidden": "true" } });
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      slot.task = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await slot.task.promise;
      slot.task = null;
      if (stale()) { canvas.width = canvas.height = 0; return; }
      if (slot.canvas) slot.canvas.width = slot.canvas.height = 0;
      slot.canvas?.remove();
      slot.el.prepend(canvas);
      slot.canvas = canvas;
      slot.renderedZoom = zoom;
      this.revealIfDrawn();
      if (slot.text) slot.text.layer.update({ viewport });
      else {
        const content = await page.getTextContent();
        if (stale()) return;
        const el = slot.el.createDiv({ cls: "textLayer" });
        const layer = new TextLayer({ textContentSource: content, container: el, viewport });
        await layer.render();
        if (stale()) { layer.cancel(); el.remove(); return; }
        // PDF.js keeps drag selections from jumping to the end of the page when the pointer leaves the text.
        el.createDiv({ cls: "endOfContent" });
        slot.text = { layer, el };
        this.drawMarks(slot);
      }
    } catch (error) {
      if (error instanceof RenderingCancelledException || stale()) return;
      slot.el.empty();
      slot.el.createDiv({ cls: "reader-page-error", text: `Could not render page ${slot.number}.` });
      console.error(error);
    } finally {
      if (token === slot.token) slot.busy = false;
      this.scheduleUpdate();
    }
  }

  private releasePage(slot: PageSlot): void {
    slot.token++;
    slot.busy = false;
    slot.task?.cancel();
    slot.task = null;
    slot.text?.layer.cancel();
    slot.text?.el.remove();
    slot.text = null;
    if (slot.canvas) slot.canvas.width = slot.canvas.height = 0;
    slot.canvas?.remove();
    slot.canvas = null;
    slot.renderedZoom = 0;
    slot.el.querySelector(".reader-highlight-layer")?.remove();
    slot.proxy?.cleanup();
    this.active.delete(slot);
  }

  private async checkText(generation: number): Promise<void> {
    const pdf = this.pdf!;
    for (let number = 1; number <= Math.min(pdf.numPages, 12); number++) {
      const content = await (await pdf.getPage(number)).getTextContent().catch(() => null);
      if (generation !== this.generation) return;
      if (content?.items.some(item => "str" in item && item.str.trim())) return;
    }
    this.hint.show();
  }

  // ---- Highlights ----

  private drawMarks(slot: PageSlot): void {
    slot.el.querySelector(".reader-highlight-layer")?.remove();
    if (!this.record || !slot.text) return;
    const annotations = this.record.annotations.filter(a => a.page === slot.number);
    if (!annotations.length) return;
    const layer = slot.el.createDiv({ cls: "reader-highlight-layer" });
    const settings = this.host.settings();
    for (const a of annotations) {
      const color = colorOf(settings, a.color).value;
      a.rects.forEach((r, index) => {
        const mark = layer.createDiv({ cls: "reader-mark", attr: { "data-id": a.id } });
        mark.style.setProperty("--reader-color", color);
        Object.assign(mark.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });
        mark.toggleClass("is-hovered", a.id === this.hovered);
        mark.toggleClass("is-flashing", a.id === this.flashing);
        if (index === a.rects.length - 1 && this.writing(a.id)) mark.createDiv({ cls: "reader-mark-note" });
      });
    }
  }

  /** What the reader wrote under a passage in the book note, or an empty string. */
  writing(annotationId: string): string {
    return this.record ? this.host.writing(this.record, annotationId) : "";
  }

  /** Opens the book note at a passage's section, or at the top. */
  openNote(annotationId: string | null): void {
    this.host.openNote(this, annotationId);
  }

  refreshAnnotations(): void {
    for (const slot of this.active) this.drawMarks(slot);
    if (this.popup.annotation && !this.record?.annotations.includes(this.popup.annotation)) this.popup.hide();
    else this.popup.sync(this.host.settings().colors);
  }

  /** Annotation under a viewport point, preferring the most recently created. */
  private annotationAt(x: number, y: number): { annotation: Annotation; slot: PageSlot } | null {
    if (!this.record) return null;
    const pageEl = this.contentEl.ownerDocument.elementsFromPoint(x, y).find(el => el.hasClass("reader-page"));
    const slot = pageEl && this.slots[Number((pageEl as HTMLElement).dataset.page) - 1];
    if (!slot) return null;
    const box = slot.el.getBoundingClientRect();
    const px = (x - box.left) / box.width, py = (y - box.top) / box.height;
    const padX = 2 / box.width, padY = 2 / box.height;
    for (let i = this.record.annotations.length - 1; i >= 0; i--) {
      const annotation = this.record.annotations[i]!;
      if (annotation.page === slot.number && annotation.rects.some(r => px >= r.x - padX && px <= r.x + r.width + padX && py >= r.y - padY && py <= r.y + r.height + padY)) return { annotation, slot };
    }
    return null;
  }

  /** Places a card beside the whole highlight so it never covers the passage. */
  private anchorFor(annotation: Annotation, clientX: number): PopupAnchor {
    const box = this.slots[annotation.page - 1]!.el.getBoundingClientRect();
    const top = Math.min(...annotation.rects.map(r => r.y)), bottom = Math.max(...annotation.rects.map(r => r.y + r.height));
    return { clientX, top: box.top + top * box.height, bottom: box.top + bottom * box.height, above: false };
  }

  private setHovered(id: string | null): void {
    if (id === this.hovered) return;
    this.hovered = id;
    this.stage.toggleClass("is-over-highlight", !!id);
    this.pages.querySelectorAll<HTMLElement>(".reader-mark").forEach(mark => mark.toggleClass("is-hovered", mark.dataset.id === id));
  }

  /**
   * Shows a short confirmation just above the page and zoom bar, where the reader is already looking, instead of in Obsidian's notice corner.
   * A new message replaces the current one, and it stays while the pointer is over it.
   */
  toast(message: string): void {
    this.toastEl?.remove();
    window.clearTimeout(this.toastTimer);
    const el = this.toastEl = this.contentEl.createDiv({ cls: "reader-toast", attr: { role: "status" } });
    el.createSpan({ text: message });
    const close = () => {
      window.clearTimeout(this.toastTimer);
      el.remove();
      if (this.toastEl === el) this.toastEl = null;
    };
    const arm = () => { this.toastTimer = window.setTimeout(close, 2500); };
    el.addEventListener("pointerenter", () => window.clearTimeout(this.toastTimer));
    el.addEventListener("pointerleave", arm);
    arm();
  }

  /** Like `showAnnotation`, for a tab that may still be opening: waits until the PDF is laid out and its saved position applied. */
  async showAnnotationWhenReady(id: string): Promise<void> {
    for (let waited = 0; waited < 10000; waited += 100) {
      const annotation = this.pdf && !this.restore ? this.record?.annotations.find(candidate => candidate.id === id) : undefined;
      if (annotation) return this.showAnnotation(annotation);
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }
  }

  /** Scrolls a highlight into view from the sidebar and briefly pulses it. */
  async showAnnotation(annotation: Annotation): Promise<void> {
    await this.app.workspace.revealLeaf(this.leaf);
    this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
    const slot = this.slots[annotation.page - 1];
    if (!slot) return;
    this.stage.scrollTop = this.pageTop(slot) + annotation.rects[0]!.y * slot.el.offsetHeight - this.stage.clientHeight * 0.3;
    this.setCurrentPage(slot.number);
    this.flashing = annotation.id;
    for (const s of this.active) this.drawMarks(s);
    this.scheduleUpdate();
    window.setTimeout(() => {
      if (this.flashing !== annotation.id) return;
      this.flashing = null;
      this.pages.querySelectorAll(".reader-mark.is-flashing").forEach(mark => mark.removeClass("is-flashing"));
    }, 1600);
  }

  // ---- Keyboard ----

  /**
   * Single-key shortcuts while this Reader is the active tab, like Obsidian's own views, so they can't clash with global
   * hotkeys. They stand aside while you type in a field, such as the page number. Each also exists as a command for hotkeys.
   */
  private bindKeys(): void {
    this.scope = new Scope(this.app.scope);
    const key = (modifiers: ("Shift")[], name: string, run: () => void) => this.scope!.register(modifiers, name, event => {
      if ((event.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']")) return true;
      run();
      return false;
    });
    key([], "h", () => this.host.toggleHighlightMode());
    // N highlights a selection and opens its section, opens the section of the highlight whose popup is showing, or opens the note.
    key([], "n", () => this.readSelection().length ? this.addHighlight(true) : this.host.openNote(this, this.popup.mode === "annotation" ? this.popup.annotation?.id ?? null : null));
    key([], "a", () => this.host.toggleAnnotations());
    key([], "t", () => void this.openOutline());
    key([], "g", () => this.contentEl.querySelector<HTMLInputElement>(".reader-page-input")?.select());
    key([], "=", () => this.zoomBy(1));
    key(["Shift"], "+", () => this.zoomBy(1));
    key([], "-", () => this.zoomBy(-1));
    key([], "0", () => this.resetZoom());
    for (const name of ["Delete", "Backspace"]) key([], name, () => {
      const annotation = this.popup.mode === "annotation" ? this.popup.annotation : null;
      if (!annotation || !this.record) return;
      this.popup.hide();
      deleteAnnotation(this.host.store, this.record, annotation);
    });
  }

  // ---- Selection and popup ----

  private bindSelection(): void {
    const doc = this.contentEl.ownerDocument;
    this.registerDomEvent(this.stage, "pointerdown", event => {
      if (event.button !== 0 || this.popup.contains(event.target as Node)) return;
      // A click away from a selection popup only dismisses it; it does not also open a highlight's popup.
      this.pointer = { x: event.clientX, y: event.clientY, down: true, dismissed: this.popup.mode === "selection" };
      this.dismissPopup();
      (event.target as HTMLElement).closest(".textLayer")?.addClass("selecting");
    });
    this.registerDomEvent(doc, "pointerup", event => {
      if (!this.pointer.down) return;
      this.pointer.down = false;
      this.pages.querySelectorAll(".textLayer.selecting").forEach(layer => layer.removeClass("selecting"));
      this.passages = this.readSelection();
      if (this.passages.length && this.host.settings().highlightMode) {
        // Highlight mode: a finished mouse selection becomes a highlight in the mode's color, without the popup.
        this.createHighlights(this.modeColor().id, false);
      } else if (this.passages.length) {
        const bounds = doc.getSelection()!.getRangeAt(0).getBoundingClientRect();
        this.showSelectionPopup({ clientX: event.clientX, top: event.clientY, bottom: event.clientY, above: event.clientY < bounds.top + bounds.height / 2 });
      } else if (!this.pointer.dismissed && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) < 4) {
        const hit = this.annotationAt(event.clientX, event.clientY);
        if (hit) this.showAnnotationPopup(hit.annotation, this.anchorFor(hit.annotation, event.clientX));
      }
    });
    this.registerDomEvent(doc, "pointerdown", event => {
      if (this.popup.open && !this.popup.contains(event.target as Node) && !this.stage.contains(event.target as Node)) this.dismissPopup();
    });
    this.registerDomEvent(doc, "selectionchange", () => {
      if (this.pointer.down) {
        const selection = doc.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        for (const slot of this.active) if (slot.text && range?.intersectsNode(slot.text.el)) slot.text.el.addClass("selecting");
        return;
      }
      if (this.popup.mode === "annotation") return;
      // Keyboard selections (Shift+arrows) get the same popup at the end of the selection.
      const passages = this.readSelection();
      if (passages.length) {
        this.passages = passages;
        const rects = doc.getSelection()!.getRangeAt(0).getClientRects();
        const last = rects.item(rects.length - 1);
        if (last && !this.popup.open) this.showSelectionPopup({ clientX: last.right, top: last.top, bottom: last.bottom, above: false });
      } else if (this.popup.mode === "selection" && !this.popup.contains(doc.activeElement)) {
        this.passages = [];
        this.popup.hide();
      }
    });
    this.registerDomEvent(doc, "keydown", event => {
      if (!this.popup.open || this.app.workspace.getActiveViewOfType(ReaderView) !== this) return;
      if (event.key === "Escape") this.dismissPopup();
      // Number keys pick a color from the selection popup, matching the order shown in its tooltips.
      else if (this.popup.mode === "selection" && /^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !(event.target as HTMLElement).closest?.("input, textarea, [contenteditable]")) {
        const color = this.host.settings().colors[Number(event.key) - 1];
        if (!color) return;
        event.preventDefault();
        this.createHighlights(color.id, false);
      }
    });
    let hoverFrame = 0;
    this.registerDomEvent(this.stage, "pointermove", event => {
      if (this.pointer.down || hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        this.setHovered(this.annotationAt(event.clientX, event.clientY)?.annotation.id ?? null);
      });
    });
    this.registerDomEvent(this.stage, "pointerleave", () => this.setHovered(null));
  }

  /** Closes the popup. A selection popup also clears its selection, which Obsidian's unselectable UI would otherwise keep. */
  private dismissPopup(): void {
    if (this.popup.mode === "selection") {
      this.passages = [];
      this.contentEl.ownerDocument.getSelection()?.removeAllRanges();
    }
    this.popup.hide();
  }

  /** Converts the DOM selection into one passage per page it touches. */
  private readSelection(): Passage[] {
    const doc = this.contentEl.ownerDocument;
    const selection = doc.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return [];
    const range = selection.getRangeAt(0);
    const passages: Passage[] = [];
    for (const slot of [...this.active].sort((a, b) => a.number - b.number)) {
      const layer = slot.text?.el;
      if (!layer || !range.intersectsNode(layer)) continue;
      const part = doc.createRange();
      part.selectNodeContents(layer);
      if (layer.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
      if (layer.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
      const raw = part.toString();
      if (!raw.trim()) continue;
      // Offsets count text only. The quote keeps PDF.js line breaks so words on adjacent lines stay apart.
      const fragment = part.cloneContents();
      fragment.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
      const exact = (fragment.textContent ?? raw).trim();
      const before = doc.createRange();
      before.setStart(layer, 0);
      before.setEnd(part.startContainer, part.startOffset);
      const start = before.toString().length, end = start + raw.length;
      const full = layer.textContent ?? "";
      const rects = this.lineRects(part, layer, slot.el.getBoundingClientRect());
      if (rects.length) passages.push({ page: slot.number, quote: { exact, prefix: full.slice(Math.max(0, start - 48), start), suffix: full.slice(end, end + 48) }, position: { start, end }, rects });
    }
    return passages;
  }

  /** Measures selected text node by node, then joins pieces on the same line into one clean bar. */
  private lineRects(range: Range, layer: HTMLElement, page: DOMRect): Rect[] {
    const doc = layer.ownerDocument;
    const pieces: DOMRect[] = [];
    const walker = doc.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!range.intersectsNode(node) || !node.textContent?.trim()) continue;
      const part = doc.createRange();
      part.selectNodeContents(node);
      if (node === range.startContainer) part.setStart(node, range.startOffset);
      if (node === range.endContainer) part.setEnd(node, range.endOffset);
      if (!part.collapsed) pieces.push(...Array.from(part.getClientRects()).filter(r => r.width > 0.5 && r.height > 0.5));
    }
    pieces.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const r of pieces) {
      const line = lines.find(l => Math.abs((l.top + l.bottom) / 2 - (r.top + r.bottom) / 2) < Math.min(l.bottom - l.top, r.height) * 0.5 && r.left - l.right < r.height * 1.5 && l.left - r.right < r.height * 1.5);
      if (line) Object.assign(line, { left: Math.min(line.left, r.left), top: Math.min(line.top, r.top), right: Math.max(line.right, r.right), bottom: Math.max(line.bottom, r.bottom) });
      else lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    return lines.map(l => {
      const x = clamp((l.left - page.left) / page.width), y = clamp((l.top - page.top) / page.height);
      return { x, y, width: clamp((l.right - page.left) / page.width) - x, height: clamp((l.bottom - page.top) / page.height) - y };
    }).filter(r => r.width > 0 && r.height > 0);
  }

  private showSelectionPopup(at: PopupAnchor): void {
    const colors = this.host.settings().colors;
    if (!colors.some(color => color.id === this.lastColor)) this.lastColor = colors[0]!.id;
    this.popup.showSelection(at, colors, this.lastColor, {
      highlight: color => this.createHighlights(color, false),
      note: () => this.createHighlights(this.lastColor, true),
      copy: () => this.copy(this.passages.map(p => p.quote.exact).join(" ")),
      preview: color => this.previewColor(color),
    });
  }

  private previewColor(id: string | null): void {
    const color = id ? this.host.settings().colors.find(option => option.id === id) : null;
    this.pages.toggleClass("is-previewing", !!color);
    if (color) this.pages.style.setProperty("--reader-preview", color.value);
  }

  private showAnnotationPopup(annotation: Annotation, at: PopupAnchor): void {
    this.popup.showAnnotation(at, annotation, this.host.settings().colors, {
      recolor: color => {
        annotation.color = this.lastColor = color;
        void this.persist();
      },
      note: () => {
        this.popup.hide();
        this.openNote(annotation.id);
      },
      copy: () => this.copy(annotation.quote.exact),
      remove: () => {
        this.popup.hide();
        if (this.record) deleteAnnotation(this.host.store, this.record, annotation);
      },
    });
  }

  /** Highlights the current selection. Used by the popup and by the highlight commands. */
  addHighlight(withNote: boolean): void {
    this.passages = this.readSelection();
    if (!this.passages.length) { this.toast("Select a passage in the PDF first."); return; }
    if (!this.host.settings().colors.some(color => color.id === this.lastColor)) this.lastColor = this.host.settings().colors[0]!.id;
    this.createHighlights(this.lastColor, withNote);
  }

  /** Highlights the selected passages. With `withNote`, opens the book note at the first one's section to write about it. */
  private createHighlights(color: string, withNote: boolean): void {
    if (!this.record || !this.passages.length) return;
    const createdAt = new Date().toISOString();
    const created = this.passages.map(passage => ({ ...passage, id: randomUUID(), color, comment: "", createdAt }));
    this.record.annotations.push(...created);
    this.lastColor = color;
    this.passages = [];
    this.contentEl.ownerDocument.getSelection()?.removeAllRanges();
    void this.persist();
    this.popup.hide();
    if (withNote) this.openNote(created[0]!.id);
  }

  private copy(text: string): void {
    void navigator.clipboard.writeText(text.replace(/\s+/g, " ").trim()).then(() => this.toast("Copied to clipboard."));
    this.popup.hide();
  }

  hidePopup(): void {
    this.popup?.hide();
    this.passages = [];
  }

  /** Called when plugin settings change. */
  refreshSettings(): void {
    for (const slot of this.active) this.drawMarks(slot);
    this.popup.sync(this.host.settings().colors);
    this.showHighlightMode();
  }

  /** Highlight mode's color, or the first color if the chosen one was removed. */
  private modeColor(): HighlightColor {
    const colors = this.host.settings().colors;
    return colors.find(color => color.id === this.host.settings().highlightModeColor) ?? colors[0]!;
  }

  private showHighlightMode(): void {
    const on = this.host.settings().highlightMode;
    const color = this.modeColor();
    this.modeAction.toggleClass("is-active", on);
    this.modeAction.style.setProperty("--reader-mode-color", color.value);
    this.modeAction.setAttribute("aria-pressed", String(on));
    this.modeAction.setAttribute("aria-label", `${on ? "Highlight mode is on" : "Turn on highlight mode"}: selecting text highlights it in ${color.name}. Right-click to choose the color. (H)`);
  }

  private async persist(): Promise<void> {
    if (this.record) await this.host.store.save(this.record).catch(() => {});
  }

  // ---- Table of contents ----

  async openOutline(): Promise<void> {
    const pdf = this.pdf;
    if (!pdf) return;
    const outline = await pdf.getOutline().catch(() => null);
    if (!outline?.length) { this.toast("This PDF has no table of contents."); return; }
    const nodes: OutlineNode[] = [];
    const targets: Promise<{ page: number; offset: number } | null>[] = [];
    const walk = (items: typeof outline, depth: number, parent: number | null) => {
      for (const item of items) {
        const node: OutlineNode = { id: nodes.length, title: item.title.trim() || "Untitled", depth, parent, children: [] };
        nodes.push(node);
        targets.push(this.resolveDestination(pdf, item.dest).catch(() => null));
        if (parent !== null) nodes[parent]!.children.push(node.id);
        if (item.items?.length) walk(item.items, depth + 1, node.id);
      }
    };
    walk(outline, 0, null);
    const resolved = await Promise.all(targets);
    resolved.forEach((target, id) => { nodes[id]!.page = target?.page; });
    if (pdf !== this.pdf) return;
    // The section being read is the last one that starts on or before the current page.
    let current: number | null = null;
    for (const node of nodes) if (node.page !== undefined && node.page <= this.page && (current === null || node.page >= nodes[current]!.page!)) current = node.id;
    new OutlineModal(this.app, nodes, current, node => {
      const target = resolved[node.id];
      if (target && pdf === this.pdf) this.goToPage(target.page, target.offset);
    }).open();
  }

  private async resolveDestination(pdf: PDFDocumentProxy, dest: string | unknown[] | null): Promise<{ page: number; offset: number } | null> {
    const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const ref = explicit[0];
    const index = typeof ref === "number" ? ref : await pdf.getPageIndex(ref).catch(() => null);
    if (index === null) return null;
    const slot = this.slots[index];
    // XYZ destinations carry a top coordinate in PDF space, measured from the bottom of the page.
    const top = explicit[1]?.name === "XYZ" && typeof explicit[3] === "number" ? explicit[3] : null;
    return { page: index + 1, offset: top !== null && slot ? Math.max(0, Math.min(1, (slot.height - top) / slot.height)) : 0 };
  }
}
