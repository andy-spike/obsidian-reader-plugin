<script lang="ts">
  import { icon, tooltip } from "./obsidian";
  import type { PdfCommentMarker, PdfFormMarker } from "../pdf-annotations";
  interface Props { comments: PdfCommentMarker[]; forms: PdfFormMarker[]; open: (comment: PdfCommentMarker) => void; openForm: () => void }
  let { comments, forms, open, openForm }: Props = $props();
</script>

<div class="reader-pdf-annotations">
  {#each forms as form (form.id)}
    <button type="button" class="reader-pdf-form" style:left="{form.left}%" style:top="{form.top}%"
      style:width="{form.width}%" style:height="{form.height}%" aria-label="Fill this form in Obsidian's PDF viewer"
      onclick={event => { event.stopPropagation(); openForm(); }} onpointerdown={event => event.stopPropagation()}
      {@attach tooltip("Fill this form in Obsidian's PDF viewer")}></button>
  {/each}
  {#each comments as comment (comment.id)}
    <button type="button" class="reader-pdf-comment clickable-icon" style:left="{comment.left}%" style:top="{comment.top}%"
      aria-label={comment.author ? `PDF comment by ${comment.author}` : "Read PDF comment"}
      onclick={event => { event.stopPropagation(); open(comment); }}
      onpointerdown={event => event.stopPropagation()}
      {@attach icon("message-square-text")} {@attach tooltip(comment.author ? `PDF comment by ${comment.author}` : "Read PDF comment")}></button>
  {/each}
</div>
