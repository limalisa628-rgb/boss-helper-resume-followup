import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveResume } from '../../src/followup/matching.ts'
import { message, asset, binding, settings } from './fixtures.ts'

test('selects the explicitly bound product PDF and retains its hash', () => {
  const result = resolveResume(message, [binding], [asset], settings)
  assert.equal(result.kind, 'matched')
  if (result.kind === 'matched') assert.equal(result.asset.hash, 'a'.repeat(64))
})
test('procurement requires the separate salary floor', () => {
  const procurement = { ...asset, direction: 'procurement' as const }
  const job = { ...binding, title: '供应链采购', direction: 'procurement' as const, fixedSalary: 9999 }
  assert.equal(resolveResume(message, [job], [procurement], settings).kind, 'blocked')
  assert.equal(resolveResume(message, [{ ...job, fixedSalary: 10000 }], [procurement], settings).kind, 'matched')
})
test('unknown fixed base is not inferred from a salary range or title', () => {
  assert.equal(resolveResume(message, [{ ...binding, fixedSalary: null }], [asset], settings).kind, 'review')
  assert.equal(resolveResume(message, [{ ...binding, salaryVerified: false }], [asset], settings).kind, 'review')
})
test('actual city must be verified and in the allowlist', () => {
  assert.equal(resolveResume(message, [{ ...binding, city: '佛山' }], [asset], settings).kind, 'blocked')
  assert.equal(resolveResume(message, [{ ...binding, locationVerified: false }], [asset], settings).kind, 'review')
  assert.equal(resolveResume(message, [binding], [asset], { ...settings, allowedCities: [] }).kind, 'review')
})
test('never guesses a job for a recruiter with several job bindings', () => {
  assert.equal(resolveResume({ ...message, jobId: undefined }, [binding, { ...binding, jobId: 'job-2' }], [asset], settings).kind, 'review')
  assert.equal(resolveResume(message, [binding, { ...binding, bindingId: 'conflict', assetId: 'other' }], [asset], settings).kind, 'review')
})
test('missing, replaced or wrong-direction files require review', () => {
  for (const assets of [[], [{ ...asset, hash: 'b'.repeat(64) }], [{ ...asset, direction: 'procurement' as const }]]) {
    assert.equal(resolveResume(message, [binding], assets, settings).kind, 'review')
  }
})
test('another account or conversation never reuses a binding', () => {
  assert.equal(resolveResume({ ...message, accountId: 'other' }, [binding], [asset], settings).kind, 'review')
  assert.equal(resolveResume({ ...message, conversationId: 'other' }, [binding], [asset], settings).kind, 'review')
})
