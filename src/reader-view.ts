import { FileView, Notice, TFile, WorkspaceLeaf } from "obsidian";
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
  private deleted: Annotation | null = null;
  private toolbar!: HTMLElement;
  private pageInput!: HTMLInputElement;
  private pageCount!: HTMLElement;
  private paper!: HTMLElement;
  private stage!: HTMLElement;
  private panel!: HTMLElement;
  private selectionTools!: HTMLElement;
  private status!: HTMLElement;
  private previous!: HTMLButtonElement;
  private next!: HTMLButtonElement;
  private pendingWrites = 0;
  private saveFailed = false;
  constructor(leaf: WorkspaceLeaf, private store: AnnotationStore, private changed: () => void, private labels: () => Record<HighlightColor, string>) { super(leaf); }
  getViewType(): string { return READER_VIEW; }
  getDisplayText(): string { return this.file?.basename ?? "PDF Reader"; }
  getIcon(): string { return "book-open"; }
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
    const zoom = this.toolbar.createEl("select", { attr: { "aria-label": "Zoom" } });
    for (const value of [0.75, 1, 1.25, 1.5, 2]) zoom.createEl("option", { value: String(value), text: `${value * 100}%` });
    zoom.value = "1";
    zoom.addEventListener("change", () => { this.zoom = Number(zoom.value); void this.showPage(this.page); });
    this.status = this.toolbar.createSpan({ cls: "reader-save-status", attr: { role: "status", "aria-live": "polite" } });
    this.button(this.toolbar, "Save annotations", () => void this.persist());
    this.button(this.toolbar, "Annotations", () => this.panel.toggleClass("reader-panel-hidden", !this.panel.hasClass("reader-panel-hidden")));
    this.selectionTools = this.contentEl.createDiv({ cls: "reader-selection-tools" });
    this.selectionTools.createSpan({ text: "Select a passage on this page to annotate it.", cls: "reader-selection-hint" });
    const color = this.selectionTools.createEl("select", { attr: { "aria-label": "Highlight category" } });
    for (const value of COLORS) color.createEl("option", { value, text: this.labels()[value] });
    color.addEventListener("change", () => { this.color = color.value as HighlightColor; });
    this.button(this.selectionTools, "Highlight", () => this.addHighlight(false)).addClass("reader-selection-action");
    this.button(this.selectionTools, "Highlight + comment", () => this.addHighlight(true)).addClass("reader-selection-action");
    // Keep the captured selection when clicking toolbar controls.
    this.selectionTools.addEventListener("mousedown", event => { if ((event.target as HTMLElement).tagName === "BUTTON") event.preventDefault(); });
    const body = this.contentEl.createDiv({ cls: "reader-body" });
    this.stage = body.createDiv({ cls: "reader-stage" });
    this.paper = this.stage.createDiv({ cls: "reader-paper" });
    this.panel = body.createEl("aside", { cls: "reader-annotations", attr: { "aria-label": "Annotations" } });
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
      this.renderAnnotations();
      this.status.setText("All annotations saved");
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
    this.deleted = null;
    this.passage = null;
  }
  async showPage(pageNumber: number): Promise<void> {
    if (!this.pdf) return;
    const generation = ++this.generation;
    this.rendering?.cancel();
    this.textLayer?.cancel();
    this.page = Math.max(1, Math.min(this.pdf.numPages, Math.trunc(pageNumber) || 1));
    this.pageInput.value = String(this.page);
    this.pageInput.max = String(this.pdf.numPages);
    this.pageCount.setText(`/ ${this.pdf.numPages}`);
    this.previous.disabled = this.page === 1;
    this.next.disabled = this.page === this.pdf.numPages;
    this.passage = null;
    this.updateSelectionTools();
    this.paper.empty();
    this.stage.scrollTop = 0;
    try {
      const page = await this.pdf.getPage(this.page);
      if (generation !== this.generation) return;
      const natural = page.getViewport({ scale: 1 });
      const width = Math.max(280, this.stage.clientWidth - 48);
      const viewport = page.getViewport({ scale: Math.min(width / natural.width, 1.5) * this.zoom });
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
    this.updateSelectionTools();
  }
  private updateSelectionTools(): void {
    this.selectionTools?.querySelectorAll<HTMLButtonElement>(".reader-selection-action").forEach(button => { button.disabled = !this.passage; });
    this.selectionTools?.querySelector(".reader-selection-hint")?.setText(this.passage ? `${this.passage.quote.exact.length} characters selected` : "Select a passage on this page to annotate it.");
  }
  addHighlight(comment: boolean): void {
    if (!this.record || !this.passage) return;
    const annotation: Annotation = { ...this.passage, id: randomUUID(), color: this.color, comment: "", createdAt: new Date().toISOString() };
    this.record.annotations.push(annotation);
    this.contentEl.ownerDocument.getSelection()?.removeAllRanges();
    this.passage = null;
    this.updateSelectionTools();
    this.changed();
    void this.persist();
    if (comment) {
      this.panel.removeClass("reader-panel-hidden");
      this.panel.querySelector<HTMLTextAreaElement>(`[data-id="${annotation.id}"] textarea`)?.focus();
    }
  }
  refreshAnnotations(): void { this.renderAnnotations(); this.drawHighlights(); }
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
  private renderAnnotations(): void {
    if (!this.panel) return;
    // Preserve unsaved typing and focus while other leaves update.
    const focused = this.contentEl.ownerDocument.activeElement;
    const focusedId = focused instanceof HTMLTextAreaElement ? focused.closest<HTMLElement>("[data-id]")?.dataset.id : null;
    const selection = focused instanceof HTMLTextAreaElement ? [focused.selectionStart, focused.selectionEnd] : null;
    this.panel.empty();
    this.panel.createEl("h3", { text: `Annotations · ${this.record?.annotations.length ?? 0}` });
    if (this.deleted) this.button(this.panel, "Undo deletion", () => {
      if (!this.record || !this.deleted) return;
      this.record.annotations.push(this.deleted); this.deleted = null; this.changed(); void this.persist();
    });
    if (!this.record?.annotations.length) this.panel.createEl("p", { cls: "reader-empty", text: "Keep a passage, then add your thoughts here. Annotations are saved to your vault as you work." });
    for (const a of [...(this.record?.annotations ?? [])].sort((a, b) => a.page - b.page || a.position.start - b.position.start)) {
      const item = this.panel.createDiv({ cls: `reader-annotation reader-annotation-${a.color}`, attr: { "data-id": a.id } });
      this.button(item, `Page ${a.page} · ${this.labels()[a.color]}`, () => void this.showPage(a.page));
      item.createEl("blockquote", { text: a.quote.exact });
      const note = item.createEl("textarea", { attr: { "aria-label": `Comment on ${a.quote.exact.slice(0, 60)}`, placeholder: "Add a passage comment…", rows: "3" } });
      note.value = a.comment;
      note.addEventListener("input", () => { a.comment = note.value; void this.persist(); });
      note.addEventListener("blur", () => this.changed());
      this.button(item, "Delete", () => {
        if (!this.record) return;
        this.record.annotations = this.record.annotations.filter(entry => entry.id !== a.id);
        this.deleted = a; this.changed(); void this.persist();
      });
    }
    if (focusedId) {
      const replacement = this.panel.querySelector<HTMLTextAreaElement>(`[data-id="${focusedId}"] textarea`);
      replacement?.focus();
      if (selection) replacement?.setSelectionRange(selection[0]!, selection[1]!);
    }
  }
  async persist(): Promise<void> {
    if (!this.record) return;
    const record = this.record;
    this.pendingWrites++;
    this.status.setText("Saving annotations…");
    try {
      await this.store.save(record);
      this.saveFailed = false;
    } catch (error) {
      this.saveFailed = true;
      new Notice(`Annotations could not be fully saved. Use Save annotations to retry. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pendingWrites--;
      if (this.record === record) this.status.setText(this.pendingWrites ? "Saving annotations…" : this.saveFailed ? "Save failed. Retry saving." : "All annotations saved");
    }
  }
}
