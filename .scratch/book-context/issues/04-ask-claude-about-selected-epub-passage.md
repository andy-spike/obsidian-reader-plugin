# 04: Ask Claude Code about a selected EPUB passage

**What to build:** Select an EPUB passage, ask a question in the reading assistant sidebar, receive a streamed answer, and open a citation back to the supplied passage.

**Blocked by:** 02: Open an EPUB and select a passage.

**Status:** ready-for-agent

- [ ] Introduce the confirmed application-facing reading assistant interface through this actual user flow. Reader/sidebar callers do not parse CLI protocol output.
- [ ] Launch the installed, unmodified Claude Code executable in an empty working directory, using its own sign-in and an explicit model. Do not read credentials or install another CLI.
- [ ] Supply the selection, nearby original text, source identity/revision, and section automatically. For this first slice, questions are limited to supplied selection context; whole-document retrieval is added by the next ticket.
- [ ] Show streamed text and completion in the sidebar. Display actionable errors if the CLI is missing, signed out, or incompatible.
- [ ] Use issued evidence references for supplied passages. Clicking a supported citation opens the exact Reader passage; unknown references are visibly unavailable rather than guessed.
- [ ] Disable unrelated built-in tools, customizations, and automatic approvals outside the reading workflow. Web research remains off until its dedicated ticket.
- [ ] Add repeatable application-level checks with real Reader context/evidence and a controlled Claude executable or adapter. Confirm one opt-in live selection question in the development vault.

Specification: Reading assistant with source document context. User stories: 1, 2, 3, 17, 18, 19, 41, 46, 47.
