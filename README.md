# Reader Plugin

An Obsidian desktop plugin for reading EPUB and text PDF source documents, keeping highlights and passage notes, and asking a reading assistant questions. The PDF Reader opens vault PDFs with page navigation, zoom, text selection, highlights, and passage comments. Annotations save automatically to JSON records and generated Markdown notes in the vault. EPUB, local retrieval, and Claude Code and Codex integrations are planned and are not implemented yet.

The [product direction](docs/product-direction.md) summarizes the intended workflow. The [reading workflow plan](docs/reading-workflow-plan.md) records the latest product decisions, architectural choices, and acceptance targets. The workflow plan is not yet an approved implementation plan.

## PDF reading and annotations

Run **Reader Plugin: Open PDF in Reader**, or right-click a vault PDF and choose **Open in Reader**. Select a passage, choose its highlight color, and click **Highlight** or **Highlight + comment**. The annotations panel lets you edit comments, jump to pages, delete highlights, and undo the latest deletion. Changes save automatically; **Save annotations** retries a failed save.

Records and searchable Markdown exports live in `Reader annotations/`. Edit comments in the Reader panel and keep your own freeform writing in separate notes. The [PDF reader guide](docs/pdf-reader.md) documents the storage schema, rename behavior, limitations, and runtime checks. Plugin settings let you name each highlight color's meaning.

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

`pnpm build` checks TypeScript, generates the CommonJS `main.js`, and copies `main.js`, `manifest.json`, and `styles.css` into this checkout's development vault. `pnpm dev` watches TypeScript changes and copies each successful build to the same vault. Restart the watcher after editing the build configuration. Changes to only `manifest.json` or `styles.css` need `pnpm dev:setup` to copy them.

The vault lives at `.dev-vault/Reader Plugin Dev - <checkout-directory>/`. On main, the vault name is `Reader Plugin Dev - reader-plugin`. A checkout in a directory named `book-search` gets `Reader Plugin Dev - book-search`. Each vault has an original sample book and reading note. Setup creates missing files and preserves existing notes and settings. To update existing fixture content, edit the note directly or create a fresh disposable vault.

Register each new checkout's vault once with **Open folder as vault** in Obsidian and select the printed vault directory. The main checkout's vault was registered during setup. After registration, the Linux `dev:open` script opens it through an `obsidian://` URI. On another OS, open it through Obsidian's vault manager. If Obsidian asks to trust the development vault, enable community plugins there. Reader Plugin is already listed as enabled in its local config.

In the command palette, run **Reader Plugin: Check development setup**. You should see a notice confirming that the plugin loaded. Open `Books/Sample book.md` in editing mode, select text, and run **Reader Plugin: Inspect reading context** to verify access to the selection.

Obsidian keeps a loaded plugin in memory. After a successful rebuild, reload it by turning it off and on in **Settings → Community plugins**. If the Obsidian CLI is enabled, reload the main checkout's plugin with:

```sh
obsidian vault="Reader Plugin Dev - reader-plugin" plugin:reload id=reader-plugin
obsidian vault="Reader Plugin Dev - reader-plugin" commands filter=reader-plugin
```

Use the matching vault name when checking another checkout. The plugin makes no model calls at this stage. For the PDF workflow, open `Books/Sample reading book.pdf` with **Reader Plugin: Open PDF in Reader** and follow the [runtime verification steps](docs/pdf-reader.md#development-verification). Run `pnpm test` for annotation storage checks.

## Commits

Agents should commit each completed unit of work, such as a verified fix or a finished feature. Commit often, keeping each commit focused so the history clearly records progress.

## Worktrees

Task worktrees live under `.wortrees/` inside the main checkout. Agents start in the root, move into a task worktree based on local `main`, and merge completed work back with Worktrunk. Each merge preserves individual commits. After verification succeeds and the worker finishes, remove its checkout from the root. Keep the merged branch unless branch deletion is requested, and retain checkouts with failed checks or pending work. See [the worktree workflow](docs/worktrees.md) for T3 session handoff, terminal commands, machine configuration, merge checks, and cleanup.

T3's **Worktree setup** script runs `pnpm worktree:setup`, which invokes the shared Worktrunk setup hooks. They copy only `node_modules`, install from the frozen lockfile, and build the checkout's own development vault. Worktrunk runs the same hooks automatically when it creates a worktree. Start the **Dev watcher** script (`pnpm dev`) from T3 when you want rebuilds on save. Register each checkout's vault in Obsidian once before using `pnpm dev:open` there.

## References

The build follows Obsidian's [plugin development guide](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin) and [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). The source stays separate from the disposable vault so each checkout can run its own build.
