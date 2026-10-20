import { App, Scope, setIcon, setTooltip } from "obsidian";

/** Colors offered for highlights. They stay readable at a highlight's half opacity on light and dark pages. */
export const PRESET_COLORS: { name: string; value: string }[] = [
  { name: "Yellow", value: "#f5d94d" },
  { name: "Orange", value: "#f5a65b" },
  { name: "Red", value: "#ec7a73" },
  { name: "Pink", value: "#ef8fb7" },
  { name: "Purple", value: "#b39ddb" },
  { name: "Blue", value: "#72a9ea" },
  { name: "Teal", value: "#5fc4c0" },
  { name: "Green", value: "#70ca8a" },
  { name: "Lime", value: "#b5d86a" },
  { name: "Brown", value: "#c4a07a" },
];

/**
 * A swatch button that opens a small grid of preset colors, with a button for the full color picker.
 * Only one is open at a time; settings closes it when it redraws or hides.
 */
export class ColorChoice {
  private static openChoice: ColorChoice | null = null;

  static closeOpen(): void { ColorChoice.openChoice?.close(); }

  private readonly buttonEl: HTMLButtonElement;
  /** The browser's color input, kept invisible beside the swatch so its picker opens there. */
  private readonly inputEl: HTMLInputElement;
  private popoverEl: HTMLElement | null = null;
  private removeListeners: (() => void) | null = null;

  constructor(
    private readonly app: App,
    container: HTMLElement,
    private value: string,
    label: string,
    private readonly onChange: (value: string) => Promise<void>,
  ) {
    const wrapper = container.createDiv({ cls: "reader-color-choice" });
    this.buttonEl = wrapper.createEl("button", { cls: "reader-swatch reader-color-choice-button", attr: { "aria-haspopup": "true", "aria-expanded": "false" } });
    setTooltip(this.buttonEl, label);
    this.inputEl = wrapper.createEl("input", { type: "color", cls: "reader-color-choice-input", attr: { tabindex: "-1", "aria-hidden": "true" } });
    this.showValue();
    this.buttonEl.addEventListener("click", () => this.popoverEl ? this.close() : this.open());
    // The swatch follows the full picker as it moves; the color is saved once the picker closes.
    this.inputEl.addEventListener("input", () => this.buttonEl.setCssProps({ "--reader-color": this.inputEl.value }));
    this.inputEl.addEventListener("change", () => void this.choose(this.inputEl.value));
  }

  private showValue(): void {
    this.buttonEl.setCssProps({ "--reader-color": this.value });
    this.inputEl.value = this.value;
  }

  private async choose(value: string): Promise<void> {
    this.close();
    this.value = value.toLowerCase();
    this.showValue();
    await this.onChange(this.value);
  }

  private open(): void {
    ColorChoice.closeOpen();
    ColorChoice.openChoice = this;
    const doc = this.buttonEl.ownerDocument;
    const popover = this.popoverEl = doc.body.createDiv({ cls: "reader-color-presets", attr: { role: "dialog", "aria-label": "Highlight colors" } });
    const grid = popover.createDiv({ cls: "reader-color-presets-grid" });
    const isPreset = PRESET_COLORS.some(preset => preset.value === this.value);
    for (const preset of PRESET_COLORS) {
      const swatch = grid.createEl("button", { cls: "reader-swatch", attr: { "aria-pressed": String(preset.value === this.value) } });
      swatch.setCssProps({ "--reader-color": preset.value });
      setTooltip(swatch, preset.name);
      swatch.addEventListener("click", () => void this.choose(preset.value));
    }
    const custom = popover.createEl("button", { cls: "reader-color-custom" });
    setIcon(custom.createSpan({ cls: "reader-button-icon" }), "pipette");
    custom.createSpan({ text: "Custom color…" });
    // A color chosen in the full picker shows here, marked like a selected preset.
    if (!isPreset) {
      const current = custom.createSpan({ cls: "reader-menu-swatch reader-color-custom-current" });
      current.setCssProps({ "--reader-color": this.value });
      custom.setAttr("aria-pressed", "true");
    }
    custom.addEventListener("click", () => {
      this.close();
      this.inputEl.showPicker();
    });
    this.place(popover);
    this.buttonEl.setAttr("aria-expanded", "true");
    (popover.querySelector<HTMLElement>("[aria-pressed=true]") ?? grid.querySelector<HTMLElement>("button"))?.focus();

    // Settings closes on Escape through Obsidian's key scopes, so the popover takes Escape with a scope of its own.
    const scope = new Scope(this.app.scope);
    scope.register([], "Escape", () => { this.close(); this.buttonEl.focus(); return false; });
    this.app.keymap.pushScope(scope);
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popover.contains(target) && !this.buttonEl.contains(target)) this.close();
    };
    // The popover is placed once, so scrolling the settings page closes it rather than leaving it behind.
    const closeOnScroll = (event: Event) => { if (!popover.contains(event.target as Node)) this.close(); };
    doc.addEventListener("pointerdown", closeOnOutsidePress, true);
    doc.addEventListener("scroll", closeOnScroll, true);
    this.removeListeners = () => {
      this.app.keymap.popScope(scope);
      doc.removeEventListener("pointerdown", closeOnOutsidePress, true);
      doc.removeEventListener("scroll", closeOnScroll, true);
    };
  }

  /** Below the swatch, or above it when there is no room below, kept inside the window. */
  private place(popover: HTMLElement): void {
    const view = this.buttonEl.ownerDocument.defaultView ?? window;
    const anchor = this.buttonEl.getBoundingClientRect();
    const { width, height } = popover.getBoundingClientRect();
    const gap = 6, margin = 8;
    const below = anchor.bottom + gap;
    const top = below + height <= view.innerHeight - margin ? below : Math.max(margin, anchor.top - gap - height);
    const left = Math.max(margin, Math.min(anchor.left, view.innerWidth - margin - width));
    popover.setCssProps({ "--reader-popover-top": `${top}px`, "--reader-popover-left": `${left}px` });
  }

  close(): void {
    if (ColorChoice.openChoice === this) ColorChoice.openChoice = null;
    this.removeListeners?.();
    this.removeListeners = null;
    this.popoverEl?.remove();
    this.popoverEl = null;
    this.buttonEl.setAttr("aria-expanded", "false");
  }
}
