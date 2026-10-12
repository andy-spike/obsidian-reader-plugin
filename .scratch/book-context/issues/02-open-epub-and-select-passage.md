# 02: Open an EPUB and select a passage

**What to build:** Open a vault-stored EPUB in the plugin-owned Reader view and inspect the selected passage with its section and source location.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A reusable original EPUB fixture opens in Obsidian through the pinned foliate-js Reader integration, without patching a private Obsidian viewer.
- [ ] The user can read sections, select text, and invoke the existing reading-context command to see the selection and its source location.
- [ ] Selection context includes document identity and revision, section identity, and a locator that can reopen the selected passage during the current document session.
- [ ] The extraction and Reader location conventions agree on reading order and selected text; a location identifies source content rather than a viewport coordinate.
- [ ] The production build and runtime flow work in the generated development vault. Add behavior checks for opening the fixture, obtaining selection context, and reopening its passage.
- [ ] Keep this slice to essential reading and selection. Full Reader display controls and the complete annotation interface remain outside this ticket.

Specification: Reading assistant with source document context. User stories: 2, 3, 32.
