import { AbstractInputSuggest, App, normalizePath, Notice, Plugin, PluginSettingTab, Scope, setIcon, Setting, SettingDefinitionItem, TFile, TFolder } from "obsidian";
import { ANNOTATION_FOLDER } from "./annotations";
import { ColorChoice } from "./color-choice";
import { DEFAULT_PAGE_COLORS, isPageColors, loadPdfPageColors, PAGE_COLOR_CHOICES, PageColors } from "./page-colors";

export interface HighlightColor { id: string; name: string; value: string }
/** Where the book note opens: the right sidebar, or beside the PDF as a tab in the main area. */
export type NotePlace = "sidebar" | "beside";
export interface ReaderSettings {
  colors: HighlightColor[];
  folder: string;
  /** Where new book notes are created. */
  notesFolder: string;
  /** A note whose text starts each new book note, or empty for the default. */
  noteTemplate: string;
  /** Highlight a passage as soon as it is selected with the mouse, instead of showing the popup. */
  highlightMode: boolean;
  /** The color highlight mode uses, chosen by right-clicking its button. Primary until changed, or if the color is removed. */
  highlightModeColor: string;
  /** Show the PDF's book note in the sidebar whenever a PDF opens in Reader. */
  showAnnotationsOnOpen: boolean;
  notePlace: NotePlace;
  /** When a highlight is deleted, keep its quote note if it has a comment, and its book-note quote if something is written under it. */
  keepWritingOfDeletedHighlights: boolean;
  /** How PDF pages are colored, unless a PDF has its own choice. */
  pageColors: PageColors;
  /** Choices made for single PDFs, by vault path. A PDF without an entry uses `pageColors`. */
  pdfPageColors: Record<string, PageColors>;
}
export const NOTES_FOLDER = "Book notes";

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

function isHighlightColor(value: unknown): value is HighlightColor {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value && typeof value.id === "string" && /^[\w-]+$/.test(value.id)
    && "name" in value && typeof value.name === "string"
    && "value" in value && typeof value.value === "string" && /^#[0-9a-f]{6}$/i.test(value.value);
}

