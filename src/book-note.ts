/**
 * The text format of book notes: one Markdown note per PDF that holds a quote section for every highlight, followed by
 * whatever the reader writes about it. The note belongs to the reader. These functions add or remove whole sections and
 * never change text the reader wrote; they work on plain strings so they can be tested without Obsidian.
 *
 * A section looks like this. The link in the first line carries the highlight's ID, which is how the section is found again.
 *
 *     > [!quote] p. 34 · [Open passage](obsidian://reader-plugin?document=…&annotation=…&page=34) · [[Book.pdf#page=34|PDF]]
 *     > The quoted passage.
 *
 *     ^e66da097
 *
 *     The reader's writing, up to the next section or heading.
 */

export interface SectionInput {
  documentId: string;
  annotationId: string;
  page: number;
  quote: string;
  /** Link text for the PDF, as Obsidian would write it from the note. */
  pdfLink: string;
}

export interface Section {
  id: string;
  /** Line indexes. The callout runs from `start` to `calloutEnd` (exclusive); `idLine` is -1 when the block ID was removed. */
  start: number;
  calloutEnd: number;
  idLine: number;
  /** The reader's writing runs from `writingStart` to `writingEnd` (exclusive): up to the next section, heading, or the end. */
  writingStart: number;
  writingEnd: number;
  quote: string;
  writing: string;
}

const HEADER = /^>\s*\[!quote\][^\n]*?obsidian:\/\/reader-plugin\?[^)\s]*?annotation=([\w-]+)/;
const HEADING = /^#{1,6}\s/;

/** Obsidian shows block IDs while editing, so a section uses the first 8 characters of the highlight's ID, unique within one note. */
export function blockId(annotationId: string): string {
  return annotationId.slice(0, 8);
}

export function passageUri(documentId: string, annotationId: string, page: number): string {
  return `obsidian://reader-plugin?document=${documentId}&annotation=${annotationId}&page=${page}`;
}

/** A quote as a section writes it: trimmed lines without blank ones. Compare a section's `quote` to this to see if it was edited. */
export function quoteText(quote: string): string {
  return quote.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean).join("\n");
}

/** The lines of a new section, without the blank lines around it. */
export function sectionLines(input: SectionInput): string[] {
  const link = input.pdfLink.replace(/[[\]|#\r\n]/g, "");
  const quote = quoteText(input.quote).split("\n").filter(Boolean);
  return [
    `> [!quote] p. ${input.page} · [Open passage](${passageUri(input.documentId, input.annotationId, input.page)}) · [[${link}#page=${input.page}|PDF]]`,
    ...(quote.length ? quote : [""]).map(line => `> ${line}`),
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
      id, start, calloutEnd, idLine, writingStart, writingEnd,
      quote: lines.slice(start + 1, calloutEnd).map(line => line.replace(/^>\s?/, "")).join("\n").trim(),
      writing: lines.slice(writingStart, writingEnd).join("\n").trim(),
    });
    start = writingEnd - 1;
  }
  return sections;
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
export function insertSection(text: string, input: SectionInput, before: Section | null): string {
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
  return finish(lines);
}

/** Removes a section's quote and block ID. Only call this for sections with nothing written under them and an unedited quote. */
export function removeSection(text: string, section: Section): string {
  const lines = text.split("\n");
  lines.splice(section.start, section.writingEnd - section.start);
  joinAt(lines, section.start);
  return finish(lines);
}

/** Adds text at the end of a section's writing. */
export function appendWriting(text: string, section: Section, writing: string): string {
  const lines = text.split("\n");
  let at = section.writingEnd;
  while (at > section.writingStart && !lines[at - 1]!.trim()) at--;
  const added = writing.replace(/\r\n?/g, "\n").trim().split("\n");
  lines.splice(at, 0, ...added);
  joinAt(lines, at + added.length);
  joinAt(lines, at);
  return finish(lines);
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
