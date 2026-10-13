# Book context prototype results

Completed October 12, 2026. The question was whether Claude Code and Codex can answer source document questions through bounded reading tools, without receiving the whole source document in a prompt.

## Decision

Proceed with the accepted document-tool approach for the first implementation. Live runs establish that both assistant CLIs can obtain original passages through the proposed transports and use them for facts, comparisons, and synthesis. They do not establish reliable answers to every question or complete coverage of every source document.

Keep these requirements in the implementation:

- Supply the selected passage and nearby text automatically.
- Tell the reading assistant to search all permitted chapters for earlier definitions and references when local context is insufficient.
- Return bounded original text, evidence IDs, locations, and explicit continuation information.
- Provide separate operations for reading a chapter and searching one. Reject an empty keyword query with guidance to use chapter reading.
- For broad questions, gather evidence across chapters and disclose incomplete coverage.
- Check citation support as well as whether the source location opens.
- Enforce permitted scope in every document tool, including passage notes and direct passage requests.

The existing plan to add local embeddings remains untested. Chapter summaries remain an improvement to evaluate. Neither is required to establish the initial CLI/tool connection.

## Experiment

The retained prototype is on local branch `prototype/book-context-retrieval`, commit `61eed56c18db7d962c3d3f984c89bf57f7db3df4`. It contains the single-file HTML walkthrough, original fixture, pure reading tools, live CLI runner, and exact result records under `src/prototype-book-context/`.

The prototype used Codex CLI 0.162.1 with `gpt-6.1-sol`, and Claude Code 2.1.296 with its `sonnet` alias, which resolved to `claude-sonnet-5-5`. Both used medium reasoning effort and their existing subscription sign-in. The runner did not read credential files. Every question began a fresh conversation in an empty temporary working directory. Claude received tools through loopback MCP HTTP; Codex received dynamic tools through app-server.

The original source document, *The Salt Ledger*, contained 126,877 words and 667 passages. Most of its length was explicitly synthetic inventory text around short story passages. This establishes retrieval over that volume, not comprehension of a natural novel of the same length. Six questions covered a selection requiring earlier context, a fact in the middle, a comparison between chapters, a broad question, a spoiler boundary, and missing information.

The published source document was the Project Gutenberg plain-text edition of *The Time Machine*, 32,310 words. Two questions asked where usable matches were found and how the explanation of the Eloi–Morlock relationship changed. This was a plain-text import; PDF and EPUB extraction were not exercised. [Source edition](https://www.gutenberg.org/ebooks/35).

Seventeen records were retained: twelve original-fixture runs, four published-book runs, and one guided Codex follow-up. These are examples, not a representative benchmark. There were also two preliminary selection runs before the retained full run; they showed variable retrieval of the earlier definition and are not included in the table below.

## Findings

| Question | Codex | Claude Code |
| --- | --- | --- |
| Selected passage | Local explanation supported, but earlier definition omitted. Guidance retrieved it in a follow-up. | Retrieved the earlier definition in the retained run. |
| Middle-of-document fact | Retrieved the correct reading and correction. | Retrieved the correct reading and correction. |
| Chapter comparison | Retrieved evidence from both chapters. | Retrieved evidence from both chapters. |
| Broad fixture question | Retrieved the beginning, middle, and end. Used 21 calls, including five unproductive empty searches. | Retrieved the key stages in five calls and disclosed incomplete reading. |
| Spoiler-safe question | Withheld the later cause and repair. | Withheld the later cause and repair. |
| Missing age and birthday | Said the details could not be found. | Said the details could not be found and explained search limits. |
| Published-book fact | Retrieved the original matches passage. | Retrieved the original matches passage. |
| Published-book synthesis | Retrieved early and later explanations and distinguished inference from observation. | Retrieved early and later explanations and distinguished inference from observation. |

All captured citation IDs belonged to evidence supplied to that conversation. The mechanical checks do not prove that every statement is supported. Answers and cited original passages were also inspected for the requested facts and distinctions. The missing earlier definition is recorded as incomplete context, rather than counted as a full success.

The largest captured tool result was 5,550 characters. Recorded answer times ranged from 5.84 to 29.75 seconds. The published-book synthesis used nine calls for each CLI. These timings apply to this experiment on this machine, not to production performance targets.

Browser checks replayed all 76 baseline original-fixture tool calls without a result mismatch. The guided case retrieved the earlier definition. Citation buttons opened the expected fixture passage. A direct request for a chapter-8 passage was denied at the chapter-4 boundary, the later passage note was hidden, and pagination advanced to the next part. The HTML was rendered at 728-pixel and 360-pixel widths without script errors.

## Compatibility finding

The installed Codex rejects `--ignore-user-config` as an unexpected argument. The prototype instead used explicit configuration and feature overrides, disabled web research, and selected no environments. Complete isolation from user configuration was not established. The production adapter must resolve this requirement against the installed protocol before release. This changes the implementation assumption, not the product rule that the plugin must never read subscription credentials.

## Limits and next step

The experiment did not test embeddings, MiniSearch ranking, chapter summaries, PDF/EPUB extraction, Obsidian navigation, arbitrary passage-level spoiler limits, multi-turn compaction, resumed history, Windows, or broad quality across different books. Public-book answers may draw on model prior knowledge; the original fixture supplies the stronger check that new evidence can be retrieved. No comparison against full-book prompting was run.

Use the requirements above when implementing production retrieval and CLI adapters. Include a larger held-out evaluation set and explicit coverage reporting before claiming reliable whole-document answers. The prototype should remain separate from production code.

## Inspect the retained primary source

```sh
git show 61eed56:src/prototype-book-context/README.md
git show 61eed56:src/prototype-book-context/results/codex-selection-guided.json
```

To re-run it, switch to `prototype/book-context-retrieval` and follow its README. The HTML file opens directly in a browser and replays captured output without making model calls. Running the CLI experiment again makes live calls and consumes subscription usage.
