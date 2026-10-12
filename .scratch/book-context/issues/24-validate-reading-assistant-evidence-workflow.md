# 24: Validate the complete reading assistant evidence workflow

**What to build:** Verify the assembled workflow on representative source documents and retain evidence that facts, comparisons, broad answers, citations, annotations, continuation, and scope restrictions work together.

**Blocked by:** 14: Answer cross-chapter and broad questions with disclosed coverage; 16: Use annotations in questions and save an answer as a passage note; 18: Resume conversations and narrow their scope safely; 19: Handle revised source documents and stale evidence safely; 22: Run assistant CLI questions across supported desktop systems; 23: Rebuild large-document indexes without interrupting reading.

**Status:** ready-for-agent

- [ ] Use fiction and nonfiction in EPUB and text PDF, including original known-answer fixtures, public-domain sources, and held-out question variations. Avoid relying on model memory of familiar books.
- [ ] Run repeatable application-facing contracts with real extraction, retrieval, records, and controlled CLI behavior for every required user path, including late-output races and explicit note saves.
- [ ] Run opt-in live evaluations for both signed-in assistant CLIs and the fallback where supported; capture versions/models, source revisions, retrieved passages, answers, timings, and chapter coverage.
- [ ] Check issued citation identity and actual Reader navigation separately from semantic support. Inspect unsupported claims and omitted evidence; no simple word-match score or small pass sample is an accuracy guarantee.
- [ ] Check passage-level spoiler limits across initial context, retrieval, continuations, annotations, narrowed history, and restored conversations. Document prior-knowledge/web limits separately.
- [ ] Record keyword-only versus hybrid retrieval behavior and the agreed opening/indexing measurements. Do not impose an invented answer-latency or accuracy threshold.
- [ ] Record native desktop coverage, configuration-isolation results, and all remaining failures honestly. Any unmet required behavior remains a blocking follow-up rather than being treated as ready to release.
- [ ] Keep chapter summaries, OCR, mobile support, full annotation UI, and public release outside this verification ticket. Do not modify or close the parent specification.

Specification: Reading assistant with source document context. User stories: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56.
Prototype evidence: retained commit `61eed56c18db7d962c3d3f984c89bf57f7db3df4`; use the specification and prototype findings for the accepted contracts and known limits.
