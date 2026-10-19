# Book notes

Each PDF gets a book note, an ordinary Markdown note you own. Each highlight also gets a quote note, a small note of its own that holds the quote and your comment about it. Reading Desk creates both with your first highlight in a PDF. The book note is named after the PDF and lives in the book notes folder, `Book notes/` by default. The quote notes go in a folder beside it with the same name.

```
Book notes/
  Thinking, Fast and Slow.md               ← the book note: every quote, in reading order
  Thinking, Fast and Slow/
    The quoted passage, first words….md    ← one quote note per highlight
```

## Write about a passage in the sidebar

The book note tab in the right sidebar lists your highlights in reading order. Each shows its page, the quote marked in its highlight's color, and your comment below it.

- Click **Add comment** and type. What you type saves to the passage's quote note as you go. Press Enter to finish, or Shift+Enter for a new line. Escape or clicking elsewhere also finishes.
- A saved comment shows as formatted Markdown. Click it to edit it again. Links in it work like links in any note.
- **Comment** above a saved comment folds it away or shows it again.
- Click a quote to scroll the Reader to its highlight, which pulses once.
- **Open the quote note** (the arrow icon) opens the quote note in a tab.
- The note button at the top opens the whole book note beside the PDF.

Because each comment lives in its passage's own note, it always stays with its quote. Linking to the quote note, embedding it, or finding it in search brings the quote and your comment together.

## What's in a quote note

```markdown
---
source: "[[Books/Thinking, Fast and Slow.pdf]]"
page: 34
document: 0b9c…
annotation: e66da097-…
tags: [quote-note]
---
> [!quote] p. 34 · [Open passage](obsidian://reader-plugin?…)
> The quoted passage, as one flowing line.

Your comment: everything below the quote.
```

Reading Desk writes the properties and the quote. Everything below the quote is your comment, and you can also write it in the note itself. The sidebar and the quote note always show the same text.

Reading Desk finds a quote note by the `annotation` property, not by its name. Rename it or move it anywhere in your vault and it stays connected. The name is the start of the quote, cut at a word after about 80 characters. If two quotes would get the same name, the second gets part of its highlight ID, like `Same words (e66da097)`.

## What's in a book note

At the top is a header. It comes from your template note if you set one (see [Settings](settings.md#book-note-template)). Otherwise it's a `source` property that links to the PDF and a `book-note` tag.

Below it comes one section for every highlight, in reading order. A section holds:

- A `[!quote]` callout with the page number and the quoted text on one flowing line. Line breaks from the PDF become spaces, and a word hyphenated across lines is joined back together.
- The quote links to its quote note and shows the full quote as the link text, like `[[Book notes/Book/The quoted passage|The quoted passage]]`. A passage containing `[`, `]`, or `|` stays plain, because a link can't show those characters.
- An **Open passage** link. Click it to scroll the Reader to the highlight, which pulses once.

The callout takes its highlight's color as a strip and a light tint. Recolor the highlight in the PDF and the quote follows.

You can also write under a quote in the book note itself. A `---` line separates each section from the one before it, unless you've put a heading of your own between them.

## The note belongs to you

Reading Desk only adds and removes sections. It never edits your writing, though deleting a highlight removes the writing in its section.

- A new highlight gets a new section. It goes before the first section from later in the book, or at the end.
- Deleting a highlight removes its section: the quote and what you wrote under it, up to the next section or heading. Its quote note goes to the trash, following your Obsidian trash setting. **Undo** brings back the section, the quote note, and your comment. To keep what you wrote, turn on **Keep writing of deleted highlights** in settings. Quote notes with a comment then stay, and so do sections you wrote under.
- A section whose quote you edited stays when its highlight is deleted.
- Your headings, other text, and sections you've moved are left alone.
- If you delete the whole note, the next highlight creates a new one.

Rename or move the PDF or the note and Reading Desk keeps them paired.

## Open the book note

The book note opens either as the cards in the right sidebar or as a normal note tab beside the PDF. You choose which under **Open book notes** in [Settings](settings.md#reader).

- Click the book note button in the Reader header, press **A**, or run **Toggle book note**. Doing it again hides the note.
- Click **Note** on a selection or a highlight to start writing about that passage. In the sidebar, its card opens with the cursor in the comment. Beside the PDF, the cursor goes under its quote.
- Right-click the book note button to open the note in the other place, just this once.

The note follows the PDF you're reading. Switch to another PDF and the tab switches to that PDF's cards or note. Switch to a regular note and the tab stays on the last book note. Until a PDF has its first highlight, the tab shows a short placeholder.

By default, opening a PDF also shows its book note. Turn that off with **Show the book note with PDFs**. After you hide the note yourself, switching PDFs won't bring it back until you toggle it again.

## Links to and from the PDF

Clicking a link to a PDF in any note opens it in Reader at the linked page. If Reader already shows that PDF, it reuses that tab. The note stays open.

**Open passage** links use an `obsidian://reader-plugin` address. Reading Desk handles clicks on these itself, so your operating system never needs to route them back to Obsidian.
