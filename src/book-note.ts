import type { Annotation, AnnotationRecord } from "./annotations";

/**
 * Each highlight has a quote section in its PDF's book note. Reconciliation preserves the reader's writing,
 * except under a deleted highlight, where it goes with the quote unless the reader chose to keep it.
 *
 * The passage link identifies the highlight; the block ID lets other notes link to the section.
 *
 *     > [!quote] p. 34 · [Open passage](obsidian://reader-plugin?document=…&annotation=…&page=34)
 *     > [[Book notes/Book/The quoted passage|The quoted passage, as one flowing line.]]
 *
 *     ^e66da097
 *
 *     The reader's writing, up to the next section or heading.
 *
 *     ---
 *
 * Separators belong to the section below them. A reader's heading replaces the separator.
 * The quote links to its highlight's quote note (see quote-note.ts), which holds the reader's comment about it.
 * A quote counts as unedited while its text is unchanged, wherever its link points.
 */

interface SectionInput {
  documentId: string;
  annotationId: string;
  page: number;
  quote: string;
}

export interface Section {
  id: string;
  /** Line indexes. The callout runs from `start` to `calloutEnd` (exclusive); `idLine` is -1 when the block ID was removed. */
  start: number;
  /** The `---` line above the section, or -1. Only a section that directly follows another one has a separator. */
  separator: number;
  calloutEnd: number;
  idLine: number;
  /** The reader's writing runs from `writingStart` to `writingEnd` (exclusive): up to the next separator, section, heading, or the end. */
  writingStart: number;
  writingEnd: number;
  quote: string;
  writing: string;
}

export const HEADER = /^>\s*\[!quote\][^\n]*?obsidian:\/\/reader-plugin\?[^)\s]*?annotation=([\w-]+)/;
const HEADING = /^#{1,6}\s/;

/** Shorten block IDs because Obsidian shows them while editing. */
function blockId(annotationId: string): string {
  return annotationId.slice(0, 8);
}

export function passageUri(documentId: string, annotationId: string, page: number): string {
  return `obsidian://reader-plugin?document=${documentId}&annotation=${annotationId}&page=${page}`;
}

const SEPARATOR = "---";

/**
 * Join PDF line breaks, preserving hyphens within words. The same normalization detects user edits to older quotes.
 */
export function quoteText(quote: string): string {
  const lines = quote.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
  let text = "";
  for (const line of lines) {
    if (!text) text = line;
    else if (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(line)) text += line;
    else text += ` ${line}`;
  }
  return text.replace(/\s+/g, " ");
}

/**
 * Links a flowing quote to its highlight's quote note, showing the quote as the link text. Brackets and `|` can't appear
 * inside a link without changing the visible text, so such a quote stays plain, as does one without a quote note yet.
 */
function linkedQuote(flowed: string, target: string | undefined): string {
  if (!target || /[[\]|]/.test(flowed)) return flowed;
  return `[[${target}|${flowed}]]`;
}

/** The quote's text in a section, as one flowing line, linked to its quote note when it has one. */
function quoteLine(quote: string, target: string | undefined): string {
  return linkedQuote(quoteText(quote), target);
}

/** The text a section shows for its quote: a link's visible text, or the plain text. */
function shownQuote(sectionQuote: string): string {
  const current = quoteText(sectionQuote);
  const link = /^\[\[([^[\]|]*)(?:\|([^[\]|]*))?\]\]$/.exec(current);
  return link ? link[2] ?? link[1]! : current;
}

/** Whether a section still shows the highlight's quote as the plugin wrote it. Where its link points doesn't matter. */
function isUneditedQuote(sectionQuote: string, quote: string): boolean {
  return shownQuote(sectionQuote) === quoteText(quote);
}

/** The lines of a new section, without the blank lines around it. */
function sectionLines(input: SectionInput, target: string | undefined): string[] {
  return [
    `> [!quote] p. ${input.page} · [Open passage](${passageUri(input.documentId, input.annotationId, input.page)})`,
    `> ${quoteLine(input.quote, target)}`,
    "",
    `^${blockId(input.annotationId)}`,
  ];
}

export function findSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  for (let start = 0; start < lines.length; start++) {
    const id = HEADER.exec(lines[start]!)?.[1];
    if (!id) continue;
    let calloutEnd = start + 1;
    while (calloutEnd < lines.length && lines[calloutEnd]!.startsWith(">") && !HEADER.test(lines[calloutEnd]!)) calloutEnd++;
    let next = calloutEnd;
    while (next < lines.length && !lines[next]!.trim()) next++;
    const idLine = lines[next]?.trim() === `^${blockId(id)}` || lines[next]?.trim() === `^${id}` ? next : -1;
    const writingStart = idLine >= 0 ? idLine + 1 : calloutEnd;
    let writingEnd = writingStart;
    while (writingEnd < lines.length && !HEADER.test(lines[writingEnd]!) && !HEADING.test(lines[writingEnd]!)) writingEnd++;
    sections.push({
      id, start, separator: -1, calloutEnd, idLine, writingStart, writingEnd,
      quote: lines.slice(start + 1, calloutEnd).map(line => line.replace(/^>\s?/, "")).join("\n").trim(),
      writing: "",
    });
    start = writingEnd - 1;
  }
  // A section that directly follows another one owns a `---` line above it, which ends the previous section's writing.
  sections.forEach((section, index) => {
    const previous = sections[index - 1];
    if (previous && previous.writingEnd === section.start) {
      let above = section.start - 1;
      while (above >= previous.writingStart && !lines[above]!.trim()) above--;
      if (above >= previous.writingStart && lines[above]!.trim() === SEPARATOR) {
        section.separator = above;
        previous.writingEnd = above;
      }
    }
  });
  for (const section of sections) section.writing = lines.slice(section.writingStart, section.writingEnd).join("\n").trim();
  return sections;
}

