# Reader Plugin

An Obsidian desktop plugin for reading PDFs with highlights and notes.

## Status

This is the first version. It is a PDF reader with annotations and comments. It can:

- Open PDFs from your vault in a continuous-scroll reader.
- Highlight passages in colors you choose.
- Keep a book note for each PDF, where you write comments about passages.
- Save highlights and notes in your vault.

Read the [PDF reader guide](docs/pdf-reader.md) for details.

## Roadmap

- EPUB support. Pending.
- An AI reading assistant that answers questions about your books. Pending. You can use it with an API key or an existing subscription.

## Development

Requirements are Node.js 22 or newer, pnpm, and Obsidian desktop.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

The [development guide](docs/development.md) covers the development vault, watch mode, headless checks, and architecture.

## Documentation

- [Product direction](docs/product-direction.md) describes the intended reading workflow.
- [PDF reader guide](docs/pdf-reader.md) covers features, the storage format, and runtime checks.
- [Reading workflow plan](docs/reading-workflow-plan.md) records planned decisions and acceptance targets. It is not yet an approved implementation plan.
- [Development guide](docs/development.md) covers building, testing, and runtime checks.
- [Worktree workflow](docs/worktrees.md) explains how agents do task work.
