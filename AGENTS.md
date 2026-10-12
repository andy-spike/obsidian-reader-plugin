## Writing

Explain concepts and changes thoroughly.

## Worktrees

Start sessions in the project root. Before editing files for an implementation task, create a task worktree under the root's `.wortrees/` directory and make all task edits there. Read `docs/worktrees.md` before creating or merging a worktree. Repository workflow setup can be performed in the root.

In T3 Code, use `t3_worktree_status` and then `t3_worktree_handoff` to move the current session into its worktree, with an explicit path, `baseRef: "main"`, `startFromOrigin: false`, and a continuation prompt. For a separately requested thread, use `t3_thread_launch` with a `worktree` workspace strategy. T3 must own the workspace binding; shell creation or changing directory does not update it. Outside T3, use `wt switch --create <branch> --base main`. Wait for the shared setup hooks to succeed before editing.

When the task is complete, validate it, commit only its changes with messages you write yourself, and run `wt merge main --no-squash --no-remove --no-commit` from the task worktree. Keep validation hooks enabled. Resolve conflicts or failed checks before reporting success. Verify that `main` contains the resulting task commits and rebuild the root's development vault. Preserve the task branch and checkout for manual cleanup unless the user requests removal. The current T3 session remains bound to the retained worktree after merging.

## Development vaults

Use each checkout's generated `.dev-vault/` for runtime checks. It is disposable and excluded from Git. Keep reusable fixture changes in `scripts/dev-vault.mjs`; keep personal books and credentials outside this project. Read `README.md` for build, reload, and runtime verification commands.

## Product direction

Read `docs/product-direction.md` before implementing book retrieval or AI integration. Authentication belongs to the user's unmodified local CLI. The plugin must not collect subscription tokens.
