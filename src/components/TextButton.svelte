<script lang="ts">
  import { icon as setIcon, tooltip } from "./obsidian";

  interface Props { icon: string; text: string; label: string; onclick: (event: MouseEvent) => void }
  let { icon, text, label, onclick }: Props = $props();
</script>

<!-- An icon with a visible word, for the action people look for first. The tooltip explains exactly what it does. -->
<button type="button" class="clickable-icon reader-icon-button reader-text-button" aria-label={label} {onclick} {@attach tooltip(label)}>
  <span class="reader-text-button-icon" {@attach setIcon(icon)}></span>{text}
</button>
