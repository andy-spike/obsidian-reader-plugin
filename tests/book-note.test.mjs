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

test("reconciliation creates flowing quotes and passage links in reading order, without block IDs", () => {
  const reconciler = new BookNoteReconciler();
  const r = record([highlight("later", 3), highlight("e66da097-long-id", 1, "A hyphen-\nated quote,\n  self-\nAware", 20), highlight("first", 1, "First", 1)]);
  const text = reconciler.reconcile(header, r);
  assert.deepEqual(findSections(text).map(s => s.id), ["first", "e66da097-long-id", "later"]);
  assert.match(text, /document=doc-1&annotation=e66da097-long-id&page=1/);
  assert.match(text, /> A hyphen-ated quote, self- Aware\n\n---\n/);
  assert.ok(!/^\^/m.test(text));
  assert.equal((text.match(/^---$/gm) ?? []).length, 4);
  assert.equal(reconciler.reconcile(text, r), text);
});

test("deleted sections are removed with the writing under them by default", () => {
  const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2), highlight("a3", 3)]);
  const edited = text.replace("> Quote a2\n", "> Quote a2\n\nGone with its quote.\n\n## My heading\n\nOutside the passage.\n");
  r.annotations = r.annotations.filter(a => a.id !== "a2");
  const result = reconciler.reconcile(edited, r);
  assert.deepEqual(findSections(result).map(s => s.id), ["a1", "a3"]);
  assert.ok(!result.includes("Gone with its quote."));
  assert.match(result, /## My heading\n\nOutside the passage\./);
  assert.ok(!/\n\n\n/.test(result));
});

test("undoing a delete brings back the writing removed with the quote", () => {
  const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2)]);
  const edited = text.replace("> Quote a2\n", "> Quote a2\n\nMy thought.\n");
  const deleted = r.annotations.find(a => a.id === "a2");
  r.annotations = r.annotations.filter(a => a !== deleted);
  const removed = reconciler.reconcile(edited, r);
  reconciler.confirm(r, removed);
  r.annotations.push(deleted);
  assert.equal(findSections(reconciler.reconcile(removed, r)).find(s => s.id === "a2").writing, "My thought.");
});

test("with keepWritingOfDeleted, only unwritten deleted sections are removed, preserving surrounding writing", () => {
  const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2), highlight("a3", 3)]);
  const edited = text.replace("> Quote a1\n", "> Quote a1\n\nKeep this.\n").replace("> Quote a3\n", "> Quote a3\n\nAnd this.\n");
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

const linked = (...ids) => ({ keepWritingOfDeleted: false, quoteLinks: new Map(ids.map(id => [id, `Book notes/Book/Quote ${id}`])) });

test("quotes link to their quote notes, and stay plain until a highlight has one", () => {
  const reconciler = new BookNoteReconciler();
  const r = record([highlight("a1", 1, "A linked\nquote", 1), highlight("a2", 1, "Not yet", 2)]);
  const text = reconciler.reconcile(header, r, linked("a1"));
  assert.deepEqual(sections(text).map(s => s.quote), ["[[Book notes/Book/Quote a1|A linked quote]]", "Not yet"]);
  assert.deepEqual(sections(reconciler.reconcile(text, r, linked("a1", "a2"))).map(s => s.quote),
    ["[[Book notes/Book/Quote a1|A linked quote]]", "[[Book notes/Book/Quote a2|Not yet]]"]);
});

test("unedited quotes follow their quote note's link, and edited ones are left alone", () => {
  const reconciler = new BookNoteReconciler();
  const r = record([highlight("a1", 1, "Quote a1", 1), highlight("a2", 2)]);
  const text = reconciler.reconcile(header, r, linked("a1", "a2"));
  reconciler.confirm(r, text);
  const edited = text.replace("> [[Book notes/Book/Quote a2|Quote a2]]", "> [[Book notes/Book/Quote a2|Quote a2]] and my words");
  const moved = { keepWritingOfDeleted: false, quoteLinks: new Map([["a1", "Elsewhere/Quote a1"], ["a2", "Elsewhere/Quote a2"]]) };
  assert.deepEqual(sections(reconciler.reconcile(edited, r, moved)).map(s => s.quote),
    ["[[Elsewhere/Quote a1|Quote a1]]", "[[Book notes/Book/Quote a2|Quote a2]] and my words"]);
});

