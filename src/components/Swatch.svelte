<script lang="ts">
  import type { HighlightColor } from "../settings";
  import { tooltip } from "./obsidian";

  interface Props { color: HighlightColor; selected: boolean; onclick: () => void }
  let { color, selected, onclick }: Props = $props();
</script>

<button type="button" class="reader-swatch" aria-label={color.name} aria-pressed={selected} data-color={color.id} style:--reader-color={color.value} {onclick} {@attach tooltip(color.name)}></button>
