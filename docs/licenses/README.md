# Bundled dependency licenses

Reading Desk's own code uses the [MIT license](../../LICENSE). Bundled dependencies retain their licenses:

- PDF.js: [Apache 2.0](pdfjs.txt), with its [upstream copyright notice](pdfjs-notice.txt).
- Svelte: [MIT license and copyright notice](svelte.txt).
- Svelte runtime dependencies: [clsx](clsx.txt) and [esm-env](esm-env.txt), both MIT.

The build embeds these texts and Reading Desk's license in a comment at the start of `main.js`. It also preserves dependency license comments recognized by esbuild. This keeps the notices with the installed plugin, since Obsidian downloads `main.js`, `manifest.json`, and `styles.css`.

When updating dependencies, compare these copies with the installed packages. The PDF.js notice comes from the header of `node_modules/pdfjs-dist/build/pdf.mjs`; its license comes from `node_modules/pdfjs-dist/LICENSE`. Svelte's license comes from `node_modules/svelte/LICENSE.md`; resolve `clsx` and `esm-env` from Svelte's package to find their upstream `license` and `LICENSE` files. Review any additional bundled dependencies and their notice requirements before releasing. PDF.js's separate font, CMap, ICC, and WebAssembly asset directories are not currently bundled by this build.
