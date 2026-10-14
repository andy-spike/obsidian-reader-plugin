import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-book-note-tests-"));
await build({ entryPoints: ["src/book-note.ts"], bundle: true, platform: "node", format: "esm", outfile: join(directory, "book-note.mjs") });
const note = await import(pathToFileURL(join(directory, "book-note.mjs")));
after(() => rm(directory, { recursive: true, force: true }));

const input = (id, page, quote = `Quote ${id}`) => ({ documentId: "doc-1", annotationId: id, page, quote });
const header = note.defaultNoteHeader("[[Books/Book.pdf]]");

test("a section has the quote as one flowing line, the passage link, and a block ID", () => {
  const text = note.insertSection(header, input("a1", 34, "First line of a hyphen-\nated quote,\n  self-\nAware"), null);
  assert.equal(text, `${header}
> [!quote] p. 34 · [Open passage](obsidian://reader-plugin?document=doc-1&annotation=a1&page=34)
> First line of a hyphen-ated quote, self- Aware

^a1
`);
  const [section] = note.findSections(text);
  assert.equal(section.id, "a1");
  assert.equal(section.quote, "First line of a hyphen-ated quote, self- Aware");
  assert.equal(section.writing, "");
});

test("block IDs use the first 8 characters, and full IDs from older notes are still found", () => {
  const id = "e66da097-ddc6-48de-915b-2d5a9ad293d0";
  const text = note.insertSection(header, input(id, 1), null);
  assert.ok(text.includes("\n^e66da097\n"));
  assert.equal(note.findSections(text + "\nMine\n")[0].writing, "Mine");
  const older = text.replace("^e66da097", `^${id}`) + "\nMine\n";
  assert.equal(note.findSections(older)[0].idLine >= 0, true);
  assert.equal(note.findSections(older)[0].writing, "Mine");
});

test("writing runs to the next section or heading", () => {
  let text = note.insertSection(header, input("a1", 1), null);
  text = note.insertSection(text, input("a2", 2), null);
  text = text.replace("^a1\n", "^a1\n\nMy thoughts\n\n- a list\n");
  text += "\n## Later chapter\n\nNot about a2\n";
  const [first, second] = note.findSections(text);
  assert.equal(first.writing, "My thoughts\n\n- a list");
  assert.equal(second.writing, "");
});

test("sections are found without their block ID, and other callouts are ignored", () => {
  const text = `${header}\n> [!note] Mine\n> not a passage\n\n> [!quote] p. 3 · [Open passage](obsidian://reader-plugin?document=d&annotation=x9&page=3)\n> quoted\n\nwriting\n`;
  const sections = note.findSections(text);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, "x9");
  assert.equal(sections[0].idLine, -1);
  assert.equal(sections[0].writing, "writing");
});

test("a section inserted before a later one goes above that chapter's heading", () => {
  let text = note.insertSection(header, input("p10", 10), null);
  text += "\n## Chapter 2\n\n";
  text = note.insertSection(text, input("p50", 50), null);
  const before = note.findSections(text).find(section => section.id === "p50");
  text = note.insertSection(text, input("p20", 20), before);
  assert.deepEqual(note.findSections(text).map(section => section.id), ["p10", "p20", "p50"]);
  assert.ok(text.indexOf("^p20") < text.indexOf("## Chapter 2"), "inserted above the heading");
  assert.ok(!/\n\n\n/.test(text), "no doubled blank lines");
});

test("removing a section leaves the reader's other text alone", () => {
  let text = note.insertSection(header, input("a1", 1), null);
  text = note.insertSection(text, input("a2", 2), null);
  text = note.insertSection(text, input("a3", 3), null);
  text = text.replace("^a1\n", "^a1\n\nKeep this.\n").replace("^a3", "^a3\n\nAnd this.");
  const target = note.findSections(text).find(section => section.id === "a2");
  text = note.removeSection(text, target);
  assert.deepEqual(note.findSections(text).map(section => [section.id, section.writing]), [["a1", "Keep this."], ["a3", "And this."]]);
  assert.ok(!/\n\n\n/.test(text));
});

test("writing is added after what is already there", () => {
  let text = note.insertSection(header, input("a1", 1), null);
  text = note.insertSection(text, input("a2", 2), null);
  text = note.appendWriting(text, note.findSections(text)[0], "A moved comment\nover two lines");
  assert.equal(note.findSections(text)[0].writing, "A moved comment\nover two lines");
  text = note.appendWriting(text, note.findSections(text)[0], "More");
  assert.equal(note.findSections(text)[0].writing, "A moved comment\nover two lines\n\nMore");
  assert.equal(note.findSections(text)[1].writing, "");
});

