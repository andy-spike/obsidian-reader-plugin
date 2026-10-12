# Worktree workflow

Start an agent in the main checkout, create a worktree for its task, and keep every task edit in that checkout. When the task is complete, merge it into local `main` with Worktrunk. Keep the branch and checkout available for review and manual cleanup. `.wortrees/` is the agreed directory name and is ignored by Git.

## Machine configuration

Development worktrees require Git, Worktrunk, Node.js 22 or newer, and pnpm. Worktrunk 0.69.2 is installed on this machine. These are development tools; they do not change the intended requirements for users of the plugin.

Worktrunk stores path and merge preferences in its user configuration. Add this repository-specific entry to `~/.config/worktrunk/config.toml` on Linux or macOS:

```toml
[projects."github.com/andy-spike/obsidian-reader-plugin"]
worktree-path = "{{ repo_path }}/.wortrees/{{ branch | sanitize }}"
merge.squash = false
merge.remove = false
merge.commit = false
```

For example, `feat/epub-reader` gets the path `.wortrees/feat-epub-reader`. Avoid branch names that sanitize to the same directory. Run `wt config show` to inspect the active configuration. The entry applies to this repository without changing defaults for other projects.

Shared hooks live in `.config/wt.toml`. The blocking `pre-start` pipeline copies dependencies, installs with the frozen lockfile, and builds. `.worktreeinclude` limits copying to ignored `node_modules/`. The copy is independent of the main checkout's directory, and the install reconciles it with the task's lockfile. Source files, docs, and local Markdown issues are tracked, so Git supplies them. Setup generates build output and a fresh development vault. Keep private books and CLI credentials outside the repository.

Worktrunk requires approval for project hook commands. This workflow's hooks are authorized as part of setup. On a new machine, use `wt config approvals add` once after reviewing `.config/wt.toml`. T3's noninteractive setup uses `--yes` to run these hooks. Setup is safe to rerun in an existing task checkout with `pnpm worktree:setup`; copying preserves existing files and development vault setup preserves existing notes and settings.

## Current T3 session

Use a session handoff so T3 updates the agent's workspace binding. A terminal `cd` or shell-created worktree does not update that binding.

1. Check `t3_worktree_status`. If the session already has a task worktree, continue there. Handoff cannot move an already attached session a second time.
2. Check root Git status and the task branch name. Commit completed prerequisite changes separately. Leave unrelated user changes out of task commits. Worktrees include committed files, so pending root edits are not carried over.
3. Call `t3_worktree_handoff` with a unique task branch, `baseRef: "main"`, `startFromOrigin: false`, `path` set to `<project-root>/.wortrees/<sanitized-branch>`, and `runSetupScript: true`. Include the remaining task and verification steps in `continuationPrompt`. Make this the last action of the turn. T3 queues a new turn in the worktree with the conversation preserved.
4. In the resumed turn, verify the branch and path, then run `pnpm worktree:setup` in the task checkout and require success before editing. This also handles a handoff that resumes before setup finishes or fails to start its setup terminal. If a T3 setup process is still running, wait for it to finish before rerunning the command. If setup fails, fix the cause and rerun it.

The saved T3 **Worktree setup** project script is `pnpm worktree:setup`, with **Run on worktree create** enabled and background execution disabled. It invokes the same `pre-start` hooks that `wt switch` uses. The script connects T3's creation process to Worktrunk's project automation.

Use `t3_thread_launch` only when the user asks for a separate thread. Set its workspace strategy to `worktree` with `baseRef: "main"`, a unique branch, and `startFromOrigin: false`. Verify the resulting path is under `.wortrees/` before editing. To open a retained checkout in a new requested thread, use `existing_worktree` with its exact path and branch.

Local `main` is the starting point. A remote push is not required to create a task worktree. Fetch or push when the task calls for remote synchronization.

## Terminal agents

Outside T3 Code, Codex and Claude Code can create the worktree directly with Worktrunk:

```sh
wt switch --create feat/epub-reader --base main
```

With shell integration enabled, this changes the terminal's directory. In an agent shell without the wrapper, read the reported checkout path and use that directory for every subsequent command. Verify it with `git rev-parse --show-toplevel` and `git branch --show-current`. Creation runs the blocking setup hooks before returning success.

Codex reads `AGENTS.md`. Claude Code imports that file through `CLAUDE.md`, so both receive the same worktree and merge instructions.

## Complete and merge a task

1. Review the task diff and run the checks appropriate to the change. Commit completed units of work with messages you write yourself. Stage only task files.
2. Ensure both the task checkout and root checkout have no pending tracked changes that could interfere with the merge. Preserve unrelated user work and report a blocking condition if it cannot be reconciled safely.
3. From the task checkout, run:

   ```sh
   wt merge main --no-squash --no-remove --no-commit
   ```

   Worktrunk rebases onto the latest local `main`, runs the `pre-merge` build check, and fast-forwards `main` only after validation succeeds. Rebase can change task commit hashes while preserving separate commits. Resolve conflicts and rerun the checks before retrying. Keep hooks enabled.
4. Verify every resulting task commit is an ancestor of `main`, both checkouts have clean tracked files, and `git worktree list` still includes the task checkout and branch.
5. Run `pnpm build` with the root checkout as the command's working directory. This refreshes the main development vault after the merge. Report the target branch, validation results, task commits, and retained checkout path.

The `pre-merge` hook currently runs `pnpm build`, including TypeScript checking. Extend it with the project's required test command when the implementation introduces a test suite. Each checkout has its own generated vault; see the README for runtime checks and Obsidian registration.

Merging does not move a T3 session back to the root. It stays attached to the retained checkout. Start the next independent task in a root session or a separately requested thread. Remove retained worktrees only when requested, using `wt remove <branch>`. T3 or Herdr merge buttons that remove the checkout do not implement this workflow.

## Verification on 2026-10-12

Verified on Linux with Worktrunk 0.69.2, Git 2.55.0, Node.js 26.11.1, and pnpm 12.4.1. T3 handed this session from the root into `.wortrees/chore-worktree-verification` on `chore/worktree-verification`, based on local `main`, and resumed the conversation in that checkout. Setup artifacts were absent when the resumed turn began, so the agent explicitly ran the shared setup command. The resumed-session step above requires that check for future tasks.

The include list copied 959 dependency files totaling 50.9 MiB. A copied TypeScript file had identical contents and a different inode from the root's file. Setup generated a separate vault with the deployed plugin, without copying the root's prototype vault files or `.env`. Rerunning setup preserved a modified task note and left the root's note unchanged. The temporary note change was restored.

The `pre-merge` hook rejected an intentional TypeScript error with exit status 2. Local `main` and its source file remained unchanged. After restoring the task source, the same hook passed. The validation probe was temporary and is absent from the committed source.

## References

- [Worktrunk configuration](https://worktrunk.dev/config/) explains user preferences and shared project configuration.
- [Worktrunk hooks](https://worktrunk.dev/hook/) explains blocking setup and merge checks.
- [Copying ignored files](https://worktrunk.dev/step/#wt-step-copy-ignored) explains the include list and independent copies.
- [Claude Code memory](https://code.claude.com/docs/en/memory) explains `CLAUDE.md` imports.
