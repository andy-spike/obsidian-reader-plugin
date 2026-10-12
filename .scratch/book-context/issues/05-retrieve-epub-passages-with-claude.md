# 05: Retrieve EPUB passages and open supporting citations

**What to build:** Ask Claude Code a question about the open EPUB without selecting text; the assistant can inspect the outline, search, read more original text, and cite the retrieved passages.

**Blocked by:** 04: Ask Claude Code about a selected EPUB passage.

**Status:** ready-for-agent

- [ ] Extract the EPUB in reading order with section labels and locators, and build a local MiniSearch keyword index. Original source text remains distinct from normalized search text.
- [ ] Serve outline, search, and passage/section reading through the agreed loopback MCP HTTP transport with a random port, a per-session token, and restricted MCP configuration. Annotation reading joins when annotation records exist.
- [ ] Bind every operation to the conversation source document and revision; model arguments cannot choose unrelated vault files.
- [ ] Enforce a documented response size budget and explicit continuations. Pagination neither skips nor duplicates original text, and surrounding text is available without general file or shell tools.
- [ ] Reject empty searches with useful guidance to read a chapter instead. Empty results do not prove that information is absent.
- [ ] Store evidence references issued for the turn and render only supported citation locations. Verify actual citation navigation in the Reader.
- [ ] A controlled assistant requesting a second search/read obtains missing original evidence through the application-facing interface. Add cases for exact terms, a middle-of-document fact, invalid references, and missing information.
- [ ] Expose keyword-only readiness while later embedding work is absent. Extraction/indexing for this slice does not send source text to a remote service.

Specification: Reading assistant with source document context. User stories: 5, 6, 8, 9, 15, 16, 17, 18, 19, 36.
Prototype evidence: retained commit `61eed56c18db7d962c3d3f984c89bf57f7db3df4`; use the specification and prototype findings for the accepted contracts and known limits.
