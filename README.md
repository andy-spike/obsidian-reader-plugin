# Reading Desk

Read PDFs in Obsidian, highlight passages, and write about them in Markdown notes that live in your vault.

Reading Desk is an Obsidian desktop plugin. It replaces the built-in PDF viewer with a continuous-scroll reader. Every PDF gets a book note, an ordinary Markdown note with a quote for each highlight and room to write under it.

## What you can do

- Read PDFs in one continuous scroll, with zoom, a table of contents, and page controls.
- Pick up where you left off. Reading Desk remembers your page and zoom for each PDF.
- Highlight text in colors you choose, one click per highlight or in highlight mode.
- Write about a passage in the book note, under its quote. Click **Open passage** to jump back to it in the PDF.
- Copy highlighted text, recolor highlights, and delete them with Undo.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/andy-spike/obsidian-reader-plugin/releases/latest).
2. Put them in `.obsidian/plugins/reading-desk/` inside your vault.
3. In Obsidian, open **Settings → Community plugins** and enable **Reading Desk**.

It needs Obsidian desktop 1.14.4 or newer. It does not run on mobile.

## Quick start

1. Click a PDF in your vault. It opens in Reading Desk.
2. Select a passage and click a color to highlight it.
3. Click **Note** in the popup to highlight and start writing in the book note.

## Guides

| Guide | What it covers |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, open a PDF, make a first highlight |
| [Reading PDFs](docs/reading-pdfs.md) | Scrolling, zoom, table of contents, saved position |
| [Highlights](docs/highlights.md) | Colors, highlight mode, editing, deleting |
| [Book notes](docs/book-notes.md) | What the note holds and how to use it |
| [Settings](docs/settings.md) | Palette, folders, templates |
| [Keyboard shortcuts and commands](docs/shortcuts.md) | Every key and command |
| [Files, sync, and renaming](docs/files-and-sync.md) | Where your data lives and how to sync it |

## Privacy

Reading Desk keeps everything in your vault and makes no network requests or telemetry calls.

It lists your vault's PDFs for the document picker and Markdown note paths for template suggestions. It reads PDFs and templates, saves highlight records, and updates book notes. When it retires an older annotation export, it reads Markdown notes to check for links before moving that export to the trash.

The Copy button writes the selected passage to the system clipboard. Reading Desk never reads the clipboard.

## Roadmap

- [ ] EPUB support
- [ ] An AI reading assistant that answers questions about your books, using an API key or an existing subscription

## Contributing

You need Node.js 22 or newer, pnpm, and Obsidian desktop.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

The [development guide](contributing/development.md) covers the development vault, watch mode, headless checks, architecture, and releases. Other contributor pages sit in [`contributing/`](contributing/).

## License

Reading Desk is licensed under the [MIT license](LICENSE).

It bundles [PDF.js](https://github.com/mozilla/pdf.js) (Apache 2.0), PDF.js's OpenJPEG, JBIG2, and qcms image and color decoders (BSD, Apache 2.0, and MIT), and [Svelte](https://github.com/sveltejs/svelte) (MIT). The [license texts and notices](licenses/README.md) are also embedded in the generated `main.js`, so they travel with the installed plugin.
