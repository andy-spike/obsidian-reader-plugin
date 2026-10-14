import { ItemView, WorkspaceLeaf } from "obsidian";
import type { ReaderView } from "./reader-view";

/** Kept from the earlier highlights panel, so layouts that saved it still open into the book note's sidebar tab. */
export const ANNOTATIONS_VIEW = "reader-plugin-annotations";

/**
 * The sidebar tab shows the active PDF's book note. Until that PDF has a note (its first highlight creates one),
 * the tab shows this placeholder instead.
 */
export class AnnotationsView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private source: () => ReaderView | null) { super(leaf); }
  getViewType(): string { return ANNOTATIONS_VIEW; }
  getDisplayText(): string { return "Book note"; }
  getIcon(): string { return "notebook-pen"; }

  async onOpen(): Promise<void> { this.refresh(); }

  /** Called when the active PDF changes. */
  refresh(): void {
    const reader = this.source();
    this.contentEl.empty();
    this.contentEl.addClass("reader-annotations");
    if (reader?.file) this.contentEl.createDiv({ cls: "reader-annotations-title", text: reader.file.basename });
    this.contentEl.createDiv({
      cls: "reader-empty",
      text: reader?.file
        ? "Highlight a passage to start this book's note. Each highlight and everything you write about it collect here."
        : "Open a PDF to see its book note here.",
    });
  }
}
