# Reading assistant with source document context

Status: ready-for-agent

Testing seam confirmed by the user on October 12, 2026.

## Problem Statement

A user wants to ask questions while reading a source document in Obsidian. The reading assistant needs the selected passage, related passages, and sometimes evidence from several chapters. Sending the whole source document with every question is inconvenient and uses context that may not help answer the question. The user should not have to find passages, copy text, or manage a search index.

The answer must use the actual source document in the vault. It must provide citations that open supporting passages. In spoiler-safe mode, document tools must respect the furthest point read. The user also needs access to highlights and passage notes, durable conversation records, and their existing assistant CLI subscription.

The current production plugin only verifies loading and reads a selection in a Markdown note. It has no Reader view, saved annotations, extraction, retrieval, or reading assistant. A live prototype showed that Claude Code and Codex can obtain passage evidence through bounded document tools. It also showed that an assistant can omit an earlier definition, waste calls on empty searches, and provide incomplete coverage of a broad question.

## Solution

Provide a reading assistant sidebar connected to the source document open in the plugin's Reader view. The user asks a normal question. For a question about a selected passage, the plugin supplies that passage and nearby text automatically. The reading assistant can search the source document, read more original text, inspect the chapter list, and read permitted highlights and passage notes.

The plugin extracts and indexes text locally. It combines keyword and embedding search and returns bounded results with source locations. The reading assistant can request more evidence as needed. Comparisons require evidence from the relevant sections; broad questions require evidence across chapters and disclosure of incomplete coverage. Answers include citations that open the original passages. The user can explicitly save an answer as a passage note.

The reading assistant uses the user's installed, unmodified Claude Code or Codex CLI. The user chooses the assistant CLI for each conversation. The CLI handles sign-in. The plugin never reads credential files or collects subscription credentials.

This specification covers the production document-question workflow and its retrieval and CLI adapters. It defines the necessary Reader and annotation interfaces as dependencies. It does not specify the full Reader controls or annotation editing interface. Because those dependencies do not exist yet, implementation tasks must build or supply them before the corresponding integrated user stories can be completed.

## User Stories

