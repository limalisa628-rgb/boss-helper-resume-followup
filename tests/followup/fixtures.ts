import type {
  MessageEnvelope,
  ResumeAsset,
  JobBinding,
  FollowupSettings,
} from '../../src/followup/types.ts'

export const hash = 'a'.repeat(64)
export const message: MessageEnvelope = {
  accountId: 'account-1',
  conversationId: 'chat-1',
  jobId: 'job-1',
  messageId: 'message-1',
  sender: 'recruiter',
  timestamp: 2000,
  text: '麻烦发一份简历',
}
export const asset: ResumeAsset = {
  assetId: 'product-pdf',
  direction: 'product',
  hash,
  version: 'v1',
  filename: 'product-demo.pdf',
  blob: new Blob(['%PDF-1.7\nsynthetic fixture'], { type: 'application/pdf' }),
  size: 26,
  mimeType: 'application/pdf',
  createdAt: 100,
}
export const binding: JobBinding = {
  bindingId: 'binding-1',
  accountId: 'account-1',
  conversationId: 'chat-1',
  jobId: 'job-1',
  title: '产品运营',
  direction: 'product',
  assetId: asset.assetId,
  assetHash: hash,
  city: '广州',
  locationVerified: true,
  fixedSalary: 8000,
  salaryVerified: true,
  revision: 1,
}
export const settings: FollowupSettings = {
  accountId: 'account-1',
  mode: 'simulation',
  armedAt: 1000,
  epoch: 'session-1',
  allowedCities: ['广州', '深圳'],
  minSalary: { product: 6000, procurement: 10000 },
  sendIntervalMs: 5000,
  dailyLimit: 11,
}
