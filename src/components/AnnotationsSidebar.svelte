<script lang="ts">
  import type { Annotation, AnnotationStore } from "../annotations";
  import type { ReaderView } from "../reader-view";
  import { colorOf, type ReaderSettings } from "../settings";
  import { colorMenu, deleteAnnotation } from "../ui";
  import IconButton from "./IconButton.svelte";
  import { tooltip } from "./obsidian";

  interface Props { store: AnnotationStore; source: () => ReaderView | null; settings: () => ReaderSettings }
  let { store, source, settings }: Props = $props();

  /** Annotations are plain objects edited in place, so a counter tells Svelte when to read them again. */
  let version = $state(0);

  export function refresh(): void { version++; }
  $effect(() => store.subscribe(refresh));

  const view = $derived.by(() => {
    void version;
    const reader = source();
    const record = reader?.getRecord() ?? null;
    if (!reader || !record) return { title: reader?.file?.basename ?? "Annotations", reader: null, record: null, error: null, pages: [], count: 0 };
    const options = settings();
    const sorted = [...record.annotations].sort((a, b) => a.page - b.page || a.position.start - b.position.start);
    const pages: { page: number; entries: { annotation: Annotation; color: { name: string; value: string }; quote: string; writing: string }[] }[] = [];
    for (const annotation of sorted) {
      if (pages[pages.length - 1]?.page !== annotation.page) pages.push({ page: annotation.page, entries: [] });
      pages[pages.length - 1]!.entries.push({ annotation, color: colorOf(options, annotation.color), quote: annotation.quote.exact.replace(/\s+/g, " ").trim(), writing: reader.writing(annotation.id) });
    }
    return { title: reader.file?.basename ?? "Annotations", reader, record, error: store.state(record).error, pages, count: sorted.length };
  });

  function save(): void {
    if (view.record) void store.save(view.record).catch(() => {});
  }

  function open(annotation: Annotation, event: MouseEvent | KeyboardEvent): void {
    if (event instanceof KeyboardEvent && (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " "))) return;
    if (event instanceof MouseEvent && (event.target as HTMLElement).closest("button, .reader-entry-writing")) return;
    event.preventDefault();
    void view.reader?.showAnnotation(annotation);
  }

  function recolor(annotation: Annotation, event: MouseEvent): void {
    colorMenu(settings().colors, annotation.color, id => {
      annotation.color = id;
      save();
    }).showAtMouseEvent(event);
  }
</script>

<div class="reader-annotations-header">
  <div class="reader-annotations-title">{view.title}</div>
  {#if view.count}<div class="reader-annotations-count">{view.count} {view.count === 1 ? "highlight" : "highlights"}</div>{/if}
</div>
{#if !view.record}
  <div class="reader-empty">Open a PDF to see its highlights here.</div>
{:else}
  {#if view.error}<div class="reader-save-error" title={view.error}>Couldn't save to the vault. Retrying automatically…</div>{/if}
  {#if !view.count}
    <div class="reader-empty">Select text in the PDF and pick a color to highlight it. Highlights appear here, with what you write about them in the book note.</div>
  {:else}
    <div class="reader-annotation-list">
      {#each view.pages as group (group.page)}
        <div class="reader-page-group">
          <div class="reader-page-heading">Page {group.page}</div>
          {#each group.entries as { annotation, color, quote, writing } (annotation.id)}
            <!-- The card is focusable so the keyboard can jump to its passage; it holds its own buttons, so it cannot itself be a button. -->
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
            <div class="reader-entry" data-id={annotation.id} tabindex="0" style:--reader-color={color.value} onclick={event => open(annotation, event)} onkeydown={event => open(annotation, event)}>
              <div class="reader-entry-quote">{quote}</div>
              <div class="reader-entry-actions">
                <button type="button" class="clickable-icon reader-icon-button reader-entry-color" aria-label="Color: {color.name}. Change color" onclick={event => recolor(annotation, event)} {@attach tooltip(color.name)}>
                  <span class="reader-entry-swatch"></span>
                </button>
                <IconButton icon="notebook-pen" label="Write in book note" onclick={() => view.reader?.openNote(annotation.id)} />
                <IconButton icon="trash-2" label="Delete highlight" onclick={() => view.record && deleteAnnotation(store, view.record, annotation)} />
              </div>
              {#if writing}
                <!-- What you wrote under this passage in the book note. Clicking it opens the note there. -->
                <div class="reader-entry-writing" role="button" tabindex="0"
                  onclick={() => view.reader?.openNote(annotation.id)}
                  onkeydown={event => { if (event.key === "Enter") { event.preventDefault(); view.reader?.openNote(annotation.id); } }}
                >{writing}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
{/if}
