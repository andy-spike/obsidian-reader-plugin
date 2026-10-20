# Reading PDFs

## Scrolling and pages

Reader shows the whole PDF as one continuous scroll. Long books stay responsive because Reader draws only the pages near your view and releases the ones you've scrolled far past. Until a page loads, it takes the size of the first page.

A bar floats at the bottom center of the pane. From left to right it has:

- Back and Forward arrows for returning from PDF links, outline entries, and search results
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

## Page colors

Dark pages show light text on dark paper, so a PDF doesn't glare when Obsidian uses a dark theme. Reader inverts the drawn page and turns its hues back, so a red heading stays reddish. Photos and pictures are inverted too, so they look like negatives. Highlights keep their own colors.

The general choice is in **Settings → Reading Desk → PDF page colors**. See [Settings](settings.md#reader).

To choose differently for one PDF, use the page colors button (the half-filled circle) in the Reader header. It is lit while dark pages show.

- **Click** it to switch this PDF between dark pages and original colors. Click again to return the PDF to the general setting.
- **Right-click** it to choose **Default** (the general setting), **Original colors**, **Match Obsidian theme**, or **Dark pages** for this PDF.
- The **Toggle dark pages for this PDF** command does the same as a click.

A PDF keeps its choice when you rename or move it in Obsidian, and on every device that syncs the plugin's settings. Changing the general setting doesn't change PDFs that have their own choice.

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

## Finding text

Press **Ctrl+F**, or **Cmd+F** on macOS, or click the search button in the Reader header. Type to search the whole PDF. Reader marks the matches on the page and shows your position in the result count.

Press **Enter** for the next match and **Shift+Enter** for the previous one. **F3** and **Shift+F3** also move between matches. Search wraps at the end of the document. **Escape** closes the search bar and removes its marks. Search ignores case and handles PDF line breaks and ligatures through PDF.js.

Following an internal PDF link, an outline entry, or a search result keeps a return location. Use the bottom bar's Back and Forward buttons, or **Alt+Left** and **Alt+Right**, to revisit those locations. This history lasts for the open Reader tab.

## Passwords, PDF comments, and forms

Reader prompts when a PDF requires a password. An incorrect password offers another attempt; Cancel stops opening the document. Passwords are used only to unlock the PDF and are not saved in settings or notes.

Existing comments embedded in a PDF appear as comment buttons on the page. Click one to read its text. These comments remain part of the original PDF and are separate from Reading Desk's Markdown passage notes.

Reader displays form PDFs for reading and highlighting. A notice identifies their form fields. Click **Fill forms in Obsidian's PDF viewer**, or click a form field, to open the interactive form in Obsidian's normal viewer. Reader does not edit or save form values itself.

If a PDF cannot open, its error message also offers a button for opening the normal viewer.

## Scanned PDFs

Reader can select and highlight only text that is in the PDF. If none of the first twelve pages has selectable text, Reader shows a hint that the PDF needs OCR. Run the PDF through an OCR tool first, then replace the file in your vault.
