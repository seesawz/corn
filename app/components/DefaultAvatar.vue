<template>
  <span class="relative grid place-items-center shrink-0 w-36px h-36px rounded-full overflow-hidden bg-accent-soft" role="img" aria-label="默认头像">
    <img
      v-if="!failed"
      class="w-full h-full object-cover"
      :src="avatarUrl"
      alt=""
      loading="lazy"
      @error="failed = true"
    >
    <svg v-else class="w-22px h-22px text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
    </svg>
  </span>
</template>

<script setup lang="ts">
// DiceBear 免费头像服务：按 seed 生成稳定的卡通头像，无需 API 密钥
const props = withDefaults(defineProps<{ seed?: string }>(), { seed: 'corn' })

const failed = ref(false)

const avatarUrl = computed(() => {
  const seed = encodeURIComponent(props.seed.trim() || 'corn')
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=ffd5dc,ffdfbf,d1d4f9,c0aede&radius=50`
})
</script>
