import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-quote-note-tests-"));
await build({ entryPoints: ["src/quote-note.ts"], bundle: true, platform: "node", format: "esm", outfile: join(directory, "quote-note.mjs") });
const { quoteNoteName, quoteNoteText, quoteNoteIds, quoteNoteParts, quoteNoteComment, withComment } = await import(pathToFileURL(join(directory, "quote-note.mjs")));
after(() => rm(directory, { recursive: true, force: true }));

const input = { documentId: "doc-1", annotationId: "e66da097-long-id", page: 34, quote: "A hyphen-\nated quote", source: "[[Books/Book.pdf]]" };

test("a new quote note has its properties, a flowing quote, and the comment below it", () => {
  assert.equal(quoteNoteText(input, "My comment."), [
    "---",
    'source: "[[Books/Book.pdf]]"',
    "page: 34",
    "document: doc-1",
    "annotation: e66da097-long-id",
    "tags: [quote-note]",
    "---",
    "> [!quote] p. 34 · [Open passage](obsidian://reader-plugin?document=doc-1&annotation=e66da097-long-id&page=34)",
    "> A hyphen-ated quote",
    "",
    "My comment.",
    "",
  ].join("\n"));
  assert.match(quoteNoteText(input), /> A hyphen-ated quote\n$/);
});

test("quote notes are recognized by their properties, and other notes aren't", () => {
  assert.deepEqual(quoteNoteIds(quoteNoteText(input)), { documentId: "doc-1", annotationId: "e66da097-long-id" });
  assert.deepEqual(quoteNoteIds("---\ndocument: 'doc-2'\nannotation: \"a1\"\n---\n"), { documentId: "doc-2", annotationId: "a1" });
  assert.equal(quoteNoteIds("---\ntags: [book-note]\n---\nannotation: a1\n"), null);
  assert.equal(quoteNoteIds("No properties"), null);
});

test("the comment is everything below the quote, and replacing it keeps the rest", () => {
  const text = quoteNoteText(input, "First line\n\n## A heading of mine\n\nMore.");
  assert.equal(quoteNoteComment(text), "First line\n\n## A heading of mine\n\nMore.");
  const replaced = withComment(text, "Rewritten.\r\n");
  assert.equal(replaced, quoteNoteText(input, "Rewritten."));
  assert.equal(withComment(replaced, "  "), quoteNoteText(input));
  // Properties the reader added stay.
  const extra = text.replace("tags: [quote-note]", "tags: [quote-note]\nrating: 5");
  assert.match(withComment(extra, "New."), /rating: 5\n---\n> \[!quote\][^\n]*\n> A hyphen-ated quote\n\nNew\.\n$/);
});

test("without the quote, everything after the properties is the comment", () => {
  assert.deepEqual(quoteNoteParts("---\nannotation: a1\n---\nJust my words.\n"), { head: "---\nannotation: a1\n---", comment: "Just my words." });
  assert.deepEqual(quoteNoteParts("No properties at all."), { head: "", comment: "No properties at all." });
});

test("quote note names are readable, safe, and short", () => {
  assert.equal(quoteNoteName("Why: a/b?\nNext line"), "Why- a-b- Next line");
  assert.equal(quoteNoteName("It ends here..."), "It ends here");
  assert.equal(quoteNoteName("..."), "Untitled");
  const long = quoteNoteName(`${"word ".repeat(30)}end`);
  assert.ok(long.length <= 81);
  assert.match(long, /^word( word)+…$/);
  assert.match(quoteNoteName("x".repeat(200)), /^x{80}…$/);
});
