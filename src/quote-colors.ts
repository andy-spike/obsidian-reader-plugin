import type { Workspace } from "obsidian";

/**
 * Gives book-note quotes their highlight's color, matched by the highlight ID in the quote's passage link. Only the rendered
 * callout changes; the note's text stays as written.
 */
export class QuoteColors {
  private frame = 0;

  /** `colors` maps highlight IDs to their current color values. */
  constructor(private workspace: Workspace, private colors: () => Map<string, string>) {}

  /** Colors the quotes in one rendered element. */
  paint(root: HTMLElement, colors = this.colors()): void {
    root.querySelectorAll<HTMLAnchorElement>('a[href^="obsidian://reader-plugin?"]').forEach(link => {
      const callout = link.closest<HTMLElement>('.callout[data-callout="quote"]');
      if (!callout) return;
      const color = colors.get(new URL(link.href).searchParams.get("annotation") ?? "");
      callout.setCssProps({ "--callout-color": color ? rgbChannels(color) : "", "--reader-color": color ?? "" });
    });
  }

  /** Repaints every open note on the next frame, once however many times it is asked. */
  scheduleRepaint(): void {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      for (const leaf of this.workspace.getLeavesOfType("markdown")) this.paint(leaf.view.containerEl);
    });
  }

  /** Cancels a pending repaint and returns open notes to Obsidian's own quote colors. */
  dispose(): void {
    window.cancelAnimationFrame(this.frame);
    for (const leaf of this.workspace.getLeavesOfType("markdown")) this.paint(leaf.view.containerEl, new Map());
  }
}

/** Obsidian's `--callout-color` takes comma-separated RGB channels, such as "255, 208, 0" for "#ffd000". */
function rgbChannels(hex: string): string {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(", ");
}
