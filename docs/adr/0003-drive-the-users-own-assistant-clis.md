# Drive the user's own assistant CLIs

The reading assistant runs through the user's installed, unmodified Claude Code or Codex CLI, chosen per conversation. The plugin launches the CLI as a child process and serves the plugin's own tools to it. Claude Code reaches those tools through an MCP server on 127.0.0.1, at a random port with a per-session token. Codex reaches them as dynamic tools over its app-server connection. The plugin never sees credentials, because each CLI handles its own sign-in. Both CLIs sit behind one adapter interface, and v1 uses only the features they share. The adapters are the plugin's own code; see [ADR 0004](./0004-own-cli-adapters-without-a-harness-library.md).

## Considered options

- **The plugin calls model APIs directly.** That would mean collecting API keys or subscription tokens, which the product direction forbids.
- **OpenAI's "Sign in with ChatGPT" route for open-source apps.** It requires the app to run OAuth and hold the user's tokens.
- **A stdio MCP script launched by the CLI.** It needs Node on PATH and cannot see the live reading state, such as the current location, the selection, and spoiler limits.
- **The same MCP server for primary Codex integration.** This would leave Codex with its shell and file tools, and the token has to reach Codex through its configuration. Codex app-server's `environments: []` removes those tools, and `dynamicTools` delivers tool calls over the existing connection with no token at all.

## Consequences

- Claude Code is limited to the plugin's tools plus web research, using `--strict-mcp-config` and `--tools`.
- Codex is limited by starting each thread with `environments: []`, which removes its shell, file-editing, and patch tools, and by turning off plugins, apps, goals, multi-agent, and similar features. A read-only sandbox, approval requests declined automatically, and ignored user configuration remain as a second layer. Because user configuration is ignored, the plugin passes the user's chosen model explicitly.
- `codex app-server`, `environments`, and `dynamicTools` are labeled experimental by OpenAI. The plugin checks at startup that they work and otherwise falls back to `codex exec --json`, which does not stream text and receives the plugin's tools through the MCP server, with the token in an environment variable. The fallback cannot remove shell and file tools through `environments: []`, so it relies on the additional restrictions above. The README and setup check explain which mode is active and its limitations.
- The plugin will be published without first confirming with Anthropic or OpenAI that a public plugin may launch their CLIs under subscription logins. Anthropic's terms permit an end user signing in to the unmodified Claude Code binary, but they are ambiguous about products that run it. OpenAI recommends API keys for automation and does not address this pattern. If either vendor objects, that CLI's adapter may have to be withdrawn.
