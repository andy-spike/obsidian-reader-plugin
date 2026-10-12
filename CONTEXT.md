# Reading and annotation

This context describes reading documents in an Obsidian vault, keeping annotations, and asking an assistant questions about the reading.

## Language

**Source document**:
The work the user reads, such as a book or article stored in the vault as a PDF or EPUB. A source document keeps its identity when its file is renamed or moved; a different edition of the same work is a different source document until the user chooses to carry annotations over.
_Avoid_: Book when referring to every supported kind of work

**Current location**:
Where the user is in a source document now; opening the document returns here.

**Furthest point read**:
The latest location the user has reached in a source document. It does not move backward when the user rereads earlier text, and the user may reset it.
_Avoid_: Reading position, which is ambiguous between current location and furthest point read

**Spoiler-safe mode**:
A per-conversation setting that restricts the reading assistant to text before the furthest point read.

**Passage**:
A specific span of text within a source document.
_Avoid_: Snippet, chunk when referring to text the user reads or selects

**Highlight**:
A saved annotation that marks a passage in a source document. Each highlight has exactly one highlight category.

**Highlight category**:
A meaning the user assigns to a highlight color, such as "important" or "question".
_Avoid_: Tag, which names a separate, not-yet-supported kind of label

**Passage note**:
The user's commentary attached to a passage or section of a source document.
_Avoid_: Note when the distinction from an Obsidian Markdown file matters

**Annotation file**:
The Markdown file specific to a source document that presents its highlights and passage notes for reading, searching, and linking in the vault. The plugin regenerates it from the annotation record; it is a view, not the place annotations are edited.
_Avoid_: Book note when referring to annotation files for every kind of source document

**Annotation record**:
The authoritative, structured store of every highlight and passage note for one source document. When the annotation record and the annotation file disagree, the annotation record wins.

**Reading assistant**:
The assistant the user asks questions about a selected passage or a source document as a whole. It reads but never changes the user's annotations; only the user saves an answer as a passage note.
_Avoid_: Agent when its autonomy or permissions have not been specified

**Citation**:
A reference in a reading assistant answer to a passage of the source document, which opens that passage when followed. Outside sources are linked, not cited, and the assistant's own interpretation is labeled as such.

**Conversation record**:
The saved history of one conversation with the reading assistant about one source document, kept by the plugin so the user can read it later regardless of what the assistant CLI retains.
_Avoid_: Session, which names the assistant CLI's own resumable state

**Assistant CLI**:
The command-line assistant the user has installed and signed in to themselves, such as Claude Code or Codex, which does the reading assistant's thinking. The user chooses which assistant CLI the reading assistant uses.
_Avoid_: Provider, backend, model when referring to the installed program
