# 09: Open a text PDF and select a passage

**What to build:** Open a vault-stored text PDF in the plugin-owned Reader view, select a passage, and inspect its original text and page location.

**Blocked by:** 02: Open an EPUB and select a passage.

**Status:** ready-for-agent

- [ ] Bundle a pinned pdf.js integration within the same Reader view convention, with working text selection and no patching of Obsidian private PDF APIs.
- [ ] The shared Reader context interface supplies document identity/revision, selected original text, and stable PDF source locators.
- [ ] Distinguish physical page indices from printed page labels and retain information needed to reopen a selection.
- [ ] Opening a PDF without a text layer shows the agreed clear unsupported-format message; the plugin does not silently add OCR.
- [ ] A reusable original text-PDF fixture and a PDF without a text layer are generated for the development vault. Validate reading/selection order and passage navigation.
- [ ] Do not extend this ticket to the full PDF display-control interface or full-document question retrieval.

Specification: Reading assistant with source document context. User stories: 2, 32, 33.
