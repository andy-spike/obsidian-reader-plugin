# Files, sync, and renaming

## What Reading Desk saves

Reading Desk keeps three kinds of data in your vault.

- **Book notes** are ordinary Markdown files in your book notes folder. Everything you write is here.
- **Highlight records** are one JSON file per PDF in the annotation folder, `.reader-annotations/` by default. They hold each highlight's page, position, and color.
- **Reading positions and settings** are in the plugin's own `data.json` file, in `.obsidian/plugins/reading-desk/`.

Edits save automatically. Nothing needs a manual save.

Everything stays on your computer. Reading Desk makes no network requests and sends no telemetry.

## Syncing

Obsidian doesn't index hidden folders, so highlight records stay out of the file list, search, and graph.

- Tools that copy hidden files, such as Git, Syncthing, and cloud folders, carry the records along.
- Obsidian Sync skips hidden folders. If you use it, set **Annotation folder** in [Settings](settings.md#annotation-folder) to a visible folder, such as `Reading/Annotations`.

## Renaming and moving PDFs

Rename or move a PDF inside Obsidian and its highlights, book note, reading position, and page colors follow it. The same holds for the book note.

If you move a PDF outside Obsidian, Reading Desk finds it again by its contents, as long as nothing else is at the old path.

Two identical copies of a PDF at different paths are tracked as separate books, each with its own highlights.

## Replacing a PDF

If you put a different edition of a PDF at the same path, Reading Desk refuses to apply the old highlights to it, since their positions no longer match. Restore the original file, or save the new edition at a different path.

## When saving fails

If Reading Desk can't write to your vault, a notice says so once, and the book note sidebar shows that saving is retrying. It retries every two seconds. Another notice tells you when saving works again. Your edits stay in memory while Obsidian is running, so keep it open until the second notice appears.

## Editing highlight records by hand

Don't edit a record while its PDF is open. Reading Desk won't merge outside changes into the copy it holds in memory. Close the PDF and reload the plugin first. Records that are damaged or from a newer version are left untouched and reported, never overwritten. The file format is described in [Annotation records](../contributing/annotation-records.md).

## Updating from older versions

Reading Desk migrates old data the first time it needs to. You don't need to do anything.

- **Comments.** Older versions kept comments inside the highlight record and generated a separate `.md` export. Now comments are added under their quotes in the book note. Reading Desk clears them from the record only after it reads the note back and finds them there. It then moves the old export file to the trash, following your Obsidian trash setting. If another note links to that file, it stays and a notice tells you.
- **Annotation folder.** Older versions kept records in a visible `Reader annotations/` folder. If your setting still names it, the records move to the hidden folder once, and the old folder is removed when empty.
- **Colors.** Settings from version 0.1, which stored four fixed colors, load as those four colors, with yellow and blue first.
- **Book notes.** Notes from earlier versions get `---` separators and single-line quotes the next time they sync, and their old `PDF` link is removed.
