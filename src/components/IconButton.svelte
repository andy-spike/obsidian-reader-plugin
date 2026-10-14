<script lang="ts">
  import { icon as setIcon, tooltip as setTooltip } from "./obsidian";

  /** `tooltip: false` names the button for screen readers only, for places where hover popovers would crowd a small card. */
  interface Props { icon: string; label: string; onclick: (event: MouseEvent) => void; disabled?: boolean; tooltip?: boolean; class?: string }
  let { icon, label, onclick, disabled = false, tooltip = true, class: extra = "" }: Props = $props();
</script>

{#if tooltip}
  <button type="button" class="clickable-icon reader-icon-button {extra}" aria-label={label} {disabled} {onclick} {@attach setIcon(icon)} {@attach setTooltip(label)}></button>
{:else}
  <button type="button" class="clickable-icon reader-icon-button {extra}" {disabled} {onclick}>
    <span class="reader-button-icon" {@attach setIcon(icon)}></span><span class="reader-visually-hidden">{label}</span>
  </button>
{/if}
