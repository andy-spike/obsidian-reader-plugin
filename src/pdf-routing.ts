import { Notice, Workspace, WorkspaceLeaf } from "obsidian";
import { READER_VIEW } from "./reader-view";

/** Marks a tab that shows Obsidian's own viewer. styles.css hides the viewer in unmarked tabs until Reader takes over. */
const NATIVE_PDF_CLASS = "reader-native-pdf";

/**
 * Moves PDF tabs from Obsidian's viewer to Reader. PDF is reserved by Obsidian, so this follows public workspace events
 * instead of patching its viewer or registry. Tabs opened on purpose in Obsidian's viewer stay there.
 */
export class PdfRouting {
  private enabled = true;
  /** Tabs asked to show a PDF in Obsidian's viewer, with the path they were asked to show. */
  private nativeTabs = new WeakMap<WorkspaceLeaf, string>();
  private redirecting = new WeakSet<WorkspaceLeaf>();
  private timer: number | undefined;

  constructor(private workspace: Workspace) {}

  get active(): boolean { return this.enabled; }

  /** Keeps a tab that is about to show `path` in Obsidian's viewer. */
  keepNative(leaf: WorkspaceLeaf, path: string): void {
    this.nativeTabs.set(leaf, path);
  }

  /** Shows Obsidian's viewer in a tab kept there. */
  showNative(leaf: WorkspaceLeaf): void {
    leaf.view.containerEl.addClass(NATIVE_PDF_CLASS);
  }

  /** A kept tab is released once it shows something other than a PDF. */
  leafActivated(leaf: WorkspaceLeaf | null): void {
    if (leaf && leaf.view.getViewType() !== "pdf") this.nativeTabs.delete(leaf);
  }

  /** Events often come in bursts; one pass right after them is enough, and soon enough that Obsidian's viewer does little work first. */
  schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.route(), 0);
  }

  stop(): void {
    this.enabled = false;
    window.clearTimeout(this.timer);
  }

  private route(): void {
    if (!this.enabled) return;
    for (const leaf of this.workspace.getLeavesOfType("pdf")) {
      const path = leaf.getViewState().state?.file;
      if (typeof path !== "string" || this.redirecting.has(leaf)) continue;
      if (this.nativeTabs.get(leaf) === path) { this.showNative(leaf); continue; }
      this.nativeTabs.delete(leaf);
      this.redirecting.add(leaf);
      void leaf.setViewState({ type: READER_VIEW, state: { file: path } })
        .catch(error => {
          // Show Obsidian's viewer rather than an empty tab.
          this.showNative(leaf);
          new Notice(`Could not open Reader: ${String(error)}`);
        })
        .finally(() => this.redirecting.delete(leaf));
    }
  }
}
