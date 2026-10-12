# 15: Save a highlight and passage note with a generated annotation file

**What to build:** Save a highlight and attached passage note from the Reader, reopen it in a minimal Annotations panel, and read its generated Markdown annotation file.

**Blocked by:** 08: Retain source document identity through renames and moves.

**Status:** ready-for-agent

- [ ] Provide the minimum annotation dependency required by the assistant spec: explicit user saving of a located highlight and passage note, plus reading/navigation in an Annotations panel.
- [ ] Use a documented structured JSON annotation record as authority, with stable annotation identity and the source selectors required by the accepted ADR.
- [ ] Regenerate the Markdown annotation file from the record, with a stable block ID for each highlight and navigable source references. Generated Markdown is not parsed back as authority.
- [ ] A highlight has exactly one highlight category. Use the existing product decision for color meaning; do not introduce tags or a competing freeform annotation format.
- [ ] Reopening the source document restores the stored highlight/note and preserves the source document identity across a rename. Freeform user writing remains in separate notes.
- [ ] Verify record-to-file behavior, block links, original passage navigation, and the agreed one-second annotation-file target in the development vault.
- [ ] Limit UI work to the dependency needed here. Complete annotation editing, deletion/undo, and display controls remain separately scoped work rather than silently added to this ticket.

Specification: Reading assistant with source document context. User stories: 21, 22, 24, 25.
