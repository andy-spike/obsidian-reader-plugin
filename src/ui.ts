import { Menu, Notice } from "obsidian";
import { Annotation, AnnotationRecord, AnnotationStore } from "./annotations";
import { HighlightColor } from "./settings";

export function colorMenu(colors: HighlightColor[], current: string, choose: (id: string) => void): Menu {
  const menu = new Menu();
  for (const color of colors) menu.addItem(item => item.setTitle(color.name).setChecked(color.id === current).onClick(() => choose(color.id)));
  return menu;
}

/** Shows a short message in a Reader tab, with an optional action. */
export interface Toaster { toast(message: string, action?: { label: string; run: () => void }): void }

/** Deletes immediately and offers a short undo window instead of asking for confirmation. The undo appears in the given Reader, or as an Obsidian notice without one. */
export function deleteAnnotation(store: AnnotationStore, record: AnnotationRecord, annotation: Annotation, reader?: Toaster | null): void {
  const index = record.annotations.indexOf(annotation);
  if (index < 0) return;
  record.annotations.splice(index, 1);
  void store.save(record).catch(() => {});
  const restore = () => {
    if (record.annotations.some(entry => entry.id === annotation.id)) return;
    record.annotations.splice(Math.min(index, record.annotations.length), 0, annotation);
    void store.save(record).catch(() => {});
  };
  if (reader) {
    reader.toast("Highlight deleted.", { label: "Undo", run: restore });
    return;
  }
  const message = createFragment();
  message.createSpan({ text: "Highlight deleted. " });
  const undo = message.createEl("a", { text: "Undo", href: "#" });
  undo.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    restore();
    notice.hide();
  });
  const notice = new Notice(message, 6000);
}