/** Adds the `---` line that each section directly following another one should have, as in notes written before separators. */
function addSeparators(text: string): string {
  const sections = findSections(text);
  const lines = text.split("\n");
  let changed = false;
  for (let index = sections.length - 1; index > 0; index--) {
    const section = sections[index]!;
    if (section.separator >= 0 || sections[index - 1]!.writingEnd !== section.start) continue;
    lines.splice(section.start, 0, SEPARATOR, "");
    joinAt(lines, section.start);
    changed = true;
  }
  return changed ? finish(lines) : text;
}

/**
 * Rewrites unedited quotes in the current form: one flowing line, linked to the highlight's quote note.
 * `quotes` maps highlight IDs to their quotes, and `links` to their quote notes.
 */
function formatQuotes(text: string, quotes: Map<string, string>, links: Map<string, string>): string {
  const lines = text.split("\n");
  let changed = false;
  for (const section of findSections(text).reverse()) {
    const quote = quotes.get(section.id);
    if (quote === undefined || !isUneditedQuote(section.quote, quote)) continue;
    const line = `> ${quoteLine(quote, links.get(section.id))}`;
    const isSingleLine = section.calloutEnd - section.start === 2;
    if (isSingleLine && lines[section.start + 1] === line) continue;
    lines.splice(section.start + 1, section.calloutEnd - section.start - 1, line);
    changed = true;
  }
  return changed ? finish(lines) : text;
}

/** Removes blank lines so that exactly one separates the text before and after `at`. */
function joinAt(lines: string[], at: number): void {
  while (at > 0 && at < lines.length && !lines[at - 1]!.trim() && !lines[at]!.trim()) lines.splice(at, 1);
  if (at > 0 && at < lines.length && lines[at - 1]!.trim() && lines[at]!.trim()) lines.splice(at, 0, "");
}

function finish(lines: string[]): string {
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  return lines.join("\n") + "\n";
}

/**
 * Adds a section before `before`, or at the end when it is null. Headings directly above `before` stay with it,
 * so a passage from an earlier chapter lands above that chapter's heading.
 */
function insertSection(text: string, input: SectionInput, before: Section | null, target: string | undefined): string {
  const lines = text.split("\n");
  let at = lines.length;
  if (before) {
    at = before.start;
    let above = at - 1;
    while (above >= 0 && (!lines[above]!.trim() || HEADING.test(lines[above]!))) above--;
    if (lines.slice(above + 1, at).some(line => HEADING.test(line))) at = above + 1;
  } else {
    while (at > 0 && !lines[at - 1]!.trim()) at--;
  }
  const added = sectionLines(input, target);
  lines.splice(at, 0, ...added);
  const end = at + added.length;
  joinAt(lines, end);
  joinAt(lines, at);
  return addSeparators(finish(lines));
}

/** Removes a section's quote, block ID, and writing. Only call this for sections with an unedited quote. */
function removeSection(text: string, section: Section): string {
  const lines = text.split("\n");
  const sections = findSections(text);
  const next = sections[sections.findIndex(candidate => candidate.id === section.id) + 1];
  const begin = section.separator >= 0 ? section.separator : section.start;
  // Removing the first of a run of sections also removes the separator of the one that now comes first.
  const end = section.separator < 0 && next && next.separator === section.writingEnd ? next.start : section.writingEnd;
  lines.splice(begin, end - begin);
  joinAt(lines, begin);
  return finish(lines);
}

/** Adds text at the end of a section's writing. */
function appendWriting(text: string, section: Section, writing: string): string {
  const lines = text.split("\n");
  let at = section.writingEnd;
  while (at > section.writingStart && !lines[at - 1]!.trim()) at--;
  const added = writing.replace(/\r\n?/g, "\n").trim().split("\n");
  lines.splice(at, 0, ...added);
  joinAt(lines, at + added.length);
  joinAt(lines, at);
  return finish(lines);
}

