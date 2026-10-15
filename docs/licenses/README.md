# Bundled dependency licenses

Reading Desk's own code uses the [MIT license](../../LICENSE). Bundled dependencies retain their licenses:

- PDF.js: [Apache 2.0](pdfjs.txt), with its [upstream copyright notice](pdfjs-notice.txt).
- PDF.js image and color decoders, bundled as WebAssembly:
  - JPEG 2000: PDF.js's [OpenJPEG wrapper](pdfjs-wasm/pdfjs-openjpeg.txt) and [OpenJPEG](pdfjs-wasm/openjpeg.txt), both BSD 2-Clause.
  - JBIG2 and CCITT: PDF.js's [JBIG2 wrapper](pdfjs-wasm/pdfjs-jbig2.txt) (Apache 2.0) and [PDFium's JBIG2 decoder](pdfjs-wasm/jbig2.txt) (BSD 3-Clause and Apache 2.0).
  - ICC color profiles: PDF.js's [qcms wrapper](pdfjs-wasm/pdfjs-qcms.txt) and [qcms](pdfjs-wasm/qcms.txt), both MIT.
- Svelte: [MIT license and copyright notice](svelte.txt).
- Svelte runtime dependencies: [clsx](clsx.txt) and [esm-env](esm-env.txt), both MIT.

The build embeds these texts and Reading Desk's license in a comment at the start of `main.js`. It also preserves dependency license comments recognized by esbuild. This keeps the notices with the installed plugin, since Obsidian downloads `main.js`, `manifest.json`, and `styles.css`.

When updating dependencies, compare these copies with the installed packages. The PDF.js notice comes from the header of `node_modules/pdfjs-dist/build/pdf.mjs`; its license comes from `node_modules/pdfjs-dist/LICENSE`. Svelte's license comes from `node_modules/svelte/LICENSE.md`; resolve `clsx` and `esm-env` from Svelte's package to find their upstream `license` and `LICENSE` files. The decoder licenses come from `node_modules/pdfjs-dist/wasm/LICENSE_*`. The OpenJPEG copy omits the file's opening `/*` and closing `*/` lines, because a comment terminator would end the `main.js` banner; the build fails if any license copy contains `*/`. Review any additional bundled dependencies and their notice requirements before releasing. PDF.js's font, CMap, and CMYK ICC profile directories are not currently bundled by this build.
