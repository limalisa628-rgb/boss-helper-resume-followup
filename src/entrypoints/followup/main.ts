import { createApp } from 'vue'

import FollowupPanel from '../../components/FollowupPanel.vue'
import { BossAttachmentAdapter } from '../../followup/bossAdapter.ts'
import { FollowupRuntimeClient } from '../../followup/runtimeClient.ts'
if (import.meta.env.DEV && ['127.0.0.1', 'localhost'].includes(location.hostname)) {
  void import('../../followup/devFixture.ts').then((module) => module.mountDevFixture())
} else {
  createApp(FollowupPanel, {
    store: new FollowupRuntimeClient(),
    port: new BossAttachmentAdapter(),
  }).mount('#app')
}