1. As a reader, I want to ask a question about the source document open in the Reader view, so that I can understand it without copying its text.
2. As a reader, I want to ask about a selected passage, so that the reading assistant knows which text I mean.
3. As a reader, I want nearby text supplied automatically, so that pronouns and references have context.
4. As a reader, I want earlier definitions retrieved when necessary, so that a local explanation does not omit information introduced in another chapter.
5. As a reader, I want to ask a question without selecting a passage, so that I can discuss the source document as a whole.
6. As a reader, I want to find an exact name, term, number, or quotation, so that I can locate specific evidence.
7. As a reader, I want to ask using different words from the source document, so that I do not need to know the author's exact wording.
8. As a reader, I want the reading assistant to read surrounding text when a search match is insufficient, so that its answer preserves the passage's meaning.
9. As a reader, I want the reading assistant to search again when evidence is missing, so that it does not stop at the first result.
10. As a reader, I want to compare two chapters or arguments, so that I can understand their relationship.
11. As a reader, I want comparisons supported by evidence from both sides, so that one passage does not stand in for the whole comparison.
12. As a reader, I want to ask how an idea or relationship changes across the source document, so that I can follow its development.
13. As a reader, I want to ask about the source document's main arguments or themes, so that I can understand its larger structure.
14. As a reader, I want broad answers to identify the chapters used and disclose incomplete coverage, so that I can judge their limits.
15. As a reader, I want the reading assistant to say when the available text does not establish an answer, so that it does not invent missing facts.
16. As a reader, I want empty search results treated as incomplete evidence, so that a failed query is not presented as proof that information is absent.
17. As a reader, I want original passages used as evidence, so that answers reflect my source document and edition.
18. As a reader, I want citations beside factual claims, so that I can check the evidence.
19. As a reader, I want a citation to open its source passage in the Reader view, so that I can inspect it in context.
20. As a reader, I want an unavailable or stale citation identified clearly, so that I am not taken to an unrelated passage.
21. As a reader, I want the reading assistant to use my highlights and passage notes when relevant, so that my reading work can inform the discussion.
22. As a reader, I want my commentary distinguished from original source text, so that a passage note is not mistaken for the author's claim.
23. As a reader, I want the reading assistant to leave annotations unchanged, so that only my explicit actions alter them.
24. As a reader, I want to save an answer as a passage note, so that I can retain useful commentary beside a passage.
25. As a reader, I want to choose the passage for an answer saved from a whole-document conversation, so that the passage note has a valid source attachment.
26. As a reader, I want the whole source document available by default, so that I can ask questions beyond my current location when I choose.
27. As a reader, I want to enable spoiler-safe mode for a conversation, so that document tools return only permitted text before the furthest point read.
28. As a reader, I want passage expansion and annotation retrieval to obey the same scope, so that a different tool cannot bypass the reading limit.
29. As a reader, I want a question whose answer lies beyond the permitted scope to remain unanswered from document evidence, so that later text is not disclosed by the tools.
30. As a reader, I want a narrower reading limit applied to the assistant's continuing context, so that previously supplied later passages are not reused silently.
31. As a reader, I want current location kept separate from the furthest point read, so that rereading an earlier passage does not move my reading limit backward.
32. As a reader, I want EPUB and text PDF source documents supported, so that I can ask questions about both formats in my vault.
33. As a reader, I want a clear message for a PDF without a text layer, so that I understand why it cannot be searched in this version.
34. As a reader, I want the correct source document retained after a rename or move, so that conversations and citations stay associated with it.
35. As a reader, I want a different edition to require confirmation before annotations are carried over, so that passages from distinct editions are not silently combined.
36. As a reader, I want local extraction and indexing, so that creating the search index does not send source document text to a remote indexing service.
37. As a reader, I want indexing to run in the background, so that Obsidian remains usable.
38. As a reader, I want keyword search while embeddings are unavailable, so that I can begin asking questions before the embedding model is ready.
39. As a reader, I want to see indexing and fallback status, so that I understand which retrieval capabilities are available.
40. As a reader, I want derived indexes rebuilt when necessary, so that a damaged cache does not destroy my annotations or conversation records.
41. As a reader, I want to choose Claude Code or Codex when starting a conversation, so that I can use my preferred installed assistant CLI.
42. As a reader, I want a default assistant CLI and an explicit model choice, so that setup is simple and the plugin uses my intended model.
43. As a reader, I want a conversation to stay with the assistant CLI that started it, so that its resumable state remains consistent.
44. As a reader, I want a setup check to report whether the assistant CLI is found, signed in, and compatible, so that I can resolve setup problems in my own terminal.
45. As a reader, I want to set the executable path when automatic discovery fails, so that I can use an existing installation.
46. As a reader, I want the CLI's own sign-in used, so that the plugin does not ask for subscription tokens.
47. As a reader, I want streamed answers and visible document-tool activity in normal operation, so that I can follow progress while the answer is prepared.
48. As a reader, I want to cancel an answer in progress, so that unnecessary work stops.
49. As a reader, I want a CLI crash to preserve the partial answer and offer Retry, so that I do not lose the discussion.
50. As a reader, I want the active Codex mode and its limitations shown, so that fallback behavior is understandable.
51. As a reader, I want web research controlled per conversation, so that I can choose whether outside sources are used.
52. As a reader, I want outside sources linked and the assistant's interpretation labeled, so that I can distinguish them from source document evidence.
53. As a reader, I want conversation records stored with the source document's records in the vault, so that I can read them later independently of CLI retention.
54. As a reader, I want recent conversations to resume and older conversations to continue from a summary, so that I can return to previous questions.
55. As a reader, I want source passages retrievable again after conversation compaction, so that the assistant's temporary memory is not the only record of evidence.
56. As a reader, I want the workflow supported on Linux, macOS, and Windows desktop, so that I can use the same reading process on those systems.

## Implementation Decisions

### Scope and module shape

1. Create one application-facing reading assistant module for starting and resuming a conversation, asking a question with Reader context, cancelling a turn, following a citation, and explicitly saving an answer as a passage note. This is the primary testing seam confirmed by the user.
2. Keep extraction, indexing, tool dispatch, evidence tracking, and CLI lifecycle behind that interface. The sidebar and Reader should not need to understand each CLI's protocol or implement retrieval separately.
3. Use one assistant CLI adapter interface with two real adapters. Their shared events cover text, tool calls, tool results, web activity, completion, errors, and approval requests. Normal mode streams text; the Codex exec fallback delivers complete messages.
4. The Reader dependency supplies source document identity and revision, selected passage and source locations, current location, furthest point read, and navigation to a passage. The annotation dependency reads structured annotation records and accepts explicit user saves. Full Reader controls and annotation editing UI remain separately scoped dependencies.

### Source text, identity, and retrieval

