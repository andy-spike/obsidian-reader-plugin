# 08: Retain source document identity through renames and moves

**What to build:** Reopen an EPUB after a vault rename or an external file move and retain its identity; detect a different edition without silently combining its records.

**Blocked by:** 02: Open an EPUB and select a passage.

**Status:** ready-for-agent

- [ ] Persist a stable source document ID, last-known path, content fingerprint, and revision through the document-opening workflow.
- [ ] A vault rename updates the path without changing source identity. A same-content file moved outside Obsidian reconnects by fingerprint on reopening.
- [ ] A different edition is treated as a different source document. Carrying annotations across requires explicit user confirmation; automatic transfer is not introduced.
- [ ] Document identity can be consumed by citations and later annotation/conversation records; it is not a path or rebuildable cache key.
- [ ] Opening and reconnecting preserve the original text and source-location conventions from the Reader ticket.
- [ ] Add behavior checks using disposable vault files for reopen, rename, move, ambiguous reconnection, and different content. Display an actionable choice rather than guessing when identity is ambiguous.

Specification: Reading assistant with source document context. User stories: 34, 35.
