# 10: Answer text PDF questions with supporting citations

**What to build:** Ask about a text PDF through the existing reading assistant; retrieve passages across pages and open their citations in the Reader.

**Blocked by:** 05: Retrieve EPUB passages and open supporting citations; 09: Open a text PDF and select a passage.

**Status:** ready-for-agent

- [ ] Extract original PDF text in usable reading order and connect it to the same keyword retrieval and source-bound document operations used for EPUB.
- [ ] Selected-passage questions and questions without a selection use the shared application-facing interface and adapter contract, not a parallel PDF assistant implementation.
- [ ] Page transitions, wrapped text, and section/outline fallbacks retain source provenance. Do not invent EPUB-like chapters or printed page numbers when the PDF does not provide them.
- [ ] Search matches, expanded passages, and continuations open the correct page/text range in the Reader; unavailable locations are reported rather than guessed.
- [ ] The generic adapter contract remains independent of source format. Exercise it with controlled adapters and the production CLI paths already implemented; both live CLI paths are checked in final integrated validation.
- [ ] Add original PDF cases with evidence on different pages, a boundary-crossing passage, different printed page labels, and missing information. Confirm an actual Obsidian citation jump.

Specification: Reading assistant with source document context. User stories: 1, 5, 6, 8, 9, 17, 18, 19, 32, 36.