5. Support vault-stored EPUB and text PDF source documents on desktop. Use the plugin-owned Reader view and the pinned reader engines already selected by the ADRs. Extraction and Reader navigation must agree on passage locations.
6. Preserve EPUB reading order and section structure. Preserve PDF page locations and usable text reading order. Keep original text distinct from text normalized for searching. A PDF without a text layer receives the agreed unsupported-format message; OCR is deferred.
7. Retain a stable source document identity, last-known path, and content fingerprint. Update paths for vault renames and reconnect externally moved files by fingerprint. Treat a different edition as a different source document unless the user confirms a transfer through the document/annotation workflow.
8. Bind extracted text and indexes to the source revision. Invalidate derived indexes when source text changes. A conversation or citation using an older revision must be identified as such and must not navigate to an unrelated passage.
9. Combine MiniSearch keyword results and local embedding results. Merge ranks and remove overlapping results. Preserve exact-term matching; the semantic index supplements it. The embedding model runs locally through transformers.js and is downloaded on first use.
10. Index passage units that fit the selected embedding model's tokenizer limit, including any structural prefix. Preserve paragraph and section boundaries where possible. Retrieve precise matches, then expand to surrounding text or an enclosing section when needed. Exact model, compatible versions, ranking weights, and passage sizes are engineering choices to measure during implementation.
11. Build indexes in the background. Keyword search remains usable while the embedding model downloads or its index builds. Report keyword-only operation. Both indexes are derived caches outside the vault and can be rebuilt without changing authoritative annotations or conversation records.

### Document tools and evidence

12. Expose four document operations to both assistant CLIs: inspect the chapter/section outline, search the source document, read original passages or sections, and read highlights and passage notes. Working names are `get_book_outline`, `search_book`, `read_section`, and `get_annotations`.
13. Bind source document identity, source revision, and permitted scope to the host conversation. Model arguments cannot select an arbitrary vault file, change the reading limit, or read another source document.
14. Supply a selected passage and nearby permitted text automatically when asking about a selection. Include source document identity, current section, and scope. Do not include the entire source document by default.
15. Search accepts a nonempty query and may narrow to a permitted section. Reject empty queries with a useful response that directs chapter inspection to the reading operation. Empty results mean no matches for that query, not proof that the source document lacks the information.
16. Reading accepts a returned passage reference or a permitted section reference. It supports surrounding text and explicit continuation. Keep reading a section distinct from searching it. Do not depend on general shell or file-reading tools.
17. All tool results have a host-enforced size budget. Return explicit truncation and continuation information when there is more text. Ensure that every advertised evidence ID and locator refers to the exact original text included in the result. Oversized results must not be silently externalized into a file inaccessible to the assistant.
18. Store issued evidence references with the conversation's source revision and scope. Document citations may only refer to evidence supplied to that conversation. Unknown or stale references are displayed as unavailable rather than linked to guessed locations. Durable evidence references allow original passages to be obtained again after CLI compaction.
19. Keep annotation commentary labeled separately from source text. Read the current document's annotation record, not its generated Markdown annotation file as an authoritative store. The reading assistant exposes no annotation-writing tool.

### Answer and conversation behavior

20. Instruct the reading assistant to obtain original evidence before making source document claims, search across permitted chapters for earlier definitions and references, and gather both sides of a comparison. Treat source text as content to read, not instructions that change the assistant's scope or capabilities.
21. For broad questions, inspect the outline, obtain evidence across relevant chapters, and disclose incomplete coverage. A few search matches do not establish that an answer represents the entire source document. The prototype validates examples of this behavior; it does not establish universal answer quality.
22. Require source citations for material document claims, links for outside sources, and labels for interpretation. A clickable citation must open the original passage in the Reader. Citation identity/navigation checks and assessment that the passage supports the claim are separate requirements.
23. The reading assistant may read annotations but cannot change them. Save as passage note is an explicit user action passed to the annotation workflow. Use the selected passage when appropriate; otherwise require the user to select the target passage. Preserve the answer's citations as references rather than treating the answer as original source text.
24. A conversation stays with the assistant CLI that started it. Store its readable history in the vault alongside the source document's annotation record. Keep CLI session identifiers separate from the conversation record. Resume supported recent sessions; continue older or unavailable sessions using a summary and retrievable source evidence.
25. Preserve partial answers on cancellation or CLI failure. Expose Retry after a crash. Track turn state so retries and late output cannot silently duplicate a saved passage note or attach evidence to a different turn.

### Permitted scope and spoiler-safe mode

