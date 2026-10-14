<script lang="ts">
  import type { HighlightColor } from "../settings";

  /** Named for screen readers only: the color itself, and the preview on hover, show what it does. */
  interface Props { color: HighlightColor; selected: boolean; label?: string; onclick: () => void; onpreview?: (active: boolean) => void }
  let { color, selected, label = color.name, onclick, onpreview }: Props = $props();
</script>

<button
  type="button" class="reader-swatch" aria-pressed={selected} data-color={color.id} style:--reader-color={color.value} {onclick}
  onpointerenter={() => onpreview?.(true)} onpointerleave={() => onpreview?.(false)} onfocus={() => onpreview?.(true)} onblur={() => onpreview?.(false)}
><span class="reader-visually-hidden">{label}</span></button>
