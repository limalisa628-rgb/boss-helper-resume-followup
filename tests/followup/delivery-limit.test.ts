import test from 'node:test'
import assert from 'node:assert/strict'
import { canStartDelivery } from '../../src/followup/deliveryLimit.ts'

test('stops before the twelfth attempt when the limit is eleven', () => {
  let completed = 0
  let sent = 0
  for (let i = 0; i < 93; i++) {
    if (!canStartDelivery(completed, 11)) break
    if (i < 37) continue
    sent++
    completed++
  }
  assert.equal(sent, 11)
})

test('already at or above the daily limit sends nothing on restart', () => {
  assert.equal(canStartDelivery(11, 11), false)
  assert.equal(canStartDelivery(56, 11), false)
})

test('bad or uninitialised counters and limits fail closed', () => {
  for (const value of [NaN, Infinity, -1, undefined, '11', 1.5]) {
    assert.equal(canStartDelivery(0, value), false)
  }
  for (const value of [NaN, Infinity, -1, undefined, '0', 1.5]) {
    assert.equal(canStartDelivery(value, 11), false)
  }
  assert.equal(canStartDelivery(0, 0), false)
})
