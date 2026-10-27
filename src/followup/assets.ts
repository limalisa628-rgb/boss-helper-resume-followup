import type { Direction, ResumeAsset } from './types.ts'

export async function pdfHash(blob: Blob): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
export async function validatePdfAsset(asset: ResumeAsset): Promise<boolean> {
  if (
    !asset.blob ||
    asset.blob.size === 0 ||
    asset.blob.size > 10 * 1024 * 1024 ||
    !/\.pdf$/iu.test(asset.filename) ||
    (asset.blob.type !== '' && asset.blob.type !== 'application/pdf') ||
    !asset.version.trim()
  )
    return false
  const header = new TextDecoder().decode(await asset.blob.slice(0, 5).arrayBuffer())
  return header === '%PDF-' && (await pdfHash(asset.blob)) === asset.hash
}
export async function createResumeAsset(
  file: File,
  direction: Direction,
  version: string,
): Promise<ResumeAsset> {
  const asset: ResumeAsset = {
    assetId: crypto.randomUUID(),
    filename: file.name,
    blob: file,
    size: file.size,
    mimeType: file.type,
    direction,
    version: version.trim(),
    hash: await pdfHash(file),
    createdAt: Date.now(),
  }
  if (!(await validatePdfAsset(asset)))
    throw Error('请选择有效的 PDF 文件（不超过 10 MB），并填写版本标签。')
  return asset
}
