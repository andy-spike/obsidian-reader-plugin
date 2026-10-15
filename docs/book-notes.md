# Book notes

Each PDF gets a book note, an ordinary Markdown note you own. It's where you write about what you read. Reading Desk creates the note with your first highlight in a PDF. The note is named after the PDF and lives in the book notes folder, `Book notes/` by default.

## What's in a book note

At the top is a header. It comes from your template note if you set one (see [Settings](settings.md#book-note-template)). Otherwise it's a `source` property that links to the PDF and a `book-note` tag.

Below it comes one section for every highlight, in reading order. A section holds:

- A `[!quote]` callout with the page number and the quoted text on one flowing line. Line breaks from the PDF become spaces, and a word hyphenated across lines is joined back together.
- An **Open passage** link. Click it to scroll the Reader to the highlight, which pulses once.
- A block ID, so other notes can link to or embed the passage.

The callout takes its highlight's color as a strip and a light tint. Recolor the highlight in the PDF and the quote follows.

Write under a quote as much as you like. A `---` line separates each section from the one before it, unless you've put a heading of your own between them.

## The note belongs to you

Reading Desk only adds and removes sections. It never edits your writing, though deleting a highlight removes the writing in its section.

- A new highlight gets a new section. It goes before the first section from later in the book, or at the end.
- Deleting a highlight removes its section: the quote and what you wrote under it, up to the next section or heading. **Undo** brings both back. To keep sections you wrote in, turn on **Keep writing of deleted highlights** in settings.
- A section whose quote you edited stays when its highlight is deleted.
- Your headings, other text, and sections you've moved are left alone.
- If you delete the whole note, the next highlight creates a new one.

Rename or move the PDF or the note and Reading Desk keeps them paired.

## Open the book note

The note opens as a normal note tab, either in the right sidebar or beside the PDF. You choose which under **Open book notes** in [Settings](settings.md#reader).

- Click the book note button in the Reader header, press **A**, or run **Toggle book note**. Doing it again hides the note.
- Run **Open book note**, or click **Note** on a selection, to open the note and put the cursor in it.
- Right-click the book note button to open the note in the other place, just this once.

The note follows the PDF you're reading. Switch to another PDF and the note tab switches to that PDF's note. Switch to a regular note and the tab stays on the last book note. Until a PDF has its first highlight, the tab shows a short placeholder.

By default, opening a PDF also shows its book note. Turn that off with **Show the book note with PDFs**. After you hide the note yourself, switching PDFs won't bring it back until you toggle it again.

## Links to and from the PDF

Clicking a link to a PDF in any note opens it in Reader at the linked page. If Reader already shows that PDF, it reuses that tab. The note stays open.

**Open passage** links use an `obsidian://reader-plugin` address. Reading Desk handles clicks on these itself, so your operating system never needs to route them back to Obsidian.
