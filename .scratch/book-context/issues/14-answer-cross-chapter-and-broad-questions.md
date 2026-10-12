# 14: Answer cross-chapter and broad questions with disclosed coverage

**What to build:** Ask about an earlier definition, compare chapters, or discuss a source document-wide argument and see which original passages support the answer.

**Blocked by:** 05: Retrieve EPUB passages and open supporting citations.

**Status:** ready-for-agent

- [ ] Assistant instructions and tool descriptions direct unresolved definitions/references across all permitted chapters rather than only the current section.
- [ ] Comparisons gather evidence from each relevant side. Broad questions inspect the outline and gather original evidence from multiple relevant parts.
- [ ] The sidebar presents the source sections that actually supplied evidence and the answer discloses incomplete coverage. A few search matches are not advertised as complete reading.
- [ ] Original document claims carry issued citations; interpretation is distinguished from original evidence. Missing or insufficient evidence is acknowledged.
- [ ] Use the retained prototype cases and held-out variations to check the earlier definition, beginning/middle/end stages, and an absent detail through controlled workflows.
- [ ] Run focused opt-in live evaluations for production adapters already implemented, and retain shared contract cases for the other adapter. Both live paths are checked in final validation. Do not make exact prose or a fixed tool-call sequence the contract.
- [ ] Keep chapter summaries, GraphRAG, and automatic whole-document prompting outside this ticket.

Specification: Reading assistant with source document context. User stories: 4, 10, 11, 12, 13, 14, 15, 16, 18, 52.
Prototype evidence: retained commit `61eed56c18db7d962c3d3f984c89bf57f7db3df4`; use the specification and prototype findings for the accepted contracts and known limits.
