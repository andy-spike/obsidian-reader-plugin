import { App, Modal } from "obsidian";
import { mount } from "svelte";
import PdfAnnotations from "./components/PdfAnnotations.svelte";
import type { PdfCommentMarker, PdfFormMarker } from "./pdf-annotations";
import type { PDFPageProxy } from "./pdf-engine";
import { findPageUnderlines, linkLineBoxes, PdfBox } from "./pdf-link-lines";
import type { PdfDestination } from "./pdf-outline";

/** The fields Reader uses from PDF.js's annotation data. */
interface PdfAnnotation {
  id: string;
  subtype: string;
  rect: [number, number, number, number];
  quadPoints?: Float32Array;
  url?: string;
  dest?: PdfDestination;
  overlaidText?: string;
  contentsObj?: { str: string };
  titleObj?: { str: string };
}

/** A box in percentages of the page, so it follows zoom without being redrawn. */
interface PageBox { left: number; top: number; width: number; height: number }

export interface PageAnnotationActions {
  /** The page has form fields, which Reader marks but cannot fill in. */
  foundForms(): void;
  /** Called when a link is pressed, so the press doesn't also start a selection or open a highlight's popup. */
  dismissPopup(): void;
  followDestination(dest: PdfDestination): void;
  openComment(comment: PdfCommentMarker): void;
  openForm(): void;
}

/**
 * Adds a page's links, and markers for its comments and form fields, over the drawn page. Boxes are percentages of the page,
 * so they follow zoom without being redrawn. Returns the mounted markers to unmount when the page is released, or null when
 * the page has none or the render went stale.
 */
export async function renderPageAnnotations(pageEl: HTMLElement, page: PDFPageProxy, stale: () => boolean, actions: PageAnnotationActions): Promise<ReturnType<typeof mount> | null> {
  const annotations = await page.getAnnotations() as PdfAnnotation[];
  // Underlines locate the words of links that wrap across lines. Reading them parses the page again, so only
  // pages with a wrapped link pay for it; PDF.js puts a line break in the text it finds under such a link.
  const hasWrappedLink = annotations.some(annotation => annotation.subtype === "Link" && annotation.overlaidText?.includes("\n"));
  const underlines = hasWrappedLink ? await findPageUnderlines(page).catch(() => []) : [];
  if (stale()) return null;
  const viewport = page.getViewport({ scale: 1 });
  const toPageBox = ([x1, y1, x2, y2]: PdfBox): PageBox => {
    const [left, top] = viewport.convertToViewportPoint(x1, y1) as [number, number];
    const [right, bottom] = viewport.convertToViewportPoint(x2, y2) as [number, number];
    return {
      left: Math.min(left, right) / viewport.width * 100,
      top: Math.min(top, bottom) / viewport.height * 100,
      width: Math.abs(right - left) / viewport.width * 100,
      height: Math.abs(bottom - top) / viewport.height * 100,
    };
  };
  const layer = pageEl.createDiv({ cls: "reader-link-layer" });
  const comments: PdfCommentMarker[] = [];
  const forms: PdfFormMarker[] = [];
  for (const annotation of annotations) {
    const rect = annotation.rect;
    if (rect.length !== 4 || !rect.every(value => typeof value === "number" && Number.isFinite(value))) continue;
    const box = toPageBox(rect);
    if (annotation.subtype === "Widget") {
      actions.foundForms();
      forms.push({ id: annotation.id, ...box });
    } else if (annotation.subtype !== "Popup" && annotation.subtype !== "Link" && annotation.contentsObj?.str.trim()) {
      comments.push({ id: annotation.id, left: Math.max(0, Math.min(96, box.left)), top: Math.max(0, Math.min(96, box.top)), text: annotation.contentsObj.str, author: annotation.titleObj?.str ?? "" });
    }
    if (annotation.subtype === "Link") {
      const lineBoxes = linkLineBoxes(rect, annotation.quadPoints, underlines)?.map(toPageBox) ?? [box];
      addLink(layer, annotation, lineBoxes, actions);
    }
  }
  if (!comments.length && !forms.length) return null;
  return mount(PdfAnnotations, { target: pageEl, props: {
    comments, forms,
    open: (comment: PdfCommentMarker) => actions.openComment(comment),
    openForm: () => actions.openForm(),
  } });
}

/**
 * Adds one link over its lines. The link element spans all of them but only its per-line parts take the pointer,
 * so the words around a wrapped link stay selectable and hovering any line tints every line of the link.
 */
function addLink(layer: HTMLElement, annotation: PdfAnnotation, lineBoxes: PageBox[], actions: PageAnnotationActions): void {
  // PDF.js supplies validated URLs. Never fall back to its unsafeUrl or execute PDF actions.
  const { url, dest } = annotation;
  if (!url && !dest) return;
  const left = Math.min(...lineBoxes.map(line => line.left));
  const top = Math.min(...lineBoxes.map(line => line.top));
  const width = Math.max(...lineBoxes.map(line => line.left + line.width)) - left;
  const height = Math.max(...lineBoxes.map(line => line.top + line.height)) - top;
  // A link without area can't be pressed, and its lines couldn't be placed within it.
  if (!(width > 0 && height > 0)) return;
  const link = layer.createEl("a", { attr: {
    href: url ?? "#",
    "aria-label": annotation.overlaidText || url || "Go to linked passage",
  } });
  link.draggable = false;
  link.setCssProps({ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
  for (const line of lineBoxes) {
    link.createSpan({ cls: "reader-link-line" }).setCssProps({
      left: `${(line.left - left) / width * 100}%`,
      top: `${(line.top - top) / height * 100}%`,
      width: `${line.width / width * 100}%`,
      height: `${line.height / height * 100}%`,
    });
  }
  if (url) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    link.dataset.pdfDestination = "true";
  }
  // Leave text-selection and highlight popups out of link activation.
  link.addEventListener("pointerdown", event => {
    event.stopPropagation();
    actions.dismissPopup();
  });
  link.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (url) layer.ownerDocument.defaultView?.open(url, "_blank", "noopener,noreferrer");
    else if (dest) actions.followDestination(dest);
  });
}

/** Shows a comment someone left in the PDF itself. */
export function showPdfComment(app: App, comment: PdfCommentMarker): void {
  const modal = new Modal(app);
  modal.setTitle(comment.author ? `PDF comment by ${comment.author}` : "PDF comment");
  modal.contentEl.createDiv({ cls: "reader-pdf-comment-text", text: comment.text });
  modal.open();
}
