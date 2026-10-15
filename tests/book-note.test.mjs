import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-book-note-tests-"));
await build({ entryPoints: ["src/book-note.ts"], bundle: true, platform: "node", format: "esm", outfile: join(directory, "book-note.mjs") });
const { BookNoteReconciler, findSections, defaultNoteHeader, noteFileName, fillTemplate } = await import(pathToFileURL(join(directory, "book-note.mjs")));
after(() => rm(directory, { recursive: true, force: true }));

const highlight = (id, page, quote = `Quote ${id}`, start = 0) => ({ id, page, position: { start }, quote: { exact: quote }, comment: "" });
const record = annotations => ({ documentId: "doc-1", annotations });
const header = defaultNoteHeader("[[Books/Book.pdf]]");
const sections = text => findSections(text).map(({ id, quote, writing }) => ({ id, quote, writing }));

function saved(annotations) {
  const reconciler = new BookNoteReconciler();
  const r = record(annotations);
  const text = reconciler.reconcile(header, r);
  reconciler.confirm(r, text);
  return { reconciler, r, text };
}

test("reconciliation creates flowing quotes, links, short block IDs, and reading order", () => {
  const reconciler = new BookNoteReconciler();
  const r = record([highlight("later", 3), highlight("e66da097-long-id", 1, "A hyphen-\nated quote,\n  self-\nAware", 20), highlight("first", 1, "First", 1)]);
  const text = reconciler.reconcile(header, r);
  assert.deepEqual(findSections(text).map(s => s.id), ["first", "e66da097-long-id", "later"]);
  assert.match(text, /document=doc-1&annotation=e66da097-long-id&page=1/);
  assert.match(text, /> A hyphen-ated quote, self- Aware\n\n\^e66da097\n/);
  assert.equal((text.match(/^---$/gm) ?? []).length, 4);
  assert.equal(reconciler.reconcile(text, r), text);
});

test("deleted sections are removed with the writing under them by default", () => {
  const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2), highlight("a3", 3)]);
  const edited = text.replace("^a2\n", "^a2\n\nGone with its quote.\n\n## My heading\n\nOutside the passage.\n");
  r.annotations = r.annotations.filter(a => a.id !== "a2");
  const result = reconciler.reconcile(edited, r);
  assert.deepEqual(findSections(result).map(s => s.id), ["a1", "a3"]);
  assert.ok(!result.includes("Gone with its quote."));
  assert.match(result, /## My heading\n\nOutside the passage\./);
  assert.ok(!/\n\n\n/.test(result));
});

test("undoing a delete brings back the writing removed with the quote", () => {
  const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2)]);
  const edited = text.replace("^a2\n", "^a2\n\nMy thought.\n");
  const deleted = r.annotations.find(a => a.id === "a2");
  r.annotations = r.annotations.filter(a => a !== deleted);
  const removed = reconciler.reconcile(edited, r);
  reconciler.confirm(r, removed);
  r.annotations.push(deleted);
  assert.equal(findSections(reconciler.reconcile(removed, r)).find(s => s.id === "a2").writing, "My thought.");
});

test("with keepWritingOfDeleted, only unwritten deleted sections are removed, preserving surrounding writing", () => {
  const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2), highlight("a3", 3)]);
  const edited = text.replace("^a1\n", "^a1\n\nKeep this.\n").replace("^a3\n", "^a3\n\nAnd this.\n");
  r.annotations = [];
  const result = reconciler.reconcile(edited, r, { keepWritingOfDeleted: true });
  assert.deepEqual(sections(result), [{ id: "a1", quote: "Quote a1", writing: "Keep this." }, { id: "a3", quote: "Quote a3", writing: "And this." }]);
  assert.equal((result.match(/^---$/gm) ?? []).length, 3);
  assert.ok(!/\n\n\n/.test(result));
});

test("user-edited quotes and unknown sections survive deletion", () => {
  const { reconciler, r, text } = saved([highlight("known", 1)]);
  r.annotations = [];
  assert.equal(reconciler.reconcile(text.replace("Quote known", "My edited quote"), r), text.replace("Quote known", "My edited quote"));
  assert.equal(new BookNoteReconciler().reconcile(text, r), text, "a fresh session cannot delete sections it never confirmed");
});

test("an unconfirmed attempted write does not make a section safe to delete", () => {
  const reconciler = new BookNoteReconciler();
  const r = record([highlight("a1", 1)]);
  const attempted = reconciler.reconcile(header, r);
  r.annotations = [];
  assert.equal(reconciler.reconcile(attempted, r), attempted);
});

