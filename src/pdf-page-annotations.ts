import { App, Modal } from "obsidian";
import { mount } from "svelte";
import PdfAnnotations from "./components/PdfAnnotations.svelte";
import type { PdfCommentMarker, PdfFormMarker } from "./pdf-annotations";
import type { PDFPageProxy } from "./pdf-engine";
import type { PdfDestination } from "./pdf-outline";

/** The fields Reader uses from PDF.js's annotation data. */
interface PdfAnnotation {
  id: string;
  subtype: string;
  rect: [number, number, number, number];
  url?: string;
  dest?: PdfDestination;
  overlaidText?: string;
  contentsObj?: { str: string };
  titleObj?: { str: string };
}

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
  if (stale()) return null;
  const viewport = page.getViewport({ scale: 1 });
  const layer = pageEl.createDiv({ cls: "reader-link-layer" });
  const comments: PdfCommentMarker[] = [];
  const forms: PdfFormMarker[] = [];
  for (const annotation of annotations) {
    const [x1, y1, x2, y2] = annotation.rect;
    if (![x1, y1, x2, y2].every(value => typeof value === "number" && Number.isFinite(value))) continue;
    const [left, top] = viewport.convertToViewportPoint(x1, y1) as [number, number];
    const [right, bottom] = viewport.convertToViewportPoint(x2, y2) as [number, number];
    const box = {
      left: Math.min(left, right) / viewport.width * 100,
      top: Math.min(top, bottom) / viewport.height * 100,
      width: Math.abs(right - left) / viewport.width * 100,
      height: Math.abs(bottom - top) / viewport.height * 100,
    };
    if (annotation.subtype === "Widget") {
      actions.foundForms();
      forms.push({ id: annotation.id, ...box });
    } else if (annotation.subtype !== "Popup" && annotation.subtype !== "Link" && annotation.contentsObj?.str.trim()) {
      comments.push({ id: annotation.id, left: Math.max(0, Math.min(96, box.left)), top: Math.max(0, Math.min(96, box.top)), text: annotation.contentsObj.str, author: annotation.titleObj?.str ?? "" });
    }
    if (annotation.subtype === "Link") addLink(layer, annotation, box, actions);
  }
  if (!comments.length && !forms.length) return null;
  return mount(PdfAnnotations, { target: pageEl, props: {
    comments, forms,
    open: (comment: PdfCommentMarker) => actions.openComment(comment),
    openForm: () => actions.openForm(),
  } });
}

function addLink(layer: HTMLElement, annotation: PdfAnnotation, box: { left: number; top: number; width: number; height: number }, actions: PageAnnotationActions): void {
  // PDF.js supplies validated URLs. Never fall back to its unsafeUrl or execute PDF actions.
  const { url, dest } = annotation;
  if (!url && !dest) return;
  const link = layer.createEl("a", { attr: {
    href: url ?? "#",
    "aria-label": annotation.overlaidText || url || "Go to linked passage",
  } });
  link.draggable = false;
  link.setCssProps({ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` });
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
