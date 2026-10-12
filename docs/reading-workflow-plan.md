# Reading workflow plan

This document records the product interviews. Vocabulary is defined in the [glossary](../CONTEXT.md), and decisions that are hard to reverse are recorded in [docs/adr](./adr/). It records the latest product decisions, acceptance targets, and remaining implementation validation. It is not yet an approved implementation plan.

## Scope of the first usable version

- EPUB and text PDF source documents stored in the vault. Scanned PDFs and OCR are deferred, and a PDF without a text layer gets a clear message.
- Desktop only, on Linux, macOS, and Windows. Development starts on Linux.
- Intended for public release, with both Claude Code and Codex.

## Reading and annotation

- One plugin Reader view renders both formats: bundled, pinned pdf.js for PDFs and pinned foliate-js for EPUBs. It does not patch Obsidian's built-in PDF viewer, which would depend on private APIs.
- Selecting text shows a toolbar with **Highlight**, **Highlight + note**, and **Ask**. Each action is also a command that can be bound to a hotkey.
- Each highlight has one highlight category: a color whose meaning the user sets in settings. Tags are deferred.
- An Annotations panel in the sidebar lists the open document's highlights in reading order. It jumps to passages, edits passage notes inline, and lets the user undo a deletion. It is the only place annotations are edited.
- The annotation record is authoritative. It is a documented JSON format with W3C-style selectors (quote with context, text position, EPUB CFI or PDF page location) stored in a vault folder, so it syncs with the vault. See [ADR 0001](./adr/0001-structured-annotation-record-with-generated-markdown.md).
- The annotation file is regenerated in full from the record. Every highlight has a block ID, so the user's own notes can link to it. The user's freeform writing lives in separate notes.
- Each source document has a stable ID, its last-known path, and a content fingerprint. Renames inside Obsidian update the path, and the fingerprint reconnects files moved outside Obsidian. Moving annotations to a different edition requires the user's confirmation.
- The plugin tracks both the current location and the furthest point read. The user can reset the furthest point read.

## Reading assistant

- The assistant appears in a sidebar and answers questions about a selected passage or the whole source document.
- It runs through the user's installed, unmodified assistant CLI: Claude Code or Codex. The user picks one per conversation, with a default in settings, and a conversation stays with the CLI that started it. Authentication belongs entirely to the CLI, and the plugin never collects credentials.
- The plugin supplies document tools such as `search_book`, `read_section`, and `get_annotations`, which returns the current document's annotations only. Claude Code receives them through a local MCP server; Codex normally receives them as dynamic tools over app-server. Normal operation exposes document tools and optional web research, without shell or file-editing tools. The Codex exec fallback has weaker tool restrictions, described below and shown in the setup check. A per-conversation switch turns web research off.
- The assistant never changes annotations. A **Save as passage note** button lets the user keep an answer.
- Answers cite document passages with links that open them, link outside sources, and label the assistant's own interpretation.
- The assistant sees the whole document by default. Spoiler-safe mode, set per conversation, restricts every document tool to text before the furthest point read.
- Conversation records are stored for each document in the vault, next to the annotation record. Recent conversations resume the CLI session. Older ones remain readable and can be continued through a summary.

## Retrieval

- Text is extracted with chapter and location labels.
- Search is hybrid: a MiniSearch keyword index and a local embedding index, built with a small transformers.js model downloaded on first use, with results merged. Book text never leaves the machine for indexing.
- Both indexes are derived data, cached in the plugin's data folder outside the vault, and can be rebuilt.

## Failure behavior

- A setup check shows the status of each assistant CLI: whether it was found and whether it is signed in. If something is missing, it tells the user which command to run in their own terminal, and it offers a setting for the executable's path.
- A CLI crash keeps the partial answer and offers **Retry**.
- Until the embedding model is ready, search falls back to keywords only and tells the user.

## Acceptance checks for the first usable version

- A 500-page EPUB or text PDF opens within 2 seconds.
- Indexing runs in the background without freezing Obsidian. Keyword search is ready within about 30 seconds, and embeddings within a few minutes.
- A new highlight appears in the annotation file within 1 second.
- Every citation in an answer opens the cited passage.
- Spoiler-safe mode never returns text past the furthest point read.

