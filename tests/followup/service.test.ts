import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'

import { BossAttachmentAdapter } from '../../src/followup/bossAdapter.ts'
import { FollowupRepository } from '../../src/followup/repository.ts'
import { FollowupService } from '../../src/followup/service.ts'
import { settings } from './fixtures.ts'

test('the unverified production adapter cannot be armed', async () => {
  const repo = new FollowupRepository(`service-${crypto.randomUUID()}`)
  await repo.saveSettings(settings)
  const service = new FollowupService(repo, new BossAttachmentAdapter(), () => 3000)
  await service.start(settings.accountId)
  await assert.rejects(service.setMode('auto'), /未验证|不可用/)
  assert.notEqual((await repo.getSettings(settings.accountId))?.mode, 'auto')
  await service.dispose()
  await repo.close()
})
test('rearming simulation creates a new epoch and watermark; pause turns it off', async () => {
  const repo = new FollowupRepository(`service-${crypto.randomUUID()}`)
  await repo.saveSettings(settings)
  let now = 3000
  const service = new FollowupService(repo, new BossAttachmentAdapter(), () => now)
  await service.start(settings.accountId)
  await service.setMode('simulation')
  const first = await repo.getSettings(settings.accountId)
  assert.equal(first?.armedAt, 3000)
  now = 4000
  await service.setMode('simulation')
  const second = await repo.getSettings(settings.accountId)
  assert.notEqual(second?.epoch, first?.epoch)
  assert.equal(second?.armedAt, 4000)
  await service.pause()
  assert.equal((await repo.getSettings(settings.accountId))?.mode, 'off')
  await service.dispose()
  await repo.close()
})
test('switching accounts pauses the old account and never carries the old activation', async () => {
  const repo = new FollowupRepository(`service-${crypto.randomUUID()}`)
  await repo.saveSettings({ ...settings, mode: 'auto' })
  const service = new FollowupService(repo, new BossAttachmentAdapter(), () => 3000)
  await service.start(settings.accountId)
  await service.start('another-account')
  assert.equal((await repo.getSettings(settings.accountId))?.mode, 'off')
  assert.equal((await repo.getSettings('another-account'))?.mode, 'off')
  await service.dispose()
  await repo.close()
})
