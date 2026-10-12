# 19: Handle revised source documents and stale evidence safely

**What to build:** Change a source document and keep annotations and conversation records intact while rebuilding derived indexes and identifying citations that no longer match.

**Blocked by:** 10: Answer text PDF questions with supporting citations; 13: Find paraphrased passages with local semantic search; 15: Save a highlight and passage note with a generated annotation file; 17: Keep readable conversation records in the vault.

**Status:** ready-for-agent

- [ ] Detect changed source content/revision and invalidate both keyword and embedding caches through the document-opening/question workflow.
- [ ] Do not mix retrieved passages from different revisions within a turn. Rebuild derived data without overwriting authoritative annotation or conversation records.
- [ ] An old citation opens only when its recorded selectors resolve to the correct original passage; otherwise show it as stale or unavailable rather than navigating to unrelated text.
- [ ] Existing records remain readable with their original revision metadata. The assistant is not silently supplied old evidence as if it belongs to the new revision.
- [ ] Respect established rename/move identity behavior and keep different-edition annotation transfers explicit; do not reinterpret a path change as a new edition.
- [ ] Use EPUB and PDF revision fixtures to check a changed passage, an unchanged located passage, cache replacement, record preservation, and an unresolvable citation through the workflow.
- [ ] Show rebuilding/stale-reference status in the Reader/sidebar so the user can understand what remains usable.

Specification: Reading assistant with source document context. User stories: 20, 34, 35, 40, 53, 55.
