import type { Annotation, Rect } from "./annotations";
import { readableText } from "./pdf-engine";

/** A selected stretch of text on one page: everything a highlight stores except its ID, color, and dates. */
export type Passage = Pick<Annotation, "page" | "quote" | "position" | "rects">;

/** A drawn page with its PDF.js text layer. */
export interface SelectablePage {
  number: number;
  el: HTMLElement;
  textLayer: HTMLElement;
}

/** Converts the DOM selection into one passage per page it touches, in page order. */
export function selectedPassages(doc: Document, pages: SelectablePage[]): Passage[] {
  const selection = doc.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  const passages: Passage[] = [];
  for (const page of [...pages].sort((a, b) => a.number - b.number)) {
    const layer = page.textLayer;
    if (!range.intersectsNode(layer)) continue;
    const part = doc.createRange();
    part.selectNodeContents(layer);
    if (layer.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
    if (layer.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
    const raw = part.toString();
    if (!raw.trim()) continue;
    // Offsets count text only. The quote keeps PDF.js line breaks so words on adjacent lines stay apart.
    const fragment = part.cloneContents();
    fragment.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    // The raw text layer can contain ligatures such as "ﬁ"; quotes store the readable form.
    const exact = readableText((fragment.textContent ?? raw).trim());
    const before = doc.createRange();
    before.setStart(layer, 0);
    before.setEnd(part.startContainer, part.startOffset);
    const start = before.toString().length, end = start + raw.length;
    const full = layer.textContent ?? "";
    const rects = lineRects(part, layer, page.el.getBoundingClientRect());
    if (rects.length) passages.push({ page: page.number, quote: { exact, prefix: readableText(full.slice(Math.max(0, start - 48), start)), suffix: readableText(full.slice(end, end + 48)) }, position: { start, end }, rects });
  }
  return passages;
}

interface LineBox { left: number; top: number; right: number; bottom: number }

/** A piece belongs to a line when their vertical centers align and the horizontal gap is under one and a half line heights. */
function joinsLine(line: LineBox, piece: DOMRect): boolean {
  const centersAlign = Math.abs((line.top + line.bottom) / 2 - (piece.top + piece.bottom) / 2) < Math.min(line.bottom - line.top, piece.height) * 0.5;
  const maxGap = piece.height * 1.5;
  return centersAlign && piece.left - line.right < maxGap && line.left - piece.right < maxGap;
}

/** Measures selected text node by node, then joins pieces on the same line into one clean bar. */
function lineRects(range: Range, layer: HTMLElement, page: DOMRect): Rect[] {
  const doc = layer.ownerDocument;
  const pieces: DOMRect[] = [];
  const walker = doc.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node) || !node.textContent?.trim()) continue;
    const part = doc.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node, range.startOffset);
    if (node === range.endContainer) part.setEnd(node, range.endOffset);
    if (!part.collapsed) pieces.push(...Array.from(part.getClientRects()).filter(r => r.width > 0.5 && r.height > 0.5));
  }
  pieces.sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: LineBox[] = [];
  for (const r of pieces) {
    const line = lines.find(candidate => joinsLine(candidate, r));
    if (line) Object.assign(line, { left: Math.min(line.left, r.left), top: Math.min(line.top, r.top), right: Math.max(line.right, r.right), bottom: Math.max(line.bottom, r.bottom) });
    else lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return lines.map(l => {
    const x = clamp((l.left - page.left) / page.width), y = clamp((l.top - page.top) / page.height);
    return { x, y, width: clamp((l.right - page.left) / page.width) - x, height: clamp((l.bottom - page.top) / page.height) - y };
  }).filter(r => r.width > 0 && r.height > 0);
}
