# Own Reader view instead of Obsidian's PDF viewer

The plugin renders PDFs and EPUBs in its own Reader view. It uses a bundled, pinned pdf.js for PDFs and a pinned foliate-js for EPUBs, rather than extending Obsidian's built-in PDF viewer. Extending that viewer, the way PDF++ does, would mean less code. But selection and highlight rendering are only reachable there by patching Obsidian's private APIs, which PDF++ itself warns can break when Obsidian updates. Owning the view also gives both formats one shared selection, highlight, and citation behavior.