test("deleting a highlight removes its section, linked or plain", () => {
  const reconciler = new BookNoteReconciler();
  const r = record([highlight("a1", 1, "Quote a1", 1), highlight("a2", 1, "Quote a2", 2), highlight("a3", 2)]);
  const text = reconciler.reconcile(header, r, linked("a1", "a3"));
  reconciler.confirm(r, text);
  // A link the reader shortened still counts as unedited, since its visible text is the quote.
  const shortened = text.replace("[[Book notes/Book/Quote a3|Quote a3]]", "[[Quote a3]]");
  r.annotations = r.annotations.filter(a => a.id === "a1");
  assert.deepEqual(sections(reconciler.reconcile(shortened, r, linked("a1"))).map(s => s.id), ["a1"]);
});

test("quotes with brackets or a bar stay plain, so the link can't change their text", () => {
  const reconciler = new BookNoteReconciler();
  const text = reconciler.reconcile(header, record([highlight("a1", 1, "See [1] or a|b")]), linked("a1"));
  assert.deepEqual(sections(text).map(s => s.quote), ["See [1] or a|b"]);
});

test("legacy comments migrate once and are confirmed only when the read-back contains them", () => {
  const { reconciler, r, text } = saved([highlight("a1", 1), highlight("a2", 2)]);
  r.annotations[0].comment = "First\r\nsecond line";
  r.annotations[1].comment = "A later thought";
  assert.deepEqual([...reconciler.confirm(r, text)], []);
  const edited = text.replace("> Quote a2\n", "> Quote a2\n\nAlready written.\n");
  const result = reconciler.reconcile(edited, r);
  assert.deepEqual(findSections(result).map(s => s.writing), ["First\nsecond line", "Already written.\n\nA later thought"]);
  assert.deepEqual([...reconciler.confirm(r, result)], ["a1", "a2"]);
  assert.equal(reconciler.reconcile(result, r), result);
});

test("block IDs from earlier versions are recognized, then removed without touching the writing", () => {
  const { reconciler, r, text } = saved([highlight("a-long-annotation-id", 1), highlight("next", 2)]);
  const old = text.replace("> Quote a-long-annotation-id\n", "> Quote a-long-annotation-id\n\n^a-long-a\n\nMine.\n")
    .replace("> Quote next\n", "> Quote next\n\n^next\n");
  assert.deepEqual(findSections(old).map(s => [s.idLine >= 0, s.writing]), [[true, "Mine."], [true, ""]]);
  assert.equal(findSections(old.replace("^a-long-a", "^a-long-annotation-id"))[0].idLine >= 0, true);
  const result = reconciler.reconcile(old, r);
  assert.ok(!/^\^/m.test(result));
  assert.deepEqual(sections(result).map(s => s.writing), ["Mine.", ""]);
  assert.equal(result, text.replace("> Quote a-long-annotation-id\n", "> Quote a-long-annotation-id\n\nMine.\n"));
});

test("writing ends at the next heading", () => {
  const { text } = saved([highlight("a1", 1), highlight("next", 2)]);
  const edited = text.replace("> Quote next\n", "> Quote next\n\nMy writing.\n\n## My heading\n\nOutside the passage.\n");
  assert.equal(findSections(edited)[1].writing, "My writing.");
});

test("file names and templates", () => {
  assert.equal(noteFileName("Ch. 1: What/Why? [draft]"), "Ch. 1- What-Why- -draft-");
  assert.equal(noteFileName("   "), "Untitled");
  assert.equal(fillTemplate("# {{title}}\nsource: {{ source }}\n{{date}} {{other}}", { title: "T", source: "[[S]]", date: "2026-10-14" }), "# T\nsource: [[S]]\n2026-10-14 {{other}}");
});
