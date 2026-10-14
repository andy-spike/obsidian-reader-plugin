import { AbstractInputSuggest, App, normalizePath, Notice, Plugin, PluginSettingTab, Scope, setIcon, Setting, TFolder } from "obsidian";
import { ANNOTATION_FOLDER } from "./annotations";

export interface HighlightColor { id: string; name: string; value: string }
export interface ReaderSettings { colors: HighlightColor[]; folder: string }

/**
 * Primary and Secondary always come first, in this order. Their color and name can change, but they can't be moved or removed;
 * colors added in settings follow them. The IDs match the earlier yellow and blue defaults, so their highlights keep a color.
 */
const DEFAULT_COLORS: HighlightColor[] = [
  { id: "yellow", name: "Primary", value: "#f5d94d" },
  { id: "blue", name: "Secondary", value: "#72a9ea" },
];
/** Version 0.1 had four fixed colors and stored only their names. */
const LEGACY_COLORS: HighlightColor[] = [
  { id: "yellow", name: "Yellow", value: "#f5d94d" },
  { id: "green", name: "Green", value: "#70ca8a" },
  { id: "blue", name: "Blue", value: "#72a9ea" },
  { id: "pink", name: "Pink", value: "#ef8fb7" },
];
/** Highlights keep their color ID when a color is removed from settings; they render with this entry. */
export const REMOVED_COLOR: HighlightColor = { id: "", name: "Removed color", value: "#a3a3a3" };

export function colorOf(settings: ReaderSettings, id: string): HighlightColor {
  return settings.colors.find(color => color.id === id) ?? REMOVED_COLOR;
}

/** How many colors at the start of the list are the fixed defaults. */
export const FIXED_COLORS = DEFAULT_COLORS.length;

