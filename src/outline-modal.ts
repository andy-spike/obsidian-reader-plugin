import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import OutlineTree from "./components/OutlineTree.svelte";
import type { OutlineNode } from "./outline";

/** The PDF's table of contents as a collapsible tree with search. `OutlineTree.svelte` renders its contents. */
export class OutlineModal extends Modal {
  private tree: ReturnType<typeof mount> | null = null;

  constructor(app: App, private nodes: OutlineNode[], private current: number | null, private choose: (node: OutlineNode) => void) { super(app); }

  onOpen(): void {
    this.setTitle("Table of contents");
    this.modalEl.addClass("reader-outline-modal");
    this.tree = mount(OutlineTree, { target: this.contentEl, props: {
      nodes: this.nodes, current: this.current,
      choose: (node: OutlineNode) => { this.close(); this.choose(node); },
    } });
  }

  onClose(): void {
    if (this.tree) void unmount(this.tree);
    this.tree = null;
    this.contentEl.empty();
  }
}
