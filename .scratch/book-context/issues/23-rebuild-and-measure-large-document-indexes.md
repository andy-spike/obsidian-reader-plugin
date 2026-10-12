# 23: Rebuild large-document indexes without interrupting reading

**What to build:** Open a long EPUB or text PDF, ask keyword-supported questions while indexing continues, and recover by rebuilding a damaged cache without losing reading work.

**Blocked by:** 10: Answer text PDF questions with supporting citations; 13: Find paraphrased passages with local semantic search.

**Status:** ready-for-agent

- [ ] Measure the agreed 500-page opening target, keyword-readiness target, and embedding preparation target with documented source sizes and hardware.
- [ ] Index construction, replacement, and rebuild do not freeze the Reader or Obsidian. The sidebar shows progress and keyword-only availability during preparation.
- [ ] A missing/damaged derived cache can be rebuilt locally. Seed source-linked user records and verify they remain unchanged during cache rebuild; correctness of the record modules is covered by their own tickets. Rebuild never requires collecting credentials.
- [ ] A model download/inference failure degrades visibly to usable keyword retrieval rather than breaking the document-question path.
- [ ] The workflow enforces result-size and source-revision contracts while an index is replaced; a turn cannot silently mix partial old/new evidence.
- [ ] Add deterministic recovery and responsiveness checks at the confirmed seam, then record long-document runtime measurements in the generated development vault. Report failures against existing targets rather than claiming the prototype met them.

Specification: Reading assistant with source document context. User stories: 37, 38, 39, 40.