test("file names and templates", () => {
  assert.equal(note.noteFileName("Ch. 1: What/Why? [draft]"), "Ch. 1- What-Why- -draft-");
  assert.equal(note.noteFileName("   "), "Untitled");
  assert.equal(note.fillTemplate("# {{title}}\nsource: {{ source }}\n{{date}} {{other}}", { title: "T", source: "[[S]]", date: "2026-10-14" }), "# T\nsource: [[S]]\n2026-10-14 {{other}}");
});

test("a section's quote reads back as written, so an edit to it can be noticed", () => {
  const quote = "  First line \r\n\r\n  second line ";
  const text = note.insertSection(header, input("a1", 1, quote), null);
  const section = note.findSections(text)[0];
  assert.equal(note.quoteText(section.quote), note.quoteText(quote));
  const edited = note.findSections(text.replace("second line", "second line, my edit"))[0];
  assert.notEqual(note.quoteText(edited.quote), note.quoteText(quote));
});

test("comments move under their quotes once, and only placed ones count", () => {
  let text = note.insertSection(header, input("a1", 1), null);
  text = note.insertSection(text, input("a2", 2), null);
  text = text.replace("^a2\n", "^a2\n\nAlready written.\n");
  const comments = [{ id: "a1", comment: "First\r\nsecond line" }, { id: "a2", comment: "A later thought" }, { id: "gone", comment: "No section" }];
  text = note.placeComments(text, comments);
  assert.deepEqual(note.findSections(text).map(section => section.writing), ["First\nsecond line", "Already written.\n\nA later thought"]);
  assert.equal(note.placeComments(text, comments), text);
  assert.deepEqual([...note.placedComments(text, comments)].sort(), ["a1", "a2"]);
});

test("the PDF link of earlier sections is removed, and nothing else", () => {
  const old = `${header}\n> [!quote] p. 3 · [Open passage](obsidian://reader-plugin?document=d&annotation=x9&page=3) · [[Books/Book.pdf#page=3|PDF]]\n> quoted\n\n^x9\n\nMy link [[Books/Book.pdf#page=3|PDF]]\n`;
  const text = note.dropPdfLinks(old);
  assert.match(text, /&page=3\)\n> quoted/);
  assert.match(text, /My link \[\[Books\/Book.pdf#page=3\|PDF\]\]/);
  assert.equal(note.dropPdfLinks(text), text);
});

test("consecutive sections are separated, and separators stay out of the writing", () => {
  let text = note.insertSection(header, input("a1", 1), null);
  text = note.insertSection(text, input("a3", 3), null);
  text = note.insertSection(text, input("a2", 2), note.findSections(text)[1]);
  text = note.insertSection(text, input("a0", 0), note.findSections(text)[0]);
  assert.equal(text.match(/^---$/gm).length - 2, 3);
  assert.deepEqual(note.findSections(text).map(section => [section.id, section.separator >= 0, section.writing]), [["a0", false, ""], ["a1", true, ""], ["a2", true, ""], ["a3", true, ""]]);
  text = note.appendWriting(text, note.findSections(text)[1], "About a1");
  assert.match(text, /About a1\n\n---\n\n> \[!quote\] p\. 2/);
  assert.equal(note.findSections(text)[1].writing, "About a1");
  assert.ok(!/\n\n\n/.test(text));
});

test("removing a section takes one separator with it", () => {
  let text = note.insertSection(header, input("a1", 1), null);
  text = note.insertSection(text, input("a2", 2), null);
  text = note.insertSection(text, input("a3", 3), null);
  const separators = t => t.match(/^---$/gm).length - 2;
  const without = id => note.removeSection(text, note.findSections(text).find(section => section.id === id));
  for (const id of ["a1", "a2", "a3"]) {
    const after = without(id);
    assert.equal(separators(after), 1, id);
    assert.equal(note.findSections(after)[0].separator, -1, id);
    assert.ok(!/\n\n\n/.test(after), id);
  }
});

test("a heading between sections replaces the separator, and older notes get separators and flowing quotes", () => {
  const old = `${header}
> [!quote] p. 1 · [Open passage](obsidian://reader-plugin?document=d&annotation=a1&page=1)
> Old first
> line

^a1

Mine.
> [!quote] p. 2 · [Open passage](obsidian://reader-plugin?document=d&annotation=a2&page=2)
> Edited by me
> on purpose

^a2

## Chapter 2

> [!quote] p. 9 · [Open passage](obsidian://reader-plugin?document=d&annotation=a3&page=9)
> Third

^a3
`;
  const text = note.addSeparators(note.flowQuotes(old, new Map([["a1", "Old first\nline"], ["a2", "Original quote"], ["a3", "Third"]])));
  assert.match(text, /> Old first line\n/);
  assert.match(text, /> Edited by me\n> on purpose/);
  assert.match(text, /Mine\.\n\n---\n\n> \[!quote\] p\. 2/);
  assert.match(text, /## Chapter 2\n\n> \[!quote\] p\. 9/);
  assert.equal(text.match(/^---$/gm).length - 2, 1);
  assert.equal(note.addSeparators(text), text);
});
