<template>
  <button
    type="button"
    class="icon-button"
    :aria-label="ariaLabel"
    :title="title || ariaLabel"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

defineProps<{
  ariaLabel: string
  title?: string
}>()
</script>
