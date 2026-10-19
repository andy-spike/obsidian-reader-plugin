import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-quote-notes-tests-"));
const obsidian = {
  name: "obsidian-stub",
  setup(build) {
    build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export class TFile {
          constructor(path) { this.path = path; }
          get parent() { return { path: this.path.split('/').slice(0, -1).join('/') }; }
        }
        export const normalizePath = path => path;`, loader: "js",
    }));
  },
};
await build({ stdin: { contents: 'export { QuoteNotes } from "./src/quote-notes"; export { quoteNoteText, quoteNoteComment } from "./src/quote-note"; export { TFile } from "obsidian";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: join(directory, "quote-notes.mjs"), plugins: [obsidian] });
const { QuoteNotes, quoteNoteText, quoteNoteComment, TFile } = await import(pathToFileURL(join(directory, "quote-notes.mjs")));
after(() => rm(directory, { recursive: true, force: true }));

/** A vault in memory. Obsidian's property index starts empty, as for notes it hasn't read yet. */
function fixture() {
  const texts = new Map();
  const files = new Map();
  const trashed = [];
  const add = (path, text) => { const file = new TFile(path); files.set(path, file); texts.set(path, text); return file; };
  const vault = {
    getFileByPath: path => files.get(path) ?? null,
    getAbstractFileByPath: path => files.get(path) ?? null,
    getMarkdownFiles: () => [...files.values()],
    createFolder: async () => {},
    create: async (path, text) => add(path, text),
    read: async file => texts.get(file.path),
    cachedRead: async file => texts.get(file.path),
    process: async (file, change) => { texts.set(file.path, change(texts.get(file.path))); },
  };
  const app = {
    vault,
    workspace: { layoutReady: true },
    metadataCache: { getFileCache: () => null },
    fileManager: { trashFile: async file => { trashed.push(file.path); files.delete(file.path); texts.delete(file.path); } },
  };
  return { quotes: new QuoteNotes(app), files, texts, trashed, add };
}

const highlight = (id, quote = `Quote ${id}`) => ({ id, page: 3, position: { start: 0 }, quote: { exact: quote }, comment: "" });
const place = { folder: "Book notes/Book", source: "[[Book.pdf]]" };

test("each highlight gets a quote note, and its link path is returned for the book note", async () => {
  const f = fixture();
  const record = { documentId: "doc-1", annotations: [highlight("a1"), highlight("a2", "Same start (2)")] };
  const links = await f.quotes.sync(record, place, false);
  assert.deepEqual([...links], [["a1", "Book notes/Book/Quote a1"], ["a2", "Book notes/Book/Same start (2)"]]);
  assert.match(f.texts.get("Book notes/Book/Quote a1.md"), /annotation: a1\n[\s\S]*> Quote a1\n$/);
  assert.equal(f.quotes.folderOf("doc-1"), "Book notes/Book");
  // Another update creates nothing new.
  await f.quotes.sync(record, place, false);
  assert.equal(f.files.size, 2);
});

test("quotes with the same name get part of their highlight ID, and existing quote notes are used again", async () => {
  const f = fixture();
  f.add("Book notes/Book/Quote a1.md", "Someone else's note");
  f.add("Book notes/Book/Shared.md", quoteNoteText({ documentId: "doc-1", annotationId: "a2", page: 3, quote: "Shared", source: "" }, "Kept."));
  const record = { documentId: "doc-1", annotations: [highlight("a1"), highlight("a2", "Shared")] };
  const links = await f.quotes.sync(record, place, false);
  assert.equal(links.get("a1"), "Book notes/Book/Quote a1 (a1)");
  assert.equal(links.get("a2"), "Book notes/Book/Shared");
  assert.equal(f.texts.get("Book notes/Book/Quote a1.md"), "Someone else's note");
  assert.equal(f.quotes.comment("a2"), "Kept.");
});

test("a quote note is found by ID after it was renamed", async () => {
  const f = fixture();
  const record = { documentId: "doc-1", annotations: [highlight("a1")] };
  await f.quotes.sync(record, place, false);
  const file = f.files.get("Book notes/Book/Quote a1.md");
  f.files.delete(file.path); f.texts.set("Elsewhere/Renamed.md", f.texts.get(file.path)); f.texts.delete(file.path);
  file.path = "Elsewhere/Renamed.md"; f.files.set(file.path, file);
  assert.deepEqual([...await f.quotes.sync(record, place, false)], [["a1", "Elsewhere/Renamed"]]);
  assert.equal(f.quotes.folderOf("doc-1"), "Elsewhere");
});

test("comments are written below the quote and read back", async () => {
  const f = fixture();
  const record = { documentId: "doc-1", annotations: [highlight("a1")] };
  await f.quotes.sync(record, place, false);
  const seen = [];
  f.quotes.subscribe(documentId => seen.push(documentId));
  await f.quotes.write("a1", "My thought.");
  assert.equal(f.quotes.comment("a1"), "My thought.");
  assert.equal(quoteNoteComment(f.texts.get("Book notes/Book/Quote a1.md")), "My thought.");
  assert.deepEqual(seen, ["doc-1"]);
  // Edits made in the note itself arrive through Obsidian's index.
  const file = f.files.get("Book notes/Book/Quote a1.md");
  f.quotes.changed(file, f.texts.get(file.path).replace("My thought.", "Edited in the note."));
  assert.equal(f.quotes.comment("a1"), "Edited in the note.");
});

test("deleting a highlight trashes its quote note, and undoing it brings the comment back", async () => {
  const f = fixture();
  const record = { documentId: "doc-1", annotations: [highlight("a1"), highlight("a2")] };
  await f.quotes.sync(record, place, false);
  await f.quotes.write("a2", "Worth keeping.");
  const deleted = { ...record, annotations: [record.annotations[0]] };
  await f.quotes.sync(deleted, place, false);
  assert.deepEqual(f.trashed, ["Book notes/Book/Quote a2.md"]);
  assert.equal(f.quotes.find("a2"), null);
  await f.quotes.sync(record, place, false);
  assert.equal(f.quotes.comment("a2"), "Worth keeping.");
});

test("with keepCommented, only quote notes without a comment are trashed", async () => {
  const f = fixture();
  const record = { documentId: "doc-1", annotations: [highlight("a1"), highlight("a2")] };
  await f.quotes.sync(record, place, false);
  await f.quotes.write("a2", "Worth keeping.");
  await f.quotes.sync({ ...record, annotations: [] }, place, true);
  assert.deepEqual(f.trashed, ["Book notes/Book/Quote a1.md"]);
  assert.ok(f.files.has("Book notes/Book/Quote a2.md"));
});

test("quote notes of highlights never seen in this session aren't removed", async () => {
  const f = fixture();
  f.add("Book notes/Book/Old.md", quoteNoteText({ documentId: "doc-1", annotationId: "gone", page: 1, quote: "Old", source: "" }));
  await f.quotes.sync({ documentId: "doc-1", annotations: [highlight("a1")] }, place, false);
  assert.deepEqual(f.trashed, []);
});
