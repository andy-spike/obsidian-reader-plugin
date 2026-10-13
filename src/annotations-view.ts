import { ItemView, WorkspaceLeaf } from "obsidian";
import { Annotation, AnnotationRecord, AnnotationStore } from "./annotations";
import type { ReaderView } from "./reader-view";
import { colorOf, ReaderSettings } from "./settings";
import { colorMenu, deleteAnnotation, iconButton } from "./ui";

export const ANNOTATIONS_VIEW = "reader-plugin-annotations";

export class AnnotationsView extends ItemView {
  /** Annotation whose comment is being edited here. Its text is excluded from the render key so typing never rebuilds the list. */
  private editing: string | null = null;
  private rendered = "";
  private rendering = false;

  constructor(leaf: WorkspaceLeaf, private store: AnnotationStore, private source: () => ReaderView | null, private settings: () => ReaderSettings) { super(leaf); }
  getViewType(): string { return ANNOTATIONS_VIEW; }
  getDisplayText(): string { return "PDF annotations"; }
  getIcon(): string { return "highlighter"; }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("reader-annotations");
    this.register(this.store.subscribe(() => this.refresh()));
    this.refresh(true);
  }

  refresh(force = false): void {
    const reader = this.source();
    const record = reader?.getRecord() ?? null;
    const key = JSON.stringify([
      reader?.file?.path, record?.documentId, record && this.store.state(record).error, this.editing, this.settings().colors,
      record?.annotations.map(a => [a.id, a.page, a.color, a.id === this.editing ? null : a.comment]),
    ]);
    if (!force && key === this.rendered) return;
    this.rendered = key;
    this.render(reader, record);
  }

  private render(reader: ReaderView | null, record: AnnotationRecord | null): void {
    const { contentEl } = this;
    const doc = contentEl.ownerDocument;
    const focused = doc.activeElement instanceof HTMLTextAreaElement && contentEl.contains(doc.activeElement) ? doc.activeElement : null;
    const caret = focused ? [focused.selectionStart, focused.selectionEnd] as const : null;
    this.rendering = true;
    contentEl.empty();
    this.rendering = false;

    const header = contentEl.createDiv({ cls: "reader-annotations-header" });
    header.createDiv({ cls: "reader-annotations-title", text: reader?.file?.basename ?? "Annotations" });
    if (!record || !reader) {
      contentEl.createDiv({ cls: "reader-empty", text: "Open a PDF to see its highlights and comments here." });
      return;
    }
    const count = record.annotations.length;
    header.createDiv({ cls: "reader-annotations-count", text: count ? `${count} ${count === 1 ? "highlight" : "highlights"}` : "" });
    const error = this.store.state(record).error;
    if (error) contentEl.createDiv({ cls: "reader-save-error", text: "Couldn't save to the vault. Retrying automatically…", attr: { title: error } });
    if (!count) {
      contentEl.createDiv({ cls: "reader-empty", text: "Select text in the PDF and pick a color to highlight it. Highlights and comments appear here." });
      return;
    }
    const list = contentEl.createDiv({ cls: "reader-annotation-list" });
    for (const a of [...record.annotations].sort((a, b) => a.page - b.page || a.position.start - b.position.start)) this.card(list, reader, record, a);
    if (caret && this.editing) {
      const editor = contentEl.querySelector<HTMLTextAreaElement>(`[data-id="${this.editing}"] textarea`);
      editor?.focus();
      editor?.setSelectionRange(caret[0], caret[1]);
    }
  }

  private card(list: HTMLElement, reader: ReaderView, record: AnnotationRecord, a: Annotation): void {
    const settings = this.settings();
    const color = colorOf(settings, a.color);
    const card = list.createDiv({ cls: "reader-card", attr: { "data-id": a.id } });
    card.style.setProperty("--reader-color", color.value);
    card.addEventListener("click", event => {
      if (!(event.target as HTMLElement).closest("button, textarea, .reader-card-comment")) void reader.showAnnotation(a);
    });

    const head = card.createDiv({ cls: "reader-card-head" });
    const dot = head.createEl("button", { cls: "reader-card-color", attr: { type: "button", "aria-label": `Color: ${color.name}. Change color` } });
    dot.addEventListener("click", event => colorMenu(settings.colors, a.color, id => {
      a.color = id;
      void this.store.save(record).catch(() => {});
    }).showAtMouseEvent(event));
    head.createSpan({ cls: "reader-card-page", text: `Page ${a.page}` });
    head.createSpan({ cls: "reader-card-label", text: color.name });
    const actions = head.createDiv({ cls: "reader-card-actions" });
    if (!a.comment && this.editing !== a.id) iconButton(actions, "message-square-plus", "Add comment", () => this.edit(a.id));
    iconButton(actions, "trash-2", "Delete highlight", () => deleteAnnotation(this.store, record, a));

    card.createDiv({ cls: "reader-card-quote", text: a.quote.exact.replace(/\s+/g, " ").trim() });

    if (this.editing === a.id) {
      const editor = card.createEl("textarea", { cls: "reader-comment-editor", attr: { "aria-label": "Comment", placeholder: "Write a comment…", rows: "1" } });
      editor.value = a.comment;
      editor.addEventListener("input", () => {
        a.comment = editor.value;
        void this.store.save(record).catch(() => {});
      });
      editor.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); editor.blur(); } });
      editor.addEventListener("blur", () => {
        if (this.rendering || this.editing !== a.id) return;
        this.editing = null;
        this.refresh();
      });
    } else if (a.comment) {
      const comment = card.createDiv({ cls: "reader-card-comment", text: a.comment, attr: { tabindex: "0", role: "button", "aria-label": "Edit comment" } });
      comment.addEventListener("click", () => this.edit(a.id));
      comment.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); this.edit(a.id); } });
    }
  }

  private edit(id: string): void {
    this.editing = id;
    this.refresh(true);
    const editor = this.contentEl.querySelector<HTMLTextAreaElement>(`[data-id="${id}"] textarea`);
    editor?.focus();
    editor?.setSelectionRange(editor.value.length, editor.value.length);
  }
}
