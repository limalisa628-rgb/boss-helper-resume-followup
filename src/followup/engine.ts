import { validatePdfAsset } from './assets.ts'
import { resolveResume } from './matching.ts'
import type { FollowupRepository } from './repository.ts'
import { classifyResumeRequest } from './rules.ts'
import type { MessageEnvelope, FollowupTask, AttachmentPort } from './types.ts'

export type FollowupStore = Pick<
  FollowupRepository,
  | 'saveSettings'
  | 'getSettings'
  | 'saveAsset'
  | 'getAsset'
  | 'listAssets'
  | 'deleteAsset'
  | 'saveBinding'
  | 'getBindings'
  | 'acceptRequest'
  | 'listTasks'
  | 'claimTask'
  | 'reserveSubmission'
  | 'isSubmissionAuthorized'
  | 'finalizeTask'
  | 'cancelTask'
>

export async function acceptMessage(
  repo: FollowupStore,
  message: MessageEnvelope,
  now: number,
): Promise<FollowupTask | null> {
  const settings = await repo.getSettings(message.accountId)
  if (
    !settings ||
    settings.mode === 'off' ||
    !settings.epoch ||
    message.accountId !== settings.accountId ||
    !message.accountId.trim() ||
    !message.conversationId.trim() ||
    !message.messageId.trim() ||
    !Number.isFinite(message.timestamp) ||
    message.timestamp <= settings.armedAt
  )
    return null
  const decision = classifyResumeRequest(message)
  if (decision.kind === 'ignore') return null
  const match = resolveResume(
    message,
    await repo.getBindings(message.accountId),
    await repo.listAssets(),
    settings,
  )
  const status =
    decision.kind === 'review'
      ? 'review'
      : match.kind === 'matched'
        ? settings.mode === 'auto'
          ? 'queued'
          : 'simulation'
        : match.kind
  const task: FollowupTask = {
    id: JSON.stringify([
      message.accountId,
      message.conversationId,
      message.jobId ?? '',
      message.messageId,
    ]),
    accountId: message.accountId,
    conversationId: message.conversationId,
    jobId: message.jobId ?? '',
    messageId: message.messageId,
    messageTimestamp: message.timestamp,
    createdAt: now,
    updatedAt: now,
    epoch: settings.epoch,
    status,
    reason:
      decision.kind === 'review'
        ? decision.reason
        : match.kind === 'matched'
          ? decision.reason
          : match.reason,
    ...(match.kind === 'matched'
      ? {
          assetId: match.asset.assetId,
          assetHash: match.asset.hash,
          assetVersion: match.asset.version,
          bindingId: match.binding.bindingId,
          bindingRevision: match.binding.revision,
        }
      : {}),
  }
  return repo.acceptRequest(task)
}

export async function processNextTask(
  repo: FollowupStore,
  port: AttachmentPort,
  account: string,
  owner: string,
  clock: () => number = Date.now,
): Promise<FollowupTask | null> {
  const task = await repo.claimTask(account, owner, clock())
  if (!task) return null
  let reserved = false
  async function finish(status: FollowupTask['status'], reason: string, evidenceId?: string) {
    await repo.finalizeTask(task!.id, owner, { status, reason, evidenceId }, clock())
    return (await repo.listTasks(account)).find((t) => t.id === task!.id) ?? null
  }
  try {
    const capability = port.capabilities()
    if (!capability.pdf || !capability.verified)
      return finish('review', capability.reason || 'platform-pdf-not-verified')
    const settings = await repo.getSettings(account)
    if (!settings || settings.mode !== 'auto' || settings.epoch !== task.epoch)
      return finish('cancelled', 'activation-changed')
    const match = resolveResume(
      {
        accountId: task.accountId,
        conversationId: task.conversationId,
        jobId: task.jobId,
        messageId: task.messageId,
        sender: 'recruiter',
        timestamp: task.messageTimestamp,
        text: '',
      },
      await repo.getBindings(account),
      await repo.listAssets(),
      settings,
    )
    if (match.kind !== 'matched') return finish(match.kind, match.reason)
    if (
      match.asset.hash !== task.assetHash ||
      match.asset.assetId !== task.assetId ||
      match.binding.bindingId !== task.bindingId ||
      match.binding.revision !== task.bindingRevision
    )
      return finish('review', 'binding-or-file-changed')
    const file = await repo.getAsset(match.asset.assetId)
    if (
      !file ||
      file.hash !== task.assetHash ||
      file.filename !== match.asset.filename ||
      !(await validatePdfAsset(file))
    )
      return finish('review', 'pdf-bytes-or-hash-invalid')
    const context = await port.getContext(task)
    if (
      context.accountId !== task.accountId ||
      context.conversationId !== task.conversationId ||
      context.jobId !== task.jobId
    )
      return finish('review', 'active-target-changed')
    if (!context.canSend)
      return finish('waiting-permission', context.reason || 'platform-permission-required')
    reserved = await repo.reserveSubmission(task.id, owner, clock())
    if (!reserved) return finish('queued', 'daily-budget-delay-or-settings-change')
    const submittedAt = clock()
    const authorize = () => repo.isSubmissionAuthorized(task.id, owner, clock())
    if (!(await authorize())) return finish('cancelled', 'activation-or-lease-invalidated')
    const submission = await port.sendPdf(task, file, authorize)
    if (submission.kind !== 'submitted')
      return finish(
        submission.kind === 'denied' ? 'review' : 'uncertain',
        submission.reason || 'not-confirmed-submitted',
      )
    const receipt = await port.verifySent(task, file)
    if (
      !receipt ||
      receipt.accountId !== task.accountId ||
      receipt.conversationId !== task.conversationId ||
      receipt.jobId !== task.jobId ||
      receipt.assetHash !== task.assetHash ||
      receipt.filename !== match.asset.filename ||
      !receipt.evidenceId ||
      receipt.evidenceId === task.messageId ||
      receipt.timestamp < submittedAt ||
      !Number.isFinite(receipt.timestamp) ||
      !receipt.isSelf ||
      !receipt.platformConfirmed
    )
      return finish('uncertain', 'missing-matching-fresh-business-receipt')
    return finish('sent', 'platform-confirmed-pdf', receipt.evidenceId)
  } catch {
    return finish(
      reserved ? 'uncertain' : 'failed',
      reserved ? 'interrupted-after-reservation-do-not-retry' : 'preflight-failed',
    )
  }
}
