<script lang="ts">
  import { tick } from "svelte";
  import IconButton from "./IconButton.svelte";

  interface Props { find: (query: string, previous: boolean, again: boolean) => void; close: () => void }
  let { find, close }: Props = $props();
  let visible = $state(false);
  let query = $state("");
  let status = $state("");
  let input = $state<HTMLInputElement>();

  export async function focus(): Promise<void> {
    visible = true;
    await tick();
    input?.focus();
    input?.select();
  }
  export function update(message: string): void { status = message; }
  export function hide(): void { visible = false; }
  export function reset(): void { query = ""; status = ""; visible = false; }
  function next(previous = false): void { if (query.trim()) find(query, previous, true); }
</script>

{#if visible}
  <div class="reader-search" role="search" aria-label="Find in PDF">
    <input bind:this={input} bind:value={query} type="search" aria-label="Find in PDF" placeholder="Find in PDF…"
      oninput={() => { status = ""; find(query, false, false); }}
      onkeydown={event => {
        if (event.key === "Enter") { event.preventDefault(); next(event.shiftKey); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      }} />
    <span class="reader-search-status" role="status">{query ? status : ""}</span>
    <IconButton icon="chevron-up" label="Previous match (Shift+Enter)" disabled={!query.trim()} onclick={() => next(true)} />
    <IconButton icon="chevron-down" label="Next match (Enter)" disabled={!query.trim()} onclick={() => next()} />
    <IconButton icon="x" label="Close search (Escape)" onclick={close} />
  </div>
{/if}
