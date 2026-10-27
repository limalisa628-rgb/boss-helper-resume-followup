export type Direction = 'product' | 'procurement'
export interface MessageEnvelope {
  accountId: string
  conversationId: string
  jobId?: string
  messageId: string
  sender: 'recruiter' | 'self' | 'system'
  timestamp: number
  text: string
  isQuoted?: boolean
  isSystem?: boolean
}
export interface RequestDecision { kind: 'request' | 'ignore' | 'review'; reason: string }
export interface ResumeAsset {
  assetId: string; direction: Direction; hash: string; version: string; filename: string
  blob: Blob; createdAt: number; platformAttachmentId?: string
}
export interface JobBinding {
  bindingId: string; accountId: string; conversationId: string; jobId: string; title: string
  direction: Direction; assetId: string; assetHash: string; city: string
  locationVerified: boolean; fixedSalary: number | null; salaryVerified: boolean; revision: number
}
export interface FollowupSettings {
  accountId: string; mode: 'off' | 'simulation' | 'auto'; armedAt: number; epoch: string
  allowedCities: string[]; minSalary: Record<Direction, number>; sendIntervalMs: number; dailyLimit: number
}
export type MatchDecision = { kind: 'matched'; asset: ResumeAsset; binding: JobBinding } |
  { kind: 'review' | 'blocked'; reason: string }

export type TaskStatus = 'simulation' | 'review' | 'blocked' | 'queued' | 'waiting-permission' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'cancelled' | 'duplicate'
export interface FollowupTask {
  id: string; accountId: string; conversationId: string; jobId: string; messageId: string
  messageTimestamp: number; createdAt: number; updatedAt: number; epoch: string
  status: TaskStatus; reason: string; assetId?: string; assetHash?: string; assetVersion?: string
  bindingId?: string; bindingRevision?: number; leaseOwner?: string; leaseUntil?: number
  submittedAt?: number; evidenceId?: string
}
export interface AttachmentContext {
  accountId: string; conversationId: string; jobId: string; canSend: boolean; reason?: string
}
export interface AttachmentReceipt {
  accountId: string; conversationId: string; jobId: string; assetHash: string
  evidenceId: string; timestamp: number; filename: string; isSelf: boolean; platformConfirmed: boolean
}
export interface AttachmentSubmission { kind: 'submitted' | 'denied' | 'failed' | 'uncertain'; reason?: string }
export interface AttachmentPort {
  capabilities(): { incoming: boolean; pdf: boolean; verified: boolean; reason: string }
  getContext(task: FollowupTask): Promise<AttachmentContext>
  sendPdf(task: FollowupTask, asset: ResumeAsset): Promise<AttachmentSubmission>
  verifySent(task: FollowupTask, asset: ResumeAsset): Promise<AttachmentReceipt | null>
}