test("quote history is isolated by document", () => {
  const { reconciler, text } = saved([highlight("same-id", 1)]);
  assert.equal(reconciler.reconcile(text, { documentId: "other", annotations: [] }), text);
});

test("deleting first, middle, last, or every section keeps separators correct", () => {
  for (const gone of [["a1"], ["a2"], ["a3"], ["a1", "a2", "a3"]]) {
    const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2), highlight("a3", 3)]);
    r.annotations = r.annotations.filter(a => !gone.includes(a.id));
    const result = reconciler.reconcile(text, r);
    assert.deepEqual(findSections(result).map(s => s.id), r.annotations.map(a => a.id));
    assert.equal((result.match(/^---$/gm) ?? []).length, 2 + Math.max(0, r.annotations.length - 1));
    assert.ok(!/\n\n\n/.test(result));
  }
});

test("new earlier passages stay before chapter headings without editing the writing", () => {
  const { reconciler, r, text } = saved([highlight("a3", 3)]);
  const edited = text.replace("> [!quote]", "## Chapter 2\n\n> [!quote]") + "\nMy writing.\n";
  r.annotations.push(highlight("a1", 1));
  const result = reconciler.reconcile(edited, r);
  assert.ok(result.indexOf("annotation=a1") < result.indexOf("## Chapter 2"));
  assert.equal(findSections(result)[1].writing, "My writing.");
});

test("old formatting migrates safely while user quotes, headings, and links survive", () => {
  const reconciler = new BookNoteReconciler();
  const old = `${header}
> [!quote] p. 1 · [Open passage](obsidian://reader-plugin?document=doc-1&annotation=a1&page=1) · [[Books/Book.pdf#page=1|PDF]]
> Old first
> line

^a1

Mine [[Books/Book.pdf#page=1|PDF]].
> [!quote] p. 2 · [Open passage](obsidian://reader-plugin?document=doc-1&annotation=a2&page=2)
> Edited by me
> on purpose

^a2

## Chapter 2

> [!quote] p. 9 · [Open passage](obsidian://reader-plugin?document=doc-1&annotation=a3&page=9)
> Third

^a3
`;
  const r = record([highlight("a1", 1, "Old first\nline"), highlight("a2", 2, "Original quote"), highlight("a3", 9, "Third")]);
  const result = reconciler.reconcile(old, r);
  assert.match(result, /&page=1\)\n> Old first line/);
  assert.match(result, /> Edited by me\n> on purpose/);
  assert.match(result, /Mine \[\[Books\/Book.pdf#page=1\|PDF\]\]\.\n\n---/);
  assert.match(result, /## Chapter 2\n\n> \[!quote\] p\. 9/);
  assert.equal(reconciler.reconcile(result, r), result);
});

test("legacy comments migrate once and are confirmed only when the read-back contains them", () => {
  const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2)]);
  r.annotations[0].comment = "First\r\nsecond line";
  r.annotations[1].comment = "A later thought";
  assert.deepEqual([...reconciler.confirm(r, text)], []);
  const edited = text.replace("^a2\n", "^a2\n\nAlready written.\n");
  const result = reconciler.reconcile(edited, r);
  assert.deepEqual(findSections(result).map(s => s.writing), ["First\nsecond line", "Already written.\n\nA later thought"]);
  assert.deepEqual([...reconciler.confirm(r, result)], ["a1", "a2"]);
  assert.equal(reconciler.reconcile(result, r), result);
});

test("section discovery supports old full block IDs, missing IDs, and headings", () => {
  const { text } = saved([highlight("a-long-annotation-id", 1), highlight("next", 2)]);
  assert.equal(findSections(text.replace("^a-long-a", "^a-long-annotation-id"))[0].idLine >= 0, true);
  assert.equal(findSections(text.replace("^a-long-a", ""))[0].idLine, -1);
  const edited = text.replace("^next\n", "^next\n\nMy writing.\n\n## My heading\n\nOutside the passage.\n");
  assert.equal(findSections(edited)[1].writing, "My writing.");
});

test("file names and templates", () => {
  assert.equal(noteFileName("Ch. 1: What/Why? [draft]"), "Ch. 1- What-Why- -draft-");
  assert.equal(noteFileName("   "), "Untitled");
  assert.equal(fillTemplate("# {{title}}\nsource: {{ source }}\n{{date}} {{other}}", { title: "T", source: "[[S]]", date: "2026-10-14" }), "# T\nsource: [[S]]\n2026-10-14 {{other}}");
});
