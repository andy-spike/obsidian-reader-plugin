# Worktree workflow

Task work happens in T3 worktrees. The main checkout stays on `main` and is not used for task edits. T3 creates each worktree, binds the conversation to it, and runs the project's setup script.

## Starting a task

1. Check `t3_worktree_status`. If the session is already attached to a worktree, continue there; a session can only be handed off once.
2. Check the root's Git status. Worktrees contain only committed files, so uncommitted edits in the root are not carried over.
3. Call `t3_worktree_handoff` with a unique task branch, `baseRef: "main"`, `startFromOrigin: false`, and `runSetupScript: true`. Put the remaining task in `continuationPrompt` and make this the last action of the turn. T3 resumes the conversation inside the worktree.
4. In the resumed turn, check the branch and path, then run `pnpm worktree:setup` and require success before editing. If a T3 setup process is still running, wait for it to finish first.

A terminal `cd` or a shell-created worktree does not change T3's binding, so always create worktrees through T3. Use `t3_thread_launch` with a `worktree` workspace strategy only when the user asks for a separate thread; use `existing_worktree` to open a retained checkout in a new thread.

## Setup

T3's saved **Worktree setup** project script is `pnpm worktree:setup`, with **Run on worktree create** enabled and background execution disabled. It runs `pnpm install --frozen-lockfile` and `pnpm build`. The build generates `main.js` and a fresh development vault for that checkout. Rerunning setup is safe; it preserves existing vault notes and settings. Keep private books and CLI credentials outside the repository.

## Finishing a task

Run `pnpm build` and `pnpm test`, then commit the task's changes in focused commits. Stage only task files. Merge into `main` or open a pull request when the user asks. After merging, run `pnpm build` in the main checkout to refresh its development vault.

A T3 conversation stays bound to its worktree after merging. Remove the worktree only after that conversation is finished, so an active session is not left pointing at a missing directory.
