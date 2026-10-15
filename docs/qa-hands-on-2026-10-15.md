# Hands-on reading workflow verification

Date: 2026-10-15. Environment: Obsidian 1.14.4 on Linux, in this checkout's private headless development vault.

This pass used real pointer drags, clicks, and keyboard input, with screenshots inspected between actions. It did not run `scripts/e2e.mjs`. PDFs were opened through Obsidian's quick switcher, and palette and note-placement changes were made in the Settings window. JavaScript was used to size headless windows and read diagnostic state, not to create highlights, write notes, change settings, or navigate the PDFs.

## Confirmed finding: page navigation reports the wrong page in a narrow pane

Status: fixed in the follow-up implementation. The original reproduction and measurements are retained below.

The two-page sample PDF reaches the end of the document after requesting page 2, but the toolbar returns to `1 / 2`. Next remains enabled and cannot move the view farther. This is a navigation and page-indicator defect. The observed highlights and book-note writing remained intact.

Reproduction:

1. Open `Books/Sample reading book.pdf` in Reader.
2. In Reader Plugin settings, choose to open book notes beside the PDF.
3. Open the book note and drag the divider until the Reader's scrolling area is about 446 CSS pixels wide. Keep Fit width enabled. The observed zoom was 49% in the 1600 by 1000 window.
4. Enter `2` in the page field and press Enter.
5. Observe that the PDF scrolls to its bottom and shows page 2, while the field reads `1 / 2` and Next remains available.

Read-only measurements after the request:

```json
{
  "paneWidth": 446,
  "pageField": "1",
  "scrollTop": 242,
  "maxScroll": 242,
  "pages": [
    { "page": "1", "top": -140, "bottom": 374 },
    { "page": "2", "top": 390, "bottom": 904 }
  ]
}
```

The behavior also appeared while narrowing the pane after navigating to page 2. Entering page 2 again reproduced it. Widening the pane allowed normal page-2 navigation.

The original current-page calculation in `src/reader-view.ts`, in `update()`, sampled a point 30% down the viewport. In this geometry that point remained on page 1, even at maximum scroll. The page requested by `goToPage()` was consequently replaced by page 1 during the next update. The existing two-tab E2E check did not exercise this geometry.

Local screenshot evidence is retained under `.dev-vault/qa/hands-on-2026-10-15/narrow-page-number.png`. These local artifacts are ignored by Git.

## Fix and regression verification

Reader now retains an explicitly requested page until scrolling moves away from the position reached by that request. This matters when the browser clamps several requested pages to the same scroll position, including when an entire short PDF fits onscreen. Resizing, zooming, and unloading invalidate the request. Ordinary scrolling recognizes the beginning and end of the document before using the usual viewport sample. Restoring saved reading state recalculates the displayed page from the saved viewport position.

The new E2E case failed with `Expected page 2 after layout settled` before the fix. It now passes at a measured Reader width of 446 pixels. It covers narrowing a pane already on page 2, entering a page number, Previous/Next and their disabled states, ordinary scrolling to either end, reopening, and navigation at 25% zoom with both pages entirely onscreen.

The complete `pnpm test:e2e` run passes all 17 workflow groups. `pnpm build` reports no errors or warnings, and `pnpm test` passes all 56 tests.

A follow-up hands-on pass opened the sample PDF through the quick switcher, narrowed the window to obtain the same Reader geometry, entered page 2, and clicked Previous and Next. The fixed result was:

```json
{
  "paneWidth": 446,
  "page": "2",
  "nextDisabled": true,
  "scrollTop": 242,
  "maxScroll": 242
}
```

Previous returned to page 1, and Next returned to page 2 with Next disabled again. The fixed screenshot is retained locally at `.dev-vault/qa/hands-on-2026-10-15/narrow-page-number-fixed.png`.

## Workflows that passed

- Opened the sample PDF through Ctrl+O and inspected its rendered pages and book-note placeholder.
- Drag-selected a passage, clicked Note, and typed personal writing into the section it opened. The PDF showed the writing indicator.
- Opened the highlight popup, recolored the passage, and saw the quote's color update.
- Deleted the highlight and visually verified that personal writing remained. Clicked the notice's Undo link and saw the highlight and quote color return.
- Entered page 2, then clicked Open passage in the book note. Reader returned to the passage and visibly pulsed it while leaving the note open.
- Opened Settings, added Questions and Evidence colors, renamed them, and dragged Evidence above Questions. Primary and Secondary remained first.
- Changed book-note placement to beside the PDF and opened it through the Reader header. Its quote and personal writing were present.
- Selected a second passage and used the reordered palette's Questions color. The PDF and book note displayed the custom color.
- Restarted the private Obsidian process. The highlights, custom palette, quote sections, and personal writing were still present.
- Opened the 1,108-page development PDF through the quick switcher, opened its table of contents with T, searched for evaluation, and pressed Enter on a result. The dialog closed and the reader navigated into the matching section. No page-render error was present in the inspected view.
- Removed the two added colors through Settings. The passage with the removed Questions color and its quote became gray. Recolored that passage with Secondary successfully.

Settings were returned to the original two-color palette, sidebar note placement, and highlight mode off. The sample passages and writing remain in the disposable development vault for inspection. No personal PDF was annotated.

Additional local screenshots show the highlight and writing, the reordered palette, and the removed-color fallback in `.dev-vault/qa/hands-on-2026-10-15/`.

## Verification limits

The original exploratory pass recorded the defect without changing plugin behavior. The follow-up fix and its verification are described above.

The headless Settings window initially had a 1 by 1 viewport and needed resizing before visual interaction. Keyboard shortcuts became unresponsive after one Settings-window close, including Obsidian's own Ctrl+O. After restarting and clicking the Reader pane, H, Ctrl+O, and T worked. That observation is not isolated to the plugin and is not classified as a confirmed plugin defect.

This was a targeted exploratory pass, not an exhaustive test of every setting, scanned PDFs, cross-platform behavior, sync, or performance under sustained load.
