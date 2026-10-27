import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'

import { FollowupRepository } from '../../src/followup/repository.ts'
import type { FollowupTask } from '../../src/followup/types.ts'
import { settings, hash, asset, binding } from './fixtures.ts'

export const queuedTask = (id = 'request-1'): FollowupTask => ({
  id,
  accountId: settings.accountId,
  conversationId: 'chat-1',
  jobId: 'job-1',
  messageId: id,
  messageTimestamp: 2000,
  createdAt: 2000,
  updatedAt: 2000,
  epoch: settings.epoch,
  status: 'queued',
  reason: 'explicit-resume-request',
  assetId: 'product-pdf',
  assetHash: hash,
  assetVersion: 'v1',
  bindingId: 'binding-1',
  bindingRevision: 1,
})
async function database() {
  const repo = new FollowupRepository(`followup-test-${crypto.randomUUID()}`)
  await repo.saveSettings({ ...settings, mode: 'auto' })
  await repo.saveAsset(asset)
  await repo.saveBinding(binding)
  await repo.saveBinding({ ...binding, bindingId: 'binding-2', jobId: 'job-2' })
  return repo
}
test('accepting the same message concurrently persists only one task', async () => {
  const repo = await database()
  await Promise.all([repo.acceptRequest(queuedTask()), repo.acceptRequest(queuedTask())])
  assert.equal((await repo.listTasks(settings.accountId)).length, 1)
  await repo.close()
})
test('only one tab can own an account send lease', async () => {
  const repo = await database()
  await repo.acceptRequest(queuedTask('one'))
  await repo.acceptRequest({ ...queuedTask('two'), jobId: 'job-2', bindingId: 'binding-2' })
  const claimed = await Promise.all([
    repo.claimTask(settings.accountId, 'tab-A', 3000),
    repo.claimTask(settings.accountId, 'tab-B', 3000),
  ])
  assert.equal(claimed.filter(Boolean).length, 1)
  await repo.close()
})
test('an expired in-flight lease is uncertain and never silently requeued', async () => {
  const repo = await database()
  await repo.acceptRequest(queuedTask())
  await repo.claimTask(settings.accountId, 'tab-A', 3000)
  assert.equal(await repo.claimTask(settings.accountId, 'tab-B', 100000), null)
  assert.equal((await repo.listTasks(settings.accountId))[0]!.status, 'uncertain')
  await repo.close()
})
test('epoch changes cancel old queued tasks and the off switch prevents claiming', async () => {
  const repo = await database()
  await repo.acceptRequest(queuedTask())
  await repo.saveSettings({ ...settings, mode: 'auto', epoch: 'new-session' })
  assert.equal(await repo.claimTask(settings.accountId, 'tab-A', 3000), null)
  assert.equal((await repo.listTasks(settings.accountId))[0]!.status, 'cancelled')
  await repo.saveSettings({ ...settings, mode: 'off' })
  assert.equal(await repo.claimTask(settings.accountId, 'tab-A', 3000), null)
  await repo.close()
})
test('a persisted reservation respects the daily limit even before receipt arrives', async () => {
  const repo = await database()
  await repo.saveSettings({ ...settings, mode: 'auto', dailyLimit: 1, sendIntervalMs: 0 })
  await repo.acceptRequest(queuedTask('one'))
  const first = await repo.claimTask(settings.accountId, 'tab-A', 3000)
  assert(first)
  assert.equal(await repo.reserveSubmission(first.id, 'tab-A', 3100), true)
  await repo.finalizeTask(
    first.id,
    'tab-A',
    { status: 'uncertain', reason: 'network-timeout' },
    3200,
  )
  await repo.acceptRequest({ ...queuedTask('two'), jobId: 'job-2', bindingId: 'binding-2' })
  const second = await repo.claimTask(settings.accountId, 'tab-B', 3300)
  assert(second)
  assert.equal(await repo.reserveSubmission(second.id, 'tab-B', 3400), false)
  await repo.close()
})
test('foreign owners cannot mark a different tab task as sent', async () => {
  const repo = await database()
  await repo.acceptRequest(queuedTask())
  const task = await repo.claimTask(settings.accountId, 'tab-A', 3000)
  assert(task)
  assert.equal(
    await repo.finalizeTask(task.id, 'tab-B', { status: 'sent', reason: 'wrong-owner' }, 3100),
    false,
  )
  assert.equal((await repo.listTasks(settings.accountId))[0]!.status, 'sending')
  await repo.close()
})
test('greeting reservations enforce eleven across concurrent tabs and count uncertain attempts', async () => {
  const repo = await database()
  const results = await Promise.all(
    Array.from({ length: 56 }, (_, i) =>
      repo.reserveGreeting('account-1', `job-${i}`, 11, 0, 3000),
    ),
  )
  assert.equal(results.filter(Boolean).length, 11)
  assert.equal(await repo.reserveGreeting('account-1', 'job-next', 11, 0, 4000), false)
  await repo.close()
})
test('an imported already-contacted count at fifty-six prevents every new greeting at limit eleven', async () => {
  const repo = await database()
  assert.equal(await repo.reserveGreeting('account-1', 'new-job', 11, 56, 3000), false)
  assert.equal(await repo.reserveGreeting('account-1', 'new-job', 11, 0, 4000), false)
  await repo.close()
})
test('removing a PDF cancels unsent tasks but never resets the daily greeting budget', async () => {
  const repo = await database()
  await repo.acceptRequest(queuedTask())
  assert.equal(await repo.reserveGreeting('account-1', 'first', 1, 0, 3000), true)
  await repo.deleteAsset(asset.assetId, 3100)
  assert.equal((await repo.listAssets()).length, 0)
  assert.equal((await repo.getBindings('account-1')).length, 0)
  assert.equal((await repo.listTasks('account-1'))[0]!.status, 'cancelled')
  assert.equal(await repo.reserveGreeting('account-1', 'another', 1, 0, 3200), false)
  await repo.close()
})
for (const oldStatus of ['queued', 'waiting-permission'] as const) {
  test(`a stale ${oldStatus} task cannot swallow a new-epoch explicit request`, async () => {
    const repo = await database()
    await repo.acceptRequest({ ...queuedTask('old'), status: oldStatus })
    await repo.saveSettings({ ...settings, mode: 'auto', epoch: 'new-epoch' })
    const task = await repo.acceptRequest({ ...queuedTask('fresh'), epoch: 'new-epoch' })
    assert.equal(task.status, 'queued')
    const claimed = await repo.claimTask(settings.accountId, 'tab-A', 3000)
    assert.equal(claimed?.id, 'fresh')
    assert.equal(
      (await repo.listTasks(settings.accountId)).find((t) => t.id === 'old')?.status,
      'cancelled',
    )
    await repo.close()
  })
}
