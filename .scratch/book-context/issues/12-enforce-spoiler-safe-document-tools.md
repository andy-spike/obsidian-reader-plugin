# 12: Enforce spoiler-safe mode across document tools

**What to build:** Enable spoiler-safe mode for a question and restrict supplied EPUB or PDF evidence to the furthest point read, including direct references and continuations.

**Blocked by:** 10: Answer text PDF questions with supporting citations; 11: Restore current location and track the furthest point read.

**Status:** ready-for-agent

- [ ] The per-conversation setting keeps whole-document access as the default and binds permitted scope in the host workflow rather than model arguments.
- [ ] Apply scope before returning initial selection context, outline entries, search excerpts, surrounding text, and continued section reads.
- [ ] A limit inside a passage clips or omits the later text and issues accurate locators for the permitted range. Direct later references and old continuation cursors cannot bypass the limit.
- [ ] Show that the answer is constrained to the permitted scope. A question whose evidence is beyond the limit produces no later document text.
- [ ] Exercise the same application-facing contract with both formats and controlled CLI adapters at exact source boundaries. Deterministic checks allow zero later-source text in returned evidence.
- [ ] Keep the filtering rule reusable for annotation reading when that operation is added. Previously supplied conversation history is handled by the dedicated continuation ticket, not claimed solved here.

Specification: Reading assistant with source document context. User stories: 26, 27, 28, 29.
