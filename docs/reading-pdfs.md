# Reading PDFs

## Scrolling and pages

Reader shows the whole PDF as one continuous scroll. Long books stay responsive because Reader draws only the pages near your view and releases the ones you've scrolled far past. Until a page loads, it takes the size of the first page.

A bar floats at the bottom center of the pane. From left to right it has:

- previous and next page arrows
- a page number field, where you can type a page and press Enter
- zoom out and zoom in
- the zoom percentage
- a reset button

**Previous** first returns to the top of a partly scrolled page, then moves up a page on the next click.

When you open a PDF, Reader waits until the pages in view are drawn, then fades them in. A small "Opening PDF…" message appears only if loading takes longer than about half a second.

## Zoom

Fit width is the default. It follows the pane as you resize it or open and close sidebars. Click the zoom percentage to choose Fit width, Fit page, or a preset percentage. At 100% a page matches its printed size.

Hold Ctrl (Cmd on macOS) and scroll the wheel to zoom around the pointer. Pages stretch while you zoom and turn sharp again when you stop.

The reset button, or the **Reset zoom** command, returns to Fit width.

## Table of contents

If the PDF has an outline, a list button appears in the Reader header. Click it, press **T**, or run **Show table of contents**.

The table of contents opens as a dialog in the middle of the window. It has a fixed size, so it looks the same for every book, and the list scrolls inside it.

- At first only the chapters show. The chapter you're reading is opened down to your current section, which is highlighted.
- Click a chevron to open or close a section. Click a title to jump to that heading.
- Type in the search field to filter by title. Each match shows under its parent chapters and sections, which are dimmed.
- Arrow keys move the selection. Page Up and Page Down move ten rows. Right opens a section or moves to its first child, Left closes it or moves to its parent, and Enter jumps.

## Remembering your place

Reader remembers the page, the position on the page, and the zoom for every PDF you read. Close the PDF, restart Obsidian, or open the PDF in a new tab, and you continue where you stopped. A link that names a page, like `[[Book.pdf#page=40]]`, still opens at that page.

Renaming the PDF keeps its position. Reader remembers the 200 PDFs you read most recently.

## Scanned PDFs

Reader can select and highlight only text that is in the PDF. If none of the first twelve pages has selectable text, Reader shows a hint that the PDF needs OCR. Run the PDF through an OCR tool first, then replace the file in your vault.
