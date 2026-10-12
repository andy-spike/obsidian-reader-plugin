# Reading assistant ticket breakdown

Breakdown approved by the user on October 12, 2026. All 23 implementation tickets are published as ready-for-agent.

The completed prototype remains issue 01. New tickets start at 02. Each individual ticket describes a demoable user path and acceptance criteria. No prefactoring ticket is needed for the current scaffold. The published specification is unchanged.

2. **Open an EPUB and select a passage**

   Blocked by: None.

   Delivers: Open a vault-stored EPUB in the plugin-owned Reader view and inspect the selected passage with its section and source location.

   [Open this ticket](./issues/02-open-epub-and-select-passage.md).

3. **Check Codex readiness and configuration isolation**

   Blocked by: None.

   Delivers: Show a Codex setup result that establishes whether the installed, signed-in CLI can run with the required restricted configuration while keeping sign-in entirely within the CLI.

   [Open this ticket](./issues/03-check-codex-configuration-isolation.md).

4. **Ask Claude Code about a selected EPUB passage**

   Blocked by: 02.

   Delivers: Select an EPUB passage, ask a question in the reading assistant sidebar, receive a streamed answer, and open a citation back to the supplied passage.

   [Open this ticket](./issues/04-ask-claude-about-selected-epub-passage.md).

5. **Retrieve EPUB passages and open supporting citations**

   Blocked by: 04.

   Delivers: Ask Claude Code a question about the open EPUB without selecting text; the assistant can inspect the outline, search, read more original text, and cite the retrieved passages.

   [Open this ticket](./issues/05-retrieve-epub-passages-with-claude.md).

6. **Ask Codex about EPUB context**

   Blocked by: 03, 05.

   Delivers: Choose Codex for a new conversation and answer EPUB questions through the same document operations and citation workflow already used by Claude Code.

   [Open this ticket](./issues/06-ask-codex-about-epub-context.md).

7. **Cancel an answer and recover from a CLI crash**

   Blocked by: 06.

   Delivers: Cancel an answer in progress, or retry after a CLI crash, while preserving the partial answer and keeping subsequent output attached to the correct turn.

   [Open this ticket](./issues/07-cancel-and-retry-answers.md).

8. **Retain source document identity through renames and moves**

   Blocked by: 02.

   Delivers: Reopen an EPUB after a vault rename or an external file move and retain its identity; detect a different edition without silently combining its records.

   [Open this ticket](./issues/08-retain-source-document-identity.md).

9. **Open a text PDF and select a passage**

   Blocked by: 02.

   Delivers: Open a vault-stored text PDF in the plugin-owned Reader view, select a passage, and inspect its original text and page location.

   [Open this ticket](./issues/09-open-text-pdf-and-select-passage.md).

10. **Answer text PDF questions with supporting citations**

   Blocked by: 05, 09.

   Delivers: Ask about a text PDF through the existing reading assistant; retrieve passages across pages and open their citations in the Reader.

   [Open this ticket](./issues/10-answer-text-pdf-questions-with-citations.md).

11. **Restore current location and track the furthest point read**

   Blocked by: 08, 09.

   Delivers: Reopen either source format at the current location, retain the furthest point read when rereading earlier text, and reset that furthest point explicitly.

   [Open this ticket](./issues/11-restore-reading-locations.md).

12. **Enforce spoiler-safe mode across document tools**

   Blocked by: 10, 11.

   Delivers: Enable spoiler-safe mode for a question and restrict supplied EPUB or PDF evidence to the furthest point read, including direct references and continuations.

   [Open this ticket](./issues/12-enforce-spoiler-safe-document-tools.md).

13. **Find paraphrased passages with local semantic search**

   Blocked by: 05.

   Delivers: Ask using words different from the source document and retrieve supporting passages through local hybrid search, with keyword search available during model preparation.

   [Open this ticket](./issues/13-add-local-semantic-search.md).

