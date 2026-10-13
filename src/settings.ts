import { AbstractInputSuggest, App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TFolder } from "obsidian";
import { ANNOTATION_FOLDER } from "./annotations";

export interface HighlightColor { id: string; name: string; value: string }
export interface ReaderSettings { colors: HighlightColor[]; folder: string }

const DEFAULT_COLORS: HighlightColor[] = [
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

export function loadSettings(saved: unknown): ReaderSettings {
  const data = (saved ?? {}) as { colors?: unknown; folder?: unknown; labels?: Record<string, unknown> };
  const colors = Array.isArray(data.colors)
    ? data.colors.filter((c): c is HighlightColor => typeof c?.id === "string" && /^[\w-]+$/.test(c.id) && typeof c.name === "string" && typeof c.value === "string" && /^#[0-9a-f]{6}$/i.test(c.value))
    // Version 0.1 stored only names for the four built-in colors.
    : DEFAULT_COLORS.map(color => ({ ...color, name: typeof data.labels?.[color.id] === "string" ? data.labels[color.id] as string : color.name }));
  const folder = typeof data.folder === "string" ? cleanFolder(data.folder) : null;
  return { colors: colors.length ? colors : DEFAULT_COLORS.map(color => ({ ...color })), folder: folder ?? ANNOTATION_FOLDER };
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

  display(): void {
    const { containerEl } = this;
    const { settings } = this.host;
    containerEl.empty();

    new Setting(containerEl).setName("Highlight colors").setHeading()
      .setDesc("Colors appear in the selection popup in this order. Give each one a meaning, such as “Key idea” or “Question”.");
    settings.colors.forEach((color, index) => {
      const row = new Setting(containerEl)
        .addColorPicker(picker => picker.setValue(color.value).onChange(async value => {
          color.value = value;
          await this.host.saveSettings();
        }))
        .addText(text => text.setPlaceholder("Color name").setValue(color.name).onChange(async value => {
          color.name = value.trim() || "Untitled color";
          await this.host.saveSettings();
        }))
        .addExtraButton(button => button.setIcon("arrow-up").setTooltip("Move up").setDisabled(index === 0).onClick(() => this.move(index, -1)))
        .addExtraButton(button => button.setIcon("arrow-down").setTooltip("Move down").setDisabled(index === settings.colors.length - 1).onClick(() => this.move(index, 1)))
        .addExtraButton(button => button.setIcon("trash-2").setTooltip(settings.colors.length === 1 ? "Keep at least one color" : "Remove color").setDisabled(settings.colors.length === 1).onClick(async () => {
          settings.colors.splice(index, 1);
          await this.host.saveSettings();
          this.display();
        }));
      row.settingEl.addClass("reader-color-setting");
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

  private async move(index: number, offset: number): Promise<void> {
    const colors = this.host.settings.colors;
    const [color] = colors.splice(index, 1);
    colors.splice(index + offset, 0, color!);
    await this.host.saveSettings();
    this.display();
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
