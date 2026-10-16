# Settings

Open **Settings → Reading Desk**.

## Reader

**Show the book note with PDFs.** When on, opening a PDF in Reader also opens its book note. When off, open the note with the book note button, the **A** key, or **Toggle book note**.

**Open book notes.** Where the book note opens, either **In the right sidebar** or **Beside the PDF**. This applies to the book note button, the **A** and **N** keys, and **Note**. Right-click the book note button to open the note in the other place once.

**PDF page colors.** How Reader colors PDF pages:

- **Always original colors** shows each PDF as it is, usually dark text on white paper.
- **Follow Obsidian's color scheme** shows dark pages while Obsidian uses a dark theme, and original colors in a light theme. Open PDFs change as soon as you switch themes. This is the default.
- **Always dark pages** shows dark pages in every theme.

Each PDF can have its own choice. See [Page colors](reading-pdfs.md#page-colors).

## Highlight colors

The palette starts with two colors.

- **Primary** (yellow) and **Secondary** (blue) always come first. You can rename and recolor them. You can't move or remove them, so their rows show a lock instead of a drag handle.
- Colors you add come after them. You can rename, recolor, and remove these, and reorder them among themselves. Drag the handle at the start of a row, or use the up and down arrow buttons. A focused handle also moves with the arrow keys, and Escape cancels a drag.

Use **Add highlight color** to add one. Color names appear in the sidebar and in your book notes.

Renaming or recoloring a color updates the highlights that use it. Highlights in a removed color turn gray until you give them another color.

## Book notes folder

Where new book notes are created. The default is `Book notes/`. Notes that already exist stay where they are.

## Book note template

A note whose text starts each new book note. Enter its path, for example `Templates/Book note.md`. Reading Desk fills in these placeholders:

- `{{title}}` is the PDF's file name without ".pdf".
- `{{source}}` is a link to the PDF, like `[[Book.pdf]]`.
- `{{date}}` is today's date.

Reading Desk also adds a `source` property to the note if your template doesn't set one. Leave the field empty to use the default header, a `source` property that links to the PDF and a `book-note` tag.

## Annotation folder

Where Reading Desk saves highlight positions and colors as JSON. The default is the hidden `.reader-annotations/` folder, which stays out of the file list, search, and graph.

Obsidian Sync skips hidden folders. If you use it, choose a visible folder here. See [Files, sync, and renaming](files-and-sync.md).

Changing the folder moves your existing records to the new one. Other files in the old folder stay, and Reading Desk removes the old folder only if it's empty.

## Using more than one window or device

If another Obsidian window on the same vault, or Obsidian Sync, changes the plugin's data file, your open windows pick up the new settings and reading positions. They don't overwrite them later.
