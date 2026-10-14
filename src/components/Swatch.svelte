<script lang="ts">
  import type { HighlightColor } from "../settings";
  import { tooltip } from "./obsidian";

  interface Props { color: HighlightColor; selected: boolean; label?: string; onclick: () => void; onpreview?: (active: boolean) => void }
  let { color, selected, label = color.name, onclick, onpreview }: Props = $props();
</script>

<button
  type="button" class="reader-swatch" aria-label={label} aria-pressed={selected} data-color={color.id} style:--reader-color={color.value} {onclick}
  onpointerenter={() => onpreview?.(true)} onpointerleave={() => onpreview?.(false)} onfocus={() => onpreview?.(true)} onblur={() => onpreview?.(false)}
  {@attach tooltip(label)}
></button>
