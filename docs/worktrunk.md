# Worktrunk setup

This project follows the Worktrunk workflow in `~/code/bia-project`. `main` lives in the repo root; branch worktrees live in `.worktrees/<branch>`. Merges preserve every branch commit. The app-specific hooks create isolated Obsidian development vaults instead of Bia's Convex deployments.

## One-time setup

Worktrunk is already installed on this machine. For another machine, install it and its shell integration:

```sh
cargo install worktrunk
wt config shell install
```

Add the following project override to `~/.config/worktrunk/config.toml`. This local repository has no remote yet, so Worktrunk uses its absolute path as the identifier:

```toml
[projects."/home/andy-spike/code/reader-plugin"]
worktree-path = "{{ repo_path }}/.worktrees/{{ branch | sanitize }}"
merge.squash = false
```

Run `wt config show` inside your checkout to find its identifier. When a remote is added, configure the new identifier, such as `github.com/<owner>/<repo>`, with the same settings. Worktrunk reads path and merge settings from user config; `.config/wt.toml` holds the shared hooks.

## Workflow

Keep the session in the repo root, including when merging or removing a branch. Use directory options to run commands in a worktree.

```sh
wt list
wt switch --create book-search --no-cd
git -C .worktrees/book-search status
pnpm --dir .worktrees/book-search dev:open
# Make changes under .worktrees/book-search, then commit them.
git -C .worktrees/book-search add src
git -C .worktrees/book-search commit -m "feat: add book search"
wt -C .worktrees/book-search merge
```

Creation runs the blocking `pre-start` pipeline: frozen-lockfile install, then the checked production build that seeds and populates this worktree's vault. `post-start` runs the watcher in the background. Worktrunk records its output in the hook log:

```sh
wt config state logs
```

The watcher has its own process group, recorded under the primary checkout's `.worktrees/.dev-servers/`. `pre-remove` stops it before `wt remove` or `wt merge` removes the checkout. Open vaults should be closed before deleting their checkout. Any notes created only in that disposable vault disappear with it; copy useful fixtures into tracked source before removal.

`pre-merge` runs `pnpm build`, including TypeScript checks and compilation. Fix failing checks in the branch. Worktrunk rebases and fast-forwards onto main, preserves commits, and removes the worktree and branch. After a merge, run `pnpm build` in main to refresh main's vault. Use `wt remove <branch>` to discard a worktree.

Worktrunk asks for approval of project hook commands when first used. The hooks only install local dependencies, build, deploy into the generated vault, and manage the local watcher. They neither authenticate nor make AI requests.

## Watcher restarts and setup failures

The creation hook already starts the watcher. To restart it from the primary checkout:

```sh
node scripts/worktree-dev-server.mjs stop "$PWD/.worktrees/book-search" "$PWD"
wt -C .worktrees/book-search hook post-start
```

If blocking setup fails, the checkout remains available. Retry setup before starting the watcher:

```sh
wt -C .worktrees/book-search hook pre-start --foreground
wt -C .worktrees/book-search hook post-start
```

Each checkout's vault, installed dependencies, and builds are ignored by Git. The `copy-ignored` exclusions prevent development vaults and nested worktrees from being copied into another branch. Fixture creation preserves existing files, and repeated setup can be run safely.
