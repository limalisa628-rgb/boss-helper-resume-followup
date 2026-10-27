import { validatePdfAsset } from './assets.ts'
import type { FollowupRepository } from './repository.ts'
import type { ResumeAsset } from './types.ts'
import type { FollowupSettings, JobBinding, FollowupTask } from './types.ts'
export const FOLLOWUP_RPC = 'boss-helper-local-resume-rpc-v1'
export function rpcString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000)
    throw Error('Invalid identifier')
  return value
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid object')
  return value as Record<string, unknown>
}
export async function encodeAsset(asset: ResumeAsset): Promise<unknown> {
  const bytes = new Uint8Array(await asset.blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  const { blob: _blob, ...metadata } = asset
  return { ...metadata, base64: btoa(binary) }
}
export function decodeAsset(wire: unknown): ResumeAsset {
  const data = object(wire)
  if (
    typeof data.base64 !== 'string' ||
    data.base64.length > 14 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(data.base64)
  )
    throw Error('Invalid PDF payload')
  const binary = atob(data.base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const filename = rpcString(data.filename)
  if (
    /[/\\\x00-\x1f]/u.test(filename) ||
    !/\.pdf$/iu.test(filename) ||
    !['product', 'procurement'].includes(String(data.direction))
  )
    throw Error('Invalid PDF metadata')
  const mimeType = typeof data.mimeType === 'string' ? data.mimeType : 'application/pdf'
  return {
    assetId: rpcString(data.assetId),
    filename,
    direction: data.direction as ResumeAsset['direction'],
    version: rpcString(data.version),
    hash: rpcString(data.hash),
    blob: new Blob([bytes], { type: mimeType }),
    size: bytes.length,
    mimeType,
    createdAt: Number(data.createdAt),
  }
}
export function validateSettings(value: unknown): FollowupSettings {
  const data = object(value)
  rpcString(data.accountId)
  rpcString(data.epoch)
  if (
    !['off', 'simulation', 'auto'].includes(String(data.mode)) ||
    !Array.isArray(data.allowedCities) ||
    data.allowedCities.length > 50 ||
    !data.allowedCities.every((c) => typeof c === 'string' && c.trim() && c.length <= 50)
  )
    throw Error('Invalid settings')
  const floors = object(data.minSalary)
  for (const value of [data.armedAt, data.sendIntervalMs, floors.product, floors.procurement])
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw Error('Invalid numeric settings')
  if (
    !Number.isSafeInteger(data.dailyLimit) ||
    Number(data.dailyLimit) < 1 ||
    Number(data.dailyLimit) > 150
  )
    throw Error('Invalid daily limit')
  return value as FollowupSettings
}
export async function handleFollowupRpc(
  repo: FollowupRepository,
  request: { method: string; args: unknown[] },
): Promise<unknown> {
  if (
    !request ||
    typeof request.method !== 'string' ||
    !Array.isArray(request.args) ||
    request.args.length > 5
  )
    throw Error('Invalid RPC request')
  const args = request.args
  switch (request.method) {
    case 'getSettings':
      return repo.getSettings(rpcString(args[0]))
    case 'saveSettings':
      return repo.saveSettings(validateSettings(args[0]))
    case 'listAssets':
      return repo.listAssets()
    case 'deleteAsset':
      return repo.deleteAsset(rpcString(args[0]), Number(args[1]))
    case 'getAsset': {
      const asset = await repo.getAsset(rpcString(args[0]))
      return asset ? encodeAsset(asset) : null
    }
    case 'saveAsset': {
      const asset = decodeAsset(args[0])
      if (!(await validatePdfAsset(asset))) throw Error('PDF bytes or hash do not match')
      return repo.saveAsset(asset)
    }
    case 'getBindings':
      return repo.getBindings(rpcString(args[0]))
    case 'saveBinding': {
      const value = object(args[0])
      for (const key of [
        'bindingId',
        'accountId',
        'conversationId',
        'jobId',
        'title',
        'assetId',
        'assetHash',
        'city',
      ])
        rpcString(value[key])
      if (
        !['product', 'procurement'].includes(String(value.direction)) ||
        !Number.isSafeInteger(value.revision) ||
        typeof value.locationVerified !== 'boolean' ||
        typeof value.salaryVerified !== 'boolean' ||
        (value.fixedSalary !== null &&
          (typeof value.fixedSalary !== 'number' || !Number.isFinite(value.fixedSalary)))
      )
        throw Error('Invalid binding')
      return repo.saveBinding(value as unknown as JobBinding)
    }
    case 'acceptRequest':
      return repo.acceptRequest(object(args[0]) as unknown as FollowupTask)
    case 'listTasks':
      return repo.listTasks(rpcString(args[0]))
    case 'claimTask':
      return repo.claimTask(rpcString(args[0]), rpcString(args[1]), Number(args[2]))
    case 'reserveSubmission':
      return repo.reserveSubmission(rpcString(args[0]), rpcString(args[1]), Number(args[2]))
    case 'finalizeTask':
      return repo.finalizeTask(
        rpcString(args[0]),
        rpcString(args[1]),
        object(args[2]) as Partial<FollowupTask>,
        Number(args[3]),
      )
    case 'cancelTask':
      return repo.cancelTask(rpcString(args[0]), rpcString(args[1]), Number(args[2]))
    default:
      throw Error('RPC method not allowed')
  }
}
