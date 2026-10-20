import { App, Modal, Setting } from "obsidian";

/** Passwords exist only in this dialog and the PDF loading task, never in plugin settings or vault files. */
export class PdfPasswordModal extends Modal {
  private settled = false;
  private field: HTMLInputElement | null = null;

  constructor(app: App, private incorrect: boolean, private answer: (password: string | null) => void) { super(app); }

  onOpen(): void {
    this.setTitle(this.incorrect ? "Incorrect PDF password" : "Unlock PDF");
    this.contentEl.createEl("p", { text: this.incorrect ? "That password did not unlock this PDF. Try again." : "Enter this PDF's password to read it." });
    new Setting(this.contentEl).setName("Password").addText(text => {
      this.field = text.inputEl;
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      text.inputEl.setAttribute("aria-label", "PDF password");
      text.inputEl.addEventListener("keydown", event => {
        if (event.key === "Enter" && text.getValue()) { event.preventDefault(); this.submit(); }
      });
    });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton(button => button.setButtonText("Unlock").setCta().onClick(() => this.submit()));
    this.field?.focus();
  }

  private submit(): void {
    if (!this.field?.value || this.settled) return;
    this.settled = true;
    this.answer(this.field.value);
    this.close();
  }

  onClose(): void {
    if (this.field) this.field.value = "";
    this.field = null;
    this.contentEl.empty();
    if (!this.settled) { this.settled = true; this.answer(null); }
  }
}
