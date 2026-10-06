## Writing

Explain concepts and changes thoroughly in clear English.

## Worktrees

Use Worktrunk (`wt`) for every worktree operation. Work on `main` in the repo root by default; when the user requests a worktree, make every edit for that task in the worktree. Read `docs/worktrunk.md` before creating, merging, removing, or troubleshooting one.

Keep the session rooted in the primary checkout. Point commands and file tools at `.worktrees/<branch>` with directory flags, working-directory options, or absolute paths. Run `wt list` before creating a branch. Preserve branch commits when merging and pass the configured checks.

## Development vaults

Use each checkout's generated `.dev-vault/` for runtime checks. It is disposable and excluded from Git. Keep reusable fixture changes in `scripts/dev-vault.mjs`; keep personal books and credentials outside this project. Read `README.md` for build, reload, and runtime verification commands.

## Product direction

Read `docs/product-direction.md` before implementing book retrieval or AI integration. Authentication belongs to the user's unmodified local CLI. The plugin must not collect subscription tokens.
