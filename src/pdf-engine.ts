import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs";
export { TextLayer } from "pdfjs-dist";
export type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

// Ship the matching worker in the plugin bundle. No CDN or private Obsidian PDF APIs.
export function loadPdf(data: ArrayBuffer) {
  if (!GlobalWorkerOptions.workerPort) {
    const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    GlobalWorkerOptions.workerPort = new Worker(url, { type: "module" });
    URL.revokeObjectURL(url);
  }
  return getDocument({ data: new Uint8Array(data) });
}
export function stopPdfWorker(): void {
  GlobalWorkerOptions.workerPort?.terminate();
  GlobalWorkerOptions.workerPort = null;
}
