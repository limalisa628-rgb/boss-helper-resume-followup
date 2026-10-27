import type {
  MessageEnvelope,
  ResumeAssetInfo,
  JobBinding,
  FollowupSettings,
  MatchDecision,
} from './types.ts'
export function resolveResume(
  message: MessageEnvelope,
  bindings: JobBinding[],
  assets: ResumeAssetInfo[],
  settings: FollowupSettings,
): MatchDecision {
  const review = (reason: string): MatchDecision => ({ kind: 'review', reason })
  if (
    !message.accountId ||
    message.accountId !== settings.accountId ||
    !message.conversationId ||
    !message.jobId
  )
    return review('missing-or-different-target')
  const candidates = bindings.filter(
    (b) =>
      b.accountId === message.accountId &&
      b.conversationId === message.conversationId &&
      b.jobId === message.jobId,
  )
  if (candidates.length !== 1) return review('ambiguous-or-missing-binding')
  const binding = candidates[0]!
  if (!['product', 'procurement'].includes(binding.direction)) return review('unknown-direction')
  if (!binding.locationVerified || !binding.city?.trim() || settings.allowedCities.length === 0)
    return review('city-unverified')
  const city = (value: string) => value.trim().replace(/市$/u, '')
  if (!settings.allowedCities.some((c) => city(c) === city(binding.city)))
    return { kind: 'blocked', reason: 'city-outside-allowlist' }
  if (
    !binding.salaryVerified ||
    typeof binding.fixedSalary !== 'number' ||
    !Number.isFinite(binding.fixedSalary) ||
    binding.fixedSalary <= 0
  )
    return review('fixed-base-unverified')
  const minimum = settings.minSalary[binding.direction]
  if (!Number.isFinite(minimum) || minimum <= 0) return review('salary-floor-not-configured')
  if (binding.fixedSalary < minimum) return { kind: 'blocked', reason: 'fixed-base-below-minimum' }
  const files = assets.filter((a) => a.assetId === binding.assetId && a.hash === binding.assetHash)
  if (files.length !== 1) return review('missing-or-replaced-file')
  const asset = files[0]!
  if (
    asset.direction !== binding.direction ||
    !asset.version?.trim() ||
    !/^[a-f0-9]{64}$/u.test(asset.hash) ||
    !/\.pdf$/iu.test(asset.filename) ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    (asset.mimeType !== '' && asset.mimeType !== 'application/pdf')
  )
    return review('invalid-pdf-metadata')
  return { kind: 'matched', binding, asset }
}
