import { setIcon, setTooltip } from "obsidian";
import type { Attachment } from "svelte/attachments";

/** Svelte attachments that hand elements to Obsidian's own icon and tooltip helpers, so components look and behave like native UI. */
export function icon(name: string): Attachment<HTMLElement> {
  return node => setIcon(node, name);
}

export function tooltip(label: string, placement: "top" | "bottom" = "top"): Attachment<HTMLElement> {
  return node => setTooltip(node, label, { placement });
}
