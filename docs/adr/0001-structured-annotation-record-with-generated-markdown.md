# Structured annotation record with a generated Markdown file

Each source document's highlights and passage notes are stored in a structured annotation record owned by the plugin. The Markdown annotation file is regenerated from that record and is not parsed back. Obsidian users would usually expect Markdown to be authoritative. We chose the record because annotations must keep reliable identities and passage locations, and hand-edited Markdown could silently break both. The generated file keeps the notes readable, searchable, and linkable in the vault.

The record uses a documented project format, not strict W3C Web Annotation conformance. Its passage locations borrow W3C-style selectors, such as quoted text with surrounding context, text positions, and EPUB CFIs, so highlights can be found again after text is re-extracted.

## Considered options

- **Strict Markdown as authority.** It is readable without the plugin, but one careless edit can corrupt IDs or locations.
- **Structured data only.** It is the most reliable option, but it leaves no durable notes in the vault.
- **Full W3C Web Annotation conformance.** It allows interoperability with other tools, which nobody needs yet, at the cost of a heavier schema.
