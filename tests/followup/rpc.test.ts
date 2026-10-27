import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { FollowupRepository } from '../../src/followup/repository.ts'
import { encodeAsset, decodeAsset, handleFollowupRpc } from '../../src/followup/rpc.ts'
import { asset } from './fixtures.ts'

test('PDF bytes survive the JSON-only Chrome runtime bridge', async () => {
  const wire = JSON.parse(JSON.stringify(await encodeAsset(asset)))
  const result = decodeAsset(wire)
  assert.equal(result.filename, 'product-demo.pdf')
  assert.equal(await result.blob.text(), '%PDF-1.7\nsynthetic fixture')
})
test('the RPC whitelist refuses arbitrary method and prototype access', async () => {
  const repo = new FollowupRepository(`rpc-${crypto.randomUUID()}`)
  for (const method of ['constructor', '__proto__', 'close', 'deleteDatabase', 'request']) {
    await assert.rejects(handleFollowupRpc(repo, { method, args: [] }))
  }
  await repo.close()
})
test('the background rejects tampered PDF hashes before writing an asset', async () => {
  const repo = new FollowupRepository(`rpc-${crypto.randomUUID()}`)
  await assert.rejects(
    handleFollowupRpc(repo, { method: 'saveAsset', args: [await encodeAsset(asset)] }),
  )
  assert.equal((await repo.listAssets()).length, 0)
  const valid = {
    ...asset,
    hash: createHash('sha256').update('%PDF-1.7\nsynthetic fixture').digest('hex'),
  }
  await handleFollowupRpc(repo, { method: 'saveAsset', args: [await encodeAsset(valid)] })
  assert.equal((await repo.listAssets()).length, 1)
  await repo.close()
})
