<script lang="ts">
  import type { Annotation } from "../annotations";
  import type { AnnotationActions, SelectionActions } from "../annotation-popup";
  import type { HighlightColor } from "../settings";
  import IconButton from "./IconButton.svelte";
  import Swatch from "./Swatch.svelte";
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
    {@const { colors, lastColor, actions } = content}
    <div class="reader-popup-row">
      <div class="reader-popup-swatches" role="group" aria-label="Highlight in color">
        {#each colors as option (option.id)}
          <Swatch color={option} selected={option.id === lastColor} onclick={() => actions.highlight(option.id)} />
        {/each}
      </div>
      <div class="reader-popup-divider"></div>
      <IconButton icon="message-square-plus" label="Highlight and comment" onclick={() => actions.comment()} />
      <IconButton icon="copy" label="Copy text" onclick={() => actions.copy()} />
    </div>
  {:else if content?.mode === "annotation"}
    {@const { colors, actions } = content}
    <div class="reader-popup-row">
      <div class="reader-popup-swatches" role="group" aria-label="Highlight color">
        {#each colors as option (option.id)}
          <Swatch color={option} selected={option.id === color} onclick={() => actions.recolor(option.id)} />
        {/each}
      </div>
      <div class="reader-popup-divider"></div>
      {#if editor}
        <IconButton icon="message-square-x" label="Remove comment" onclick={() => { actions.comment(""); editor = false; }} />
      {:else}
        <IconButton icon="message-square-plus" label="Add comment" onclick={() => { editor = true; focusEditor = true; }} />
      {/if}
      <IconButton icon="copy" label="Copy text" onclick={() => actions.copy()} />
      <IconButton icon="trash-2" label="Delete highlight" class="mod-warning" onclick={() => actions.remove()} />
    </div>
    {#if editor}
      <textarea
        class="reader-comment-editor" aria-label="Comment" placeholder="Write a comment…" rows="1" value={comment}
        oninput={event => actions.comment(event.currentTarget.value)}
        {@attach focusEditor && focusAtEnd}
      ></textarea>
    {/if}
  {/if}
{/key}
