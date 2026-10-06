# Reader Plugin

An Obsidian desktop plugin for a book reading and note-taking workflow. The initial scaffold has two commands to verify plugin loading and access to selected text. Book import, retrieval, MCP tools, and Claude Code integration are future work. The intended workflow is recorded in [Product direction](docs/product-direction.md).

## Development

Requirements: Node.js 22 or newer, pnpm, Obsidian desktop, and Worktrunk for worktrees. This checkout was initialized with pnpm 12.4.1. The lockfile pins the dependencies, and `pnpm-workspace.yaml` permits esbuild's installation script.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev:open
pnpm dev
```

`pnpm build` checks TypeScript, generates the CommonJS `main.js`, and copies `main.js`, `manifest.json`, and `styles.css` into this checkout's development vault. `pnpm dev` watches TypeScript changes and copies each successful build to the same vault. Restart the watcher after editing the build configuration. Changes to only `manifest.json` or `styles.css` need `pnpm dev:setup` to copy them.

The vault lives at `.dev-vault/Reader Plugin Dev - <checkout-directory>/`. On main, the vault name is `Reader Plugin Dev - reader-plugin`. A worktree named `book-search` gets `Reader Plugin Dev - book-search` inside its own checkout. Each vault has an original sample book and reading note. Setup creates missing files and preserves existing notes and settings. To update existing fixture content, edit the note directly or create a fresh disposable vault.

Register each new checkout's vault once with **Open folder as vault** in Obsidian and select the printed vault directory. The main checkout's vault was registered during setup. After registration, the Linux `dev:open` script opens it through an `obsidian://` URI. On another OS, open it through Obsidian's vault manager. If Obsidian asks to trust the development vault, enable community plugins there. Reader Plugin is already listed as enabled in its local config.

In the command palette, run **Reader Plugin: Check development setup**. You should see a notice confirming that the plugin loaded. Open `Books/Sample book.md` in editing mode, select text, and run **Reader Plugin: Inspect reading context** to verify access to the selection.

Obsidian keeps a loaded plugin in memory. After a successful rebuild, reload it by turning it off and on in **Settings → Community plugins**. If the Obsidian CLI is enabled, reload the main checkout's plugin with:

```sh
obsidian vault="Reader Plugin Dev - reader-plugin" plugin:reload id=reader-plugin
obsidian vault="Reader Plugin Dev - reader-plugin" commands filter=reader-plugin
```

Use the worktree's vault name when checking another branch. The plugin makes no model calls at this stage.

## Git worktrees

[Worktrunk setup and workflow](docs/worktrunk.md) follows Bia's branch layout, lifecycle hooks, and commit-preserving merges. A new worktree installs dependencies, builds its own vault, and starts a background watcher. The removal hook stops the watcher, and the merge hook runs the checked build.

## References

The build follows Obsidian's [plugin development guide](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin) and [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). The source stays separate from the disposable vault so each Git worktree can run its own build.
