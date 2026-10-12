# 11: Restore current location and track the furthest point read

**What to build:** Reopen either source format at the current location, retain the furthest point read when rereading earlier text, and reset that furthest point explicitly.

**Blocked by:** 08: Retain source document identity through renames and moves; 09: Open a text PDF and select a passage.

**Status:** ready-for-agent

- [ ] Persist current location and furthest point read separately under the source identity for EPUB and text PDF.
- [ ] Reopening returns the Reader to current location. Navigating backward does not reduce the furthest point read.
- [ ] The user can reset the furthest point read through an explicit action; changes are visible to the reading assistant context.
- [ ] Location state uses source-order/range semantics suitable for a reading limit within a passage, not only chapter numbers or screen coordinates.
- [ ] Add workflow checks for read forward, reread backward, reopen, rename/reconnect, explicit reset, and an unavailable old location.
- [ ] This ticket supplies reading-state data; spoiler-safe tool filtering is delivered separately.

Specification: Reading assistant with source document context. User stories: 26, 31, 32.
