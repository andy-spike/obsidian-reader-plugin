import { Menu, Notice } from "obsidian";
import { Annotation, AnnotationRecord, AnnotationStore } from "./annotations";
import { HighlightColor } from "./settings";

/**
 * A menu whose items may carry a checkmark. Obsidian only adds the checkmark to the checked item, so the menu's width
 * would change with the selection; the class reserves the checkmark's space on every item (see styles.css).
 */
export function checkMenu(): Menu {
  const menu = new Menu();
  (menu as Menu & { dom?: HTMLElement }).dom?.addClass("reader-check-menu");
  return menu;
}

export function colorMenu(colors: HighlightColor[], current: string, choose: (id: string) => void): Menu {
  const menu = checkMenu();
  for (const color of colors) {
    // A dot in the color before its name, so each choice shows what it looks like.
    const title = createFragment(fragment => {
      fragment.createSpan({ cls: "reader-menu-swatch" }).style.setProperty("--reader-color", color.value);
      fragment.appendText(color.name);
    });
    menu.addItem(item => item.setTitle(title).setChecked(color.id === current).onClick(() => choose(color.id)));
  }
  return menu;
}

/** Deletes immediately and offers a short undo window, in an Obsidian notice, instead of asking for confirmation. */
export function deleteAnnotation(store: AnnotationStore, record: AnnotationRecord, annotation: Annotation): void {
  const index = record.annotations.indexOf(annotation);
  if (index < 0) return;
  record.annotations.splice(index, 1);
  void store.save(record).catch(() => {});
  const restore = () => {
    if (record.annotations.some(entry => entry.id === annotation.id)) return;
    record.annotations.splice(Math.min(index, record.annotations.length), 0, annotation);
    void store.save(record).catch(() => {});
  };
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
