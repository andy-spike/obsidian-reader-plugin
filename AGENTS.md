## Writing

Explain concepts and changes thoroughly.

## Worktrees

Do implementation tasks in a T3 worktree, never in the main checkout. Read `docs/worktrees.md` before creating one. Check `t3_worktree_status` first; if the session is already attached to a worktree, continue there. Otherwise call `t3_worktree_handoff` with a unique branch, `baseRef: "main"`, `startFromOrigin: false`, and a continuation prompt. For a separately requested thread, use `t3_thread_launch` with a `worktree` workspace strategy. T3 must own the workspace binding; shell-created worktrees or changing directory do not update it. Run `pnpm worktree:setup` in the worktree and require success before editing.

When the task is complete, run `pnpm build` and `pnpm test`, and commit only the task's changes with messages you write yourself. Merge into `main` or open a pull request only when the user asks.

## Development vaults

Use each checkout's generated `.dev-vault/` for runtime checks. It is disposable and excluded from Git. Keep reusable fixture changes in `scripts/dev-vault.mjs`; keep personal books and credentials outside this project. Read `README.md` for build, reload, and runtime verification commands.

## Product direction

Read `docs/product-direction.md` before implementing book retrieval or AI integration. Authentication belongs to the user's unmodified local CLI. The plugin must not collect subscription tokens.
