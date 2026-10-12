# 16: Use annotations in questions and save an answer as a passage note

**What to build:** Ask a question with the source document’s permitted highlights and passage notes, then explicitly save a useful answer beside a chosen passage.

**Blocked by:** 06: Ask Codex about EPUB context; 12: Enforce spoiler-safe mode across document tools; 15: Save a highlight and passage note with a generated annotation file.

**Status:** ready-for-agent

- [ ] Add the annotation-reading operation to both CLI transports, reading the authoritative record for the current source document only.
- [ ] Scope filtering excludes annotations whose referenced source range is beyond the furthest point read. User commentary remains labeled separately from original text.
- [ ] The assistant can read annotations but exposes no annotation-writing operation. Asking, retrying, or following citations does not change the record.
- [ ] Save as passage note is an explicit user action using the selected passage or a passage the user chooses for a whole-document answer.
- [ ] Save the commentary and citation references through the established annotation workflow; regenerate its Markdown annotation file without treating the answer as original source evidence.
- [ ] Repeated save/callback delivery does not silently create duplicate notes. Add checks for no-write assistant activity, permitted annotation retrieval, chosen target, one explicit save, and an unavailable target.
- [ ] Demonstrate the complete ask/read/save/reopen path with the controlled workflow and the available production CLI paths.

Specification: Reading assistant with source document context. User stories: 21, 22, 23, 24, 25, 28.
