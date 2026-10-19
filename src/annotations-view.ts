import { Component, ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import { flushSync, mount, unmount } from "svelte";
import type { AnnotationRecord } from "./annotations";
import { quoteText } from "./book-note";
import Cards from "./components/BookNoteCards.svelte";
import type { ReaderView } from "./reader-view";
import { colorOf, type ReaderSettings } from "./settings";

/** Kept from the earlier highlights panel, so layouts that saved it still open into the book note's sidebar tab. */
export const ANNOTATIONS_VIEW = "reader-plugin-annotations";

/** One highlight's card: its quote, and the comment from its quote note. */
export interface CardData { id: string; page: number; color: string; quote: string; comment: string }

export interface CardsState {
  title: string;
  /** Shown instead of cards, for a PDF without highlights or no PDF at all. */
  empty: string;
  cards: CardData[];
}

export interface CardActions {
  openPassage(id: string): void;
  openQuoteNote(id: string): void;
  openBookNote(): void;
  /** Saves a comment to the highlight's quote note. */
  save(id: string, comment: string): void;
  /** Renders a comment's Markdown the way Obsidian renders notes. Returns a cleanup function. */
  render(element: HTMLElement, id: string, markdown: string): () => void;
}

export interface BookNoteCardsHost {
  /** The PDF whose cards to show. */
  source(): ReaderView | null;
  settings(): ReaderSettings;
  comment(annotationId: string): string;
  /** Path of a highlight's quote note, for resolving links in its comment. */
  quoteNotePath(annotationId: string): string;
  saveComment(record: AnnotationRecord, annotationId: string, comment: string): Promise<void>;
  openPassage(reader: ReaderView, annotationId: string): void;
  openQuoteNote(record: AnnotationRecord, annotationId: string): void;
  openBookNote(reader: ReaderView): void;
  /** Calls `listener` when highlights or comments change, and returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

type CardsComponent = ReturnType<typeof mount<{ actions: CardActions }, { update(next: CardsState): void; focusComment(id: string): void }>>;

/**
 * The sidebar tab shows the active PDF's highlights as cards: each quote, with the comment from its quote note below it,
 * ready to read or type into. Comments are saved to the quote notes as you type.
 */
export class AnnotationsView extends ItemView {
  private cards: CardsComponent | null = null;

  constructor(leaf: WorkspaceLeaf, private host: BookNoteCardsHost) { super(leaf); }
  getViewType(): string { return ANNOTATIONS_VIEW; }
  getDisplayText(): string { return "Book note"; }
  getIcon(): string { return "notebook-pen"; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("reader-annotations");
    this.cards = mount(Cards, { target: this.contentEl, props: { actions: this.actions() } });
    this.register(() => { if (this.cards) void unmount(this.cards); this.cards = null; });
    this.register(this.host.subscribe(() => this.refresh()));
    this.refresh();
  }

  /** Called when the active PDF, its highlights, or their comments change. */
  refresh(): void {
    if (!this.cards) return;
    const reader = this.host.source();
    const record = reader?.getRecord() ?? null;
    const settings = this.host.settings();
    const annotations = [...record?.annotations ?? []].sort((a, b) => a.page - b.page || a.position.start - b.position.start);
    this.cards.update({
      title: reader?.file?.basename ?? "",
      empty: reader?.file
        ? "Highlight a passage to start this book's note. Each highlight and what you write about it collect here."
        : "Open a PDF to see its book note here.",
      cards: annotations.map(annotation => ({
        id: annotation.id,
        page: annotation.page,
        color: colorOf(settings, annotation.color).value,
        quote: quoteText(annotation.quote.exact),
        comment: this.host.comment(annotation.id),
      })),
    });
  }

  /** Opens a highlight's comment for typing, as after the Reader's Note button. */
  focusComment(annotationId: string): void {
    this.refresh();
    flushSync();
    this.cards?.focusComment(annotationId);
  }

  private actions(): CardActions {
    const withRecord = (run: (reader: ReaderView, record: AnnotationRecord) => void) => {
      const reader = this.host.source();
      const record = reader?.getRecord();
      if (reader && record) run(reader, record);
    };
    return {
      openPassage: id => withRecord(reader => this.host.openPassage(reader, id)),
      openQuoteNote: id => withRecord((_, record) => this.host.openQuoteNote(record, id)),
      openBookNote: () => withRecord(reader => this.host.openBookNote(reader)),
      save: (id, comment) => withRecord((_, record) => {
        this.host.saveComment(record, id, comment).catch(error => new Notice(`Could not save the comment: ${String(error)}`));
      }),
      render: (element, id, markdown) => {
        const component = new Component();
        component.load();
        const sourcePath = this.host.quoteNotePath(id);
        // Render into a child that cleanup removes, so rendering again never adds a second copy.
        const target = element.createDiv();
        void MarkdownRenderer.render(this.app, markdown, target, sourcePath, component);
        // Rendered links aren't wired up outside note views, so follow them here.
        const follow = (event: MouseEvent) => {
          const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a.internal-link");
          if (!link) return;
          event.preventDefault();
          void this.app.workspace.openLinkText(link.getAttribute("data-href") ?? link.getAttribute("href") ?? "", sourcePath, event.ctrlKey || event.metaKey);
        };
        element.addEventListener("click", follow);
        return () => {
          element.removeEventListener("click", follow);
          component.unload();
          target.remove();
        };
      },
    };
  }
}
