# PDF and core workflow runtime review

Reviewed Reading Desk 0.1.4 at `19b051a` on Linux with Obsidian 1.14.4 and PDF.js 6.4.299. This was an exploratory runtime review, using the checkout's private `pnpm headless` Obsidian. No automated tests were added or run, and no plugin implementation was changed.

## Findings

### 1. Reader has no search within the PDF

Priority: high for ordinary reading, especially long books.

Open a PDF in Reader, focus the document, and press Ctrl+F. No search field appears. This reproduced with both the two-page sample and a 1,108-page book. The only visible input in Reader remained the page field. There is no search action in Reader's toolbar or registered commands either.

Open the same book through **Open PDF in Obsidian's normal viewer**, press Ctrl+F, and a Search field appears and accepts a query. Reader takes over normal PDF opening, so users lose this standard operation unless they explicitly switch viewers.

Suggested correction: provide document search with result navigation, or an obvious search action that transfers to the normal viewer until Reader supports it.

### 2. A rotated page's selectable text does not line up with its visible text

Priority: high when a PDF contains rotated pages.

Open the disposable `Books/QA compatibility.pdf`, then follow **Jump to rotated page**. Its second page has a 90-degree PDF rotation. Drag over the visible words. The selection remains empty.

This reproduced in two separate Reader tabs. In the second reproduction, the canvas occupied approximately 895 by 1,158 CSS pixels, while the text layer occupied approximately 1,158 by 895 pixels. The selectable span began around x=1,316, beyond the canvas's right edge at x=1,264. The canvas and text layer therefore disagree about page orientation. This prevents normal selection, copying, and creation of Reading Desk highlights on the visible words.

The page renders and the link reaches it. This is a selection-layer failure, not a missing page. Relevant code is the canvas and TextLayer setup in `src/reader-view.ts`, plus the PDF.js text-layer CSS in `styles.css`. The precise corrective change has not been established by this review.

### 3. Existing PDF comments disappear from the reading experience

Priority: high for annotated PDFs because context becomes inaccessible without a warning.

The compatibility PDF contains a saved PDF Text annotation with the content `Saved PDF comment: essential context.` PDF.js reports the annotation, but Reader shows neither its icon nor a popup. The same annotation is visible in Obsidian's normal viewer; clicking its icon opens the saved comment.

Existing PDF highlight appearance still renders. Reading Desk's own highlights and Markdown comments also work. The missing feature is access to comments already embedded in the PDF.

Reader creates interactive overlays only for Link annotations in `renderLinks`. It does not create the PDF annotation popup layer. Suggested correction: render supported existing annotations, or visibly disclose the limitation and offer the native viewer.

### 4. PDF form fields look editable but are only static page content

Priority: medium for a book reader, high for users who open forms through it.

The compatibility PDF has a text widget named `reader_name`, initially containing `Existing field value`. Reader paints its appearance but creates no input or textarea for the field. It cannot receive edits. In the normal viewer, the same field is an input and accepted `Edited in native viewer` through real pointer and keyboard input. Saving or exporting those native form edits was outside this review.

This is particularly confusing because the existing field border and value remain visible. Suggested correction: support interactive widgets or provide a clear native-viewer fallback for form PDFs.

### 5. Password-protected PDFs have no unlock flow

Priority: medium overall, blocking for an affected document.

Open the disposable `Books/QA password.pdf` through normal file opening. Reader displays `Could not open this PDF. No password given` and never offers a password field.

The normal viewer presents its password input and renders the two pages after the fixture password is supplied. The fixture password is a local, generated QA value, not a user credential.

The Reader loading task has no password callback. Suggested correction: supply a password prompt, or offer the native viewer directly from this error state. At present the native-viewer command still provides a manual escape route.

### 6. "Open beside the PDF" can hide the PDF instead

Priority: high for the core book-note workflow.

1. Open a PDF in Reader and create a highlight so its book note exists.
2. Open that book note as a regular tab in the same tab group as the PDF.
3. Return to the PDF.
4. Right-click its book-note action and choose **Open beside the PDF**.

The existing Markdown tab is revealed in the same group, hiding the PDF. The workspace still has one main tab group and zero visible Reader views. This was reproduced through the actual context-menu action.

As a control, closing the existing book-note tabs and requesting the same action creates two groups with both the PDF and note visible.

`ObsidianBookNoteWorkspace.find` treats every main-area note as "beside" without checking whether it shares the PDF's tab group. `create` does split the Reader correctly, but is skipped when such an existing note is found. Suggested correction: reuse only a note in a separate visible group, or move/split a same-group note before revealing it.

## Workflows exercised successfully

