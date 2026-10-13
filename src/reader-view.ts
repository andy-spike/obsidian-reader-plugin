import { FileView, Notice, TFile, WorkspaceLeaf, ViewStateResult } from "obsidian";
import { randomUUID } from "node:crypto";
import { Annotation, AnnotationRecord, AnnotationStore, COLORS, fingerprint, HighlightColor } from "./annotations";
import { loadPdf, PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayer } from "./pdf-engine";

export const READER_VIEW = "reader-plugin-pdf";
type Passage = Pick<Annotation, "page" | "quote" | "position" | "rects">;
export class ReaderView extends FileView {
  private pdf: PDFDocumentProxy | null = null;
  private loading: PDFDocumentLoadingTask | null = null;
  private rendering: RenderTask | null = null;
  private textLayer: TextLayer | null = null;
  private record: AnnotationRecord | null = null;
  private page = 1;
  private zoom = 1;
  private generation = 0;
  private passage: Passage | null = null;
  private color: HighlightColor = "yellow";
  private editing: Annotation | null = null;
  private pointerDown = false;
  private popupPoint = { x: 0, y: 0 };
  private zoomControl!: HTMLSelectElement;
  private fitWidth = true;
  private toolbar!: HTMLElement;
  private pageInput!: HTMLInputElement;
  private pageCount!: HTMLElement;
  private paper!: HTMLElement;
  private stage!: HTMLElement;
  private selectionTools!: HTMLElement;
  private status!: HTMLElement;
  private previous!: HTMLButtonElement;
  private next!: HTMLButtonElement;
  constructor(leaf: WorkspaceLeaf, private store: AnnotationStore, private ready: (reader: ReaderView) => void, private openAnnotations: () => void, private labels: () => Record<HighlightColor, string>) { super(leaf); }
  getViewType(): string { return READER_VIEW; }
  getDisplayText(): string { return this.file?.basename ?? "PDF Reader"; }
  getIcon(): string { return "book-open"; }
  getState(): Record<string, unknown> { return { ...super.getState(), page: this.page, zoom: this.fitWidth ? "fit" : this.zoom }; }
  async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    if (!this.pdf) return;
    const oldFit = this.fitWidth;
    const oldZoom = this.zoom;
    if (state.zoom === "fit") { this.fitWidth = true; this.zoomControl.value = "fit"; }
    const zoom = typeof state.zoom === "number" ? Math.max(0.25, Math.min(4, state.zoom)) : null;
    if (zoom !== null) {
      this.fitWidth = false;
      this.zoom = zoom;
      if (!Array.from(this.zoomControl.options).some(option => option.value === String(zoom))) this.zoomControl.createEl("option", { value: String(zoom), text: `${Math.round(zoom * 100)}%` });
      this.zoomControl.value = String(zoom);
    }
    const page = typeof state.page === "number" ? state.page : 1;
    if (page !== this.page || oldFit !== this.fitWidth || oldZoom !== this.zoom) await this.showPage(page);
  }
  canAcceptExtension(extension: string): boolean { return extension === "pdf"; }
  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("reader-view");
    this.toolbar = this.contentEl.createDiv({ cls: "reader-toolbar" });
    this.previous = this.button(this.toolbar, "Previous", () => void this.showPage(this.page - 1));
    this.pageInput = this.toolbar.createEl("input", { type: "number", attr: { "aria-label": "Page number", min: "1" } });
    this.pageInput.addEventListener("change", () => void this.showPage(Number(this.pageInput.value)));
    this.pageCount = this.toolbar.createSpan();
    this.next = this.button(this.toolbar, "Next", () => void this.showPage(this.page + 1));
    this.button(this.toolbar, "−", () => this.changeZoom(-0.25)).setAttribute("aria-label", "Zoom out");
    this.zoomControl = this.toolbar.createEl("select", { attr: { "aria-label": "Zoom" } });
    this.zoomControl.createEl("option", { value: "fit", text: "Fit width" });
    for (const value of [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]) this.zoomControl.createEl("option", { value: String(value), text: `${value * 100}%` });
    this.zoomControl.value = "fit";
    this.zoomControl.addEventListener("change", () => {
      this.fitWidth = this.zoomControl.value === "fit";
      if (!this.fitWidth) this.zoom = Number(this.zoomControl.value);
      void this.showPage(this.page, true);
    });
    this.button(this.toolbar, "+", () => this.changeZoom(0.25)).setAttribute("aria-label", "Zoom in");
    this.status = this.toolbar.createSpan({ cls: "reader-save-status", attr: { role: "status", "aria-live": "polite" } });
    this.button(this.toolbar, "Annotations", this.openAnnotations);
    const body = this.contentEl.createDiv({ cls: "reader-body" });
    this.stage = body.createDiv({ cls: "reader-stage" });
    this.paper = this.stage.createDiv({ cls: "reader-paper" });
    this.selectionTools = this.contentEl.ownerDocument.body.createDiv({ cls: "reader-selection-tools", attr: { role: "dialog", "aria-label": "Annotate selected passage" } });
    this.selectionTools.hidden = true;
    this.register(() => this.selectionTools.remove());
    this.buildSelectionPopup();
    this.selectionTools.addEventListener("mousedown", event => { if ((event.target as HTMLElement).closest("button")) event.preventDefault(); });
    this.registerDomEvent(this.stage, "pointerdown", () => { this.pointerDown = true; this.dismissPopup(); });
    this.registerDomEvent(this.contentEl.ownerDocument, "pointerup", event => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      this.popupPoint = { x: event.clientX, y: event.clientY + 12 };
      this.captureSelection();
    });
    this.registerDomEvent(this.contentEl.ownerDocument, "pointerdown", event => {
      if (!this.selectionTools.contains(event.target as Node) && !this.paper.contains(event.target as Node)) this.dismissPopup();
    });
    this.registerDomEvent(this.stage, "scroll", () => this.dismissPopup());
    this.registerDomEvent(this.contentEl.ownerDocument, "keydown", event => {
      if (event.key === "Escape" && !this.selectionTools.hidden) { this.dismissPopup(); this.passage = null; }
    });
    this.registerDomEvent(this.stage, "wheel", event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.changeZoom(event.deltaY < 0 ? 0.25 : -0.25);
    }, { passive: false });
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let width = this.stage.clientWidth;
    const observer = new ResizeObserver(() => {
      const next = this.stage.clientWidth;
      if (next === width) return;
      width = next;
      this.dismissPopup();
      clearTimeout(resizeTimer);
      if (this.fitWidth && this.pdf) resizeTimer = setTimeout(() => void this.showPage(this.page, true), 150);
    });
    observer.observe(this.stage);
    this.register(() => { observer.disconnect(); clearTimeout(resizeTimer); });
    this.register(this.store.subscribe(record => {
      if (record === this.record) this.refreshAnnotations();
    }));
    this.registerDomEvent(this.contentEl.ownerDocument, "selectionchange", () => this.captureSelection());
    this.updateSelectionTools();
  }
  private button(parent: HTMLElement, text: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { text, attr: { type: "button" } });
    button.addEventListener("click", action);
    return button;
  }
  async onLoadFile(file: TFile): Promise<void> {
    await this.disposePdf();
    const generation = ++this.generation;
    this.paper.empty();
    this.paper.createEl("p", { text: "Opening PDF…" });
    try {
      const data = await this.app.vault.readBinary(file);
      if (generation !== this.generation) return;
      this.record = await this.store.open(file.path, fingerprint(data));
      if (generation !== this.generation) return;
      this.loading = loadPdf(data);
      this.pdf = await this.loading.promise;
      if (generation !== this.generation) return;
      this.page = 1;
      this.ready(this);
      this.updateSaveStatus();
      await this.showPage(1);
    } catch (error) {
      if (generation !== this.generation) return;
      this.paper.empty();
      this.paper.createEl("h3", { text: "Could not open this PDF" });
      this.paper.createEl("p", { text: error instanceof Error ? error.message : String(error) });
    }
  }
  async onUnloadFile(): Promise<void> { await this.disposePdf(); }
  async onClose(): Promise<void> { await this.disposePdf(); }
  private async disposePdf(): Promise<void> {
    ++this.generation;
    this.rendering?.cancel();
    this.textLayer?.cancel();
    await this.loading?.destroy();
    this.loading = null;
    this.pdf = null;
    this.record = null;
    this.dismissPopup();
    this.ready(this);
    this.passage = null;
  }
  async showPage(pageNumber: number, preservePosition = false): Promise<void> {
    if (!this.pdf) return;
    const generation = ++this.generation;
    this.dismissPopup();
    this.rendering?.cancel();
    this.textLayer?.cancel();
    this.page = Math.max(1, Math.min(this.pdf.numPages, Math.trunc(pageNumber) || 1));
    this.app.workspace.requestSaveLayout();
    this.pageInput.value = String(this.page);
    this.pageInput.max = String(this.pdf.numPages);
    this.pageCount.setText(`/ ${this.pdf.numPages}`);
    this.previous.disabled = this.page === 1;
    this.next.disabled = this.page === this.pdf.numPages;
    this.passage = null;
    this.updateSelectionTools();
    const scrollRatio = preservePosition ? this.stage.scrollTop / Math.max(1, this.paper.clientHeight) : 0;
    this.paper.empty();
    this.stage.scrollTop = 0;
    try {
      const page = await this.pdf.getPage(this.page);
      if (generation !== this.generation) return;
      const natural = page.getViewport({ scale: 1 });
      const width = Math.max(280, this.stage.clientWidth - 48);
      const viewport = page.getViewport({ scale: this.fitWidth ? width / natural.width : this.zoom });
      this.paper.style.width = `${viewport.width}px`;
      this.paper.style.height = `${viewport.height}px`;
      this.paper.style.setProperty("--scale-factor", String(viewport.scale));
      this.paper.style.setProperty("--total-scale-factor", String(viewport.scale));
      const canvas = this.paper.createEl("canvas", { attr: { "aria-label": `PDF page ${this.page}` } });
      const ratio = this.contentEl.ownerDocument.defaultView?.devicePixelRatio ?? 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      this.rendering = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      const text = await page.getTextContent();
      if (generation !== this.generation) return;
      const layer = this.paper.createDiv({ cls: "textLayer" });
      this.textLayer = new TextLayer({ textContentSource: text, container: layer, viewport });
      await Promise.all([this.rendering.promise, this.textLayer.render()]);
      if (generation !== this.generation) return;
      this.drawHighlights();
      this.stage.scrollTop = scrollRatio * viewport.height;
      if (!text.items.some(item => "str" in item && item.str.trim())) {
        new Notice("This page has no selectable text. Scanned PDFs need OCR before passages can be highlighted.");
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.paper.empty();
      this.paper.createEl("p", { text: `Could not render page ${this.page}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  private captureSelection(): void {
    if (this.editing) return;
    const selection = this.contentEl.ownerDocument.getSelection();
    const layer = this.paper?.querySelector(".textLayer");
    if (!selection?.rangeCount || !layer || selection.isCollapsed) {
      if (this.selectionTools?.contains(this.contentEl.ownerDocument.activeElement)) return;
      this.passage = null; this.updateSelectionTools(); return;
    }
    const range = selection.getRangeAt(0);
    if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) {
      if (this.selectionTools.contains(this.contentEl.ownerDocument.activeElement)) return;
      this.passage = null; this.updateSelectionTools(); return;
    }
    const exact = range.toString();
    if (!exact.trim()) return;
    const before = range.cloneRange();
    before.selectNodeContents(layer);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.cloneContents().textContent?.length ?? 0;
    const end = start + (range.cloneContents().textContent?.length ?? 0);
    const full = layer.textContent ?? "";
    const bounds = this.paper.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0).map(r => ({
      x: Math.max(0, (r.left - bounds.left) / bounds.width), y: Math.max(0, (r.top - bounds.top) / bounds.height),
      width: Math.min(r.width / bounds.width, (bounds.right - r.left) / bounds.width),
      height: Math.min(r.height / bounds.height, (bounds.bottom - r.top) / bounds.height),
    })).filter(r => r.width > 0 && r.height > 0);
    this.passage = rects.length ? { page: this.page, quote: { exact, prefix: full.slice(Math.max(0, start - 48), start), suffix: full.slice(end, end + 48) }, position: { start, end }, rects } : null;
    if (!this.pointerDown) {
      const last = range.getClientRects().item(range.getClientRects().length - 1);
      if (last && !this.popupPoint.x) this.popupPoint = { x: last.right, y: last.bottom + 12 };
    }
    this.updateSelectionTools();
  }
  private updateSelectionTools(): void {
    if (!this.selectionTools || this.editing) return;
    if (!this.passage || this.pointerDown) { this.selectionTools.hidden = true; return; }
    this.buildSelectionPopup();
    this.positionPopup();
  }
  private buildSelectionPopup(): void {
    this.selectionTools.empty();
    this.selectionTools.removeClass("reader-comment-popup");
    const colors = this.selectionTools.createDiv({ cls: "reader-popup-colors", attr: { role: "group", "aria-label": "Highlight category" } });
    for (const value of COLORS) {
      const button = this.button(colors, "", () => {
        this.color = value;
        colors.querySelectorAll("button").forEach(control => control.setAttribute("aria-pressed", String(control === button)));
      });
      button.addClasses(["reader-color", `reader-color-${value}`]);
      button.setAttribute("aria-label", this.labels()[value]);
      button.setAttribute("aria-pressed", String(this.color === value));
      button.title = this.labels()[value];
    }
    this.button(this.selectionTools, "Highlight", () => this.addHighlight(false));
    this.button(this.selectionTools, "Comment", () => this.addHighlight(true));
  }
  private positionPopup(): void {
    this.selectionTools.hidden = false;
    const window = this.contentEl.ownerDocument.defaultView!;
    const width = this.selectionTools.offsetWidth;
    const height = this.selectionTools.offsetHeight;
    const x = Math.max(8, Math.min(this.popupPoint.x, window.innerWidth - width - 8));
    const y = this.popupPoint.y + height < window.innerHeight - 8 ? this.popupPoint.y : Math.max(8, this.popupPoint.y - height - 24);
    Object.assign(this.selectionTools.style, { left: `${x}px`, top: `${Math.max(8, y)}px` });
  }
  private dismissPopup(): void {
    if (this.selectionTools) this.selectionTools.hidden = true;
    this.editing = null;
    this.popupPoint = { x: 0, y: 0 };
  }
  addHighlight(comment: boolean): void {
    if (!this.record || !this.passage) return;
    const annotation: Annotation = { ...this.passage, id: randomUUID(), color: this.color, comment: "", createdAt: new Date().toISOString() };
    this.record.annotations.push(annotation);
    const point = { ...this.popupPoint };
    this.passage = null;
    if (comment) this.editing = annotation;
    this.contentEl.ownerDocument.getSelection()?.removeAllRanges();
    void this.persist();
    if (comment) {
      this.selectionTools.empty();
      this.selectionTools.addClass("reader-comment-popup");
      const note = this.selectionTools.createEl("textarea", { attr: { "aria-label": "Passage comment", placeholder: "Add a comment…", rows: "3" } });
      note.addEventListener("input", () => { annotation.comment = note.value; void this.persist(); });
      this.button(this.selectionTools, "Done", () => { this.dismissPopup(); this.selectionTools.removeClass("reader-comment-popup"); });
      this.popupPoint = point;
      this.positionPopup();
      note.focus();
    } else this.dismissPopup();
  }
  getRecord(): AnnotationRecord | null { return this.record; }
  hideSelectionPopup(): void { this.dismissPopup(); this.passage = null; }
  refreshAnnotations(): void {
    this.drawHighlights();
    this.updateSaveStatus();
    if (!this.editing) return;
    if (!this.record?.annotations.includes(this.editing)) { this.dismissPopup(); return; }
    const editor = this.selectionTools.querySelector("textarea");
    if (editor && editor.value !== this.editing.comment) {
      const start = editor.selectionStart, end = editor.selectionEnd;
      editor.value = this.editing.comment;
      editor.setSelectionRange(start, end);
    }
  }
  private updateSaveStatus(): void {
    if (!this.record || !this.status) return;
    const state = this.store.state(this.record);
    this.status.setText(state.error ? "Retrying save…" : state.saving ? "Saving…" : "Saved");
    this.status.title = state.error ?? "Highlights and comments save automatically to your vault.";
  }
  changeZoom(delta: number): void {
    if (!this.pdf) return;
    const current = this.zoom;
    // Fit width switches to the current rendered scale, then adjusts by 25 percentage points.
    const scale = this.fitWidth ? Number(this.paper.style.getPropertyValue("--scale-factor")) || current : current;
    this.zoom = Math.max(0.25, Math.min(4, Math.round((scale + delta) * 100) / 100));
    this.fitWidth = false;
    if (!Array.from(this.zoomControl.options).some(option => option.value === String(this.zoom))) this.zoomControl.createEl("option", { value: String(this.zoom), text: `${Math.round(this.zoom * 100)}%` });
    this.zoomControl.value = String(this.zoom);
    void this.showPage(this.page, true);
  }
  async showAnnotation(annotation: Annotation): Promise<void> {
    await this.showPage(annotation.page);
    this.stage.scrollTop = Math.max(0, annotation.rects[0]!.y * this.paper.clientHeight - 80);
    await this.app.workspace.revealLeaf(this.leaf);
    this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
  }
  private drawHighlights(): void {
    this.paper?.querySelector(".reader-highlight-layer")?.remove();
    if (!this.record || !this.paper?.querySelector(".textLayer")) return;
    const layer = this.paper.createDiv({ cls: "reader-highlight-layer" });
    for (const a of this.record.annotations.filter(a => a.page === this.page)) {
      for (const r of a.rects) {
        const mark = layer.createDiv({ cls: `reader-mark reader-mark-${a.color}`, attr: { title: a.comment || a.quote.exact } });
        Object.assign(mark.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });
      }
    }
  }
  async persist(): Promise<void> {
    if (this.record) await this.store.save(this.record).catch(() => {});
  }
}
