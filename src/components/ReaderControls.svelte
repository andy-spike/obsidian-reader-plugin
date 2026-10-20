<script lang="ts" module>
  export interface ControlsState { page: number; total: number; atStart: boolean; zoom: number; canZoomOut: boolean; canZoomIn: boolean; fitWidth: boolean; canBack: boolean; canForward: boolean }
</script>

<script lang="ts">
  import IconButton from "./IconButton.svelte";
  import { tooltip } from "./obsidian";

  interface Props { step: (delta: 1 | -1) => void; goToPage: (page: number) => void; done: () => void; zoomBy: (direction: 1 | -1) => void; zoomMenu: (anchor: DOMRect) => void; reset: () => void; back: () => void; forward: () => void }
  let { step, goToPage, done, zoomBy, zoomMenu, reset, back, forward }: Props = $props();
  const id = $props.id();

  let current = $state<ControlsState>({ page: 1, total: 0, atStart: true, zoom: 1, canZoomOut: true, canZoomIn: true, fitWidth: false, canBack: false, canForward: false });
  /** What the reader types into the page field. It replaces the current page only while the field has focus. */
  let typed = $state<string | null>(null);

  export function update(next: ControlsState): void { current = next; }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      const page = Number.parseInt((event.currentTarget as HTMLInputElement).value, 10);
      if (Number.isFinite(page)) goToPage(page);
      done();
    } else if (event.key === "Escape") done();
  }
</script>

<div class="reader-controls" role="toolbar">
  <IconButton icon="arrow-left" label="Back (Alt+Left)" disabled={!current.canBack} onclick={back} />
  <IconButton icon="arrow-right" label="Forward (Alt+Right)" disabled={!current.canForward} onclick={forward} />
  <div class="reader-controls-divider"></div>
  <IconButton icon="chevron-up" label="Previous page" disabled={!current.total || current.atStart} onclick={() => step(-1)} />
  <label class="reader-visually-hidden" for="reader-page-{id}">Page number</label>
  <input
    id="reader-page-{id}" class="reader-page-input" type="text" inputmode="numeric"
    style:width="{Math.max(2, String(current.total).length) + 1.5}ch"
    value={typed ?? (current.total ? String(current.page) : "")}
    onfocus={event => { typed = event.currentTarget.value; event.currentTarget.select(); }}
    oninput={event => (typed = event.currentTarget.value)}
    onblur={() => (typed = null)}
    {onkeydown}
  />
  <span class="reader-page-total">{current.total ? `/ ${current.total}` : ""}</span>
  <IconButton icon="chevron-down" label="Next page" disabled={!current.total || current.page >= current.total} onclick={() => step(1)} />
  <div class="reader-controls-divider"></div>
  <IconButton icon="minus" label="Zoom out (-)" disabled={!current.canZoomOut} onclick={() => zoomBy(-1)} />
  <button type="button" class="reader-zoom-level" onclick={event => zoomMenu(event.currentTarget.getBoundingClientRect())} {@attach tooltip("Zoom options")}>{Math.round(current.zoom * 100)}%</button>
  <IconButton icon="plus" label="Zoom in (+)" disabled={!current.canZoomIn} onclick={() => zoomBy(1)} />
  <IconButton icon="rotate-ccw" label="Fit width (0)" disabled={current.fitWidth} onclick={reset} />
</div>