export function loadSettings(saved: unknown): ReaderSettings {
  const data = (saved ?? {}) as { colors?: unknown; folder?: unknown; labels?: Record<string, unknown> };
  const valid = Array.isArray(data.colors)
    ? data.colors.filter((c): c is HighlightColor => typeof c?.id === "string" && /^[\w-]+$/.test(c.id) && typeof c.name === "string" && typeof c.value === "string" && /^#[0-9a-f]{6}$/i.test(c.value))
    : data.labels ? LEGACY_COLORS.map(color => ({ ...color, name: typeof data.labels?.[color.id] === "string" ? data.labels[color.id] as string : color.name })) : [];
  const colors = valid.filter((color, index) => valid.findIndex(other => other.id === color.id) === index);
  // The defaults come first even if earlier settings moved or removed them, keeping any name and color given to them.
  const defaults = DEFAULT_COLORS.map(color => { const own = colors.find(other => other.id === color.id); return { ...color, ...(own && { name: own.name, value: own.value }) }; });
  const added = colors.filter(color => !DEFAULT_COLORS.some(other => other.id === color.id)).map(color => ({ id: color.id, name: color.name, value: color.value }));
  const folder = typeof data.folder === "string" ? cleanFolder(data.folder) : null;
  return { colors: [...defaults, ...added], folder: folder ?? ANNOTATION_FOLDER };
}

/** Returns a vault-relative folder path, or null for the vault root and empty input. */
export function cleanFolder(input: string): string | null {
  const path = normalizePath(input.trim());
  return path && path !== "/" ? path : null;
}

export interface SettingsHost extends Plugin {
  settings: ReaderSettings;
  saveSettings(): Promise<void>;
  moveAnnotations(folder: string): Promise<void>;
}

export class ReaderSettingTab extends PluginSettingTab {
  constructor(app: App, private host: SettingsHost) { super(app, host); }

  /** Set while a color is dragged. A redraw then would drop the row from under the pointer, so it waits for the drop. */
  private dragging = false;
  private redrawAfterDrag = false;
  /** Ends the current drag without moving anything. */
  private cancelDrag: (() => void) | null = null;

  /** Closing settings mid-drag cancels it, so later redraws aren't held back. */
  hide(): void {
    this.cancelDrag?.();
    super.hide();
  }

  display(): void {
    if (this.dragging) { this.redrawAfterDrag = true; return; }
    const { containerEl } = this;
    const { settings } = this.host;
    containerEl.empty();

    new Setting(containerEl).setName("Highlight colors").setHeading()
      .setDesc("Colors appear in the selection popup in this order. Primary and Secondary always come first; you can change their color and name. Colors you add follow them, and you can reorder them with the handles or arrows. Give each one a meaning, such as “Key idea” or “Question”.");
    settings.colors.forEach((color, index) => {
      const fixed = index < FIXED_COLORS;
      const row = new Setting(containerEl)
        .addColorPicker(picker => picker.setValue(color.value).onChange(async value => {
          color.value = value;
          await this.host.saveSettings();
        }))
        .addText(text => text.setPlaceholder("Color name").setValue(color.name).onChange(async value => {
          color.name = value.trim() || "Untitled color";
          await this.host.saveSettings();
        }))
      row.settingEl.addClass("reader-color-setting");
      if (fixed) {
        // Invisible stand-ins for the buttons keep the name fields the same width in every row.
        for (let i = 0; i < 3; i++) row.addExtraButton(button => { button.extraSettingsEl.addClass("reader-color-placeholder"); button.extraSettingsEl.setAttr("aria-hidden", "true"); button.extraSettingsEl.tabIndex = -1; });
        const lock = row.settingEl.createDiv({ cls: "reader-color-lock" });
        setIcon(lock, "lock");
        lock.createSpan({ cls: "reader-visually-hidden", text: `${color.name} is a default color. It always stays in this place.` });
        row.settingEl.prepend(lock);
        return;
      }
      row
        .addExtraButton(button => button.setIcon("arrow-up").setTooltip("Move up").setDisabled(index === FIXED_COLORS).onClick(() => this.move(index, index - 1)))
        .addExtraButton(button => button.setIcon("arrow-down").setTooltip("Move down").setDisabled(index === settings.colors.length - 1).onClick(() => this.move(index, index + 1)))
        .addExtraButton(button => button.setIcon("trash-2").setTooltip("Remove color").onClick(async () => {
          settings.colors.splice(index, 1);
          await this.host.saveSettings();
          this.display();
        }));
      row.settingEl.addClass("is-movable");
      this.addHandle(row.settingEl, color.id, color.name);
    });
    new Setting(containerEl)
      .setDesc("Existing highlights in a removed color turn gray. Add the color again or pick a new color from the highlight to restore them.")
      .addButton(button => button.setButtonText("Add color").setCta().onClick(async () => {
        settings.colors.push({ id: `color-${Date.now().toString(36)}`, name: "New color", value: "#b39ddb" });
        await this.host.saveSettings();
        this.display();
        containerEl.querySelectorAll<HTMLInputElement>(".reader-color-setting input[type=text]").item(settings.colors.length - 1)?.select();
      }));

    new Setting(containerEl).setName("Storage").setHeading();
    let pending = settings.folder;
    // Choosing a suggestion and leaving the field both commit; run them one after another.
    let committing = Promise.resolve();
    const commit = (input: HTMLInputElement) => committing = committing.then(async () => {
      const folder = cleanFolder(pending);
      if (!folder) {
        new Notice("Choose a folder inside the vault for annotations.");
        input.value = pending = settings.folder;
        return;
      }
      if (folder !== settings.folder) await this.host.moveAnnotations(folder);
      input.value = pending = settings.folder;
    });
    new Setting(containerEl)
      .setName("Annotation folder")
      .setDesc("Where highlight records (JSON) and their Markdown notes are saved. Changing it moves existing annotation files.")
      .addText(text => {
        text.setPlaceholder(ANNOTATION_FOLDER).setValue(settings.folder).onChange(value => { pending = value; });
        new FolderSuggest(this.app, text.inputEl, folder => { pending = folder; void commit(text.inputEl); });
        text.inputEl.addEventListener("blur", () => void commit(text.inputEl));
        text.inputEl.addEventListener("keydown", event => { if (event.key === "Enter") text.inputEl.blur(); });
      });
  }

  /**
   * A grip at the start of the row. Dragging it slides the row while the others make room, and dropping saves the new order.
   * Escape cancels a drag. When focused, the up and down arrow keys move the color.
   */
  private addHandle(row: HTMLElement, id: string, name: string): void {
    const handle = row.createDiv({ cls: "reader-color-handle", attr: { role: "button", tabindex: "0" } });
    setIcon(handle, "grip-vertical");
    // Named for screen readers without an aria-label, which Obsidian would show as a hover tooltip.
    handle.createSpan({ cls: "reader-visually-hidden", text: `Reorder ${name}. Use the up and down arrow keys to move it.` });
    row.prepend(handle);
    const indexOf = () => this.host.settings.colors.findIndex(color => color.id === id);
    handle.addEventListener("keydown", event => {
      const offset = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (!offset) return;
      event.preventDefault();
      void this.move(indexOf(), indexOf() + offset, true);
    });
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || this.dragging) return;
      event.preventDefault();
      // Only added colors move, and only among themselves.
      const rows = Array.from(this.containerEl.querySelectorAll<HTMLElement>(".reader-color-setting.is-movable"));
      const index = rows.indexOf(row);
      if (index < 0 || rows.length < 2) return;
      // Rows share a height, so the distance between the first two is one step.
      const step = rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().top;
      // The settings page can scroll during a drag; the row follows the pointer either way.
      const scroller = this.containerEl.closest<HTMLElement>(".vertical-tab-content") ?? this.containerEl;
      const startY = event.clientY, startScroll = scroller.scrollTop;
      let pointerY = startY, target = index;
      this.dragging = true;
      handle.setPointerCapture(event.pointerId);
      row.addClass("is-dragging");
      this.containerEl.addClass("is-reordering");
      const update = () => {
        const dy = Math.max(-index * step, Math.min((rows.length - 1 - index) * step, pointerY - startY + scroller.scrollTop - startScroll));
        target = index + Math.round(dy / step);
        row.style.transform = `translateY(${dy}px)`;
        rows.forEach((other, i) => {
          if (other === row) return;
          const shift = i > index && i <= target ? -step : i < index && i >= target ? step : 0;
          other.style.transform = shift ? `translateY(${shift}px)` : "";
        });
      };
      const onMove = (move: PointerEvent) => { pointerY = move.clientY; update(); };
      // Settings closes on Escape through Obsidian's key scopes, so the drag takes Escape with a scope of its own.
      const scope = new Scope(this.app.scope);
      scope.register([], "Escape", () => { this.cancelDrag?.(); return false; });
      this.app.keymap.pushScope(scope);
      const end = () => {
        this.cancelDrag = null;
        this.app.keymap.popScope(scope);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        handle.removeEventListener("lostpointercapture", end);
        scroller.removeEventListener("scroll", update);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        this.containerEl.removeClass("is-reordering");
        rows.forEach(other => { other.style.transform = ""; other.removeClass("is-dragging"); });
        this.dragging = false;
        // Settings changed elsewhere during the drag replace the list, so find the color again by its ID.
        const from = indexOf();
        if (from >= 0 && target !== index) void this.move(from, FIXED_COLORS + target);
        else if (this.redrawAfterDrag) this.display();
        this.redrawAfterDrag = false;
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
      handle.addEventListener("lostpointercapture", end);
      scroller.addEventListener("scroll", update);
      this.cancelDrag = () => { target = index; end(); };
    });
  }

  private async move(from: number, to: number, refocus = false): Promise<void> {
    const colors = this.host.settings.colors;
    if (from < FIXED_COLORS || from >= colors.length || to < FIXED_COLORS || to >= colors.length || from === to) return;
    const [color] = colors.splice(from, 1);
    colors.splice(to, 0, color!);
    // Redraw before saving, so a dropped row never shows in its old place.
    this.display();
    if (refocus) this.containerEl.querySelectorAll<HTMLElement>(".reader-color-handle").item(to - FIXED_COLORS)?.focus();
    await this.host.saveSettings();
  }
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, private input: HTMLInputElement, private choose: (folder: string) => void) { super(app, input); }
  protected getSuggestions(query: string): TFolder[] {
    const needle = query.toLowerCase();
    return this.app.vault.getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder && !file.isRoot() && file.path.toLowerCase().includes(needle))
      .slice(0, 50);
  }
  renderSuggestion(folder: TFolder, el: HTMLElement): void { el.setText(folder.path); }
  selectSuggestion(folder: TFolder): void {
    this.input.value = folder.path;
    this.choose(folder.path);
    this.close();
  }
}
