<script lang="ts" module>
  export type { OutlineNode } from "../outline";
</script>

<script lang="ts">
  import type { OutlineNode } from "../outline";
  import { tick, untrack } from "svelte";
  import { icon } from "./obsidian";

  /** `current` is the section being read. It starts selected, with its chapter open, and is marked while the reader moves around. */
  interface Props { nodes: OutlineNode[]; current: number | null; choose: (node: OutlineNode) => void }
  let { nodes, current, choose }: Props = $props();

  const ancestors = (id: number): number[] => {
    const chain: number[] = [];
    for (let parent = nodes[id]!.parent; parent !== null; parent = nodes[parent]!.parent) chain.push(parent);
    return chain;
  };

  // Only chapters show at first, plus the path to the section being read.
  // The dialog opens once per table of contents, so its starting state reads the props a single time.
  const start = untrack(() => ({ expanded: new Set<number>(current === null ? [] : ancestors(current)), cursor: current ?? (nodes.length ? 0 : null) }));
  let expanded = $state(start.expanded);
  let query = $state("");
  let cursor = $state<number | null>(start.cursor);
  let list: HTMLElement;

  /** While searching, matches show with the sections that contain them, all open. */
  const matches = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const keep = new Set<number>();
    for (const node of nodes) if (node.title.toLowerCase().includes(needle)) {
      keep.add(node.id);
      for (const id of ancestors(node.id)) keep.add(id);
    }
    return keep;
  });
  const visible = $derived(matches ? nodes.filter(node => matches.has(node.id)) : nodes.filter(node => ancestors(node.id).every(id => expanded.has(id))));
  const isMatch = (node: OutlineNode) => !!matches && node.title.toLowerCase().includes(query.trim().toLowerCase());

  // Keep the selection on a visible row, preferring the first match while searching.
  $effect(() => {
    if (cursor !== null && visible.some(node => node.id === cursor)) return;
    cursor = (visible.find(isMatch) ?? visible[0])?.id ?? null;
  });
  $effect(() => {
    void cursor;
    void tick().then(() => list?.querySelector(".tree-item-self.is-active")?.scrollIntoView({ block: "nearest" }));
  });
  $effect(() => {
    // Center the section being read when the dialog opens.
    void tick().then(() => list?.querySelector(".tree-item-self.is-active")?.scrollIntoView({ block: "center" }));
  });

  function toggle(id: number, open = !expanded.has(id)): void {
    const next = new Set(expanded);
    if (open) next.add(id); else next.delete(id);
    expanded = next;
  }

  function onkeydown(event: KeyboardEvent): void {
    const index = visible.findIndex(node => node.id === cursor);
    const node = cursor === null ? null : nodes[cursor]!;
    const move = (to: number) => { event.preventDefault(); cursor = visible[Math.max(0, Math.min(visible.length - 1, to))]?.id ?? null; };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "PageDown") move(index + 10);
    else if (event.key === "PageUp") move(index - 10);
    else if (event.key === "Enter" && node) { event.preventDefault(); choose(node); }
    // Left and Right open and close sections when not searching, so they still move the caret in a search.
    else if (!matches && node && event.key === "ArrowRight" && node.children.length) {
      event.preventDefault();
      if (!expanded.has(node.id)) toggle(node.id, true); else cursor = node.children[0]!;
    } else if (!matches && node && event.key === "ArrowLeft") {
      event.preventDefault();
      if (node.children.length && expanded.has(node.id)) toggle(node.id, false);
      else if (node.parent !== null) cursor = node.parent;
    }
  }
</script>

<div class="search-input-container reader-outline-search">
  <!-- svelte-ignore a11y_autofocus -->
  <input type="search" placeholder="Search chapters and sections" spellcheck="false" autofocus bind:value={query} {onkeydown} />
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  {#if query}<div class="search-input-clear-button" role="button" tabindex="-1" aria-label="Clear search" onclick={() => (query = "")}></div>{/if}
</div>
<div class="reader-outline-list" role="tree" bind:this={list}>
  {#each visible as node (node.id)}
    {@const open = !!matches || expanded.has(node.id)}
    <!-- The search field handles the keyboard for the whole tree, like Obsidian's quick switcher. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="tree-item-self is-clickable reader-outline-row" class:mod-collapsible={node.children.length > 0} class:is-active={node.id === cursor}
      class:is-current={node.id === current} class:is-top-level={node.depth === 0} class:is-dimmed={!!matches && !isMatch(node)}
      style:padding-inline-start="calc(var(--size-4-6) + {node.depth} * var(--size-4-5))"
      role="treeitem" aria-level={node.depth + 1} aria-selected={node.id === cursor} aria-expanded={node.children.length ? open : undefined} tabindex="-1"
      onclick={() => choose(node)}
    >
      <!-- Obsidian places the arrow in the row's left padding, so rows line up with or without one. -->
      {#if node.children.length}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="tree-item-icon collapse-icon" class:is-collapsed={!open} onclick={event => { event.stopPropagation(); if (!matches) toggle(node.id); }} {@attach icon("right-triangle")}></div>
      {/if}
      <div class="tree-item-inner">{node.title}</div>
      {#if node.page}<div class="tree-item-flair-outer"><span class="tree-item-flair">{node.page}</span></div>{/if}
    </div>
  {:else}
    <div class="reader-outline-empty">No chapters or sections match “{query.trim()}”.</div>
  {/each}
</div>
