import { FollowupRepository } from './repository.ts'
import { FOLLOWUP_RPC, handleFollowupRpc } from './rpc.ts'

export function allowedFollowupSender(
  id: string | undefined,
  url: string | undefined,
  frameId: number | undefined,
  ownId: string,
): boolean {
  if (id !== ownId || !url) return false
  try {
    const source = new URL(url)
    if (source.protocol === 'chrome-extension:' && source.hostname === ownId) return true
    return (
      frameId === 0 &&
      source.protocol === 'https:' &&
      (source.hostname === 'zhipin.com' || source.hostname.endsWith('.zhipin.com'))
    )
  } catch {
    return false
  }
}
export function installFollowupRpc() {
  // This constructor runs in the extension service worker only. Never store PDF
  // bytes in the BOSS-origin IndexedDB or expose them through the main-world bridge.
  const repository = new FollowupRepository()
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.scope !== FOLLOWUP_RPC) return false
    if (!allowedFollowupSender(sender.id, sender.url, sender.frameId, chrome.runtime.id)) {
      respond({ ok: false, error: 'Unauthorized follow-up caller' })
      return false
    }
    void handleFollowupRpc(repository, message).then(
      (value) => respond({ ok: true, value }),
      (error) =>
        respond({ ok: false, error: error instanceof Error ? error.message : '本地数据操作失败' }),
    )
    return true
  })
}
