<script lang="ts">
  import { icon as setIcon } from "./obsidian";

  interface Props { icon: string; text: string; onclick: (event: MouseEvent) => void }
  let { icon, text, onclick }: Props = $props();
</script>

<!-- An icon with a visible word, for the action people look for first. -->
<button type="button" class="clickable-icon reader-icon-button reader-text-button" {onclick}>
  <span class="reader-button-icon" {@attach setIcon(icon)}></span>{text}
</button>
