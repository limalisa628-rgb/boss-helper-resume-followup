import type {
  AttachmentPort,
  AttachmentContext,
  AttachmentReceipt,
  AttachmentSubmission,
  FollowupTask,
  ResumeAsset,
  MessageEnvelope,
} from './types.ts'
export interface NativeAttachmentSurface {
  verified: boolean
  readContext(): Promise<AttachmentContext>
  listAttachments(): Promise<Array<{ id: string; filename: string; hash: string }>>
  readReceipts(): Promise<AttachmentReceipt[]>
  selectAndSend(id: string): Promise<void>
  subscribeIncoming(handler: (message: MessageEnvelope) => void): () => void
}
export class BossAttachmentAdapter implements AttachmentPort {
  private surface?: NativeAttachmentSurface
  private baselines = new Map<string, Set<string>>()
  constructor(surface?: NativeAttachmentSurface) {
    this.surface = surface
  }
  capabilities() {
    const verified = this.surface?.verified === true
    return {
      incoming: verified,
      pdf: verified,
      verified,
      reason: verified
        ? 'verified-native-surface'
        : '尚未验证 BOSS 的消息接收与 PDF 附件通道，自动发送不可用。',
    }
  }
  async getContext(_task: FollowupTask): Promise<AttachmentContext> {
    return this.capabilities().verified
      ? this.surface!.readContext()
      : {
          accountId: '',
          conversationId: '',
          jobId: '',
          canSend: false,
          reason: this.capabilities().reason,
        }
  }
  async sendPdf(task: FollowupTask, asset: ResumeAsset): Promise<AttachmentSubmission> {
    if (!this.capabilities().verified)
      return { kind: 'denied', reason: 'unverified-platform-adapter' }
    const surface = this.surface!
    const context = await surface.readContext()
    if (
      !context.canSend ||
      context.accountId !== task.accountId ||
      context.conversationId !== task.conversationId ||
      context.jobId !== task.jobId
    )
      return { kind: 'denied', reason: 'wrong-target-or-no-permission' }
    const candidates = (await surface.listAttachments()).filter(
      (file) =>
        file.hash === asset.hash &&
        file.filename === asset.filename &&
        (!asset.platformAttachmentId || file.id === asset.platformAttachmentId),
    )
    if (candidates.length !== 1) return { kind: 'denied', reason: 'no-unique-verified-pdf' }
    this.baselines.set(task.id, new Set((await surface.readReceipts()).map((r) => r.evidenceId)))
    // Recheck after reading selectors/attachments; the user may have switched chats.
    const current = await surface.readContext()
    if (
      !current.canSend ||
      current.accountId !== task.accountId ||
      current.conversationId !== task.conversationId ||
      current.jobId !== task.jobId
    )
      return { kind: 'denied', reason: 'target-changed-before-click' }
    try {
      await surface.selectAndSend(candidates[0]!.id)
      return { kind: 'submitted' }
    } catch {
      return { kind: 'uncertain', reason: 'platform-action-interrupted' }
    }
  }
  async verifySent(task: FollowupTask, asset: ResumeAsset): Promise<AttachmentReceipt | null> {
    const baseline = this.baselines.get(task.id)
    if (!this.capabilities().verified || !baseline) return null
    const receipts = (await this.surface!.readReceipts()).filter(
      (r) =>
        !baseline.has(r.evidenceId) &&
        r.evidenceId &&
        r.accountId === task.accountId &&
        r.conversationId === task.conversationId &&
        r.jobId === task.jobId &&
        r.assetHash === asset.hash &&
        r.filename === asset.filename &&
        r.isSelf &&
        r.platformConfirmed,
    )
    this.baselines.delete(task.id)
    return receipts.length === 1 ? receipts[0]! : null
  }
  subscribeIncoming(handler: (message: MessageEnvelope) => void): () => void {
    return this.capabilities().incoming ? this.surface!.subscribeIncoming(handler) : () => {}
  }
}
