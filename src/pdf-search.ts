// The build binds these viewer helpers to our pinned PDF.js, independently of Obsidian's PDF viewer.
import { EventBus, FindState, PDFFindController, PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PDFDocumentProxy, TextLayer } from "./pdf-engine";
import { mount, unmount } from "svelte";
import PdfSearchControls from "./components/PdfSearch.svelte";

interface SearchPage { page: HTMLElement; text: TextLayer }

/** PDF.js owns text extraction, normalization, and matching. Reader owns the controls and page layout. */
export class PdfSearch {
  private events = new EventBus();
  private links = new PDFLinkService({ eventBus: this.events });
  private controller: PDFFindController;
  private pages = new Map<number, SearchPage>();
  private ui: ReturnType<typeof mount<Record<string, unknown>, {
    focus(): Promise<void>; update(message: string): void; hide(): void; reset(): void;
  }>>;
  private query = "";
  private selected = "";
  private revealMatch = false;
  private open = false;

  constructor(target: HTMLElement, currentPage: () => number, navigate: (page: number) => void, done: () => void) {
    this.links.setViewer({
      get currentPageNumber() { return currentPage(); },
      set currentPageNumber(page: number) { navigate(page); },
    });
    this.controller = new PDFFindController({ linkService: this.links, eventBus: this.events });
    this.ui = mount(PdfSearchControls, { target, props: {
      find: (query: string, previous: boolean, again: boolean) => this.find(query, previous, again),
      close: () => { this.close(); done(); },
    } });
    this.events.on("updatefindcontrolstate", (event: { state: number; matchesCount: { current: number; total: number } }) => {
      const { current, total } = event.matchesCount;
      this.ui.update(event.state === FindState.PENDING ? "Searching…" : event.state === FindState.NOT_FOUND ? "No matches" : `${current} of ${total}`);
    });
    this.events.on("updatefindmatchescount", (event: { matchesCount: { current: number; total: number } }) => {
      const { current, total } = event.matchesCount;
      this.ui.update(total ? `${current} of ${total}` : "No matches");
    });
    this.events.on("updatetextlayermatches", () => {
      const match = this.controller.selected;
      const selected = `${match?.pageIdx}:${match?.matchIdx}`;
      if (selected !== this.selected) { this.selected = selected; this.revealMatch = true; }
      for (const [page, content] of this.pages) this.draw(page, content);
    });
  }

  setDocument(pdf: PDFDocumentProxy): void {
    this.links.setDocument(pdf);
    this.controller.setDocument(pdf);
  }

  focus(): void { this.open = true; void this.ui.focus(); }

  next(previous = false): void {
    if (!this.query.trim()) { this.focus(); return; }
    this.open = true;
    this.find(this.query, previous, true);
  }

  private find(query: string, previous: boolean, again: boolean): void {
    this.query = query;
    this.events.dispatch("find", {
      source: this, type: again ? "again" : "", query,
      caseSensitive: false, entireWord: false, highlightAll: true,
      findPrevious: previous, matchDiacritics: false,
    });
  }

  close(): void {
    this.open = false;
    this.ui.hide();
    this.events.dispatch("findbarclose", { source: this });
    for (const content of this.pages.values()) content.page.querySelector(".reader-search-marks")?.remove();
  }

  reset(): void {
    this.close();
    this.query = this.selected = "";
    // PDF.js accepts null to cancel extraction and discard the previous document's matches.
    this.controller.setDocument(null as unknown as PDFDocumentProxy);
    this.links.setDocument(null);
    this.pages.clear();
    this.ui.reset();
  }

  attach(pageNumber: number, page: HTMLElement, text: TextLayer): void {
    const content = { page, text };
    this.pages.set(pageNumber, content);
    this.draw(pageNumber, content);
  }

  detach(pageNumber: number): void { this.pages.delete(pageNumber); }

  private draw(pageNumber: number, { page, text }: SearchPage): void {
    page.querySelector(".reader-search-marks")?.remove();
    if (!this.open || !this.query.trim() || !this.controller.highlightMatches) return;
    const matches = (this.controller.pageMatches?.[pageNumber - 1] as number[] | undefined) ?? [];
    const lengths = (this.controller.pageMatchesLength?.[pageNumber - 1] as number[] | undefined) ?? [];
    if (!matches.length) return;
    const layer = page.createDiv({ cls: "reader-search-marks" });
    const bounds = page.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const selected = this.controller.selected;
    const doc = page.ownerDocument;
    let offset = 0;
    const runs = text.textDivs.map((element, index) => {
      const start = offset;
      offset += text.textContentItemsStr[index]?.length ?? 0;
      return { element, start, end: offset };
    });
    matches.forEach((start, matchIndex) => {
      const end = start + (lengths[matchIndex] ?? 0);
      const active = selected?.pageIdx === pageNumber - 1 && selected.matchIdx === matchIndex;
      for (const run of runs) {
        if (run.end <= start || run.start >= end || !run.element.firstChild) continue;
        const range = doc.createRange();
        range.setStart(run.element.firstChild, Math.max(0, start - run.start));
        range.setEnd(run.element.firstChild, Math.min(run.end, end) - run.start);
        for (const rect of Array.from(range.getClientRects())) {
          const mark = layer.createDiv({ cls: active ? "reader-search-mark is-current" : "reader-search-mark" });
          mark.setCssProps({ left: `${(rect.left - bounds.left) / bounds.width * 100}%`, top: `${(rect.top - bounds.top) / bounds.height * 100}%`, width: `${rect.width / bounds.width * 100}%`, height: `${rect.height / bounds.height * 100}%` });
          if (active && this.revealMatch) {
            this.revealMatch = false;
            this.controller.scrollMatchIntoView({ element: mark, pageIndex: pageNumber - 1, matchIndex });
          }
        }
      }
    });
  }

  destroy(): void { this.reset(); void unmount(this.ui); }
}
