# 20: Choose assistant models and control web research

**What to build:** Set default assistant choices, select a model for a new conversation, and turn outside research on or off while seeing source evidence separately from external links.

**Blocked by:** 17: Keep readable conversation records in the vault.

**Status:** ready-for-agent

- [ ] Settings expose default assistant CLI, explicit model choice, and executable paths. Existing conversations retain their recorded CLI and model unless a supported explicit continuation action changes the model.
- [ ] Pass the user’s model explicitly through both adapters instead of relying on unrelated user configuration. Report unsupported models without silently substituting another choice.
- [ ] A per-conversation web setting changes the actual available research capability in both adapters, with web research off in document-only mode.
- [ ] Show visible external research activity when enabled. Render outside sources as links and interpretation separately from source document citations.
- [ ] Store and restore the conversation’s research choice so reopening/resuming does not silently enable the network capability.
- [ ] The setup check reports both CLIs’ discovery, version, sign-in, compatible mode, and useful terminal instructions without credentials entering plugin data.
- [ ] Controlled checks verify model propagation, unsupported choices, research enable/disable, and persistence. Explain that enabled external research is outside the enforceable document spoiler limit.

Specification: Reading assistant with source document context. User stories: 41, 42, 44, 45, 51, 52.
