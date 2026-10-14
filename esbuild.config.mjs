import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import { builtinModules } from "node:module";
import { deployPlugin, setupVault } from "./scripts/dev-vault.mjs";

const production = process.argv.includes("production");
await setupVault();
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
        if (result.errors.length === 0) await deployPlugin();
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
