/**
 * How Reader colors PDF pages. "original" draws the PDF's own colors, "inverted" always shows light text on dark pages,
 * and "follow" shows dark pages only while Obsidian uses a dark theme.
 */
export type PageColors = "original" | "follow" | "inverted";
export const PAGE_COLOR_CHOICES: { value: PageColors; name: string }[] = [
  { value: "original", name: "Always original colors" },
  { value: "follow", name: "Follow Obsidian's color scheme" },
  { value: "inverted", name: "Always dark pages" },
];
export const DEFAULT_PAGE_COLORS: PageColors = "follow";

export function isPageColors(value: unknown): value is PageColors {
  return value === "original" || value === "follow" || value === "inverted";
}

/** A PDF's own choice wins over the general setting. */
export function showsDarkPages(general: PageColors, ownChoice: PageColors | undefined, darkTheme: boolean): boolean {
  const choice = ownChoice ?? general;
  return choice === "inverted" || (choice === "follow" && darkTheme);
}

/**
 * The PDF's choice after the toggle command or header button. A PDF with its own choice goes back to the general setting.
 * Otherwise it gets the fixed choice that shows the opposite of what it shows now.
 */
export function toggledChoice(general: PageColors, ownChoice: PageColors | undefined, darkTheme: boolean): PageColors | undefined {
  if (ownChoice) return undefined;
  return showsDarkPages(general, undefined, darkTheme) ? "original" : "inverted";
}

/** Keeps valid choices for vault paths, dropping anything else from a hand-edited or older data file. */
export function loadPdfPageColors(saved: unknown): Record<string, PageColors> {
  const choices: Record<string, PageColors> = {};
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return choices;
  for (const [path, value] of Object.entries(saved)) if (path && isPageColors(value)) choices[path] = value;
  return choices;
}

/** Moves choices to a renamed PDF or folder. Returns whether anything moved. */
export function renamePdfPageColors(choices: Record<string, PageColors>, oldPath: string, newPath: string): boolean {
  let moved = false;
  for (const [path, value] of Object.entries(choices)) {
    if (path !== oldPath && !path.startsWith(oldPath + "/")) continue;
    delete choices[path];
    choices[newPath + path.slice(oldPath.length)] = value;
    moved = true;
  }
  return moved;
}

/** Forgets the choices of a deleted PDF or folder. Returns whether anything was removed. */
export function forgetPdfPageColors(choices: Record<string, PageColors>, deletedPath: string): boolean {
  let removed = false;
  for (const path of Object.keys(choices)) {
    if (path !== deletedPath && !path.startsWith(deletedPath + "/")) continue;
    delete choices[path];
    removed = true;
  }
  return removed;
}
