<script lang="ts">
  import type { Annotation } from "../annotations";
  import type { AnnotationActions, SelectionActions } from "../annotation-popup";
  import type { HighlightColor } from "../settings";
  import IconButton from "./IconButton.svelte";
  import Swatch from "./Swatch.svelte";
  import TextButton from "./TextButton.svelte";
  import { focusAtEnd } from "./obsidian";

  type Content =
    | { mode: "selection"; colors: HighlightColor[]; lastColor: string; actions: SelectionActions }
    | { mode: "annotation"; annotation: Annotation; colors: HighlightColor[]; actions: AnnotationActions };

  let content = $state.raw<Content | null>(null);
  /** Increments on each show so the card is rebuilt from scratch, like a newly opened popup. */
  let shown = $state(0);
  let editor = $state(false);
  let focusEditor = $state(false);
  /** Mirrors the annotation, which is a plain object edited in place by the reader and the sidebar. */
  let color = $state("");
  let comment = $state("");

  export function showSelection(colors: HighlightColor[], lastColor: string, actions: SelectionActions): void {
    content = { mode: "selection", colors, lastColor, actions };
    shown++;
  }

  export function showAnnotation(annotation: Annotation, colors: HighlightColor[], actions: AnnotationActions, focusComment: boolean): void {
    content = { mode: "annotation", annotation, colors, actions };
    color = annotation.color;
    comment = annotation.comment;
    editor = focusComment || !!annotation.comment;
    focusEditor = focusComment;
    shown++;
  }

  /** Reflects edits made elsewhere, such as the sidebar or another tab of the same PDF. */
  export function sync(colors: HighlightColor[]): void {
    if (content?.mode !== "annotation") return;
    content = { ...content, colors };
    color = content.annotation.color;
    comment = content.annotation.comment;
    if (comment) editor = true;
  }

  export function clear(): void { content = null; }
</script>

{#key shown}
  {#if content?.mode === "selection"}
    {@const { colors, actions } = content}
    <div class="reader-popup-row">
      <!-- Nothing is highlighted yet, so no swatch is marked as chosen. Hovering one previews it on the selection; keys 1–9 pick one. -->
      <div class="reader-popup-swatches">
        {#each colors as option, index (option.id)}
          <Swatch
            color={option} selected={false} label={`Highlight ${option.name}`}
            onclick={() => actions.highlight(option.id)} onpreview={active => actions.preview(active ? option.id : null)}
          />
        {/each}
      </div>
      <div class="reader-popup-divider"></div>
      <TextButton icon="message-square-plus" text="Comment" onclick={() => actions.comment()} />
      <IconButton tooltip={false} icon="copy" label="Copy text" onclick={() => actions.copy()} />
    </div>
  {:else if content?.mode === "annotation"}
    {@const { colors, actions } = content}
    <div class="reader-popup-row">
      <div class="reader-popup-swatches">
        {#each colors as option (option.id)}
          <Swatch color={option} selected={option.id === color} onclick={() => actions.recolor(option.id)} />
        {/each}
      </div>
      <div class="reader-popup-divider"></div>
      {#if editor}
        <IconButton tooltip={false} icon="message-square-x" label="Remove comment" onclick={() => { actions.comment(""); editor = false; }} />
      {:else}
        <IconButton tooltip={false} icon="message-square-plus" label="Add comment" onclick={() => { editor = true; focusEditor = true; }} />
      {/if}
      <IconButton tooltip={false} icon="copy" label="Copy text" onclick={() => actions.copy()} />
      <IconButton tooltip={false} icon="trash-2" label="Delete highlight" class="mod-warning" onclick={() => actions.remove()} />
    </div>
    {#if editor}
      <textarea
        class="reader-comment-editor" placeholder="Write a comment…" rows="1" value={comment}
        oninput={event => actions.comment(event.currentTarget.value)}
        {@attach focusEditor && focusAtEnd}
      ></textarea>
    {/if}
  {/if}
{/key}
