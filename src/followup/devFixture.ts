// Development only: tree-shaken out of production builds. Synthetic data only.
import { createApp } from 'vue'

import FollowupPanel from '../components/FollowupPanel.vue'
import { createResumeAsset } from './assets.ts'
import { BossAttachmentAdapter } from './bossAdapter.ts'
import { FollowupRepository } from './repository.ts'
import { defaultSettings } from './service.ts'

export async function mountDevFixture() {
  const repo = new FollowupRepository('FollowupBrowserFixture')
  const account = 'demo-account'
  if (!(await repo.getSettings(account))) {
    await repo.saveSettings({ ...defaultSettings(account), allowedCities: ['广州', '深圳'] })
    for (const direction of ['product', 'procurement'] as const) {
      const file = new File(
        ['%PDF-1.7\nsynthetic fixture, never send externally'],
        direction === 'product' ? '产品运营_演示.pdf' : '采购供应链_演示.pdf',
        { type: 'application/pdf' },
      )
      const asset = await createResumeAsset(file, direction, 'DEMO-1')
      await repo.saveAsset(asset)
      await repo.saveBinding({
        bindingId: `${account}:${direction}`,
        accountId: account,
        conversationId: `preview-${direction}`,
        jobId: `preview-job-${direction}`,
        title: direction === 'product' ? '产品运营演示岗位' : '采购演示岗位',
        direction,
        assetId: asset.assetId,
        assetHash: asset.hash,
        city: '广州',
        fixedSalary: direction === 'product' ? 8000 : 12000,
        locationVerified: true,
        salaryVerified: true,
        revision: 1,
      })
    }
  }
  createApp(FollowupPanel, {
    store: repo,
    port: new BossAttachmentAdapter(),
    profileId: account,
    fixture: true,
  }).mount('#app')
  const bar = document.createElement('section')
  bar.style.cssText = 'background:#153c30;color:white;padding:12px 24px;font:14px system-ui'
  const button = document.createElement('button')
  button.textContent = '运行浏览器 IndexedDB 自检'
  button.style.cssText = 'padding:8px 14px;cursor:pointer'
  const result = document.createElement('p')
  result.setAttribute('role', 'status')
  result.id = 'browser-db-result'
  result.textContent = '仅操作合成数据，不连接 BOSS，不读取真实简历。'
  button.onclick = async () => {
    button.disabled = true
    try {
      const name = `FollowupBrowserCheck-${crypto.randomUUID()}`
      const database = new FollowupRepository(name)
      const accepted = await Promise.all(
        Array.from({ length: 56 }, (_, i) =>
          database.reserveGreeting('demo', `job-${i}`, 11, 0, Date.now()),
        ),
      )
      await database.close()
      const reopened = new FollowupRepository(name)
      const extra = await reopened.reserveGreeting('demo', 'job-57', 11, 0, Date.now())
      const count = accepted.filter(Boolean).length
      await reopened.close()
      if (count !== 11 || extra)
        throw Error(`Expected 11 reservations and persistent stop; got ${count}, ${extra}`)
      result.textContent =
        '浏览器 IndexedDB 自检通过：56 个并发请求只获准 11 个，关闭并重开数据库后，第 12 个仍被拦截。'
      result.dataset.result = 'passed'
    } catch (error) {
      result.textContent = `自检失败：${error instanceof Error ? error.message : String(error)}`
      result.dataset.result = 'failed'
    } finally {
      button.disabled = false
    }
  }
  bar.append(button, result)
  document.body.prepend(bar)
}
