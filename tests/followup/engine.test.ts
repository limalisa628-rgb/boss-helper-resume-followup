import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { BossAttachmentAdapter } from '../../src/followup/bossAdapter.ts'
import type { NativeAttachmentSurface } from '../../src/followup/bossAdapter.ts'
import { acceptMessage, processNextTask } from '../../src/followup/engine.ts'
import { FollowupRepository } from '../../src/followup/repository.ts'
import type {
  AttachmentPort,
  FollowupTask,
  ResumeAsset,
  AttachmentReceipt,
} from '../../src/followup/types.ts'
import { message, asset, binding, settings } from './fixtures.ts'

const realHash = createHash('sha256').update('%PDF-1.7\nsynthetic fixture').digest('hex')
async function setup(mode: 'simulation' | 'auto' = 'auto') {
  const repo = new FollowupRepository(`engine-${crypto.randomUUID()}`)
  await repo.saveSettings({ ...settings, mode })
  await repo.saveAsset({ ...asset, hash: realHash })
  await repo.saveBinding({ ...binding, assetHash: realHash })
  return repo
}
class FixturePort implements AttachmentPort {
  submissions: string[] = []
  allowed = true
  capability = true
  receiptOverride: Partial<AttachmentReceipt> = {}
  timeout = false
  capabilities() {
    return {
      incoming: true,
      pdf: this.capability,
      verified: this.capability,
      reason: 'fixture-only',
    }
  }
  async getContext(task: FollowupTask) {
    return {
      accountId: task.accountId,
      conversationId: task.conversationId,
      jobId: task.jobId,
      canSend: this.allowed,
    }
  }
  async sendPdf(task: FollowupTask, _asset: ResumeAsset) {
    this.submissions.push(task.id)
    if (this.timeout) throw Error('timeout-after-submit')
    return { kind: 'submitted' as const }
  }
  async verifySent(task: FollowupTask, file: ResumeAsset) {
    return {
      accountId: task.accountId,
      conversationId: task.conversationId,
      jobId: task.jobId,
      assetHash: file.hash,
      evidenceId: 'new-file-card',
      timestamp: 3000,
      filename: file.filename,
      isSelf: true,
      platformConfirmed: true,
      ...this.receiptOverride,
    }
  }
}
test('a new explicit request is persisted once and a verified receipt confirms it', async () => {
  const repo = await setup()
  const one = await acceptMessage(repo, message, 2500)
  assert.equal(one?.status, 'queued')
  assert.equal((await acceptMessage(repo, message, 2500))?.id, one?.id)
  const port = new FixturePort()
  const result = await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000)
  assert.equal(result?.status, 'sent')
  assert.equal(result?.evidenceId, 'new-file-card')
  assert.equal(port.submissions.length, 1)
  await repo.close()
})
test('simulation produces a preview task and never reaches the send boundary', async () => {
  const repo = await setup('simulation')
  assert.equal((await acceptMessage(repo, message, 2500))?.status, 'simulation')
  const port = new FixturePort()
  assert.equal(await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000), null)
  assert.equal(port.submissions.length, 0)
  await repo.close()
})
test('old, self, system and missing-identity messages do not queue', async () => {
  const repo = await setup()
  for (const change of [
    { timestamp: 999 },
    { sender: 'self' as const },
    { sender: 'system' as const },
    { messageId: '' },
    { accountId: 'other' },
  ]) {
    assert.equal(await acceptMessage(repo, { ...message, ...change }, 2500), null)
  }
  assert.equal((await repo.listTasks(settings.accountId)).length, 0)
  await repo.close()
})
test('lack of permission waits without sending and may proceed when permission opens', async () => {
  const repo = await setup()
  await acceptMessage(repo, message, 2500)
  const port = new FixturePort()
  port.allowed = false
  assert.equal(
    (await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000))?.status,
    'waiting-permission',
  )
  assert.equal(port.submissions.length, 0)
  port.allowed = true
  assert.equal(
    (await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000))?.status,
    'sent',
  )
  await repo.close()
})
test('a replaced binding is reviewed instead of silently sending the new file', async () => {
  const repo = await setup()
  await acceptMessage(repo, message, 2500)
  await repo.saveBinding({ ...binding, assetHash: realHash, revision: 2 })
  const port = new FixturePort()
  assert.equal(
    (await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000))?.status,
    'review',
  )
  assert.equal(port.submissions.length, 0)
  await repo.close()
})
test('an unverified live adapter cannot send', async () => {
  const repo = await setup()
  await acceptMessage(repo, message, 2500)
  const port = new FixturePort()
  port.capability = false
  assert.equal(
    (await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000))?.status,
    'review',
  )
  assert.equal(port.submissions.length, 0)
  await repo.close()
})
for (const override of [
  { assetHash: 'b'.repeat(64) },
  { conversationId: 'other' },
  { accountId: 'other' },
  { jobId: 'other' },
  { timestamp: 100 },
  { evidenceId: '' },
  { filename: 'wrong.pdf' },
  { isSelf: false },
  { platformConfirmed: false },
]) {
  test(`never confirms a mismatched or stale receipt: ${JSON.stringify(override)}`, async () => {
    const repo = await setup()
    await acceptMessage(repo, message, 2500)
    const port = new FixturePort()
    port.receiptOverride = override
    assert.equal(
      (await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000))?.status,
      'uncertain',
    )
    assert.equal(await processNextTask(repo, port, settings.accountId, 'tab-A', () => 4000), null)
    assert.equal(port.submissions.length, 1)
    await repo.close()
  })
}
test('a timeout after submitting stays uncertain across restart and repeated requests', async () => {
  const repo = await setup()
  await acceptMessage(repo, message, 2500)
  const port = new FixturePort()
  port.timeout = true
  assert.equal(
    (await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000))?.status,
    'uncertain',
  )
  assert.equal(
    (await acceptMessage(repo, { ...message, messageId: 'new-request' }, 4000))?.status,
    'duplicate',
  )
  assert.equal(await processNextTask(repo, port, settings.accountId, 'tab-B', () => 5000), null)
  assert.equal(port.submissions.length, 1)
  await repo.close()
})
test('queue logs do not persist the full recruiter message', async () => {
  const repo = await setup()
  const task = await acceptMessage(
    repo,
    { ...message, text: '麻烦发一份简历，这是不应存储的聊天全文' },
    2500,
  )
  assert(task)
  assert.equal(
    JSON.stringify(await repo.listTasks(settings.accountId)).includes('不应存储的聊天全文'),
    false,
  )
  await repo.close()
})
test('changing the binding during platform preflight prevents submission', async () => {
  const repo = await setup()
  await acceptMessage(repo, message, 2500)
  const port = new FixturePort()
  const original = port.getContext.bind(port)
  port.getContext = async (task) => {
    await repo.saveBinding({ ...binding, assetHash: realHash, revision: 2 })
    return original(task)
  }
  const result = await processNextTask(repo, port, settings.accountId, 'tab-A', () => 3000)
  assert.notEqual(result?.status, 'sent')
  assert.equal(port.submissions.length, 0)
  await repo.close()
})
for (const stage of ['listAttachments', 'readReceipts', 'selectAndSend'] as const) {
  for (const mode of ['off', 'simulation', 'switch-account'] as const) {
    test(`review regression: ${mode} during ${stage} prevents the native submit`, async () => {
      const repo = await setup()
      await acceptMessage(repo, message, 2500)
      let sends = 0
      let changed = false
      async function boundary(at: typeof stage) {
        if (at !== stage || changed) return
        changed = true
        await repo.saveSettings({
          ...settings,
          mode: mode === 'simulation' ? 'simulation' : 'off',
          epoch: 'changed-while-selecting',
        })
        if (mode === 'switch-account')
          await repo.saveSettings({
            ...settings,
            accountId: 'other-account',
            mode: 'off',
            epoch: 'other-account-session',
          })
      }
      const surface: NativeAttachmentSurface = {
        verified: true,
        async readContext() {
          return {
            accountId: message.accountId,
            conversationId: message.conversationId,
            jobId: 'job-1',
            canSend: true,
          }
        },
        async listAttachments() {
          await boundary('listAttachments')
          return [{ id: 'pdf', filename: asset.filename, hash: realHash }]
        },
        async readReceipts() {
          await boundary('readReceipts')
          return sends
            ? [
                {
                  accountId: message.accountId,
                  conversationId: message.conversationId,
                  jobId: 'job-1',
                  assetHash: realHash,
                  evidenceId: 'new-receipt',
                  timestamp: 3000,
                  filename: asset.filename,
                  isSelf: true,
                  platformConfirmed: true,
                },
              ]
            : []
        },
        async selectAndSend(_id: string, authorize?: () => Promise<boolean>) {
          await boundary('selectAndSend')
          if (authorize && !(await authorize())) return false
          sends++
          return true
        },
        subscribeIncoming() {
          return () => {}
        },
      }
      await processNextTask(
        repo,
        new BossAttachmentAdapter(surface),
        settings.accountId,
        'tab-A',
        () => 3000,
      )
      assert.equal(changed, true)
      assert.equal(sends, 0)
      assert.notEqual((await repo.listTasks(settings.accountId))[0]!.status, 'sent')
      await repo.close()
    })
  }
}