- Default file opening routes to Reader. The explicit native-viewer command opens Obsidian's PDF viewer.
- The sample's external hyperlink passes the expected URL to `window.open` with `_blank` and `noopener,noreferrer`. The browser launch was intercepted so QA did not open the user's browser. OS browser launching was not verified.
- An explicit internal PDF destination reaches page 2. A named destination in the compatibility PDF also reaches its target page.
- Table of contents opens and keyboard selection navigates to a chapter. A real book's nested outline loads.
- The page field accepts page jumps and clamps 999 to the sample's last page and 0 to its first page. The G shortcut focuses it.
- Zoom in, zoom out, keyboard shortcuts, reset to width, Fit page, and the 50% preset work. A real Ctrl-wheel event also changes zoom.
- Continuous scrolling and PageDown move the document. A 1,108-page PDF opens and jumps to pages 300 and 700. Only two canvases were retained at the observed distant-page checkpoints. This is an observation, not a performance benchmark.
- Real pointer selection produces the expected quote and selection popup. Both default highlight colors save and render. Recoloring updates both Reader tabs for the same PDF.
- Copy text places the expected quote on the clipboard.
- The Note action creates a highlight and focuses its comment field. Typing a comment saves it in the quote note and displays the comment dot on the PDF.
- Highlight mode turns mouse selections directly into highlights and can be toggled off.
- A selection spanning two pages becomes two annotations with the expected page numbers, quote text, and normalized rectangles.
- Deleting a highlight removes it and offers Undo. Undo restores the highlight and its saved comment after reconciliation finishes.
- Highlight JSON, book-note sections, and individual quote notes are written to the vault. A plugin reload preserves the saved annotation, recolor, and comment.
- Rendered **Open passage** links return to Reader, reveal the annotation's page, and flash the correct highlight. A normal Obsidian PDF wiki link with `#page=700` reaches page 700.
- A plugin reload preserves the long book's physical reading position and displayed page 700.
- Sidebar cards follow a switch to another PDF. Opening a book note beside a PDF succeeds when there is no conflicting same-group book-note tab.
- Updating a palette color redraws existing marks. The original palette was restored afterward.
- Moving annotation storage to a different hidden folder moves all five records observed in this vault. Moving it back succeeds.
- Renaming the annotated sample PDF updates its record's source path and retains all five annotations. Renaming it back succeeds. Obsidian's link-update confirmation was accepted for the generated fixture notes.
- A simulated annotation write failure produces the failure notice and automatic retry. The next write succeeds without another user action, the recovery notice appears, and the saved JSON contains the new color. The original adapter method was restored.
- An image-only PDF renders and displays the expected OCR hint, with no selectable text.

## Additional navigation observation

Following an internal PDF link does not create a Reader page-history entry. After a page-1-to-page-2 jump, Alt+Left did not return to page 1. In a tab with prior view history, clicking its Navigate back action returned to a previous native-viewer entry rather than the link's source location. Returning from footnotes therefore requires a manual page jump. This was observed, but native-viewer page-history parity was not fully investigated, so it is not included among the six prioritized findings above.

## Evidence and limits

The generated PDFs, notes, and records remain inside this checkout's ignored development vault. Local screenshots and the compatibility fixture generation script are in `.dev-vault/qa-evidence/`:

- `reader-compat.png`: Reader's static form appearance and absent comment icon.
- `native-compat.png`: the same page in the native viewer.
- `reader-rotated-fresh.png`: the rotated-page reproduction.
- `book-note-beside-confirmed.png`: the context-menu reproduction hiding the PDF.
- `reader-password.png`: Reader's password failure.
- `create-reader-qa-pdf.py`: the disposable compatibility document recipe.

The recipe uses ReportLab and pypdf installed in `/tmp/reader-qa-env`. These dependencies were not added to the project. The screenshot of the rotated page should be assessed together with the measured canvas/text rectangles above; the invisible selection layer cannot be diagnosed from the picture alone.

No unexpected window error or unhandled rejection was captured during the observed session. Expected simulated disk failures were checked separately. This does not prove there are no console warnings or failures outside the exercised paths.

This review does not establish Windows/macOS behavior, screen-reader accessibility, OS browser launching, printing, native form export, multi-process synchronization, arbitrary malformed PDFs, or exhaustive rendering coverage across image codecs and fonts. OCR remains outside the plugin's documented support. Some settings and file operations were exercised through the live plugin's runtime methods rather than the settings window. Reader controls, pointer selection, popup actions, text entry, and links were also exercised through real input.

`pnpm worktree:setup`, `pnpm build`, and `pnpm lint` passed. The build reported zero Svelte/TypeScript errors and warnings.
