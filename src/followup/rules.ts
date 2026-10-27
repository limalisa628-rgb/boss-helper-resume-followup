import type { MessageEnvelope, RequestDecision } from './types.ts'
export function classifyResumeRequest(message: MessageEnvelope): RequestDecision {
  if (message.sender !== 'recruiter' || message.isSystem)
    return { kind: 'ignore', reason: 'not-recruiter' }
  if (message.isQuoted) return { kind: 'review', reason: 'quoted-message' }
  const text = String(message.text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!/(?:简历|履历|\bcv\b|\br[eé]sum[eé]\b)/u.test(text))
    return { kind: 'ignore', reason: 'no-resume-reference' }
  if (
    /(?:不|别|勿|莫).{0,12}(?:发|传|提供|提交|分享|简历)|\b(?:not|never|cannot|can't|shouldn't|mustn't|refrain|avoid|stop|wait)\b/u.test(
      text,
    )
  )
    return { kind: 'review', reason: 'negative-or-conflicting-request' }
  if (
    /(?:如果|若|等.{0,20}(?:后|通知|通过)|之后|以后|稍后|晚点|待会|明天|再发|暂时|先聊|先沟通|我(?:会|将|来|帮)|我们(?:会|将|来|帮))|\b(?:if|when|after|until|later|yet)\b|\b(?:i|we)\s+(?:will|shall|can|am going to)\b/u.test(
      text,
    )
  )
    return { kind: 'review', reason: 'deferred-conditional-or-other-actor' }
  if (/'[^']*(?:resume|cv|简历)[^']*'/u.test(text))
    return { kind: 'review', reason: 'quoted-historical-or-process-text' }
  if (
    /(?:不需要|不用|无需|别再|不要|不必|无需再|无须|no need|do not|don't|already received|已经收到|已收到|已经收到了)/u.test(
      text,
    )
  ) {
    return { kind: 'review', reason: 'negative-or-conflicting-request' }
  }
  if (
    /(?:英文|英语版|word|docx|邮箱|邮件|微信|链接|网址|email|e-mail|wechat|link|english|https?:|www\.|[^\s@]+@[^\s@]+)/u.test(
      text,
    )
  ) {
    return { kind: 'review', reason: 'unsupported-format-or-destination' }
  }
  if (
    /[“”「」『』"<>]|(?:引用|例如|比如|自动回复|流程|筛选后|收到.{0,8}简历|简历.{0,8}收到)/u.test(
      text,
    )
  ) {
    return { kind: 'review', reason: 'quoted-historical-or-process-text' }
  }
  const explicit =
    /(?:发|发送|提供|传|分享|提交|投递|补发).{0,24}(?:简历|履历|\bcv\b|\bresume\b)/u.test(text) ||
    /(?:简历|履历|\bcv\b|\bresume\b).{0,16}(?:发|传|给|提供).{0,10}(?:我|过来|一下|下|看看|一份)/u.test(
      text,
    ) ||
    /\b(?:send|share|provide|forward|attach|submit)\b.{0,40}\b(?:cv|resume)\b/u.test(text)
  return explicit
    ? { kind: 'request', reason: 'explicit-resume-request' }
    : { kind: 'ignore', reason: 'no-explicit-send-request' }
}
