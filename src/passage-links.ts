import { MarkdownView, Workspace } from "obsidian";

/** The passage link under the pointer: a rendered link, or a raw Markdown link on the editor line under it. */
export function passageLinkAt(workspace: Workspace, target: Element | null): string | null {
  const rendered = target?.closest?.("a[href^='obsidian://reader-plugin?']");
  if (rendered) return rendered.getAttribute("href");
  if (!target?.closest?.(".cm-link, .cm-url")) return null;
  const view = workspace.getLeavesOfType("markdown").map(leaf => leaf.view).find((view): view is MarkdownView => view instanceof MarkdownView && view.contentEl.contains(target));
  // Obsidian's editor is CodeMirror, which finds the text position of an element on screen.
  const cm = (view?.editor as { cm?: { posAtDOM(node: Node): number } } | undefined)?.cm;
  if (!view || !cm) return null;
  const at = view.editor.offsetToPos(cm.posAtDOM(target));
  for (const match of view.editor.getLine(at.line).matchAll(/\[[^\]]*\]\((obsidian:\/\/reader-plugin\?[^)\s]+)\)/g)) {
    if (at.ch >= match.index && at.ch <= match.index + match[0].length) return match[1]!;
  }
  return null;
}
