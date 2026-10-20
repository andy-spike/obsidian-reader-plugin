## Writing

Explain concepts and changes thoroughly.

## Code readability

Prioritize readable code over compact code. Use descriptive names and straightforward control flow. Keep comments concise and focused on intent, constraints, or non-obvious behavior. Clarify confusing code when working nearby, while preserving behavior and keeping changes focused.

## Tests

Do not create tests unless the user explicitly requests them. Validate changes with the build and relevant runtime checks.

## Worktrees

Prepare and publish releases directly on `main` in the main checkout. Read the release verification section in `contributing/development.md` before making a release. For other implementation tasks, use a T3 worktree. Read `contributing/worktrees.md` before creating one. Check `t3_worktree_status` first; if the session is already attached to a worktree, continue there. Otherwise call `t3_worktree_handoff` with a unique branch, `baseRef: "main"`, `startFromOrigin: false`, and a continuation prompt. For a separately requested thread, use `t3_thread_launch` with a `worktree` workspace strategy. T3 must own the workspace binding; shell-created worktrees or changing directory do not update it. Run `pnpm worktree:setup` in the worktree and require success before editing.

When the task is complete, run `pnpm build` and commit only the task's changes with messages you write yourself. Merge into `main` or open a pull request only when the user asks.

## Development vaults

Use each checkout's generated `.dev-vault/` for runtime checks. It is disposable and excluded from Git. Keep reusable fixture changes in `scripts/dev-vault.mjs`; keep personal books and credentials outside this project. Read `contributing/development.md` for build, reload, and runtime verification commands. Do runtime checks with `pnpm headless`, never by opening, focusing, or driving the user's Obsidian; it runs a windowless Obsidian that does not take focus.

## Product direction

Read `contributing/product-direction.md` before implementing book retrieval or AI integration. Authentication belongs to the user's unmodified local CLI. The plugin must not collect subscription tokens.
