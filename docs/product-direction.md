# Product direction

Context: [Book Note Workflow Options](chatgpt-conversation://6ac50675-2160-83e9-8b9c-90a861c07281), read during project setup on October 6, 2026.

The user wants to read books and keep durable Markdown notes in Obsidian, with AI assistance through an existing subscription. The assistant should know the current book, reading position, and selected passage. Long books need local processing and retrieval so individual questions do not require sending the whole book.

The proposed design keeps the Obsidian plugin responsible for reading context, highlights, notes, and navigation back to source passages. A separate local retrieval component will extract book text, preserve chapter and location information, index passages, and expose tools such as `search_book`, `read_section`, and `get_annotations` through MCP.

The initial integration target is the user's installed, unmodified Claude Code CLI. The user signs in through the CLI's own authentication flow. The plugin should communicate with the CLI and supply tools without collecting, storing, or relaying subscription credentials. Verify current primary documentation and provider terms before implementing that integration; the referenced conversation supplies requirements rather than a standing guarantee about third-party policies.

The planned context scopes are the selected passage, the current book, and the current book plus the user's notes. A reading-position limit may help avoid spoilers. Answers should cite retrievable source locations that open the relevant passage. Markdown notes are durable user data; derived search indexes should be rebuildable.

The development scaffold deliberately stops at plugin loading and selected-note context. Book formats, extraction, indexing storage, MCP transport, CLI lifecycle, and the assistant interface still need implementation decisions.
