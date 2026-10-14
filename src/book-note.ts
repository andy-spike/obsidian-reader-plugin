import type { Annotation, AnnotationRecord } from "./annotations";

/**
 * Each highlight has a quote section in its PDF's book note. Reconciliation preserves the reader's writing.
 *
 * The passage link identifies the highlight; the block ID lets other notes link to the section.
 *
 *     > [!quote] p. 34 · [Open passage](obsidian://reader-plugin?document=…&annotation=…&page=34)
 *     > The quoted passage, as one flowing line.
 *
 *     ^e66da097
 *
 *     The reader's writing, up to the next section or heading.
 *
 *     ---
 *
 * Separators belong to the section below them. A reader's heading replaces the separator.
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

const HEADER = /^>\s*\[!quote\][^\n]*?obsidian:\/\/reader-plugin\?[^)\s]*?annotation=([\w-]+)/;
const HEADING = /^#{1,6}\s/;

/** Shorten block IDs because Obsidian shows them while editing. */
function blockId(annotationId: string): string {
  return annotationId.slice(0, 8);
}

function passageUri(documentId: string, annotationId: string, page: number): string {
  return `obsidian://reader-plugin?document=${documentId}&annotation=${annotationId}&page=${page}`;
}

const SEPARATOR = "---";

/**
 * Join PDF line breaks, preserving hyphens within words. The same normalization detects user edits to older quotes.
 */
function quoteText(quote: string): string {
  const lines = quote.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
  let text = "";
  for (const line of lines) {
    if (!text) text = line;
    else if (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(line)) text += line;
    else text += ` ${line}`;
  }
  return text.replace(/\s+/g, " ");
}

/** The lines of a new section, without the blank lines around it. */
function sectionLines(input: SectionInput): string[] {
  return [
    `> [!quote] p. ${input.page} · [Open passage](${passageUri(input.documentId, input.annotationId, input.page)})`,
    `> ${quoteText(input.quote)}`,
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

/** Rewrites unedited quotes that still keep the PDF's line breaks as one flowing line. `quotes` maps highlight IDs to their quotes. */
function flowQuotes(text: string, quotes: Map<string, string>): string {
  const lines = text.split("\n");
  let changed = false;
  for (const section of findSections(text).reverse()) {
    const quote = quotes.get(section.id);
    if (quote === undefined || section.calloutEnd - section.start === 2) continue;
    const flowed = quoteText(quote);
    if (quoteText(section.quote) !== flowed) continue;
    lines.splice(section.start + 1, section.calloutEnd - section.start - 1, `> ${flowed}`);
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
function insertSection(text: string, input: SectionInput, before: Section | null): string {
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
  lines.splice(at, 0, ...sectionLines(input));
  const end = at + sectionLines(input).length;
  joinAt(lines, end);
  joinAt(lines, at);
  return addSeparators(finish(lines));
}

/** Removes a section's quote and block ID. Only call this for sections with nothing written under them and an unedited quote. */
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

/** Owns the complete text policy. Only quotes confirmed after a successful vault write may later be removed. */
export class BookNoteReconciler {
  private quotes = new Map<string, Map<string, string>>();

  reconcile(text: string, record: AnnotationRecord): string {
    text = dropPdfLinks(text);
    const quotes = new Map(record.annotations.map(annotation => [annotation.id, annotation.quote.exact]));
    text = flowQuotes(text, quotes);
    text = addSeparators(text);
    const ids = new Set(record.annotations.map(annotation => annotation.id));
    const known = this.quotes.get(record.documentId);
    for (const section of findSections(text).reverse()) {
      if (ids.has(section.id) || section.writing) continue;
      if (known?.get(section.id) === quoteText(section.quote)) text = removeSection(text, section);
    }
    const sorted = [...record.annotations].sort(byPosition);
    for (const annotation of sorted) {
      const sections = findSections(text);
      if (sections.some(section => section.id === annotation.id)) continue;
      const later = sections.find(section => {
        const other = record.annotations.find(candidate => candidate.id === section.id);
        return other && byPosition(annotation, other) < 0;
      }) ?? null;
      text = insertSection(text, { documentId: record.documentId, annotationId: annotation.id, page: annotation.page, quote: annotation.quote.exact }, later);
    }
    return placeComments(text, comments(record));
  }

  /** Call with the note read back from disk. Only these legacy comments are safe to clear from the JSON record. */
  confirm(record: AnnotationRecord, text: string): Set<string> {
    this.quotes.set(record.documentId, new Map(record.annotations.map(annotation => [annotation.id, quoteText(annotation.quote.exact)])));
    return placedComments(text, comments(record));
  }
}
