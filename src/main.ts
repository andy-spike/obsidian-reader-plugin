import { MarkdownView, Notice, Plugin } from "obsidian";

export default class ReaderPlugin extends Plugin {
  onload(): void {
    this.addCommand({
      id: "check-development-setup",
      name: "Check development setup",
      callback: () => {
        new Notice("Reader Plugin is loaded. The development setup is ready.");
      },
    });

    this.addCommand({
      id: "inspect-reading-context",
      name: "Inspect reading context",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!checking) {
          const selection = view.editor.getSelection();
          new Notice(
            selection
              ? `${view.file.basename}: selected ${selection.length} characters.`
              : `${view.file.basename}: select a passage to inspect reading context.`,
          );
        }
        return true;
      },
    });
  }
}
