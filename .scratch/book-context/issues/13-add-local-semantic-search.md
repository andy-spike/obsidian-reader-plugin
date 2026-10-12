# 13: Find paraphrased passages with local semantic search

**What to build:** Ask using words different from the source document and retrieve supporting passages through local hybrid search, with keyword search available during model preparation.

**Blocked by:** 05: Retrieve EPUB passages and open supporting citations.

**Status:** ready-for-agent

- [ ] Select and pin a compatible local embedding model and transformers.js runtime using representative evidence-retrieval measurements and documented model limits.
- [ ] Download model assets on first use with visible progress. Source text is embedded locally; no remote embedding or indexing service receives it.
- [ ] Combine semantic and MiniSearch keyword rankings and deduplicate overlapping evidence through the existing document operations and application interface.
- [ ] Passage units, metadata prefixes, and actual tokenization stay within the embedding model input limit. Semantic indexing must not silently truncate the relevant text.
- [ ] The user can keep asking keyword-supported questions while the model downloads/builds or is unavailable. The sidebar reports keyword-only status and errors without freezing Obsidian.
- [ ] A paraphrased fixture question obtains original supporting passages, and exact names/numbers remain retrievable. Returned evidence keeps existing size, continuation, revision, and scope contracts.
- [ ] Persist derived indexes outside the vault without changing annotations or conversation records. Compare keyword-only and hybrid evidence retrieval through controlled workflows rather than checking vector values.

Specification: Reading assistant with source document context. User stories: 7, 36, 37, 38, 39.
