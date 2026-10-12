# 07: Cancel an answer and recover from a CLI crash

**What to build:** Cancel an answer in progress, or retry after a CLI crash, while preserving the partial answer and keeping subsequent output attached to the correct turn.

**Blocked by:** 06: Ask Codex about EPUB context.

**Status:** ready-for-agent

- [ ] Both assistant CLIs stop active work when the user cancels, and the sidebar displays a clear terminal turn state with the partial answer preserved.
- [ ] A CLI crash preserves already received text and evidence and exposes Retry. The next attempt has a distinct turn identity.
- [ ] Late chunks or tool responses from an old turn cannot alter a newer answer or attach evidence to another turn.
- [ ] Repeated cancellation or retry actions do not create duplicate turns or hidden child processes. Reader/sidebar disposal releases the owned process and temporary transport resources.
- [ ] Controlled CLI fixtures exercise partial text, a crash, delayed output, cancellation, and a subsequent successful question through the confirmed workflow interface.
- [ ] Record the correct turn events for later conversation storage; do not introduce direct annotation writes from retry or cancellation.

Specification: Reading assistant with source document context. User stories: 48, 49.