## Assistant CLI integration

Both assistant CLIs sit behind one adapter interface implemented by the plugin, without a harness library. Each adapter launches the user's installed executable with Node's `child_process.spawn` and translates output into shared events: text, tool call, tool result, web activity, done, and error. V1 uses streaming text, visible tool calls and web activity, cancel, and resume in normal operation. Approval requests are declined automatically. Document citations always come from the plugin's own tool results. See [ADR 0003](./adr/0003-drive-the-users-own-assistant-clis.md) and [ADR 0004](./adr/0004-own-cli-adapters-without-a-harness-library.md).

- **Claude Code:** one long-lived `claude -p` process per conversation, using stream-json input and output. The plugin hosts its MCP server on 127.0.0.1 at a random port with a per-session token, passes it with `--mcp-config` and `--strict-mcp-config`, and limits built-in tools to WebSearch and WebFetch with `--tools` when web research is enabled.
- **Codex, primary mode:** `codex app-server`, using JSON-RPC over stdio. Each thread starts with `environments: []` to remove shell, file-editing, and patch tools. The plugin supplies `dynamicTools` over the existing connection, without an MCP server or token for this mode. Plugins, apps, goals, multi-agent, and similar features are disabled. A read-only sandbox, automatically declined approval requests, ignored user configuration, and an empty working directory provide additional restrictions.
- **Codex, fallback mode:** if startup checks find app-server or its required experimental features unavailable, use `codex exec --json`. This mode delivers complete messages without streaming text and receives document tools through the same local MCP server used by Claude Code. Per-run configuration supplies the MCP connection, with its token in an environment variable. This mode cannot remove shell and file tools through `environments: []`; it relies on the additional restrictions listed above. The README and setup check explain the active mode and its limitations.
- The plugin passes the user's chosen model explicitly, because ignoring user configuration also drops the user's model choice.
- CLI processes inherit Obsidian's environment and run in an empty working directory created by the plugin. On Windows, the setup check resolves the native `codex.exe` behind an npm `.cmd` wrapper where possible; otherwise it uses the built-in `cmd.exe` with escaped arguments. No separate Node.js or Git for Windows installation is required for the plugin's adapter code.

## Remaining implementation validation

The product choices above are settled, but implementation must pin compatible dependency versions, define the annotation schema and storage paths, and verify extraction, passage locations, and performance in both formats. CLI protocol and tool restrictions need end-to-end checks, including the per-conversation web switch, startup detection, fallback behavior, session resumption, and Windows executable handling. These checks must preserve the rule that the plugin never reads subscription credentials.

## Release

The plugin will be published publicly with support for both CLIs, without first asking Anthropic or OpenAI for confirmation. This is a known risk, and ADR 0003 records it. Before release, recheck both vendors' terms and Obsidian's developer policies, including the README's disclosure of network use and external process use.

## Historical research notes

The following notes record research and local tests from 2026-10-07. They are not a fresh compatibility or policy verification. The integration decisions above and ADRs include later refinements, particularly Codex dynamic tools and the choice to own the adapters. Recheck current primary documentation before implementation.

Claude Code supports multi-turn `claude -p` with `--input-format stream-json` and `--output-format stream-json`, `--mcp-config` with `--strict-mcp-config`, and `--tools` to restrict built-in tools. Sessions persist for 30 days, and the transcript format is internal. `--bare` mode skips the subscription login. If it becomes the default for `-p`, the plugin must opt out. These facts come from code.claude.com documentation and a local test on 2026-10-07.

Codex 0.161.0 provides `codex app-server`, which is experimental and streams through `item/agentMessage/delta`, and `codex exec --json`, which delivers only complete messages. Per-run MCP configuration works through `-c mcp_servers.<name>.url` and `bearer_token_env_var`. Web search is set with `-c web_search="live"`. Codex has no tool allowlist. OpenAI recommends API keys for automation. Its documented route for open-source apps to use ChatGPT plans has the app handle OAuth tokens itself, which this project rules out. These facts come from learn.chatgpt.com and developers.openai.com documentation and a local test on 2026-10-07. The 2026-10-07 notes did not establish end-to-end app-server or fallback MCP integration, or Windows compatibility; those checks remain implementation work.
