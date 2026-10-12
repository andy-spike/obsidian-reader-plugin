# Own CLI adapters without a harness library

The plugin writes its own small adapters for Claude Code and Codex instead of using a unified agent-harness library. Each adapter starts the user's `claude` or `codex` executable directly with Node's `child_process.spawn`, without a shell except for the Windows wrapper fallback described below, and turns the CLI's output into one shared set of events: text, tool call, tool result, web activity, done, and error. This keeps setup to Obsidian plus the CLI the user already installed, on Linux, macOS, and Windows.

On Windows, an npm-installed `codex` is a `.cmd` wrapper that Node will not spawn without a shell. The setup check resolves the native `codex.exe` behind it and, failing that, runs the wrapper through the built-in `cmd.exe` with escaped arguments.

## Considered options

- **Vercel AI SDK Harnesses (`@ai-sdk/harness-claude-code`, `@ai-sdk/harness-codex`).** In subscription mode, the Claude Code adapter reads the user's stored OAuth credentials, refreshes them, and injects the token. The Codex adapter reads the access token from `~/.codex/auth.json`. Both break the rule that the plugin never touches subscription credentials, and the Claude Code behavior conflicts with Anthropic's terms. The adapters also install their own copy of the CLI rather than using the user's.
- **TanStack AI (`@tanstack/ai-claude-code`, `@tanstack/ai-codex`, `@tanstack/ai-sandbox-local-process`).** It respects the credential rule: in host mode it lets each CLI use its own login and reads no credential files. But the local sandbox runs every command through `sh.exe`, which on Windows comes only with Git for Windows, and the Claude Code adapter launches a runner script with `node`, which needs a separate Node.js install. Non-technical Windows users would have neither. Its Codex adapter also uses `codex exec`, so text does not stream, and its Claude Code adapter has no exact tool allowlist.

## Consequences

- The plugin owns the code that parses each CLI's stream format and must follow changes to it. The setup check reports each CLI's version so that breakage is visible.
- Being a direct child of Obsidian, each CLI inherits Obsidian's environment and runs in an empty working directory created by the plugin.
- No harness library is a runtime dependency, so no early, fast-moving package version has to be pinned.
