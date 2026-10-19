<script setup lang="ts">
const { busy, authError, signIn, continueAsGuest } = useAuth()
</script>

<template>
  <main class="min-h-100dvh grid place-items-center p-24px bg-surface">
    <section class="w-full max-w-400px rounded-20px border border-solid border-edge bg-card p-32px shadow-soft" aria-labelledby="login-title">
      <div class="text-accent mb-24px [&_svg]:w-36px [&_svg]:h-36px" aria-hidden="true"><BrandIcon /></div>
      <h1 id="login-title" class="font-sans text-30px m-0">欢迎来到 corn</h1>
      <p class="text-muted mt-12px mb-32px">登录后，随时继续你的待办。<br>每个账号都有独立的任务与项目空间。</p>
      <div class="flex flex-col gap-12px">
        <button class="auth-provider" type="button" :disabled="busy" @click="signIn('github')">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.73 2.64 1.23 3.29.94.1-.73.4-1.23.71-1.52-2.5-.28-5.12-1.25-5.12-5.54 0-1.22.44-2.22 1.15-3-.11-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.22 2.68.11 2.96.71.78 1.15 1.78 1.15 3 0 4.3-2.62 5.26-5.13 5.54.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z" /></svg>
          使用 GitHub 登录
        </button>
      </div>
      <button class="project-add mx-auto mt-16px" type="button" :disabled="busy" @click="continueAsGuest">暂不登录，本地使用</button>
      <p class="text-center text-subtle text-12px mt-8px mb-0">访客数据只保存在此浏览器，登录后使用独立的账号空间。</p>
      <p v-if="busy" role="status" class="text-muted text-13px">正在前往授权页面…</p>
      <p v-if="authError" role="alert" class="text-danger text-13px">{{ authError }}</p>
      <p class="text-subtle text-12px mt-24px mb-0">首次登录将自动创建账号。</p>
    </section>
  </main>
</template>
