declare const __DEV__: boolean;

declare module "pdfjs-dist/web/pdf_viewer.mjs" {
  export { EventBus, FindState, PDFFindController, PDFLinkService } from "pdfjs-dist/types/web/pdf_viewer.component";
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  const source: string;
  export default source;
}

// Bundled as base64 text by esbuild; see the `.wasm` loader in esbuild.config.mjs.
declare module "pdfjs-dist/wasm/*.wasm" {
  const base64: string;
  export default base64;
}
