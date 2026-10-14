# Reader Plugin

An Obsidian desktop plugin for reading EPUB and text PDF source documents, keeping highlights and passage notes, and asking a reading assistant questions. The PDF Reader opens vault PDFs with continuous scrolling, zoom, a table of contents, highlights in configurable colors, and a book note per PDF for writing about each passage. Annotations save automatically to JSON records and generated Markdown notes in the vault. EPUB, local retrieval, and Claude Code and Codex integrations are planned and are not implemented yet.

The [product direction](docs/product-direction.md) summarizes the intended workflow. The [reading workflow plan](docs/reading-workflow-plan.md) records the latest product decisions, architectural choices, and acceptance targets. The workflow plan is not yet an approved implementation plan.

## PDF reading and annotations

Vault PDFs open in Reader by default. Pages scroll continuously; a floating bar at the bottom center shows the page number with previous/next arrows and the zoom controls. Click the zoom percentage for Fit width, Fit page, or a preset, and use the reset button to return to Fit width. Ctrl/Cmd-wheel zooms around the pointer. The view header has a table of contents for PDFs with an outline and a button that shows or hides the PDF's book note, in the right sidebar or beside the PDF as set in settings (right-click it to use the other place once). Reader remembers where you were in each PDF and its zoom, and reopens there.

Select a passage to show a popup at the cursor. Hover a color to preview it on the selection, then click it (or press its number key, 1–9) to highlight. **Note** highlights and opens the PDF's book note at the passage, ready to write. Click anywhere else to clear the selection and close the popup. Turn on highlight mode with the highlighter button in the Reader header to highlight every mouse selection right away; right-click it to choose the color. Single keys work while a Reader is active, such as **H** for highlight mode and **N** for the book note; the [PDF reader guide](docs/pdf-reader.md) lists them. Click any highlight to change its color, write about it in the book note, copy its text, or delete it; deletion offers Undo. The book note, in the sidebar or beside the PDF, shows every highlight's quote, colored like the highlight, with what you wrote under it; **Open passage** jumps back to the highlight.

