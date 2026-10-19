// Nuxt 配置：SPA 模式 + 静态生成，适配 GitHub Pages 子路径托管
export default defineNuxtConfig({
  compatibilityDate: '2026-10-10',

  // 纯客户端应用：数据在 localStorage / Supabase，无需服务端渲染
  ssr: false,

  app: {
    // GitHub 项目页托管在仓库子路径下
    baseURL: '/corn/',
    head: {
      title: 'corn — 待办清单',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: '简洁的待办清单应用，轻松管理每日任务' },
      ],
      link: [{
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/corn/icon.svg',
      }],
    },
    spaLoadingTemplate: 'app/spa-loading-template.html',
  },

  modules: ['@unocss/nuxt'],

  // Supabase 连接信息由环境变量注入（构建时烘焙进静态产物）
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseKey: '',
    },
  },
})
