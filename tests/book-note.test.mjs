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

const input = (id, page, quote = `Quote ${id}`) => ({ documentId: "doc-1", annotationId: id, page, quote, pdfLink: "Books/Book.pdf" });
const header = note.defaultNoteHeader("[[Books/Book.pdf]]");

test("a section has the quote, both links, and a block ID", () => {
  const text = note.insertSection(header, input("a1", 34, "First line\nsecond line"), null);
  assert.equal(text, `${header}
> [!quote] p. 34 · [Open passage](obsidian://reader-plugin?document=doc-1&annotation=a1&page=34) · [[Books/Book.pdf#page=34|PDF]]
> First line
> second line

^a1
`);
  const [section] = note.findSections(text);
  assert.equal(section.id, "a1");
  assert.equal(section.quote, "First line\nsecond line");
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
  const edited = note.findSections(text.replace("> second line", "> second line, my edit"))[0];
  assert.notEqual(note.quoteText(edited.quote), note.quoteText(quote));
});
