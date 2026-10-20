import type { OutlineNode } from "./outline";
import type { PDFDocumentProxy } from "./pdf-engine";

/** A named destination, an explicit one as an array, or none. Links and outline entries both carry one. */
export type PdfDestination = string | unknown[] | null;

/** A page, and how far down it a destination points as a fraction of the page's height. */
export interface PageTarget { page: number; offset: number }

export interface PdfOutline {
  nodes: OutlineNode[];
  /** Each node's target, by node ID. */
  targets: (PageTarget | null)[];
}

interface PdfOutlineItem { title: string; dest: PdfDestination; items: PdfOutlineItem[] }

function isPdfReference(value: unknown): value is { num: number; gen: number } {
  return typeof value === "object" && value !== null && "num" in value && "gen" in value
    && typeof value.num === "number" && typeof value.gen === "number";
}

/** Resolves a destination to a page. `pageHeight` gives a page's height in PDF points by zero-based index, when known. */
export async function resolveDestination(pdf: PDFDocumentProxy, dest: PdfDestination, pageHeight: (index: number) => number | undefined): Promise<PageTarget | null> {
  const explicit: unknown = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
  if (!Array.isArray(explicit)) return null;
  const destination: unknown[] = explicit;
  const ref = destination[0];
  if (typeof ref !== "number" && !isPdfReference(ref)) return null;
  const index = typeof ref === "number" ? ref : await pdf.getPageIndex(ref).catch(() => null);
  if (index === null) return null;
  const height = pageHeight(index);
  // XYZ destinations carry a top coordinate in PDF space, measured from the bottom of the page.
  const mode = destination[1];
  const top = typeof mode === "object" && mode !== null && "name" in mode && mode.name === "XYZ" && typeof destination[3] === "number" ? destination[3] : null;
  return { page: index + 1, offset: top !== null && height !== undefined ? Math.max(0, Math.min(1, (height - top) / height)) : 0 };
}

/** The PDF's table of contents as a flat list of nodes, with each entry's target. Null when the PDF has none. */
export async function loadOutline(pdf: PDFDocumentProxy, resolve: (dest: PdfDestination) => Promise<PageTarget | null>): Promise<PdfOutline | null> {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline?.length) return null;
  const nodes: OutlineNode[] = [];
  const pending: Promise<PageTarget | null>[] = [];
  const walk = (items: readonly PdfOutlineItem[], depth: number, parent: number | null) => {
    for (const item of items) {
      const node: OutlineNode = { id: nodes.length, title: item.title.trim() || "Untitled", depth, parent, children: [] };
      nodes.push(node);
      pending.push(resolve(item.dest).catch(() => null));
      if (parent !== null) nodes[parent]!.children.push(node.id);
      if (item.items.length) walk(item.items, depth + 1, node.id);
    }
  };
  walk(outline, 0, null);
  const targets = await Promise.all(pending);
  targets.forEach((target, id) => { nodes[id]!.page = target?.page; });
  return { nodes, targets };
}

/** The section being read: the last one that starts on or before the current page. */
export function currentSection(nodes: OutlineNode[], page: number): number | null {
  let current: number | null = null;
  for (const node of nodes) {
    if (node.page !== undefined && node.page <= page && (current === null || node.page >= nodes[current]!.page!)) current = node.id;
  }
  return current;
}
