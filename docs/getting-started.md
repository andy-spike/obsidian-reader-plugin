# Getting started

Reading Desk turns Obsidian into a PDF reader. You highlight passages and write about them in an ordinary Markdown note, called a book note, that lives in your vault.

It works on Obsidian desktop 1.14.4 or newer. It does not run on mobile.

## Install

### Option 1. Obsidian plugin directory (recommended)

1. Open **Settings → Community plugins**.
2. Select **Turn on community plugins** if it isn't already on. Obsidian calls the off state Restricted Mode.
3. Select **Browse** and search for **Reading Desk**.
4. Select **Install**, then **Enable**.

Obsidian updates directory plugins for you when a new version is released.

### Option 2. Manual install

Use this if you can't reach the plugin directory or want a specific release.

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/andy-spike/obsidian-reader-plugin/releases/latest).
2. In your vault, open the `.obsidian/plugins/` folder. The `.obsidian` folder is hidden. To open the plugins folder without hunting for it, go to **Settings → Community plugins** and click the folder icon next to **Installed plugins**.
3. Create a folder named `reading-desk` inside `plugins` and put the three files in it.
4. Restart Obsidian, or reload the plugin list.
5. Open **Settings → Community plugins**, turn on community plugins if needed, and switch on **Reading Desk** under **Installed plugins**.

Obsidian doesn't update manually installed plugins. To update, download the new release and replace the three files.

## Open a PDF

Click any PDF in your vault. Reading Desk opens it in its own reader, whether you click it in the file explorer, follow a link to it, or restore a tab that held one.

You can also run **Open PDF in Reader** from the command palette. If a PDF is already active, it opens that one. Otherwise you pick from a list of the PDFs in your vault.

To use Obsidian's built-in viewer for one PDF, right-click the file and choose **Open in Obsidian's normal PDF viewer**. You can also run **Open PDF in Obsidian's normal viewer** from the command palette, or use the same item in the tab's **⋯** menu. That tab keeps the built-in viewer. The next PDF you open still goes to Reader, and Obsidian forgets the choice when it restarts. PDFs embedded in a Markdown note always use Obsidian's own rendering.

## Your first highlight

1. Select a sentence with the mouse. A small popup appears next to it.
2. Click a color swatch. The passage is highlighted and saved.
3. Click **Note** instead to highlight and start writing. Reader opens the book note at a new section for that passage, with the cursor ready.

From here, read on:

- [Reading PDFs](reading-pdfs.md) covers scrolling, zoom, the table of contents, and how Reader remembers your place.
- [Highlights](highlights.md) covers colors, highlight mode, and editing or deleting a highlight.
- [Book notes](book-notes.md) covers what the note contains and how to write in it.
- [Settings](settings.md) covers colors, folders, and templates.
- [Keyboard shortcuts and commands](shortcuts.md) lists every key and command.
- [Files, sync, and renaming](files-and-sync.md) explains where your data lives.