26. Whole-document access is the default. Spoiler-safe mode uses the furthest point read, independently of current location. Apply scope before returning outline entries, search excerpts, expanded text, section continuations, and annotations. An annotation's referenced source range must be permitted.
27. Handle a reading limit inside a passage or section, not only whole-chapter limits. Clip or omit text beyond the limit and issue locators for the permitted range. A direct passage reference or continuation cursor cannot bypass the limit.
28. If a conversation's scope is narrowed after later text has reached the CLI, start a fresh CLI session/thread with permitted context before accepting the next question. Filtering future tool calls alone cannot remove earlier model history. Preserve the readable conversation record, but do not resupply impermissible history or summaries.
29. Any future derived summaries or context descriptions must track their covered source ranges and obey the same scope. Chapter summaries are not part of this implementation. Scope enforcement controls supplied document evidence; it cannot erase prior model knowledge or guarantee that enabled web research contains no spoilers.

### Assistant CLI integration

30. Write the adapters directly. Launch the user's installed executable as a child process. Use an empty working directory and keep authentication with the unmodified CLI. Do not read credential files, perform subscription OAuth, or inject subscription credentials.
31. Claude Code uses a streaming process with the plugin's document tools supplied through a loopback MCP server at a random port with a per-session token. Restrict MCP configuration to that server. Restrict built-in tools to optional web research. Check connection and configuration status before treating document tools as available.
32. Codex uses app-server with dynamic document tools and no selected environments in primary mode. Disable unrelated plugins, apps, goals, multi-agent behavior, and other capabilities outside the reading workflow. Retain read-only restrictions, automatically declined approval requests, and explicit model selection.
33. Ignore unrelated user configuration while preserving the CLI's own sign-in. The installed prototype version rejects the assumed ignore-config flag; do not implement it from that assumption. Establish and verify a supported isolation mechanism as part of adapter implementation. A successful question is not evidence that configuration isolation is complete.
34. At startup, check required experimental Codex capabilities. If primary mode is unavailable, use the agreed exec/MCP fallback only when its required restrictions and document tools can be established. Show the active mode, the absence of text streaming, and its weaker shell/file-tool restrictions. If the required configuration cannot be established, show a setup failure instead of silently exposing broader capabilities.
35. Decline approval requests automatically. Web research is controlled per conversation. Setup reports executable discovery, CLI version, sign-in status, compatible mode, and configuration failures, with commands the user can run in their own terminal and an executable-path setting.
36. On Windows, resolve the native executable behind a Codex command wrapper where possible. Otherwise use the built-in command interpreter with correctly escaped arguments. End-user setup must not require separate Node.js or Git for Windows for the plugin's adapter code.

### Existing performance targets

37. Retain the agreed first-version targets: a 500-page EPUB or text PDF opens within two seconds, indexing does not freeze Obsidian, keyword search becomes ready in about thirty seconds, and embeddings become ready within a few minutes. Measure against recorded fixture size and hardware. These are targets from the workflow plan, not achievements of the prototype.
38. No answer-latency or statistical answer-quality threshold has been accepted. Record latency, calls, evidence coverage, and failures during evaluation. Do not convert the prototype's small sample into an accuracy guarantee. Establish measured release criteria in the implementation evaluation work.

## Testing Decisions

