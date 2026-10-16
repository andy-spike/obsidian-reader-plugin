import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-page-colors-tests-"));
await build({ entryPoints: ["src/page-colors.ts"], bundle: true, platform: "node", format: "esm", outfile: join(directory, "page-colors.mjs") });
const { showsDarkPages, toggledChoice, loadPdfPageColors, renamePdfPageColors, forgetPdfPageColors } = await import(pathToFileURL(join(directory, "page-colors.mjs")));
after(() => rm(directory, { recursive: true, force: true }));

test("the general setting decides when a PDF has no choice of its own", () => {
  assert.equal(showsDarkPages("original", undefined, true), false);
  assert.equal(showsDarkPages("inverted", undefined, false), true);
  assert.equal(showsDarkPages("follow", undefined, true), true);
  assert.equal(showsDarkPages("follow", undefined, false), false);
});

test("a PDF's own choice wins over the general setting", () => {
  assert.equal(showsDarkPages("follow", "original", true), false);
  assert.equal(showsDarkPages("original", "inverted", false), true);
  assert.equal(showsDarkPages("original", "follow", true), true);
});

test("toggling flips what the PDF shows, and toggling again returns it to the general setting", () => {
  assert.equal(toggledChoice("follow", undefined, true), "original");
  assert.equal(toggledChoice("follow", undefined, false), "inverted");
  assert.equal(toggledChoice("original", undefined, true), "inverted");
  assert.equal(toggledChoice("follow", "original", true), undefined);
});

test("saved choices keep only valid entries", () => {
  assert.deepEqual(loadPdfPageColors({ "Books/A.pdf": "original", "Books/B.pdf": "sepia", "": "inverted", "Books/C.pdf": 3 }), { "Books/A.pdf": "original" });
  assert.deepEqual(loadPdfPageColors(null), {});
  assert.deepEqual(loadPdfPageColors(["original"]), {});
});

test("choices follow renamed PDFs and folders, and leave similar names alone", () => {
  const choices = { "Books/A.pdf": "original", "Books/Old/B.pdf": "inverted", "Books/Older/C.pdf": "follow" };
  assert.equal(renamePdfPageColors(choices, "Books/A.pdf", "Books/A2.pdf"), true);
  assert.equal(renamePdfPageColors(choices, "Books/Old", "Books/New"), true);
  assert.deepEqual(choices, { "Books/A2.pdf": "original", "Books/New/B.pdf": "inverted", "Books/Older/C.pdf": "follow" });
  assert.equal(renamePdfPageColors(choices, "Books/Missing.pdf", "Books/X.pdf"), false);
});

test("deleting a PDF or its folder forgets its choice", () => {
  const choices = { "Books/A.pdf": "original", "Books/Old/B.pdf": "inverted", "Books/Older/C.pdf": "follow" };
  assert.equal(forgetPdfPageColors(choices, "Books/Old"), true);
  assert.equal(forgetPdfPageColors(choices, "Books/A.pdf"), true);
  assert.deepEqual(choices, { "Books/Older/C.pdf": "follow" });
  assert.equal(forgetPdfPageColors(choices, "Books/Nothing.pdf"), false);
});
