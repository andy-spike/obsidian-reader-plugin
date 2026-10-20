import { getDocument, normalizeUnicode, PDFWorker } from "pdfjs-dist";
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs";
import openJpegWasm from "pdfjs-dist/wasm/openjpeg.wasm";
import jbig2Wasm from "pdfjs-dist/wasm/jbig2.wasm";
import qcmsWasm from "pdfjs-dist/wasm/qcms_bg.wasm";
export { TextLayer, PasswordResponses } from "pdfjs-dist";
export type { PDFDocumentProxy, PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "pdfjs-dist";
export { RenderingCancelledException } from "pdfjs-dist";

/** Replaces ligatures and compatibility characters with readable text, matching PDF.js's own copy behavior. */
export function readableText(text: string): string {
  return normalizeUnicode(text) as string;
}

// PDF.js asks for its decoders by URL. Obsidian installs only main.js, manifest.json, and styles.css,
// so the worker answers requests under this prefix from the copies bundled into main.js.
const BUNDLED_FILES_URL = "reading-desk-bundled:/";
// Without these, JPEG 2000, JBIG2, and CCITT images render blank and ICC colors are wrong, with no error.
const bundledWasmFiles: Record<string, string> = {
  "openjpeg.wasm": openJpegWasm,
  "jbig2.wasm": jbig2Wasm,
  "qcms_bg.wasm": qcmsWasm,
};

/**
 * Runs inside the PDF.js worker, before PDF.js. It must not use anything outside its own body,
 * because it is converted to source text. Each bundled file becomes a local blob URL, and
 * requests for `prefix` + file name are redirected there. PDF.js loads image decoders with
 * fetch, and the color-profile decoder with a synchronous XMLHttpRequest, so both redirect.
 */
function serveBundledFiles(prefix: string, base64ByName: Record<string, string>): void {
  const blobUrlByName = new Map<string, string>();
  for (const [name, base64] of Object.entries(base64ByName)) {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    blobUrlByName.set(name, URL.createObjectURL(new Blob([bytes], { type: "application/wasm" })));
  }
  const redirect = (url: string): string => (url.startsWith(prefix) && blobUrlByName.get(url.slice(prefix.length))) || url;

  const nativeFetch = self.fetch.bind(self);
  self.fetch = (input, init) => nativeFetch(typeof input === "string" ? redirect(input) : input, init);

  class RedirectingRequest extends XMLHttpRequest {
    override open(method: string, url: string | URL, async = true, username?: string | null, password?: string | null): void {
      super.open(method, redirect(String(url)), async, username, password);
    }
  }
  self.XMLHttpRequest = RedirectingRequest;
}

// Ship the matching worker in the plugin bundle. No CDN or private Obsidian PDF APIs.
let workerPort: Worker | null = null;
let sharedWorker: PDFWorker | null = null;

export function loadPdf(data: ArrayBuffer) {
  if (!sharedWorker) {
    const preamble = `(${serveBundledFiles.toString()})(${JSON.stringify(BUNDLED_FILES_URL)}, ${JSON.stringify(bundledWasmFiles)});\n`;
    const url = URL.createObjectURL(new Blob([preamble, workerSource], { type: "text/javascript" }));
    workerPort = new Worker(url, { type: "module" });
    sharedWorker = PDFWorker.create({ port: workerPort });
    URL.revokeObjectURL(url);
  }
  // Worker-side fetching is required: PDF.js disables color-profile support without it.
  // Explicit ownership keeps destroying one document, including a cancelled password prompt,
  // from destroying the worker while another Reader is opening a PDF.
  return getDocument({ data: new Uint8Array(data), worker: sharedWorker, wasmUrl: BUNDLED_FILES_URL, useWorkerFetch: true });
}
export function stopPdfWorker(): void {
  sharedWorker?.destroy();
  sharedWorker = null;
  workerPort?.terminate();
  workerPort = null;
}
