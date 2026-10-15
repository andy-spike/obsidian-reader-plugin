import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import { builtinModules } from "node:module";
import { readFile } from "node:fs/promises";
import { deployPlugin, setupVault } from "./scripts/dev-vault.mjs";

const production = process.argv.includes("production");
// Obsidian installs only the plugin assets, so license texts must travel inside main.js.
const licenseFiles = [
  ["Reading Desk - MIT", "LICENSE"],
  ["Third-party notices: PDF.js - Apache-2.0", "docs/licenses/pdfjs-notice.txt"],
  ["PDF.js license", "docs/licenses/pdfjs.txt"],
  ["PDF.js OpenJPEG decoder - BSD-2-Clause", "docs/licenses/pdfjs-wasm/pdfjs-openjpeg.txt"],
  ["OpenJPEG - BSD-2-Clause", "docs/licenses/pdfjs-wasm/openjpeg.txt"],
  ["PDF.js JBIG2 decoder - Apache-2.0", "docs/licenses/pdfjs-wasm/pdfjs-jbig2.txt"],
  ["PDFium JBIG2 - BSD-3-Clause and Apache-2.0", "docs/licenses/pdfjs-wasm/jbig2.txt"],
  ["PDF.js qcms decoder - MIT", "docs/licenses/pdfjs-wasm/pdfjs-qcms.txt"],
  ["qcms - MIT", "docs/licenses/pdfjs-wasm/qcms.txt"],
  ["Svelte - MIT", "docs/licenses/svelte.txt"],
  ["clsx - MIT", "docs/licenses/clsx.txt"],
  ["esm-env - MIT", "docs/licenses/esm-env.txt"],
];
const licenseSections = await Promise.all(licenseFiles.map(async ([label, path]) => {
  const text = await readFile(new URL(path, import.meta.url), "utf8");
  // A comment terminator would end the banner early and corrupt main.js.
  if (text.includes("*/")) throw new Error(`${path} contains "*/"; remove the comment markers from the license copy.`);
  return `${label}\n\n${text}`;
}));
const licenseBanner = `/*!\n${licenseSections.join("\n\n----------------------------------------\n\n")}\n*/`;
if (!production) await setupVault();
const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
  format: "cjs",
  target: "es2022",
  platform: "node",
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  minify: production,
  define: { __DEV__: JSON.stringify(!production) },
  banner: { js: licenseBanner },
  legalComments: "inline",
  // PDF.js's image and color decoders travel inside main.js; src/pdf-engine.ts serves them to the worker.
  loader: { ".wasm": "base64" },
  logLevel: "info",
  // Svelte's browser build, so components mount in Obsidian's window rather than as server-rendered HTML.
  conditions: ["svelte", "browser"],
  mainFields: ["svelte", "browser", "module", "main"],
  plugins: [esbuildSvelte({ compilerOptions: { css: "injected", dev: !production } }), {
    name: "inline-pdf-worker",
    setup(build) {
      build.onLoad({ filter: /pdf\.worker\.min\.mjs$/ }, async (args) => ({
        contents: await (await import("node:fs/promises")).readFile(args.path, "utf8"),
        loader: "text",
      }));
    },
  }, {
    name: "deploy-to-dev-vault",
    setup(build) {
      build.onEnd(async (result) => {
        if (!production && result.errors.length === 0) await deployPlugin();
      });
    },
  }],
});

if (production) {
  try { await context.rebuild(); }
  finally { await context.dispose(); }
} else {
  await context.watch();
  const stop = async () => { await context.dispose(); process.exit(0); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
