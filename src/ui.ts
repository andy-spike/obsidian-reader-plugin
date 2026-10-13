import { Menu, Notice, setIcon, setTooltip } from "obsidian";
import { Annotation, AnnotationRecord, AnnotationStore } from "./annotations";
import { HighlightColor } from "./settings";

export function iconButton(parent: HTMLElement, icon: string, label: string, action: (event: MouseEvent) => void, placement: "top" | "bottom" = "bottom"): HTMLButtonElement {
  const button = parent.createEl("button", { cls: "clickable-icon reader-icon-button", attr: { type: "button" } });
  setIcon(button, icon);
  setTooltip(button, label, { placement });
  button.addEventListener("click", action);
  return button;
}

export function swatch(parent: HTMLElement, color: HighlightColor, selected: boolean, action: () => void): HTMLButtonElement {
  const button = parent.createEl("button", { cls: "reader-swatch", attr: { type: "button", "aria-pressed": String(selected), "data-color": color.id } });
  button.style.setProperty("--reader-color", color.value);
  setTooltip(button, color.name, { placement: "top" });
  button.addEventListener("click", action);
  return button;
}

export function colorMenu(colors: HighlightColor[], current: string, choose: (id: string) => void): Menu {
  const menu = new Menu();
  for (const color of colors) menu.addItem(item => item.setTitle(color.name).setChecked(color.id === current).onClick(() => choose(color.id)));
  return menu;
}

/** Deletes immediately and offers a short undo window instead of asking for confirmation. */
export function deleteAnnotation(store: AnnotationStore, record: AnnotationRecord, annotation: Annotation): void {
  const index = record.annotations.indexOf(annotation);
  if (index < 0) return;
  record.annotations.splice(index, 1);
  void store.save(record).catch(() => {});
  const message = createFragment();
  message.createSpan({ text: "Highlight deleted. " });
  const undo = message.createEl("a", { text: "Undo", href: "#" });
  undo.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (!record.annotations.some(entry => entry.id === annotation.id)) {
      record.annotations.splice(Math.min(index, record.annotations.length), 0, annotation);
      void store.save(record).catch(() => {});
    }
    notice.hide();
  });
  const notice = new Notice(message, 6000);
}