14. **Answer cross-chapter and broad questions with disclosed coverage**

   Blocked by: 05.

   Delivers: Ask about an earlier definition, compare chapters, or discuss a source document-wide argument and see which original passages support the answer.

   [Open this ticket](./issues/14-answer-cross-chapter-and-broad-questions.md).

15. **Save a highlight and passage note with a generated annotation file**

   Blocked by: 08.

   Delivers: Save a highlight and attached passage note from the Reader, reopen it in a minimal Annotations panel, and read its generated Markdown annotation file.

   [Open this ticket](./issues/15-save-highlight-and-passage-note.md).

16. **Use annotations in questions and save an answer as a passage note**

   Blocked by: 06, 12, 15.

   Delivers: Ask a question with the source document’s permitted highlights and passage notes, then explicitly save a useful answer beside a chosen passage.

   [Open this ticket](./issues/16-use-annotations-and-save-assistant-answer.md).

17. **Keep readable conversation records in the vault**

   Blocked by: 06, 08.

   Delivers: Return to a source document and read its previous questions, answers, tool evidence, and partial turns regardless of the assistant CLI’s own retention.

   [Open this ticket](./issues/17-keep-durable-conversation-records.md).

18. **Resume conversations and narrow their scope safely**

   Blocked by: 07, 12, 17.

   Delivers: Continue a recent conversation or an older record while keeping the correct assistant CLI, retrievable evidence, and any narrower spoiler-safe limit.

   [Open this ticket](./issues/18-resume-conversations-with-safe-context.md).

19. **Handle revised source documents and stale evidence safely**

   Blocked by: 10, 13, 15, 17.

   Delivers: Change a source document and keep annotations and conversation records intact while rebuilding derived indexes and identifying citations that no longer match.

   [Open this ticket](./issues/19-handle-revised-source-documents.md).

20. **Choose assistant models and control web research**

   Blocked by: 17.

   Delivers: Set default assistant choices, select a model for a new conversation, and turn outside research on or off while seeing source evidence separately from external links.

   [Open this ticket](./issues/20-choose-models-and-web-research.md).

21. **Provide the disclosed Codex exec fallback**

   Blocked by: 06.

   Delivers: When required app-server capabilities are unavailable, answer through the approved Codex exec/MCP fallback and show its different streaming and tool restrictions.

   [Open this ticket](./issues/21-provide-codex-exec-fallback.md).

22. **Run assistant CLI questions across supported desktop systems**

   Blocked by: 20, 21.

   Delivers: Use the configured assistant CLI to ask a source document question on Linux, macOS, and Windows, including installations with spaces or command wrappers in their paths.

   [Open this ticket](./issues/22-run-assistant-clis-across-desktop-systems.md).

23. **Rebuild large-document indexes without interrupting reading**

   Blocked by: 10, 13.

   Delivers: Open a long EPUB or text PDF, ask keyword-supported questions while indexing continues, and recover by rebuilding a damaged cache without losing reading work.

   [Open this ticket](./issues/23-rebuild-and-measure-large-document-indexes.md).

24. **Validate the complete reading assistant evidence workflow**

   Blocked by: 14, 16, 18, 19, 22, 23.

   Delivers: Verify the assembled workflow on representative source documents and retain evidence that facts, comparisons, broad answers, citations, annotations, continuation, and scope restrictions work together.

   [Open this ticket](./issues/24-validate-reading-assistant-evidence-workflow.md).

## Dependency rules

Only direct gates are listed. Transitive blockers are omitted. Independent paths can proceed when their own blockers are resolved. The first available tickets are 02 and 03. Codex configuration isolation is an early real gate, not an assumed working flag. Shared behavior is tested through the confirmed application-facing seam; internal layers are not separate build tickets. Each implementation ticket includes its own behavior checks. The final ticket checks assembled behavior and live quality rather than postponing all testing to the end.

## Working the tickets

Start with an available ticket whose listed blockers are resolved. Use a fresh implementation context for each ticket and verify its own acceptance criteria before resolving it. A ready-for-agent status means the ticket is fully specified; unresolved blockers still prevent it from starting. Keep the parent specification and resolved prototype issue unchanged.
