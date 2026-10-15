import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs";
import openJpegWasm from "pdfjs-dist/wasm/openjpeg.wasm";
import jbig2Wasm from "pdfjs-dist/wasm/jbig2.wasm";
import qcmsWasm from "pdfjs-dist/wasm/qcms_bg.wasm";
export { TextLayer } from "pdfjs-dist";
export type { PDFDocumentProxy, PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "pdfjs-dist";
export { RenderingCancelledException } from "pdfjs-dist";

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
 * because it is converted to source text. PDF.js loads image decoders with fetch, and the
 * color-profile decoder with a synchronous XMLHttpRequest, so both are answered here.
 */
function serveBundledFiles(prefix: string, base64ByName: Record<string, string>): void {
  const bytesFor = (url: string): Uint8Array<ArrayBuffer> | null => {
    if (!url.startsWith(prefix)) return null;
    const base64 = base64ByName[url.slice(prefix.length)];
    if (base64 === undefined) return null;
    return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  };

  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const bytes = typeof input === "string" ? bytesFor(input) : null;
    if (!bytes) return nativeFetch(input, init);
    return Promise.resolve(new Response(bytes, { headers: { "Content-Type": "application/wasm" } }));
  };

  const bundledResponses = new WeakMap<XMLHttpRequest, ArrayBuffer>();
  const requestPrototype = XMLHttpRequest.prototype;
  const nativeOpen = requestPrototype.open;
  const nativeSend = requestPrototype.send;
  const nativeResponse = Object.getOwnPropertyDescriptor(requestPrototype, "response")?.get;
  requestPrototype.open = function (this: XMLHttpRequest, ...args: [string, string | URL, ...unknown[]]) {
    const bytes = bytesFor(String(args[1]));
    if (bytes) bundledResponses.set(this, bytes.buffer);
    else {
      bundledResponses.delete(this);
      Reflect.apply(nativeOpen, this, args);
    }
  };
  requestPrototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    if (!bundledResponses.has(this)) nativeSend.call(this, body);
  };
  Object.defineProperty(requestPrototype, "response", {
    configurable: true,
    get(this: XMLHttpRequest): unknown {
      return bundledResponses.get(this) ?? nativeResponse?.call(this);
    },
  });
}

// Ship the matching worker in the plugin bundle. No CDN or private Obsidian PDF APIs.
export function loadPdf(data: ArrayBuffer) {
  if (!GlobalWorkerOptions.workerPort) {
    const preamble = `(${serveBundledFiles.toString()})(${JSON.stringify(BUNDLED_FILES_URL)}, ${JSON.stringify(bundledWasmFiles)});\n`;
    const url = URL.createObjectURL(new Blob([preamble, workerSource], { type: "text/javascript" }));
    GlobalWorkerOptions.workerPort = new Worker(url, { type: "module" });
    URL.revokeObjectURL(url);
  }
  // Worker-side fetching is required: PDF.js disables color-profile support without it.
  return getDocument({ data: new Uint8Array(data), wasmUrl: BUNDLED_FILES_URL, useWorkerFetch: true });
}
export function stopPdfWorker(): void {
  GlobalWorkerOptions.workerPort?.terminate();
  GlobalWorkerOptions.workerPort = null;
}
