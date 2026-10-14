import { flushSync, mount, unmount } from "svelte";
import { Annotation } from "./annotations";
import Card from "./components/AnnotationPopup.svelte";
import { HighlightColor } from "./settings";

type PopupCard = ReturnType<typeof mount<Record<string, never>, {
  showSelection(colors: HighlightColor[], lastColor: string, actions: SelectionActions): void;
  showAnnotation(annotation: Annotation, colors: HighlightColor[], actions: AnnotationActions, focusComment: boolean): void;
  sync(colors: HighlightColor[]): void;
  clear(): void;
}>>;

/** `preview` tints the selection in a color while its swatch is hovered or focused, and clears it with null. */
export interface SelectionActions { highlight(color: string): void; comment(): void; copy(): void; preview(color: string | null): void }
export interface AnnotationActions { recolor(color: string): void; comment(text: string): void; copy(): void; remove(): void }
/** Horizontal position and the vertical span the card should not cover, in viewport coordinates. */
export interface PopupAnchor { clientX: number; top: number; bottom: number; above: boolean }

/** One floating card for a text selection or an existing highlight. It lives in the scrolled content so it moves with the passage. This class places and dismisses the card; `AnnotationPopup.svelte` renders its contents. */
export class AnnotationPopup {
  readonly el: HTMLElement;
  mode: "selection" | "annotation" | null = null;
  annotation: Annotation | null = null;
  private anchor = { x: 0, top: 0, bottom: 0, above: false };
  private card: PopupCard;
  private observer: ResizeObserver;

  constructor(private host: HTMLElement, private viewport: HTMLElement, private reserveBottom: number, private onHide: () => void = () => {}) {
    this.el = host.createDiv({ cls: "reader-popup", attr: { role: "dialog", "aria-label": "Annotate passage" } });
    this.el.hidden = true;
    this.card = mount(Card, { target: this.el });
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
  destroy(): void { this.observer.disconnect(); void unmount(this.card); this.el.remove(); }

  showSelection(at: PopupAnchor, colors: HighlightColor[], lastColor: string, actions: SelectionActions): void {
    this.mode = "selection";
    this.annotation = null;
    this.card.showSelection(colors, lastColor, actions);
    this.show(at);
  }

  showAnnotation(at: PopupAnchor, annotation: Annotation, colors: HighlightColor[], actions: AnnotationActions, focusComment: boolean): void {
    this.mode = "annotation";
    this.annotation = annotation;
    this.card.showAnnotation(annotation, colors, actions, focusComment);
    this.show(at);
  }

  /** Reflects edits made elsewhere, such as the sidebar or another tab of the same PDF. */
  sync(colors: HighlightColor[]): void {
    this.card.sync(colors);
    flushSync();
  }

  hide(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.mode = null;
    this.annotation = null;
    this.card.clear();
    flushSync();
    this.onHide();
  }

  private show(at: PopupAnchor): void {
    this.el.hidden = false;
    // Render now so the card can be measured and its comment field focused.
    flushSync();
    const host = this.host.getBoundingClientRect();
    this.anchor = { x: at.clientX - host.left, top: at.top - host.top, bottom: at.bottom - host.top, above: at.above };
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
