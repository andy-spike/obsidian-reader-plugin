<script lang="ts">
  import { icon as setIcon, tooltip } from "./obsidian";

  interface Props { icon: string; label: string; onclick: (event: MouseEvent) => void; disabled?: boolean; class?: string }
  let { icon, label, onclick, disabled = false, class: extra = "" }: Props = $props();
</script>

<button type="button" class="clickable-icon reader-icon-button {extra}" aria-label={label} {disabled} {onclick} {@attach setIcon(icon)} {@attach tooltip(label)}></button>
