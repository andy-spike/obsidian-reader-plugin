# 06: Ask Codex about EPUB context

**What to build:** Choose Codex for a new conversation and answer EPUB questions through the same document operations and citation workflow already used by Claude Code.

**Blocked by:** 03: Check Codex readiness and configuration isolation; 05: Retrieve EPUB passages and open supporting citations.

**Status:** ready-for-agent

- [ ] Implement the second real adapter behind the shared assistant CLI interface, using the installed Codex app-server and dynamic document tools.
- [ ] Require the verified restricted configuration from the setup ticket; no selected environments, declined approvals, disabled unrelated capabilities, and explicit model selection remain in effect.
- [ ] The same application-facing contract handles text, tool requests/results, completion, errors, and evidence for both CLIs. Retrieval is not duplicated in a Codex-specific implementation.
- [ ] The user can select Claude Code or Codex when starting a conversation. The conversation remains bound to that CLI; changing a default does not change an existing conversation.
- [ ] Repeated document calls return the same original source/locator semantics across both transports, and supported citations open the same Reader passage.
- [ ] Add controlled app-server protocol/executable checks through the workflow for tool invocation, completion, initialization failure, and automatically declined approvals.
- [ ] Confirm an opt-in live Codex question in the development vault. The setup and sidebar report primary mode; do not silently pretend the exec fallback is already available.

Specification: Reading assistant with source document context. User stories: 1, 5, 41, 42, 43, 46, 47.
Prototype evidence: retained commit `61eed56c18db7d962c3d3f984c89bf57f7db3df4`; use the specification and prototype findings for the accepted contracts and known limits.
