## Writing

Explain concepts and changes thoroughly in clear English.

## Worktrees

Work on `main` in the repo root by default. When the user requests a worktree, create it through T3 Code, using `t3_thread_launch` with a `worktree` workspace strategy, and make every edit for that task in that worktree. Do not run `git worktree add` yourself; T3 would not bind the thread to it or run the project's setup script. Push `main` before creating a worktree, because new worktrees start from `origin/main`.

## Development vaults

Use each checkout's generated `.dev-vault/` for runtime checks. It is disposable and excluded from Git. Keep reusable fixture changes in `scripts/dev-vault.mjs`; keep personal books and credentials outside this project. Read `README.md` for build, reload, and runtime verification commands.

## Product direction

Read `docs/product-direction.md` before implementing book retrieval or AI integration. Authentication belongs to the user's unmodified local CLI. The plugin must not collect subscription tokens.
