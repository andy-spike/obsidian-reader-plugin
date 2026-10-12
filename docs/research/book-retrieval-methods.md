# Book retrieval for a reading assistant

Researched October 12, 2026. The user subsequently accepted the approach of automatic passage context, document search and reading tools, chapter coverage for broad questions, and validation with both assistant CLIs. The accepted scope is recorded in the [reading workflow plan](../reading-workflow-plan.md#retrieval). This note preserves the research and wider proposals. Exact tool parameters, chapter summary generation, and other enhancements remain to be evaluated.

The practical goal is to let the user ask a normal question while the plugin supplies the right parts of the open book. The agent needs access to the book through tools, and it needs a way to obtain both precise passages and broader chapter context. Having a large context window alone does not establish that it will answer reliably.

## What the evidence supports

### Long context is useful, but needs testing

Liu et al.'s *Lost in the Middle* found that answer quality changed with the position of relevant information in a long prompt. Information near the beginning or end often worked better than information in the middle. The study tested multi-document QA and synthetic key-value retrieval with 2023 models. It supplies a useful test design, not a prediction of the exact behavior of today's Claude or Codex models. [Paper](https://arxiv.org/abs/2307.03172).

Li et al. compared retrieval and long-context prompting using GPT-4o, GPT-3.5 Turbo, and Gemini 1.5 Pro on nine English query-based datasets. Long context performed better on average when sufficiently resourced; retrieval used fewer tokens. Their Self-Route method first checked whether retrieved material was sufficient, then used long context when necessary. Their baseline used 300-word chunks and five retrieved chunks with dense retrievers. This is evidence for testing adaptive expansion, not proof that full-book prompting beats a carefully tuned hybrid book index. Models, context limits, and token costs are from 2024. [Paper](https://arxiv.org/html/2407.16833v1).

### Preserve lexical search alongside embeddings

The BEIR authors evaluated ten retrieval systems over eighteen datasets. BM25 remained a robust baseline across domains, while reranking and late-interaction methods performed well at higher computational cost. The 2021 study is not a current ranking of embedding models, and its datasets are broader than book reading. It does argue against assuming semantic embeddings alone solve retrieval. [Paper](https://arxiv.org/abs/2104.08663).

Anthropic's Contextual Retrieval experiments combined semantic search with BM25 and added short chunk-specific descriptions before indexing. Across their tested domains, which included fiction, contextual embeddings plus contextual BM25 reduced retrieval failure at top 20 from 5.7% to 2.9%; reranking reduced it to 1.9%. These are retrieval results, not guaranteed answer accuracy. The strongest reported configuration used hosted Gemini embeddings and a Cohere reranker, so those figures should not be attributed to our local index. Their context descriptions used the whole document, and therefore need a different construction for spoiler-safe reading. Chunk size, overlap, candidate count, and reranking need evaluation for our books. [Anthropic engineering report](https://www.anthropic.com/engineering/contextual-retrieval).

### Book questions require more than isolated passages

RAPTOR builds a hierarchy by embedding, clustering, and summarizing text repeatedly, then retrieves at multiple levels. The authors evaluated NarrativeQA, QASPER, and QuALITY, including full-book narrative questions. Their controlled comparisons found improvements from adding the hierarchy. Their headline improvement on QuALITY combined RAPTOR with GPT-4 and compared against prior systems; it is not a clean estimate of the hierarchy's independent effect. QuALITY documents average roughly 5,000 tokens, shorter than many books. This supports testing summaries alongside original text, while keeping original passages available for verification. [Paper](https://arxiv.org/html/2401.18059v1).

Microsoft's GraphRAG addresses broad questions such as the main themes of an entire collection. It extracts an entity graph, builds community summaries, produces partial answers, and combines them. The paper reports gains over conventional RAG for comprehensiveness and diversity on global questions over corpora around one million tokens. That setting differs from one ordered book. Its result supports a separate strategy for broad questions, without establishing that we need a graph database or entity extraction in the first release. [Paper](https://arxiv.org/abs/2404.16130).

NarrativeQA deliberately asks questions written from summaries of books and film scripts, making word matching against the original text harder. Its full-story task is a useful reminder to evaluate narrative relationships and synthesis, rather than only exact-fact lookup. Public benchmark questions should supplement our own tests, because citation locations and spoiler boundaries are separate product requirements. [Original paper](https://arxiv.org/abs/1712.07040), [authors' dataset repository](https://github.com/google-deepmind/narrativeqa).

### Local embedding inference is technically plausible

Transformers.js supports feature extraction, runs pretrained models through ONNX Runtime, and permits local model paths and disabling remote models. Its default model loading can download model assets. That makes it a candidate for local embeddings without an API key, subject to model licensing, memory use, download UX, and testing in Obsidian's Electron runtime. The documentation does not establish that any specific model is sufficiently accurate or fast for our books. [Official documentation](https://huggingface.co/docs/transformers.js/en/index), [local model configuration](https://huggingface.co/docs/transformers.js/en/custom_usage).

## Proposed design for this plugin

The following choices are engineering recommendations inferred from the research and project constraints. They need a prototype and measured evaluation.

### Build a source-preserving local index

Extract EPUB spine order and chapter structure, and text PDF reading order with physical page references. Preserve the original text separately from normalized search text. Each indexed passage should carry the document identity, source revision, ordered start and end positions, section path, and a locator the Reader can open. In PDFs, distinguish physical page index from printed page labels. EPUB text can use stable reader locators rather than invented page numbers.

Split by paragraph and section boundaries, with a target size and maximum size tuned experimentally. The maximum must fit the chosen embedding model's actual tokenizer limit, including any title or context prefix. For example, all-MiniLM-L6-v2 defaults to truncating text above 256 wordpieces. A generic 800-token passage would therefore be a poor default for that model. Separate small indexed units from larger passages returned for reading. [Model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2). Search smaller passages, then expand a match to its neighboring paragraphs or enclosing section. This keeps matching precise while resolving pronouns, definitions, and surrounding arguments. Keep chapter titles and structural metadata in the search representation. Do not silently discard footnotes or merge repeated headers into the prose.

Combine the already selected keyword search with local embeddings. Merge rankings, deduplicate overlapping passages, and preserve exact-name and phrase matching. A local reranker is an optional improvement if evaluation justifies its latency and model size. Start with a working keyword index while embeddings build, so importing a book does not force the user to wait for all processing.

### Give the agent several ways to read

The plugin should supply a small initial context containing the selected passage, nearby text, current chapter, document identity, and conversation scope. Tools can then expose bounded operations such as reading the outline, searching the allowed text, reading a passage with surrounding context, and listing relevant annotations.

Results should include stable evidence IDs, exact source text, locations, and explicit truncation or continuation information. The agent can search, read matches, identify missing evidence, and search again. Tool descriptions should explain when to expand context and when to stop. This method works through either CLI's tool protocol; retrieval quality should live in the plugin rather than differ by provider.

For a question about a selection, begin with local context. For a fact or definition elsewhere, search the allowed book and expand promising matches. For a comparison, decompose the question and obtain evidence for both sides. For a global question, use the chapter structure to obtain coverage across the allowed book, instead of treating the most similar five passages as representative.

### Add broader coverage gradually

A section and chapter summary hierarchy is simpler to test than full GraphRAG. Generate summaries lazily through the user's chosen CLI, or offer preparation explicitly. Record source revision, covered ranges, supporting evidence IDs, and generation provenance. This consumes the user's CLI quota even though it requires no API key. Keep derived summaries disposable and separate from authoritative annotations.

Summaries should help the agent find evidence and plan broader reading. Before making a precise claim or quotation, return to original text. An answer to a broad question should say which parts of the book supplied evidence and disclose incomplete coverage. If summaries are unavailable, a bounded scan over relevant sections can still work, with an honest latency and coverage tradeoff. Full-book prompting remains an option for suitably small allowed scopes and validated models, not the default for every question.

### Enforce scope before returning evidence

Every tool must apply the conversation's book and spoiler boundary. Clip passage expansion at the furthest point read. Filter annotations as well, because a note may itself mention later events. An early passage with a context prefix generated from the entire book can leak an ending, as can a whole-chapter summary that extends past the boundary. Derived content is eligible only if all of its source ranges are allowed; partial sections need summaries generated from the allowed prefix.

Filtering retrieval cannot erase the model's prior knowledge of a popular book. Web research can introduce spoilers too. The implementation can enforce what document tools disclose and instruct the agent to ground answers only in permitted evidence, but should not promise absolute spoiler freedom. Strict spoiler-safe conversations should avoid external searches about the book, subject to a product decision about the existing web setting.

### Verify success with book questions

Build a small evaluation set across public-domain fiction and nonfiction in EPUB and text PDF. Include exact facts, paraphrased concepts, selected passages needing earlier context, comparisons across chapters, global themes, missing answers, and questions just before a spoiler boundary. Include extraction failures and a query whose answer is in the middle of a long scope. Add original or modified fixture stories with known answers, so memorized knowledge of public books cannot masquerade as successful retrieval. Use held-out questions when tuning the index.

Measure evidence recall, claim support, citation correctness, scope leakage, answer coverage, latency, and tool-result size. Compare keyword-only retrieval, hybrid retrieval, passage expansion, summaries, and long-context prompting under similar budgets. Test both installed CLIs and their chosen models. Passing a citation link check establishes that the locator resolves; a separate check must establish that the cited passage supports the claim. No paper above demonstrates that our complete system already meets these requirements.

## CLI integration findings

Claude Code supports programmatic `-p` runs, custom prompt instructions, MCP configuration, and session resumption. Its startup stream reports MCP connection/configuration errors, which the plugin should check before accepting questions. `--bare` skips subscription login, so it is unsuitable for our subscription-based integration. These are documented interfaces, not an end-to-end test of our future adapter. [Programmatic execution documentation](https://code.claude.com/docs/en/headless).

Codex app-server exposes experimental `dynamicTools` registered on `thread/start`; tool invocation arrives as `item/tool/call`, and the host returns content. This fits a retrieval service owned by the plugin, without giving the agent book files or shell access. The documentation also describes usage updates and compaction events. Pin and check protocol compatibility rather than assuming experimental behavior is permanent. [Official OpenAI documentation](https://learn.chatgpt.com/docs/app-server).

Both transports can call the same retrieval implementation. MCP and dynamic tools carry requests and results; they do not extract, index, rank, or understand the book themselves. The plugin supplies those capabilities. No new model API integration or credential handling is required for this proposed path. This is an architectural inference from the interfaces and our existing product constraints, not a guarantee about vendor subscription policy.

### Keep tool results bounded and readable

Claude Code can save oversized successful MCP text results to a file and replace inline content with the file path. Its documented defaults include a 25,000-token limit, and foreground results can also be externalized above a character limit. Because our assistant lacks general file-reading tools, the plugin must paginate its own results before they are externalized. Do not solve this by increasing limits and returning entire books. [MCP output limits](https://code.claude.com/docs/en/mcp#mcp-output-limits-and-warnings).

Codex documents per-MCP-tool output token limits and truncation budgets. Regardless of transport, the plugin should set a conservative response budget itself and return a continuation cursor when necessary. [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

A proposed minimal tool set is:

- `get_book_outline`: chapter and section structure within the permitted scope, paginated when needed.
- `search_book`: hybrid-ranked matches with short exact excerpts, evidence IDs, readable locations, and optional section filters.
- `read_section`: bounded original text around a returned passage or within a section, with a cursor for continuing. It can expand surrounding context without exposing general filesystem reads.
- `get_annotations`: the permitted annotations for this document, with explicit limits.

Book identity and spoiler scope should be bound by the host conversation, not accepted as unrestricted model arguments. Tool outputs should distinguish source text from derived summaries and unambiguously report whether text or results were omitted. An empty search is not proof that the book never addresses the subject. These are proposed tool contracts; names and parameters should be tuned against actual agent behavior. Anthropic recommends a small number of purposeful tools, meaningful results, token efficiency, and realistic evaluations. [Tool design guidance](https://www.anthropic.com/engineering/writing-tools-for-agents).

### Preserve evidence outside conversation memory

Claude Code documents that it clears older tool outputs and summarizes conversations as context fills. Resume and compaction are useful for continuity, but they do not substitute for the source index. Keep retrieved evidence IDs and locators in plugin records and make passages available to retrieve again after compaction. [How Claude Code manages context](https://code.claude.com/docs/en/how-claude-code-works#when-context-fills-up).

If a conversation previously saw later text and the user enables spoiler-safe mode or lowers its boundary, filtering future tool calls cannot remove that earlier evidence from model history. A new CLI session/thread with a summary containing only permitted evidence is the safer proposed behavior. This needs a product decision and a test, particularly for conversation resumption.

## Further research worth tracking

Recursive Language Models treat long inputs as an external environment that the model can inspect and subdivide, with recursive model calls. The authors report gains on four long-context tasks using this strategy. This reinforces investigating external context and decomposition, but their approach is not a turnkey Claude Code or Codex feature. Arbitrary REPL execution and recursive model calls would exceed our current constrained tool design, and published results do not establish book QA quality in this plugin. Keep it as a later experiment if chapter-based retrieval and synthesis underperform. [RLM paper, version 3](https://arxiv.org/abs/2512.24601v3).

## Recommended next experiment

Build a retrieval proof of concept over one original fixture story and one long public-domain book, preserving source locators. Connect the four bounded tools to both CLIs, supply selection context automatically, and evaluate passage questions, cross-chapter comparisons, and a broad synthesis question. Measure retrieval and evidence support before choosing an embedding model or adding a summary hierarchy. A successful demo must obtain its evidence through our tools, preserve citation locations, and recover when an answer requires a second search. No live CLI model calls, indexing benchmark, or integration prototype was run for this research note.
