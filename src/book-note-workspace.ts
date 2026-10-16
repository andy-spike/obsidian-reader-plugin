import { WorkspaceLeaf, WorkspaceSidedock } from "obsidian";
import type { App } from "obsidian";
import type { AnnotationRecord } from "./annotations";
import { AnnotationsView, ANNOTATIONS_VIEW } from "./annotations-view";
import type { BookNoteWorkspace } from "./book-note-following";
import type { BookNotes } from "./book-notes";
import { ReaderView, READER_VIEW } from "./reader-view";
import type { NotePlace } from "./settings";

/** Obsidian's tab and focus operations, including restored tabs whose views have not loaded yet. */
export class ObsidianBookNoteWorkspace implements BookNoteWorkspace {
  constructor(private app: App, private notes: BookNotes) {}

  isCurrent(reader: ReaderView): boolean {
    return this.app.workspace.getMostRecentLeaf() === reader.leaf || this.app.workspace.getActiveViewOfType(ReaderView) === reader;
  }

  readers(): ReaderView[] {
    return this.app.workspace.getLeavesOfType(READER_VIEW).map(leaf => leaf.view).filter((view): view is ReaderView => view instanceof ReaderView);
  }

  find(place: NotePlace): WorkspaceLeaf | null {
    const workspace = this.app.workspace;
    const samePlace = (leaf: WorkspaceLeaf) => (this.inSidebar(leaf) ? "sidebar" : "beside") === place;
    let found = workspace.getLeavesOfType(ANNOTATIONS_VIEW).find(samePlace) ?? null;
    if (!found) workspace.iterateAllLeaves(leaf => {
      const state = leaf.getViewState();
      if (!found && samePlace(leaf) && state.type === "markdown" && this.notes.isNote(state.state?.file)) found = leaf;
    });
    return found;
  }

  create(place: NotePlace, reader: ReaderView | null): WorkspaceLeaf | null {
    if (place === "sidebar") return this.app.workspace.getRightLeaf(false);
    if (!reader) return null;
    return this.app.workspace.createLeafBySplit(reader.leaf, "vertical");
  }

  /** The sidebar shows the PDF's highlights as cards; beside the PDF, its book note opens as a Markdown note. */
  async display(leaf: WorkspaceLeaf, record: AnnotationRecord | null): Promise<void> {
    const file = record ? this.notes.file(record) : null;
    const state = leaf.getViewState();
    if (this.inSidebar(leaf)) {
      if (state.type !== ANNOTATIONS_VIEW) await leaf.setViewState({ type: ANNOTATIONS_VIEW, active: false });
    } else if (file) {
      if (state.type !== "markdown" || state.state?.file !== file.path) await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "source" }, active: false });
    } else if (record || state.type === "empty") {
      if (state.type !== ANNOTATIONS_VIEW) await leaf.setViewState({ type: ANNOTATIONS_VIEW, active: false });
    }
    for (const panel of this.app.workspace.getLeavesOfType(ANNOTATIONS_VIEW)) {
      if (panel.view instanceof AnnotationsView) panel.view.refresh();
    }
  }

  visible(leaf: WorkspaceLeaf): boolean {
    return leaf.view.containerEl.isShown() && !(this.inSidebar(leaf) && (leaf.getRoot() as WorkspaceSidedock).collapsed);
  }

  dismiss(leaf: WorkspaceLeaf): void {
    if (this.inSidebar(leaf)) (leaf.getRoot() as WorkspaceSidedock).collapse();
    else leaf.detach();
  }

  async reveal(leaf: WorkspaceLeaf): Promise<void> {
    // Automatic readiness must never raise a background Obsidian window.
    if (leaf.view.containerEl.doc.hasFocus()) await this.app.workspace.revealLeaf(leaf);
    else if (this.inSidebar(leaf) && (leaf.getRoot() as WorkspaceSidedock).collapsed) (leaf.getRoot() as WorkspaceSidedock).expand();
  }

  private inSidebar(leaf: WorkspaceLeaf): boolean {
    return leaf.getRoot() === this.app.workspace.rightSplit || leaf.getRoot() === this.app.workspace.leftSplit;
  }
}
