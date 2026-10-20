/** Whether a vault path is `target` itself or lies inside it, as when `target` is a renamed or deleted folder. */
export function isSameOrInside(path: string, target: string): boolean {
  return path === target || path.startsWith(target + "/");
}

/** A PDF's file name without its folder or `.pdf` extension. */
export function pdfTitle(path: string): string {
  return path.split("/").pop()!.replace(/\.pdf$/i, "");
}
