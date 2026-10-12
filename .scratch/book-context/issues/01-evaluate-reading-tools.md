# Evaluate source document reading tools with both assistant CLIs

Status: resolved
Type: prototype
Blocked by: none

## Question

Can Claude Code and Codex answer passage, chapter comparison, and broad source document questions through bounded document tools, while returning supporting citations and respecting a spoiler boundary?

## Answer

The approach is viable for a first implementation. Both CLIs retrieved original evidence for facts, comparisons, and synthesis. Cross-chapter guidance improved a selected-passage answer that had omitted an earlier definition. Whole-document reliability and full coverage remain unproven.

See `docs/research/book-context-prototype.md` for the findings, compatibility gap, and limits.

## Primary source

- Branch: `prototype/book-context-retrieval`.
- Commit: `61eed56c18db7d962c3d3f984c89bf57f7db3df4`.
- Prototype: `src/prototype-book-context/demo.html` on that commit.
- Runner and instructions: `src/prototype-book-context/run.mjs` and `README.md` on that commit.
- Exact evidence: `src/prototype-book-context/results/` on that commit.

## Validation

Seventeen retained live-run records across an original 126,877-word fixture and the 32,310-word Project Gutenberg edition of The Time Machine. All captured citation IDs were supplied to their conversations. Requested evidence and answers were inspected. Browser replay, citation opening, pagination, and direct spoiler-scope denial were checked. See the findings for the incomplete selected-passage baseline and untested behavior.

## Implementation follow-up

Carry the observed requirements into the specification and subsequent implementation tasks. Keep the throwaway runner and HTML on the prototype branch. Resolve Codex configuration isolation before treating the adapter as production-ready.
