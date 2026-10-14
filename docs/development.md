# Development

This page covers building, running, and testing the plugin. The [README](../README.md) gives the overview.

Requirements: Node.js 22 or newer, pnpm, and Obsidian desktop. This checkout was initialized with pnpm 12.4.1. The lockfile pins the dependencies. `pnpm-workspace.yaml` permits esbuild's installation script.

## Build and watch

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev:open
pnpm dev
```

`pnpm build` checks TypeScript and Svelte components with `svelte-check`. It then generates the CommonJS `main.js` and copies `main.js`, `manifest.json`, and `styles.css` into this checkout's development vault. `pnpm dev` watches TypeScript and Svelte changes and copies each successful build to the same vault. Restart the watcher after you edit the build configuration. Changes to only `manifest.json` or `styles.css` need `pnpm dev:setup` to copy them.

## Interface

The plugin's own interface, including the highlight popup and the page and zoom toolbar, is written as Svelte 5 components in `src/components/`. They reuse Obsidian's CSS classes and variables from `styles.css`. `src/components/obsidian.ts` passes their buttons to Obsidian's `setIcon` and `setTooltip`, so they match the app and its themes. Menus, notices, modals, and the settings tab use Obsidian's own APIs directly.

## Development vault

The vault lives at `.dev-vault/Reader Plugin Dev - <checkout-directory>/`. On main, the vault name is `Reader Plugin Dev - reader-plugin`. A checkout in a directory named `book-search` gets `Reader Plugin Dev - book-search`. Each vault has an original sample book and a reading note. Setup creates missing files and preserves existing notes and settings. To update existing fixture content, edit the note directly or create a fresh disposable vault.

Run `npm run dev:open` or `pnpm dev:open` from the checkout you want to test. The command prepares that checkout's vault and opens it in Obsidian using its absolute vault path. It uses the system URI opener on Linux, macOS, and Windows. If Obsidian asks to trust the development vault, enable community plugins there. Reader Plugin is already listed as enabled in its local config.

Setup also copies `Books/AI Engineering.pdf` from the main checkout's development vault into each worktree's vault. Git's common directory locates the main checkout, so this works with T3's worktree paths. The PDF stays outside Git. Each worktree receives an independent copy, and repeated setup preserves any existing copy. If the source is missing, setup prints its expected path and continues with the sample book. Put the PDF there and rerun `pnpm dev:setup` to copy it.

Edit plugin source in the worktree and run `pnpm dev` to deploy rebuilds into its vault. Books, annotations, settings, and reading state belong to that vault. They are ignored by Git and do not merge back to main; commit reusable fixtures in `scripts/dev-vault.mjs` and plugin changes in the source. Keep a worktree if you want to keep its local reading data.

## Checking the setup

In the command palette, run **Reader Plugin: Check development setup**. You should see a notice confirming that the plugin loaded. Open `Books/Sample book.md` in editing mode, select text, and run **Reader Plugin: Inspect reading context** to verify access to the selection.

The plugin makes no model calls at this stage. For the PDF workflow, open `Books/Sample reading book.pdf` with **Reader Plugin: Open PDF in Reader**, and follow the [runtime verification steps](pdf-reader.md#development-verification). Run `pnpm test` for annotation storage checks.

## Reloading

Obsidian keeps a loaded plugin in memory. In a development vault, the plugin reloads itself whenever `pnpm build` or `pnpm dev` replaces its files. The build adds a `.dev-reload` marker beside them, and the plugin watches its folder only while that marker exists. Open PDFs stay open at the same page. Your Obsidian window is never raised or focused.

The first time, or when a vault has an older build loaded, reload the plugin once by turning it off and on in **Settings → Community plugins**. If the Obsidian CLI is enabled, you can also reload the main checkout's plugin with:

```sh
obsidian vault="Reader Plugin Dev - reader-plugin" plugin:reload id=reader-plugin
obsidian vault="Reader Plugin Dev - reader-plugin" commands filter=reader-plugin
```

Use the matching vault name when you check another checkout.

## Headless checks

`pnpm headless` runs a second, private Obsidian on this checkout's development vault, with no window. It never takes focus, so checks can run while you keep working, including in your own Obsidian. It uses the Obsidian you already have installed. If the launcher cannot find it, set `OBSIDIAN_APP` to the Obsidian executable or AppImage. The headless instance keeps its own app data in `.dev-vault/headless-obsidian/`.

In the vault, it uses its own configuration folder, `.obsidian-headless/`. That folder starts as a copy of `.obsidian/` without the tab layout. Its tabs and plugin settings therefore never change your Obsidian's. Builds deploy the plugin to both folders. Notes, PDFs, and annotations are shared. It takes the newest app update from your everyday install, so both run the same Obsidian version. Commands talk to it over the Chrome DevTools Protocol:

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

Add `--window=Settings` to drive the settings window, which Obsidian opens separately. The headless Obsidian and your own Obsidian open the same vault folder. Reader Plugin's settings and reading positions follow each other's changes. Both write the vault's `.obsidian/workspace.json`, so each may pick up the other's last tab layout. If that gets in the way, close the development vault in your own Obsidian while headless checks run.

## Architecture and tests

Three modules keep reading workflow rules out of plugin startup:

- `BookNoteReconciler` in `src/book-note.ts` owns complete note reconciliation, including reading order, legacy formatting, and the rules that preserve writing and edited quotes. Its low-level text edits are internal. `BookNotes` handles vault writes and confirms migrated comments only after reading the note back from disk.
- `BookNoteFollowing` in `src/book-note-following.ts` owns the active PDF, dismissal, and serialized opening of book notes. `ObsidianBookNoteWorkspace` supplies tab and focus operations. Tests use an in-memory workspace adapter to exercise complete event sequences.
- `SavedReadingState` in `src/reading-state.ts` owns the shared settings and reading-position file. It handles debounce, serialized snapshots, external reloads, renames, eviction, retries, and the final flush on unloading. Pending positions remain local until their write succeeds. External changes received during a write trigger a fresh snapshot after it finishes.

Tests exercise these modules through the same interfaces their callers use. `pnpm test` covers preservation, migration durability, tab transitions, and delayed or failed writes. Keep layout, deferred-tab, and actual focus checks in the headless development vault. An in-memory adapter cannot verify Obsidian's rendering and window behavior.

## Commits

Agents should commit each completed unit of work, such as a verified fix or a finished feature. Commit often, and keep each commit focused so the history shows progress clearly.

## Worktrees

Agents do task work in T3 worktrees based on local `main`. See [the worktree workflow](worktrees.md). T3's **Worktree setup** script runs `pnpm worktree:setup`. It installs from the frozen lockfile and builds the checkout's own development vault. Start the **Dev watcher** script (`pnpm dev`) from T3 when you want rebuilds on save. Run `npm run dev:open` from that checkout to open its vault.

## References

The build follows Obsidian's [plugin development guide](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin) and [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). The source stays separate from the disposable vault, so each checkout can run its own build.
