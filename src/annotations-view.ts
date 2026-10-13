import { ItemView, WorkspaceLeaf } from "obsidian";
import { Annotation, AnnotationRecord, AnnotationStore, HighlightColor } from "./annotations";
import type { ReaderView } from "./reader-view";

export const ANNOTATIONS_VIEW = "reader-plugin-annotations";
export class AnnotationsView extends ItemView {
  private deleted: { record: AnnotationRecord; annotation: Annotation } | null = null;
  constructor(leaf: WorkspaceLeaf, private store: AnnotationStore, private source: () => ReaderView | null, private labels: () => Record<HighlightColor, string>) { super(leaf); }
  getViewType(): string { return ANNOTATIONS_VIEW; }
  getDisplayText(): string { return "Reader annotations"; }
  getIcon(): string { return "highlighter"; }
  async onOpen(): Promise<void> {
    this.contentEl.addClass("reader-annotations");
    this.register(this.store.subscribe(() => this.refresh()));
    this.refresh();
  }
  refresh(): void {
    const reader = this.source();
    const record = reader?.getRecord();
    const focused = this.contentEl.ownerDocument.activeElement;
    const id = focused instanceof HTMLTextAreaElement && this.contentEl.contains(focused) ? focused.closest<HTMLElement>("[data-id]")?.dataset.id : null;
    const selection = id && focused instanceof HTMLTextAreaElement ? [focused.selectionStart, focused.selectionEnd] : null;
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: reader?.file?.basename ?? "Annotations" });
    if (!record || !reader) {
      this.contentEl.createEl("p", { cls: "reader-empty", text: "Open a PDF to see its highlights and comments." });
      return;
    }
    const state = this.store.state(record);
    this.contentEl.createEl("p", { cls: "reader-annotation-summary", text: `${record.annotations.length} ${record.annotations.length === 1 ? "highlight" : "highlights"} · ${state.error ? "Retrying save…" : state.saving ? "Saving…" : "Saved"}`, attr: { role: "status", "aria-live": "polite" } });
    if (this.deleted?.record === record) this.button(this.contentEl, "Undo deletion", () => {
      if (!this.deleted) return;
      record.annotations.push(this.deleted.annotation);
      this.deleted = null;
      void this.store.save(record).catch(() => {});
    });
    if (!record.annotations.length) this.contentEl.createEl("p", { cls: "reader-empty", text: "Select text in the PDF, then highlight it. Your passages and comments will appear here and save automatically." });
    for (const a of [...record.annotations].sort((a, b) => a.page - b.page || a.position.start - b.position.start)) {
      const item = this.contentEl.createDiv({ cls: `reader-annotation reader-annotation-${a.color}`, attr: { "data-id": a.id } });
      this.button(item, `Page ${a.page} · ${this.labels()[a.color]}`, () => void reader.showAnnotation(a));
      item.createEl("blockquote", { text: a.quote.exact });
      const note = item.createEl("textarea", { attr: { "aria-label": `Comment on ${a.quote.exact.slice(0, 60)}`, placeholder: "Add a comment…", rows: "3" } });
      note.value = a.comment;
      note.addEventListener("input", () => { a.comment = note.value; void this.store.save(record).catch(() => {}); });
      this.button(item, "Delete highlight", () => {
        record.annotations = record.annotations.filter(entry => entry.id !== a.id);
        this.deleted = { record, annotation: a };
        void this.store.save(record).catch(() => {});
      }).addClass("reader-delete");
    }
    if (id) {
      const note = this.contentEl.querySelector<HTMLTextAreaElement>(`[data-id="${id}"] textarea`);
      note?.focus();
      if (selection) note?.setSelectionRange(selection[0]!, selection[1]!);
    }
  }
  private button(parent: HTMLElement, text: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { text, attr: { type: "button" } });
    button.addEventListener("click", action);
    return button;
  }
}
