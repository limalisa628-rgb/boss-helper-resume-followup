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