/** Removes the `· [[book.pdf#page=N|PDF]]` link that earlier sections had after **Open passage**. Only section first lines change. */
function dropPdfLinks(text: string): string {
  return text.split("\n").map(line => HEADER.test(line) ? line.replace(/ · \[\[[^\]\n]*#page=\d+\|PDF\]\]\s*$/, "") : line).join("\n");
}

/** Comments from before book notes, to place under their passages' quotes. */
interface MovedComment { id: string; comment: string }

/** Adds each comment under its section, unless that section already holds it, as after an interrupted move. */
function placeComments(text: string, comments: MovedComment[]): string {
  for (const { id, comment } of comments) {
    const section = findSections(text).find(candidate => candidate.id === id);
    if (section && !hasComment(section.writing, comment)) text = appendWriting(text, section, comment);
  }
  return text;
}

/** IDs of the comments that the note holds under their passages, so they can safely be cleared from the record. */
function placedComments(text: string, comments: MovedComment[]): Set<string> {
  const sections = findSections(text);
  return new Set(comments.filter(({ id, comment }) => sections.some(section => section.id === id && hasComment(section.writing, comment))).map(({ id }) => id));
}

function hasComment(writing: string, comment: string): boolean {
  return writing.includes(comment.replace(/\r\n?/g, "\n").trim());
}

/** Characters Obsidian does not allow in file names, or that break links. */
export function noteFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim() || "Untitled";
}

/** Fills `{{title}}`, `{{source}}`, and `{{date}}` in a template. */
export function fillTemplate(template: string, values: { title: string; source: string; date: string }): string {
  return template.replace(/\{\{\s*(title|source|date)\s*\}\}/g, (_, key: keyof typeof values) => values[key]);
}

export function defaultNoteHeader(source: string): string {
  // Obsidian shows the file name as the note's title, so the note starts without a heading.
  return `---\nsource: "${source.replace(/"/g, '\\"')}"\ntags: [book-note]\n---\n`;
}


const byPosition = (a: Annotation, b: Annotation) => a.page - b.page || a.position.start - b.position.start;
const comments = (record: AnnotationRecord): MovedComment[] => [...record.annotations].sort(byPosition)
  .filter(annotation => annotation.comment.trim()).map(annotation => ({ id: annotation.id, comment: annotation.comment }));

export interface ReconcileOptions {
  /** Keep the section of a deleted highlight when the reader wrote under it, instead of removing the writing with the quote. */
  keepWritingOfDeleted: boolean;
  /** Link paths of quote notes by highlight ID. A quote without one is written as plain text. */
  quoteLinks: Map<string, string>;
}

const DEFAULT_RECONCILE_OPTIONS: ReconcileOptions = { keepWritingOfDeleted: false, quoteLinks: new Map() };

/** Owns the complete text policy. Only quotes confirmed after a successful vault write may later be removed. */
export class BookNoteReconciler {
  private quotes = new Map<string, Map<string, string>>();
  /** Writing removed with deleted highlights, by document ID and then annotation ID, so undoing a delete brings it back. */
  private removedWritings = new Map<string, Map<string, string>>();

  reconcile(text: string, record: AnnotationRecord, options: ReconcileOptions = DEFAULT_RECONCILE_OPTIONS): string {
    text = dropPdfLinks(text);
    const quotes = new Map(record.annotations.map(annotation => [annotation.id, annotation.quote.exact]));
    text = formatQuotes(text, quotes, options.quoteLinks);
    text = addSeparators(text);
    const ids = new Set(record.annotations.map(annotation => annotation.id));
    const known = this.quotes.get(record.documentId);
    for (const section of findSections(text).reverse()) {
      if (ids.has(section.id) || (section.writing && options.keepWritingOfDeleted)) continue;
      const knownQuote = known?.get(section.id);
      if (knownQuote === undefined || !isUneditedQuote(section.quote, knownQuote)) continue;
      if (section.writing) {
        const removed = this.removedWritings.get(record.documentId) ?? new Map<string, string>();
        removed.set(section.id, section.writing);
        this.removedWritings.set(record.documentId, removed);
      }
      text = removeSection(text, section);
    }
    const sorted = [...record.annotations].sort(byPosition);
    for (const annotation of sorted) {
      const sections = findSections(text);
      if (sections.some(section => section.id === annotation.id)) continue;
      const later = sections.find(section => {
        const other = record.annotations.find(candidate => candidate.id === section.id);
        return other && byPosition(annotation, other) < 0;
      }) ?? null;
      text = insertSection(text, { documentId: record.documentId, annotationId: annotation.id, page: annotation.page, quote: annotation.quote.exact }, later, options.quoteLinks.get(annotation.id));
      const removedWriting = this.removedWritings.get(record.documentId)?.get(annotation.id);
      const inserted = findSections(text).find(section => section.id === annotation.id);
      if (removedWriting && inserted) text = appendWriting(text, inserted, removedWriting);
    }
    return placeComments(text, comments(record));
  }

  /** Call with the note read back from disk. Only these legacy comments are safe to clear from the JSON record. */
  confirm(record: AnnotationRecord, text: string): Set<string> {
    this.quotes.set(record.documentId, new Map(record.annotations.map(annotation => [annotation.id, quoteText(annotation.quote.exact)])));
    return placedComments(text, comments(record));
  }
}
