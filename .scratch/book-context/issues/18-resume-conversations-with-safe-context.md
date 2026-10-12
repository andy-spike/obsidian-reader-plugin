# 18: Resume conversations and narrow their scope safely

**What to build:** Continue a recent conversation or an older record while keeping the correct assistant CLI, retrievable evidence, and any narrower spoiler-safe limit.

**Blocked by:** 07: Cancel an answer and recover from a CLI crash; 12: Enforce spoiler-safe mode across document tools; 17: Keep readable conversation records in the vault.

**Status:** ready-for-agent

- [ ] Resume supported recent CLI sessions from their stored identifiers. If unavailable or expired, start a new session from a readable conversation summary and retrievable permitted source evidence.
- [ ] After CLI compaction, evidence references allow original passages to be fetched again. Conversation memory is not the only record of source evidence.
- [ ] If scope narrows after later evidence was supplied, stop/reject the old active context and start a fresh CLI session/thread before the next question.
- [ ] The fresh session receives no impermissible transcript material, source excerpts, or summaries. The old conversation record remains readable without being silently resupplied.
- [ ] The continuation retains the original assistant CLI and explicit recorded model/mode/scope behavior; it does not switch providers to make a resume work.
- [ ] Controlled protocol/workflow cases cover recent resume, expired session, compaction, lowered boundary, pending old output, and summary continuation. Opt-in live checks demonstrate both CLI paths.
- [ ] Unavailable evidence or source revisions produce an honest limitation instead of a guessed passage or an accidental duplicate turn.

Specification: Reading assistant with source document context. User stories: 30, 43, 54, 55.
