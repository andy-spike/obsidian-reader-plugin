import { HEADER, noteFileName, passageUri, quoteText } from "./book-note";

/**
 * Each highlight has a quote note: its own Markdown file, in a folder beside the book note, that holds the quote and
 * the reader's comment about it. The book note's quote links to it.
 *
 *     ---
 *     source: "[[Books/Book.pdf]]"
 *     page: 34
 *     document: 0b9c…
 *     annotation: e66da097-…
 *     tags: [quote-note]
 *     ---
 *     > [!quote] p. 34 · [Open passage](obsidian://reader-plugin?document=…&annotation=…&page=34)
 *     > The quoted passage, as one flowing line.
 *
 *     The reader's comment: everything below the quote.
 *
 * The plugin finds a quote note by the highlight ID in its `annotation` property, never by its name, so the reader
 * can rename or move it. The plugin writes the properties and the quote; the comment belongs to the reader.
 */

export interface QuoteNoteInput {
  documentId: string;
  annotationId: string;
  page: number;
  quote: string;
  /** A link to the PDF, like the book note's `source` property. */
  source: string;
}

/** Longest file name, kept short so the path stays well within file system limits. Longer quotes are cut at a word. */
const NAME_LENGTH = 80;

/** A readable file name, without extension, from the start of the quote. Windows doesn't allow a name to end in a period. */
export function quoteNoteName(quote: string): string {
  const name = noteFileName(quoteText(quote)).replace(/[\s.]+$/, "") || "Untitled";
  if (name.length <= NAME_LENGTH) return name;
  const cut = name.slice(0, NAME_LENGTH);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > NAME_LENGTH / 2 ? cut.slice(0, atWord) : cut).replace(/[\s.,;:-]+$/, "")}…`;
}

/** The text of a new quote note, with the comment below the quote. */
export function quoteNoteText(input: QuoteNoteInput, comment = ""): string {
  const head = [
    "---",
    `source: "${input.source.replace(/"/g, '\\"')}"`,
    `page: ${input.page}`,
    `document: ${input.documentId}`,
    `annotation: ${input.annotationId}`,
    "tags: [quote-note]",
    "---",
    `> [!quote] p. ${input.page} · [Open passage](${passageUri(input.documentId, input.annotationId, input.page)})`,
    `> ${quoteText(input.quote)}`,
  ].join("\n");
  return join(head, comment);
}

/** The highlight and PDF a quote note belongs to, read from its properties, or null for other notes. */
export function quoteNoteIds(text: string): { documentId: string; annotationId: string } | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  if (!frontmatter) return null;
  const property = (name: string) => new RegExp(`^${name}:\\s*["']?([\\w-]+)["']?\\s*$`, "m").exec(frontmatter)?.[1];
  const documentId = property("document");
  const annotationId = property("annotation");
  return documentId && annotationId ? { documentId, annotationId } : null;
}

/**
 * Splits a quote note into what the plugin wrote, the properties and the quote, and the reader's comment below it.
 * If the reader removed the quote, everything after the properties is the comment.
 */
export function quoteNoteParts(text: string): { head: string; comment: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let end = 0;
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) end = close + 1;
  }
  let quote = end;
  while (quote < lines.length && !lines[quote]!.trim()) quote++;
  if (quote < lines.length && HEADER.test(lines[quote]!)) {
    end = quote + 1;
    while (end < lines.length && lines[end]!.startsWith(">")) end++;
  }
  return { head: lines.slice(0, end).join("\n"), comment: lines.slice(end).join("\n").trim() };
}

/** The reader's comment in a quote note. */
export function quoteNoteComment(text: string): string {
  return quoteNoteParts(text).comment;
}

/** Replaces the comment, leaving the properties and the quote as they are. */
export function withComment(text: string, comment: string): string {
  return join(quoteNoteParts(text).head, comment);
}

function join(head: string, comment: string): string {
  const body = comment.replace(/\r\n?/g, "\n").trim();
  return body ? `${head.trimEnd()}\n\n${body}\n` : `${head.trimEnd()}\n`;
}
