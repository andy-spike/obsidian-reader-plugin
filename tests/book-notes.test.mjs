import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-book-notes-tests-"));
const obsidian = {
  name: "obsidian-stub",
  setup(build) {
    build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export class TFile { constructor(path) { this.path = path; this.basename = path.split('/').pop().replace(/\\.[^.]+$/, ''); } }
        export class MarkdownView {} export class Notice {}
        export const normalizePath = path => path;`, loader: "js",
    }));
  },
};
// Re-export the same TFile used by BookNotes so the vault adapter supplies real instances of its file type.
await build({ stdin: { contents: 'export { BookNotes } from "./src/book-notes"; export { TFile } from "obsidian";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: join(directory, "notes.mjs"), plugins: [obsidian] });
const { BookNotes, TFile } = await import(pathToFileURL(join(directory, "notes.mjs")));
after(() => rm(directory, { recursive: true, force: true }));

function fixture() {
  const file = new TFile("Book notes/Book.md");
  const oldExport = new TFile(".reader-annotations/doc-1.md");
  const files = new Map([[file.path, file], [oldExport.path, oldExport]]);
  let text = "# Book\n";
  const calls = [];
  const vault = {
    getAbstractFileByPath: path => files.get(path), getMarkdownFiles: () => [],
    process: async (_, change) => { calls.push("write note"); text = change(text); },
    read: async () => { calls.push("read back"); return text; },
  };
  const app = { vault, fileManager: { trashFile: async file => { calls.push("retire export"); files.delete(file.path); } } };
  const store = { folder: ".reader-annotations", save: async record => { calls.push("save record"); assert.equal(record.annotations[0].comment, ""); } };
  const record = { documentId: "doc-1", sourcePath: "Book.pdf", notePath: file.path, annotations: [{ id: "a1", page: 1, position: { start: 0 }, quote: { exact: "A quote" }, comment: "An old comment" }] };
  const notes = new BookNotes(app, store, () => ({}));
  return { notes, record, vault, store, calls, text: () => text, oldExport, files };
}

test("migration confirms the written note before clearing comments, retiring the export, and saving JSON", async () => {
  const f = fixture();
  await f.notes.sync(f.record);
  assert.deepEqual(f.calls, ["write note", "read back", "retire export", "save record"]);
  assert.match(f.text(), /An old comment/);
  assert.equal(f.record.annotations[0].comment, "");
  assert.equal(f.record.exportRetired, true);
});

test("failed note writes or read-back leave legacy comments and their export untouched", async () => {
  for (const stage of ["process", "read"]) {
    const f = fixture(); f.vault[stage] = async () => { throw new Error("disk failed"); };
    await assert.rejects(f.notes.sync(f.record), /disk failed/);
    assert.equal(f.record.annotations[0].comment, "An old comment");
    assert.equal(f.record.exportRetired, undefined);
    assert.equal(f.files.has(f.oldExport.path), true);
    assert.equal(f.calls.includes("save record"), false);
  }
});

test("a failed JSON save can be retried without duplicating migrated comments", async () => {
  const f = fixture(); const save = f.store.save;
  f.store.save = async () => { throw new Error("JSON failed"); };
  await assert.rejects(f.notes.sync(f.record), /JSON failed/);
  f.store.save = save;
  // A restart could reload the legacy comment from the JSON file that failed to save.
  f.record.annotations[0].comment = "An old comment";
  await f.notes.sync(f.record);
  assert.equal(f.text().split("An old comment").length - 1, 1);
});
