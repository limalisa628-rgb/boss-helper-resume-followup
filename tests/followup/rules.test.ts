import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyResumeRequest } from '../../src/followup/rules.ts'
import { message } from './fixtures.ts'

for (const text of [
  '麻烦发一份简历。',
  '方便把简历发过来吗？',
  '请提供您的个人简历',
  '可以发下 CV 吗？',
  'Please send me your resume.',
  'Could you share your CV?',
  '请把简历传给我看看',
]) {
  test(`recognises an explicit request: ${text}`, () =>
    assert.equal(classifyResumeRequest({ ...message, text }).kind, 'request'))
}
for (const text of [
  '你好',
  '收到',
  '好的',
  '谢谢',
  '有简历吗？',
  '不用发简历',
  '不需要简历',
  '简历已经收到了',
  '不用再发简历了',
  'No need to send your resume',
  '简历筛选后会发面试通知',
]) {
  test(`does not send for nonrequests: ${text}`, () =>
    assert.notEqual(classifyResumeRequest({ ...message, text }).kind, 'request'))
}
for (const text of [
  '请发英文简历',
  '简历发到 hr@example.invalid',
  '请把简历发到微信',
  '提供简历链接',
  '请发Word简历',
  '例如“发一份简历”是开场白',
  '不用发简历，但是请再发一份简历',
]) {
  test(`requires review for special or contradictory request: ${text}`, () =>
    assert.notEqual(classifyResumeRequest({ ...message, text }).kind, 'request'))
}
test('self, system and quoted messages cannot trigger a send', () => {
  for (const extra of [
    { sender: 'self' as const },
    { sender: 'system' as const },
    { isSystem: true },
    { isQuoted: true },
  ]) {
    assert.notEqual(classifyResumeRequest({ ...message, ...extra }).kind, 'request')
  }
})
test('normalises full-width Latin text and whitespace', () => {
  assert.equal(
    classifyResumeRequest({ ...message, text: 'ＰＬＥＡＳＥ　ＳＥＮＤ　ＭＥ　ＹＯＵＲ　ＣＶ' })
      .kind,
    'request',
  )
})
for (const text of [
  '先别发简历，等我通知',
  '暂时不发简历，先聊一下',
  '如果面试通过，再发简历给我',
  '我会帮你转发简历',
  'You should not send your resume yet.',
  'Please do not send your CV',
  'I will forward your resume',
  '明天再发简历吧',
  "The phrase 'send your resume' is an example.",
]) {
  test(`review regression: no action for deferred, negated or third-party action: ${text}`, () => {
    assert.notEqual(classifyResumeRequest({ ...message, text }).kind, 'request')
  })
}
