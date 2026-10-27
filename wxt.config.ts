import { resolve } from 'path'

import ui from '@nuxt/ui/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindShadowDOM from 'vite-plugin-tailwind-shadowdom'
import { defineConfig } from 'wxt'

import { version } from './package.json'

const matches = ['*://zhipin.com/*', '*://*.zhipin.com/*']

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  modules: ['@wxt-dev/module-vue'],
  // imports: false,

  vite: () => ({
    resolve: {
      alias: {
        'devlog-ui': resolve(__dirname, 'packages/devlog-ui/src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    ssr: {
      noExternal: [
        '@webext-core/storage',
        '@webext-core/messaging',
        '@webext-core/proxy-service',
        '@nuxt/ui',
        '@nuxt/icon',
      ],
    },
    plugins: [
      vueJsx(),
      ui({
        // autoImport: false,
        // components: false,
        colorMode: false,
        router: false,
        prose: false,
        ui: {
          colors: {
            primary: 'teal',
            neutral: 'gray',
            warning: 'orange',
            success: 'emerald',
            error: 'rose',
          },
          badge: {
            defaultVariants: {
              color: 'neutral',
              variant: 'subtle',
            },
          },
          alert: {
            slots: {
              root: 'px-4 py-2',
            },
            defaultVariants: {
              orientation: 'horizontal',
            },
          },
          button: {
            slots: {
              base: 'cursor-pointer',
            },
          },
          tabs: {
            slots: {
              trigger: 'cursor-pointer',
            },
          },
          link: {
            base: 'no-underline hover:underline',
          },
          formField: {
            slots: {
              // container: 'flex flex-1',
              // root: 'justify-start items-center',
            },
            defaultVariants: {
              orientation: 'horizontal',
            },
          },
          modal: {
            slots: {
              overlay: 'z-200',
              content: 'z-220',
              footer: 'justify-end',
            },
          },
          chatMessage: {
            variants: {
              side: {
                right: {
                  container: 'flex-row-reverse justify-start',
                },
              },
            },
          },
          slideover: {
            slots: {
              content: 'z-230',
            },
          },
        },
      }),
      tailwindShadowDOM(),
    ],
  }),
  dev: {},
  manifest: ({ browser }) => ({
    default_locale: 'zh_CN',
    name: 'Boss Helper · 简历跟进实验版',
    description: '本地规则识别简历请求与版本匹配；真实 PDF 自动发送通道未验证，默认禁用。',
    permissions: ['storage', 'notifications'],
    web_accessible_resources: [
      {
        resources: ['boss.js', 'followup.html'],
        matches,
      },
    ],
    host_permissions: ['http://*/*', 'https://*/*'],
    browser_specific_settings:
      browser == 'firefox'
        ? {
            gecko: {
              id: '{1b66669d-c871-43f3-8c0c-d8a1c0566071}',
              strict_min_version: '109.0',
            },
          }
        : undefined,
  }),
  webExt: {
    disabled: true,
  },
  // hooks: {
  //   'build:manifestGenerated': (wxt, manifest) => {
  //     manifest.content_scripts ??= []
  //     manifest.content_scripts.push({
  //       // Build extension once to see where your CSS get's written to
  //       css: ['/assets/main-world.css'],
  //       matches,
  //     })
  //   },
  // },
})
