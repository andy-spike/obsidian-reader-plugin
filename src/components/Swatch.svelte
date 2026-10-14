<script lang="ts">
  import type { HighlightColor } from "../settings";
  import { tooltip as setTooltip } from "./obsidian";

  /**
   * The color itself, and the preview on hover, show what a swatch does, so by default it is named for screen readers only.
   * `tooltip` also shows the name on hover, through Obsidian's tooltip, which reads `aria-label`.
   */
  interface Props { color: HighlightColor; selected: boolean; label?: string; tooltip?: boolean; onclick: () => void; onpreview?: (active: boolean) => void }
  let { color, selected, label = color.name, tooltip = false, onclick, onpreview }: Props = $props();
</script>

{#if tooltip}
  <button
    type="button" class="reader-swatch" aria-label={label} aria-pressed={selected} data-color={color.id} style:--reader-color={color.value} {onclick}
    onpointerenter={() => onpreview?.(true)} onpointerleave={() => onpreview?.(false)} onfocus={() => onpreview?.(true)} onblur={() => onpreview?.(false)}
    {@attach setTooltip(label)}
  ></button>
{:else}
  <button
    type="button" class="reader-swatch" aria-pressed={selected} data-color={color.id} style:--reader-color={color.value} {onclick}
    onpointerenter={() => onpreview?.(true)} onpointerleave={() => onpreview?.(false)} onfocus={() => onpreview?.(true)} onblur={() => onpreview?.(false)}
  ><span class="reader-visually-hidden">{label}</span></button>
{/if}