1. Use one primary seam at the application-facing reading assistant interface. Exercise asking a question with source document context, serving document tools, streaming or completing an answer, following citations, cancelling, resuming, and explicitly saving a passage note through that interface.
2. Run deterministic behavior checks with real extraction, retrieval, scope enforcement, evidence tracking, and disposable record storage. Replace only the external assistant CLI behavior with a controlled adapter or fixture executable. Avoid mocks for internal search helpers and assertions about private function calls.
3. Run the same application-level contract cases against both real CLI adapter implementations using controlled protocol transcripts or fixture executables. Check streamed text, tool requests/results, completion, cancellation, crashes, configuration errors, and declined approvals. Assert external events and effects, not private parser structure or a brittle full event sequence.
4. Keep separate opt-in live evaluations through signed-in CLIs. These consume subscription usage and are not the default deterministic test suite. Record CLI versions, selected models, source revisions, questions, retrieved passages, answers, citations, timing, and coverage.
5. Validate EPUB and text PDF extraction and source navigation with original reusable fixtures in each checkout's generated development vault. Include reading order, section transitions, printed PDF labels versus physical page locations, and unsupported PDFs without a text layer. Verify actual citation jumps in Obsidian through the documented runtime workflow.
6. Cover the prototype's selected-passage case, including an earlier definition in another chapter. Check that the required evidence can be retrieved and supplied. Live evaluation must assess whether the answer actually uses it. Include variations so a tuned prompt cannot merely memorize one question.
7. Cover facts at the beginning, middle, and end; exact terms and paraphrased questions; chapter comparisons; changing hypotheses; broad arguments/themes; and insufficient or absent information. Use fiction and nonfiction, original fixtures and public-domain sources, and held-out questions for retrieval tuning.
8. Compare keyword-only and hybrid retrieval, including operation before embeddings are ready and after rebuilding caches. Assess evidence recall and answer support without asserting exact rank order or embedding values unless they form an explicit external contract.
9. Check size limits, pagination without skipped or duplicated source text, invalid references, empty search guidance, and unavailable sections. Verify that returned evidence IDs resolve to the exact text and source revision supplied.
10. Check scope at passage-level positions, including a boundary within a search match, expanded passage, and section continuation. Attempt direct later-passage requests and annotation reads. Check narrow-scope restarts after prior later evidence and restored conversations. Deterministic tool checks must return no source text beyond the permitted range.
11. Check citations in two stages: issued evidence identity and Reader navigation deterministically, then semantic support of the associated claim in evaluation. A location opening correctly is insufficient. Do not claim that simple term checks establish answer quality.
12. Check that assistant activity does not change annotation records. An explicit save creates the intended passage note through the annotation workflow. Conversation/index operations must preserve the annotation record and its generated-file relationship.
13. Check source renames, moved files, changed source revisions, stale caches/citations, and unsupported edition transfers through the relevant document dependencies. Keep source identity distinct from a path or cache key.
14. Check process discovery, sign-in failure, incompatible capabilities, primary/fallback disclosure, configuration isolation, and executable handling on the supported desktop systems. Credential files are not test fixtures and are not read by plugin code.
15. Measure the existing opening/indexing performance targets with representative long documents and documented hardware. Record interface responsiveness and degradation when the embedding model is unavailable. Do not assert a model response-time target that has not been agreed.
16. Prior art is the retained prototype's original fixture, questions, exact tool traces, and live transport experiment. There is no existing production test suite or reading assistant module to extend; the current two plugin commands only check loading and selected Markdown context. The prototype's examples guide behavior tests but its runner and HTML are not production code.

## Out of Scope

- The full Reader layout, display controls, library/import management interface, and full annotation editing panel. Their source-context, navigation, record-reading, and explicit-save capabilities are dependencies of this workflow and must be planned as blocking work where absent.
- Scanned PDF support and OCR, mobile Obsidian, and additional source formats.
- Chapter-summary generation, a summary hierarchy, GraphRAG, recursive model execution, arbitrary code tools, and automatic full-book prompting. These remain later experiments.
- Direct model API integration, API-key setup, subscription-token handling, plugin-managed OAuth, bundled replacement CLIs, and a unified agent library.
- Assistant changes to highlights or passage notes without an explicit user save, automatic changes to freeform notes, and access to unrelated vault documents.
- Full annotation interoperability, tags, and edition-transfer UI beyond respecting the established document identity rules.
- An absolute guarantee of spoiler-free model output, complete source document understanding, or perfect answer accuracy. The required enforceable property is permitted document-tool output; model prior knowledge and external sources are separate limits.
- Vendor approval requests, publishing the plugin, and release operations. The agreed public-release direction remains in effect, including the pre-release documentation and policy checks already recorded by the project.
- Merging or shipping the throwaway prototype.

## Further Notes

The user selected local Markdown as the issue tracker and the five default triage roles. This specification is published as `ready-for-agent` and does not need another triage pass. The testing seam was confirmed by the user.

The accepted product decisions are in [the reading workflow plan](../../docs/reading-workflow-plan.md), terminology is in [the glossary](../../CONTEXT.md), and the four [architecture decisions](../../docs/adr/) govern annotation authority, the Reader view, CLI integration, and direct adapters.

The [research note](../../docs/research/book-retrieval-methods.md) explains the retrieval evidence. The [prototype findings](../../docs/research/book-context-prototype.md) record the measured examples and limitations. The resolved [prototype issue](./issues/01-evaluate-reading-tools.md) points to the primary source on branch `prototype/book-context-retrieval`, commit `61eed56c18db7d962c3d3f984c89bf57f7db3df4`.

The build will span several tasks and sessions. Use to-tickets next to define dependency-ordered implementation tasks from this published specification. Keep the Reader and annotation prerequisites explicit. Model/version compatibility and configuration isolation need implementation validation; the specification records required behavior without inventing an unsupported flag.
