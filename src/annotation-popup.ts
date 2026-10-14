import { Annotation } from "./annotations";
import { HighlightColor } from "./settings";
import { iconButton, swatch } from "./ui";

export interface SelectionActions { highlight(color: string): void; comment(): void; copy(): void }
export interface AnnotationActions { recolor(color: string): void; comment(text: string): void; copy(): void; remove(): void }
/** Horizontal position and the vertical span the card should not cover, in viewport coordinates. */
export interface PopupAnchor { clientX: number; top: number; bottom: number; above: boolean }

/** One floating card for a text selection or an existing highlight. It lives in the scrolled content so it moves with the passage. */
export class AnnotationPopup {
  readonly el: HTMLElement;
  mode: "selection" | "annotation" | null = null;
  annotation: Annotation | null = null;
  private anchor = { x: 0, top: 0, bottom: 0, above: false };
  private editor: HTMLTextAreaElement | null = null;
  private colors: HighlightColor[] = [];
  private actions: AnnotationActions | null = null;
  private observer: ResizeObserver;

  constructor(private host: HTMLElement, private viewport: HTMLElement, private reserveBottom: number) {
    this.el = host.createDiv({ cls: "reader-popup", attr: { role: "dialog", "aria-label": "Annotate passage" } });
    this.el.hidden = true;
    // Buttons must not take focus away from the text selection they act on.
    this.el.addEventListener("mousedown", event => { if ((event.target as HTMLElement).closest("button")) event.preventDefault(); });
    this.el.addEventListener("keydown", event => {
      if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        event.stopPropagation();
        this.hide();
        this.viewport.focus({ preventScroll: true });
      }
    });
    this.observer = new ResizeObserver(() => { if (!this.el.hidden) this.place(); });
    this.observer.observe(this.el);
  }

  get open(): boolean { return !this.el.hidden; }
  contains(node: Node | null): boolean { return !!node && this.el.contains(node); }
  destroy(): void { this.observer.disconnect(); this.el.remove(); }

  showSelection(at: PopupAnchor, colors: HighlightColor[], lastColor: string, actions: SelectionActions): void {
    this.reset("selection");
    const row = this.el.createDiv({ cls: "reader-popup-row" });
    const swatches = row.createDiv({ cls: "reader-popup-swatches", attr: { role: "group", "aria-label": "Highlight in color" } });
    for (const color of colors) swatch(swatches, color, color.id === lastColor, () => actions.highlight(color.id));
    row.createDiv({ cls: "reader-popup-divider" });
    iconButton(row, "message-square-plus", "Highlight and comment", () => actions.comment(), "top");
    iconButton(row, "copy", "Copy text", () => actions.copy(), "top");
    this.show(at);
  }

  showAnnotation(at: PopupAnchor, annotation: Annotation, colors: HighlightColor[], actions: AnnotationActions, focusComment: boolean): void {
    this.reset("annotation");
    this.annotation = annotation;
    this.colors = colors;
    this.actions = actions;
    this.renderAnnotation(focusComment || !!annotation.comment);
    this.show(at);
    if (focusComment) this.focusEditor();
  }

  /** Reflects edits made elsewhere, such as the sidebar or another tab of the same PDF. */
  sync(colors: HighlightColor[]): void {
    const annotation = this.annotation;
    if (this.mode !== "annotation" || !annotation) return;
    const key = (list: HighlightColor[]) => list.map(color => `${color.id}:${color.name}:${color.value}`).join();
    const editor = this.editor;
    if (key(colors) !== key(this.colors) || (!editor && annotation.comment)) {
      const focused = editor === editor?.ownerDocument.activeElement ? [editor!.selectionStart, editor!.selectionEnd] as const : null;
      this.colors = colors;
      this.renderAnnotation(!!editor || !!annotation.comment);
      if (focused) { this.editor?.focus(); this.editor?.setSelectionRange(focused[0], focused[1]); }
      return;
    }
    this.el.querySelectorAll<HTMLElement>(".reader-swatch").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.color === annotation.color)));
    if (editor && editor.value !== annotation.comment) {
      const start = editor.selectionStart, end = editor.selectionEnd;
      editor.value = annotation.comment;
      editor.setSelectionRange(start, end);
    }
  }

  hide(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.reset(null);
  }

  private reset(mode: AnnotationPopup["mode"]): void {
    this.mode = mode;
    this.annotation = null;
    this.actions = null;
    this.editor = null;
    this.el.empty();
    this.el.toggleClass("has-editor", false);
  }

  private renderAnnotation(showEditor: boolean): void {
    const annotation = this.annotation!, actions = this.actions!;
    this.el.empty();
    this.editor = null;
    const row = this.el.createDiv({ cls: "reader-popup-row" });
    const swatches = row.createDiv({ cls: "reader-popup-swatches", attr: { role: "group", "aria-label": "Highlight color" } });
    for (const color of this.colors) swatch(swatches, color, color.id === annotation.color, () => actions.recolor(color.id));
    row.createDiv({ cls: "reader-popup-divider" });
    if (showEditor) iconButton(row, "message-square-x", "Remove comment", () => {
      actions.comment("");
      this.renderAnnotation(false);
    }, "top");
    else iconButton(row, "message-square-plus", "Add comment", () => {
      this.renderAnnotation(true);
      this.focusEditor();
    }, "top");
    iconButton(row, "copy", "Copy text", () => actions.copy(), "top");
    iconButton(row, "trash-2", "Delete highlight", () => actions.remove(), "top").addClass("mod-warning");
    this.el.toggleClass("has-editor", showEditor);
    if (!showEditor) return;
    const editor = this.editor = this.el.createEl("textarea", { cls: "reader-comment-editor", attr: { "aria-label": "Comment", placeholder: "Write a comment…", rows: "1" } });
    editor.value = annotation.comment;
    editor.addEventListener("input", () => actions.comment(editor.value));
  }

  private focusEditor(): void {
    const editor = this.editor;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }

  private show(at: PopupAnchor): void {
    const host = this.host.getBoundingClientRect();
    this.anchor = { x: at.clientX - host.left, top: at.top - host.top, bottom: at.bottom - host.top, above: at.above };
    this.el.hidden = false;
    this.place();
  }

  /** Keeps the card inside the visible part of the PDF and clear of the passage it belongs to. */
  private place(): void {
    const width = this.el.offsetWidth, height = this.el.offsetHeight;
    const host = this.host.getBoundingClientRect(), view = this.viewport.getBoundingClientRect();
    const left = view.left - host.left + 8, top = view.top - host.top + 8;
    const right = left + this.viewport.clientWidth - width - 16;
    const bottom = top + this.viewport.clientHeight - height - this.reserveBottom;
    const below = this.anchor.bottom + 12, above = this.anchor.top - height - 12;
    const y = this.anchor.above ? (above >= top ? above : below) : (below <= bottom ? below : above);
    this.el.style.left = `${Math.max(left, Math.min(this.anchor.x - width / 2, right))}px`;
    this.el.style.top = `${Math.max(top, Math.min(y, Math.max(top, bottom)))}px`;
  }
}
