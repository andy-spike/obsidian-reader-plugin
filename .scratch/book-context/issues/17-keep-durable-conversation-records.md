# 17: Keep readable conversation records in the vault

**What to build:** Return to a source document and read its previous questions, answers, tool evidence, and partial turns regardless of the assistant CLI’s own retention.

**Blocked by:** 06: Ask Codex about EPUB context; 08: Retain source document identity through renames and moves.

**Status:** ready-for-agent

- [ ] Store a per-source readable conversation record beside its annotation record location, with document identity/revision and the CLI/model/mode/scope metadata needed for continuation.
- [ ] Keep CLI session identifiers separate from plugin conversation identity. A conversation stays bound to the CLI that started it.
- [ ] Persist questions, answers, issued evidence references, completion/error/cancellation state, and partial output through the application-facing workflow.
- [ ] Reopening after a vault rename or plugin restart still finds the correct records. A source path or derived index is not the record’s identity.
- [ ] The sidebar can display completed and partial records without launching a CLI or requiring a valid session.
- [ ] Controlled workflow checks verify independent reading, interrupted/failed turns, stable evidence references, and durable storage. Live session continuation is delivered by the next ticket.

Specification: Reading assistant with source document context. User stories: 43, 53, 55.
