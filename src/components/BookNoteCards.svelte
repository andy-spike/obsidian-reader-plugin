<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import type { CardActions, CardData, CardsState } from "../annotations-view";
  import IconButton from "./IconButton.svelte";
  import { icon } from "./obsidian";

  interface Props { actions: CardActions }
  let { actions }: Props = $props();

  let current = $state.raw<CardsState>({ title: "", empty: "", cards: [] });
  /** Cards whose comment section the reader opened or closed. Others are open when they have a comment. */
  let expanded = $state<Record<string, boolean>>({});
  /** The card whose comment is being typed, and its text. While typing, saved changes from elsewhere don't replace it. */
  let editing = $state<string | null>(null);
  let draft = $state("");
  let saveTimer = 0;
  const SAVE_DELAY = 600;

  export function update(next: CardsState): void { current = next; }

  /** Opens a card's comment for typing and brings the card into view. */
  export function focusComment(id: string): void {
    const card = current.cards.find(candidate => candidate.id === id);
    if (!card) return;
    if (editing && editing !== id) finishEditing();
    expanded[id] = true;
    startEditing(card);
  }

  const isOpen = (card: CardData) => expanded[card.id] ?? !!card.comment;

  function toggle(card: CardData): void {
    const open = !isOpen(card);
    expanded[card.id] = open;
    if (open && !card.comment) startEditing(card);
    if (!open && editing === card.id) finishEditing();
  }

  function startEditing(card: CardData): void {
    editing = card.id;
    draft = card.comment;
  }

  function save(): void {
    window.clearTimeout(saveTimer);
    if (!editing) return;
    const card = current.cards.find(candidate => candidate.id === editing);
    if (card && card.comment !== draft.trim()) actions.save(editing, draft);
  }

  function finishEditing(): void {
    save();
    editing = null;
  }

  function oninput(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, SAVE_DELAY);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      (event.currentTarget as HTMLTextAreaElement).blur();
    }
  }

  /** Clicking a rendered comment edits it, unless the click was on a link inside it. */
  function onPreviewClick(event: MouseEvent, card: CardData): void {
    if ((event.target as HTMLElement).closest("a")) return;
    startEditing(card);
  }

  /** Grows the field with its text, and puts the cursor at the end when it opens. */
  const field: Attachment<HTMLTextAreaElement> = node => {
    const fit = () => { node.style.height = "auto"; node.style.height = `${node.scrollHeight}px`; };
    fit();
    node.addEventListener("input", fit);
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
    node.closest(".reader-card")?.scrollIntoView({ block: "nearest" });
    return () => node.removeEventListener("input", fit);
  };

  const rendered = (card: CardData): Attachment<HTMLElement> => node => actions.render(node, card.id, card.comment);
</script>

<div class="reader-cards-header">
  <div class="reader-annotations-title">{current.title}</div>
  {#if current.cards.length}
    <IconButton icon="file-text" label="Open the book note" onclick={() => actions.openBookNote()} />
  {/if}
</div>

{#if !current.cards.length}
  <div class="reader-empty">{current.empty}</div>
{/if}

{#each current.cards as card (card.id)}
  <section class="reader-card" style:--reader-color={card.color}>
    <div class="reader-card-top">
      <span class="reader-card-page">p. {card.page}</span>
      <IconButton icon="locate" label="Show in the PDF" onclick={() => actions.openPassage(card.id)} />
      <IconButton icon="external-link" label="Open the quote note" onclick={() => actions.openQuoteNote(card.id)} />
    </div>
    <blockquote class="reader-card-quote">{card.quote}</blockquote>
    <button type="button" class="reader-card-toggle" aria-expanded={isOpen(card)} onclick={() => toggle(card)}>
      <span class="reader-card-chevron" {@attach icon("chevron-right")}></span>
      Comment
    </button>
    {#if isOpen(card)}
      {#if editing === card.id}
        <textarea
          class="reader-card-comment-field" rows="2" placeholder="Write about this passage…"
          bind:value={draft} {oninput} {onkeydown} onblur={finishEditing} {@attach field}
        ></textarea>
      {:else if card.comment}
        {#key card.comment}
          <div class="reader-card-comment markdown-rendered" role="button" tabindex="0" onclick={event => onPreviewClick(event, card)}
            onkeydown={event => { if (event.key === "Enter") startEditing(card); }} {@attach rendered(card)}></div>
        {/key}
      {:else}
        <button type="button" class="reader-card-add" onclick={() => startEditing(card)}>Write about this passage…</button>
      {/if}
    {/if}
  </section>
{/each}
