# Reading workflow plan

This document records the product interview. Confirmed requirements are separate from open decisions; it is not yet an approved implementation plan.

## Confirmed requirements

- The first usable version supports both EPUB and text PDF documents stored in the user's Obsidian vault.
- The first version targets desktop.
- The user can save highlights and attach passage notes to passages or sections.
- A reading assistant in a sidebar can answer questions about a selected passage or the source document as a whole.
- The assistant may research outside sources when relevant. The interview recommendation is to distinguish document evidence, external evidence, and interpretation; the exact answer and citation behavior remains to be settled.
- The user prefers standardized annotation management for reliability over freely editable Markdown as annotation storage.

## Open decisions

- Whether authoritative annotations live in structured data with a Markdown export, in structured data alone, or in a strictly defined Markdown format.
- Whether "standardized" requires an existing interoperability standard or a documented project format.
- Whether scanned PDFs and OCR belong in a later version.
- How the user creates, edits, deletes, and navigates annotations.
- Whether assistant context includes unread portions of the document and the user's annotations.
- What the assistant may change, how conversations persist, and how citations open source passages.
- Reader engines, annotation locations and document identity, retrieval design, storage, and CLI integration.
- Performance targets, failure behavior, and the acceptance checks for the first usable version.

## Existing project direction

The current code is an Obsidian desktop plugin scaffold built with TypeScript and esbuild. It does not yet implement a PDF or EPUB reader, saved annotations, retrieval, or an assistant.

[Product direction](./product-direction.md) proposes the user's unmodified local Claude Code CLI and a separate local retrieval component. CLI authentication belongs to the user; the plugin must not collect subscription tokens. Integration feasibility must be verified against current primary documentation before implementation.

The product direction and [glossary](../CONTEXT.md) currently describe Markdown as durable annotation storage. That definition needs reconciliation once the annotation format decision is settled.