Highlights save automatically to JSON records, in the hidden `.reader-annotations/` folder by default (out of the file list and search; Git, Syncthing, and cloud folders still sync it, Obsidian Sync doesn't), and to each PDF's book note in `Book notes/`, which is yours to write in. Every edit updates open Reader tabs and book note colors immediately; failed writes retry automatically and are reported only when they fail. Comments from older versions move into the book notes, and the Markdown files those versions generated are retired. Highlights start with a primary and a secondary color. Primary and Secondary always stay first. In plugin settings you can rename and recolor any color, add more colors that you can also reorder and remove, and choose the annotation folder; changing the folder moves existing annotation files. Use **Reader Plugin: Open PDF in Obsidian's normal viewer** from the command palette, or the tab's **⋯** menu, when you need the built-in viewer. The [PDF reader guide](docs/pdf-reader.md) documents the storage schema, rename behavior, and runtime checks.

## Planned reading assistant workflow

The user will ask questions without choosing which passages to send. For a question about a selected passage, the plugin will supply that passage and nearby text. The reading assistant will use document tools to search, read more text, inspect the chapter list, and read highlights and passage notes. Questions about the whole source document will require evidence across chapters. Answers will include citations that open supporting passages. Chapter summaries are an improvement to test later. See the accepted [retrieval workflow](docs/reading-workflow-plan.md#retrieval). These capabilities are not implemented yet.

## Planned assistant integration

The reading assistant will use the user's installed, unmodified Claude Code or Codex CLI, chosen per conversation. Each CLI handles its own sign-in; the plugin will not read credential files or collect subscription credentials. The plugin will own its CLI adapters without a harness library. End-user setup is intended to require Obsidian and the chosen CLI, without a separate Node.js or Git for Windows installation for the plugin.

Claude Code will use a streaming process with the plugin's document tools supplied through a local MCP server and built-in tools limited to optional web research. Codex will normally use app-server with dynamic document tools and `environments: []` to remove shell and file tools. The planned Codex exec fallback uses MCP and delivers complete messages without streaming text. It cannot remove shell and file tools in the same way, so it relies on a read-only sandbox, automatically declined approval requests, ignored user configuration, disabled plugins and apps, and an empty working directory. The setup check will report the active mode and these differences. See [assistant CLI integration](docs/reading-workflow-plan.md#assistant-cli-integration).

Indexing will run locally. Assistant requests send reading context and retrieved passages to the chosen CLI's service; optional web research also uses the network. The first-use embedding model download uses the network. The plugin will launch external CLI processes. These are planned behaviors, not capabilities of the current scaffold.

## Development

Requirements: Node.js 22 or newer, pnpm, and Obsidian desktop. This checkout was initialized with pnpm 12.4.1. The lockfile pins the dependencies, and `pnpm-workspace.yaml` permits esbuild's installation script.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev:open
pnpm dev
```

`pnpm build` checks TypeScript and Svelte components with `svelte-check`, generates the CommonJS `main.js`, and copies `main.js`, `manifest.json`, and `styles.css` into this checkout's development vault. `pnpm dev` watches TypeScript and Svelte changes and copies each successful build to the same vault. Restart the watcher after editing the build configuration. Changes to only `manifest.json` or `styles.css` need `pnpm dev:setup` to copy them.

The plugin's own interface (the highlight popup and the page and zoom toolbar) is written as Svelte 5 components in `src/components/`. They reuse Obsidian's CSS classes and variables from `styles.css`, and `src/components/obsidian.ts` hands their buttons to Obsidian's `setIcon` and `setTooltip`, so they match the app and its themes. Menus, notices, modals, and the settings tab use Obsidian's own APIs directly.

The vault lives at `.dev-vault/Reader Plugin Dev - <checkout-directory>/`. On main, the vault name is `Reader Plugin Dev - reader-plugin`. A checkout in a directory named `book-search` gets `Reader Plugin Dev - book-search`. Each vault has an original sample book and reading note. Setup creates missing files and preserves existing notes and settings. To update existing fixture content, edit the note directly or create a fresh disposable vault.

Register each new checkout's vault once with **Open folder as vault** in Obsidian and select the printed vault directory. The main checkout's vault was registered during setup. After registration, the Linux `dev:open` script opens it through an `obsidian://` URI. On another OS, open it through Obsidian's vault manager. If Obsidian asks to trust the development vault, enable community plugins there. Reader Plugin is already listed as enabled in its local config.

In the command palette, run **Reader Plugin: Check development setup**. You should see a notice confirming that the plugin loaded. Open `Books/Sample book.md` in editing mode, select text, and run **Reader Plugin: Inspect reading context** to verify access to the selection.

Obsidian keeps a loaded plugin in memory. In a development vault, the plugin reloads itself whenever `pnpm build` or `pnpm dev` replaces its files: the build adds a `.dev-reload` marker beside them, and the plugin watches its folder only when that marker is there. Open PDFs stay open at the same page, and your Obsidian window is never raised or focused. The first time, or if a vault has an older build loaded, reload it once by turning it off and on in **Settings → Community plugins**. If the Obsidian CLI is enabled, you can also reload the main checkout's plugin with:

```sh
obsidian vault="Reader Plugin Dev - reader-plugin" plugin:reload id=reader-plugin
obsidian vault="Reader Plugin Dev - reader-plugin" commands filter=reader-plugin
```

Use the matching vault name when checking another checkout. The plugin makes no model calls at this stage. For the PDF workflow, open `Books/Sample reading book.pdf` with **Reader Plugin: Open PDF in Reader** and follow the [runtime verification steps](docs/pdf-reader.md#development-verification). Run `pnpm test` for annotation storage checks.

### Headless checks

`pnpm headless` runs a second, private Obsidian on this checkout's development vault with no window. It never takes focus, so checks can run while you keep working, including in your own Obsidian. It uses the Obsidian you already have installed (set `OBSIDIAN_APP` to its executable or AppImage if it isn't found) and keeps its own app data in `.dev-vault/headless-obsidian/`. In the vault it uses its own configuration folder, `.obsidian-headless/`, first copied from `.obsidian/` without the tab layout, so its tabs and plugin settings never change your Obsidian's. Builds deploy the plugin to both folders. Notes, PDFs and annotations are shared. It shares the newest app update from your everyday install, so both run the same Obsidian version. Commands talk to it over the Chrome DevTools Protocol:

```sh
pnpm headless start                    # launch it; other commands also start it when needed
pnpm headless reload                   # force a reload; builds already reload it
pnpm headless eval 'app.workspace.getActiveFile()?.path'
pnpm headless screenshot /tmp/reader.png
pnpm headless hover '.reader-popup button'   # real pointer input: tooltips and :hover appear
pnpm headless click 300,400
pnpm headless drag 353,177 353,317 --window=Settings   # press, move in steps, release
pnpm headless press Escape
pnpm headless type 'a comment'
pnpm headless stop
```

Add `--window=Settings` to drive the settings window, which Obsidian opens separately. The headless Obsidian and your own Obsidian open the same vault folder. Reader Plugin's settings and reading positions follow each other's changes, but both write the vault's `.obsidian/workspace.json`, so each may pick up the other's last tab layout. Close the development vault in your own Obsidian while headless checks run if that gets in the way.

## Commits

Agents should commit each completed unit of work, such as a verified fix or a finished feature. Commit often, keeping each commit focused so the history clearly records progress.

## Worktrees

Agents do task work in T3 worktrees based on local `main`; see [the worktree workflow](docs/worktrees.md). T3's **Worktree setup** script runs `pnpm worktree:setup`, which installs from the frozen lockfile and builds the checkout's own development vault. Start the **Dev watcher** script (`pnpm dev`) from T3 when you want rebuilds on save. Register each checkout's vault in Obsidian once before using `pnpm dev:open` there.

## References

The build follows Obsidian's [plugin development guide](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin) and [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). The source stays separate from the disposable vault so each checkout can run its own build.
