import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { deployPlugin, setupVault } from "./scripts/dev-vault.mjs";

const production = process.argv.includes("production");
await setupVault();
const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
  format: "cjs",
  target: "es2018",
  platform: "node",
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "info",
  plugins: [{
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