export function loadSettings(saved: unknown): ReaderSettings {
  const data = (saved ?? {}) as { colors?: unknown; folder?: unknown; labels?: Record<string, unknown>; notesFolder?: unknown; noteTemplate?: unknown; highlightMode?: unknown; highlightModeColor?: unknown; showAnnotationsOnOpen?: unknown; notePlace?: unknown; keepWritingOfDeletedHighlights?: unknown; pageColors?: unknown; pdfPageColors?: unknown };
  const valid = Array.isArray(data.colors)
    ? data.colors.filter(isHighlightColor)
    : data.labels ? LEGACY_COLORS.map(color => ({ ...color, name: typeof data.labels?.[color.id] === "string" ? data.labels[color.id] as string : color.name })) : [];
  const colors = valid.filter((color, index) => valid.findIndex(other => other.id === color.id) === index);
  // The defaults come first even if earlier settings moved or removed them, keeping any name and color given to them.
  const defaults = DEFAULT_COLORS.map(color => { const own = colors.find(other => other.id === color.id); return { ...color, ...(own && { name: own.name, value: own.value }) }; });
  const added = colors.filter(color => !DEFAULT_COLORS.some(other => other.id === color.id)).map(color => ({ id: color.id, name: color.name, value: color.value }));
  const folder = typeof data.folder === "string" ? cleanFolder(data.folder) : null;
  const notesFolder = typeof data.notesFolder === "string" ? cleanFolder(data.notesFolder) : null;
  return {
    colors: [...defaults, ...added],
    folder: folder ?? ANNOTATION_FOLDER,
    notesFolder: notesFolder ?? NOTES_FOLDER,
    noteTemplate: typeof data.noteTemplate === "string" ? cleanFolder(data.noteTemplate) ?? "" : "",
    highlightMode: data.highlightMode === true,
    showAnnotationsOnOpen: data.showAnnotationsOnOpen !== false,
    notePlace: data.notePlace === "beside" ? "beside" : "sidebar",
    keepWritingOfDeletedHighlights: data.keepWritingOfDeletedHighlights === true,
    pageColors: isPageColors(data.pageColors) ? data.pageColors : DEFAULT_PAGE_COLORS,
    pdfPageColors: loadPdfPageColors(data.pdfPageColors),
    highlightModeColor: typeof data.highlightModeColor === "string" && /^[\w-]+$/.test(data.highlightModeColor) ? data.highlightModeColor : DEFAULT_COLORS[0]!.id,
  };
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
    ColorChoice.closeOpen();
    super.hide();
  }

  update(): void {
    if (this.dragging) { this.redrawAfterDrag = true; return; }
    // A redraw replaces the swatch the open color choice belongs to.
    ColorChoice.closeOpen();
    super.update();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const { settings } = this.host;
    return [
      { type: "group", heading: "Reader", items: [
        {
          name: "Show the book note with PDFs",
          desc: "Open the PDF's book note whenever a PDF opens in Reader. When off, open it with the book note button, the A key, or the Toggle book note command.",
          render: row => { row.addToggle(toggle => toggle.setValue(settings.showAnnotationsOnOpen).onChange(async value => {
            settings.showAnnotationsOnOpen = value;
            await this.host.saveSettings();
          })); },
        },
        {
          name: "Open book notes",
          desc: "Where the book note opens from the button, the A and N keys, and Note. Right-click the book note button to open it in the other place once.",
          render: row => { row.addDropdown(dropdown => dropdown.addOption("sidebar", "In the right sidebar").addOption("beside", "Beside the PDF")
            .setValue(settings.notePlace).onChange(async value => {
              settings.notePlace = value === "beside" ? "beside" : "sidebar";
              await this.host.saveSettings();
            })); },
        },
        {
          name: "PDF page colors",
          desc: "Dark pages show light text on a dark background, so a PDF doesn't glare in a dark theme. Photos and pictures are inverted too. To choose differently for one PDF, use the page colors button in its header.",
          render: row => { row.addDropdown(dropdown => {
            for (const choice of PAGE_COLOR_CHOICES) dropdown.addOption(choice.value, choice.name);
            dropdown.setValue(settings.pageColors).onChange(async value => {
              settings.pageColors = isPageColors(value) ? value : DEFAULT_PAGE_COLORS;
              await this.host.saveSettings();
            });
          }); },
        },
      ] },
      { type: "group", heading: "Highlight colors", items: [
        { name: "Palette order", desc: "Primary and Secondary always come first. Rename or recolor any color; reorder added colors with their handles or arrows." },
        ...settings.colors.map((color, index) => ({
          name: `${color.name} highlight color`,
          render: (row: Setting) => this.renderColor(row, color, index),
        })),
        {
          name: "Add highlight color",
          desc: "Highlights in a removed color turn gray until recolored.",
          render: row => { row.addButton(button => button.setButtonText("Add color").setCta().onClick(async () => {
            settings.colors.push({ id: `color-${Date.now().toString(36)}`, name: "New color", value: "#b39ddb" });
            await this.host.saveSettings();
            this.update();
            this.containerEl.querySelectorAll<HTMLInputElement>(".reader-color-setting input[type=text]").item(settings.colors.length - 1)?.select();
          })); },
        },
      ] },
      { type: "group", heading: "Book notes", items: [
        {
          name: "Book notes folder", desc: "Where new book notes are created. Existing notes stay where they are.",
          render: row => { row.addText(text => {
            text.setPlaceholder(NOTES_FOLDER).setValue(settings.notesFolder);
            const apply = (value: string) => { settings.notesFolder = cleanFolder(value) ?? NOTES_FOLDER; text.setValue(settings.notesFolder); };
            new FolderSuggest(this.app, text.inputEl, folder => { apply(folder); void this.host.saveSettings(); });
            this.saveOnLeave(text.inputEl, apply);
          }); },
        },
        {
          name: "Book note template",
          desc: "A note whose text starts each book note. {{title}}, {{source}}, and {{date}} are filled in. Leave empty for a title and source link.",
          render: row => { row.addText(text => {
            text.setPlaceholder("Templates/Book note.md").setValue(settings.noteTemplate);
            const apply = (value: string) => { settings.noteTemplate = cleanFolder(value) ?? ""; text.setValue(settings.noteTemplate); };
            new NoteSuggest(this.app, text.inputEl, path => { apply(path); void this.host.saveSettings(); });
            this.saveOnLeave(text.inputEl, apply);
          }); },
        },
        {
          name: "Keep writing of deleted highlights",
          desc: "When you delete a highlight, its quote note goes to the trash and its quote is removed from the book note, along with anything you wrote about it. Turn on to keep a quote note that has a comment, and a quote with writing under it in the book note.",
          render: row => { row.addToggle(toggle => toggle.setValue(settings.keepWritingOfDeletedHighlights).onChange(async value => {
            settings.keepWritingOfDeletedHighlights = value;
            await this.host.saveSettings();
          })); },
        },
      ] },
      { type: "group", heading: "Storage", items: [{
        name: "Annotation folder",
        desc: "Where highlight positions and colors are saved as JSON. The default .reader-annotations folder is hidden from the file list and search. Obsidian Sync skips hidden folders; choose a visible folder to use it. Changing this folder moves existing records.",
        render: row => { row.addText(text => {
          let pending = settings.folder;
          let committing = Promise.resolve();
          const commit = () => committing = committing.then(async () => {
            const folder = cleanFolder(pending);
            if (!folder) new Notice("Choose a folder inside the vault for annotations.");
            else if (folder !== settings.folder) await this.host.moveAnnotations(folder);
            text.setValue(pending = settings.folder);
          });
          text.setPlaceholder(ANNOTATION_FOLDER).setValue(settings.folder).onChange(value => { pending = value; });
          new FolderSuggest(this.app, text.inputEl, folder => { pending = folder; void commit(); });
          text.inputEl.addEventListener("blur", () => void commit());
          text.inputEl.addEventListener("keydown", event => { if (event.key === "Enter") text.inputEl.blur(); });
        }); },
      }] },
    ];
  }

  private saveOnLeave(input: HTMLInputElement, apply: (value: string) => void): void {
    input.addEventListener("blur", () => { apply(input.value); void this.host.saveSettings(); });
    input.addEventListener("keydown", event => { if (event.key === "Enter") input.blur(); });
  }

  private renderColor(row: Setting, color: HighlightColor, index: number): void {
    const { settings } = this.host;
    const fixed = index < FIXED_COLORS;
    new ColorChoice(this.app, row.controlEl, color.value, "Change color", async value => {
      color.value = value;
      await this.host.saveSettings();
    });
    row
      .addText(text => text.setPlaceholder("Color name").setValue(color.name).onChange(async value => {
        color.name = value.trim() || "Untitled color";
        await this.host.saveSettings();
      }));
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
        this.update();
      }));
    row.settingEl.addClass("is-movable");
    this.addHandle(row.settingEl, color.id, color.name);
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
        row.setCssProps({ "--reader-row-offset": `${dy}px` });
        rows.forEach((other, i) => {
          if (other === row) return;
          const shift = i > index && i <= target ? -step : i < index && i >= target ? step : 0;
          other.setCssProps({ "--reader-row-offset": `${shift}px` });
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
        rows.forEach(other => { other.setCssProps({ "--reader-row-offset": "" }); other.removeClass("is-dragging"); });
        this.dragging = false;
        // Settings changed elsewhere during the drag replace the list, so find the color again by its ID.
        const from = indexOf();
        if (from >= 0 && target !== index) void this.move(from, FIXED_COLORS + target);
        else if (this.redrawAfterDrag) this.update();
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
    this.update();
    if (refocus) this.containerEl.querySelectorAll<HTMLElement>(".reader-color-handle").item(to - FIXED_COLORS)?.focus();
    await this.host.saveSettings();
  }
}

class NoteSuggest extends AbstractInputSuggest<TFile> {
  constructor(app: App, private input: HTMLInputElement, private choose: (path: string) => void) { super(app, input); }
  protected getSuggestions(query: string): TFile[] {
    const needle = query.toLowerCase();
    return this.app.vault.getMarkdownFiles().filter(file => file.path.toLowerCase().includes(needle)).slice(0, 50);
  }
  renderSuggestion(file: TFile, el: HTMLElement): void { el.setText(file.path); }
  selectSuggestion(file: TFile): void {
    this.input.value = file.path;
    this.choose(file.path);
    this.close();
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
