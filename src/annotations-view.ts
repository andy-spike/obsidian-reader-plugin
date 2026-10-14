import { ItemView, WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { AnnotationStore } from "./annotations";
import AnnotationsSidebar from "./components/AnnotationsSidebar.svelte";
import type { ReaderView } from "./reader-view";
import { ReaderSettings } from "./settings";

export const ANNOTATIONS_VIEW = "reader-plugin-annotations";

/** Obsidian's side panel for the active PDF's highlights. `AnnotationsSidebar.svelte` renders its contents. */
export class AnnotationsView extends ItemView {
  private sidebar: ReturnType<typeof mount<Record<string, unknown>, { refresh(): void }>> | null = null;

  constructor(leaf: WorkspaceLeaf, private store: AnnotationStore, private source: () => ReaderView | null, private settings: () => ReaderSettings) { super(leaf); }
  getViewType(): string { return ANNOTATIONS_VIEW; }
  getDisplayText(): string { return "PDF annotations"; }
  getIcon(): string { return "highlighter"; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("reader-annotations");
    this.sidebar = mount(AnnotationsSidebar, { target: this.contentEl, props: { store: this.store, source: this.source, settings: this.settings } });
  }

  async onClose(): Promise<void> {
    if (this.sidebar) await unmount(this.sidebar);
    this.sidebar = null;
  }

  /** Called when the active PDF or the settings change. Annotation edits arrive through the store. */
  refresh(): void { this.sidebar?.refresh(); }
}
