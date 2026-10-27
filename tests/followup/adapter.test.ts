import test from 'node:test'
import assert from 'node:assert/strict'
import { BossAttachmentAdapter } from '../../src/followup/bossAdapter.ts'
import type { NativeAttachmentSurface } from '../../src/followup/bossAdapter.ts'
import type { FollowupTask, AttachmentReceipt } from '../../src/followup/types.ts'
import { asset, message, settings } from './fixtures.ts'

const task: FollowupTask = { id: 'task', accountId: message.accountId, conversationId: message.conversationId, jobId: 'job-1', messageId: message.messageId, messageTimestamp: 2000, createdAt: 2000, updatedAt: 2000, epoch: settings.epoch, status: 'sending', reason: '', assetHash: asset.hash }
const receipt: AttachmentReceipt = { accountId: task.accountId, conversationId: task.conversationId, jobId: task.jobId, assetHash: asset.hash, filename: asset.filename, timestamp: 3000, evidenceId: 'card-2', isSelf: true, platformConfirmed: true }
function surface() {
  let clicked = ''
  let receipts: AttachmentReceipt[] = [{ ...receipt, evidenceId: 'old-card', timestamp: 1000 }]
  const value: NativeAttachmentSurface = {
    verified: true,
    async readContext() { return { accountId: task.accountId, conversationId: task.conversationId, jobId: task.jobId, canSend: true } },
    async listAttachments() { return [{ id: 'pdf-1', filename: asset.filename, hash: asset.hash }] },
    async readReceipts() { return receipts },
    async selectAndSend(id) { clicked = id; receipts = [...receipts, receipt] },
    subscribeIncoming() { return () => {} },
  }
  return { value, clicked: () => clicked }
}
test('the production default is unavailable and cannot send', async () => {
  const port = new BossAttachmentAdapter()
  assert.equal(port.capabilities().verified, false)
  assert.equal((await port.sendPdf(task, asset)).kind, 'denied')
})
test('a verified surface selects the uniquely matching PDF and confirms a new card', async () => {
  const fixture = surface(); const port = new BossAttachmentAdapter(fixture.value)
  assert.equal((await port.sendPdf(task, asset)).kind, 'submitted')
  assert.equal(fixture.clicked(), 'pdf-1')
  assert.equal((await port.verifySent(task, asset))?.evidenceId, 'card-2')
})
test('same filename without a matching hash is never enough to select a file', async () => {
  const fixture = surface()
  fixture.value.listAttachments = async () => [{ id: 'other', filename: asset.filename, hash: 'b'.repeat(64) }]
  const port = new BossAttachmentAdapter(fixture.value)
  assert.equal((await port.sendPdf(task, asset)).kind, 'denied')
  assert.equal(fixture.clicked(), '')
})
test('duplicate matching attachments and wrong active targets do not get clicked', async () => {
  for (const wrongTarget of [false, true]) {
    const fixture = surface()
    if (wrongTarget) fixture.value.readContext = async () => ({ accountId: 'other', conversationId: task.conversationId, jobId: task.jobId, canSend: true })
    else fixture.value.listAttachments = async () => [{ id: 'one', filename: asset.filename, hash: asset.hash }, { id: 'two', filename: asset.filename, hash: asset.hash }]
    assert.equal((await new BossAttachmentAdapter(fixture.value).sendPdf(task, asset)).kind, 'denied')
    assert.equal(fixture.clicked(), '')
  }
})
test('an old card or no new business receipt cannot confirm delivery', async () => {
  const fixture = surface()
  fixture.value.selectAndSend = async () => {}
  const port = new BossAttachmentAdapter(fixture.value)
  await port.sendPdf(task, asset)
  assert.equal(await port.verifySent(task, asset), null)
})
