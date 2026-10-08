# Reader Plugin

An Obsidian desktop plugin for a book reading and note-taking workflow. The initial scaffold has two commands to verify plugin loading and access to selected text. Book import, retrieval, MCP tools, and Claude Code integration are future work. The intended workflow is recorded in [Product direction](docs/product-direction.md).

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

Use the matching vault name when checking another checkout. The plugin makes no model calls at this stage.

## Commits

Agents should commit each completed unit of work, such as a verified fix or a finished feature. Commit often, keeping each commit focused so the history clearly records progress.

## Worktrees

Worktrees are created through T3 Code. When T3 creates a worktree for this project, it runs the project's **Worktree setup** script (`pnpm install --frozen-lockfile && pnpm build`), which installs dependencies and builds the worktree's own development vault. Start the **Dev watcher** script (`pnpm dev`) from T3 when you want rebuilds on save. Register the worktree's vault in Obsidian once before using `pnpm dev:open` there. New worktrees start from `origin/main`, so push `main` first.

## References

The build follows Obsidian's [plugin development guide](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin) and [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). The source stays separate from the disposable vault so each checkout can run its own build.
