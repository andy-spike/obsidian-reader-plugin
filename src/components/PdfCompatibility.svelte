<script lang="ts">
  interface Props { openNative: () => void }
  let { openNative }: Props = $props();
  let forms = $state(false);
  export function showForms(visible: boolean): void { forms = visible; }
</script>

{#if forms}
  <div class="reader-compatibility" role="status">
    <span>This PDF contains form fields.</span>
    <button type="button" onclick={openNative}>Fill forms in Obsidian's PDF viewer</button>
  </div>
{/if}
