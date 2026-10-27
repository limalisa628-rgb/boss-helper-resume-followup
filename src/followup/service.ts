import type { FollowupStore } from './engine.ts'
import { acceptMessage, processNextTask } from './engine.ts'
import type { AttachmentPort, MessageEnvelope, FollowupSettings } from './types.ts'
export function defaultSettings(accountId: string): FollowupSettings {
  return {
    accountId,
    mode: 'off',
    armedAt: 0,
    epoch: crypto.randomUUID(),
    allowedCities: [],
    minSalary: { product: 6000, procurement: 10000 },
    sendIntervalMs: 5000,
    dailyLimit: 10,
  }
}
export class FollowupService {
  private store: FollowupStore
  private port: AttachmentPort & {
    subscribeIncoming(handler: (message: MessageEnvelope) => void): () => void
  }
  private clock: () => number
  private account = ''
  private owner = crypto.randomUUID()
  private unsubscribe?: () => void
  private running = false
  private disposed = false
  lastError = ''
  constructor(
    store: FollowupStore,
    port: AttachmentPort & {
      subscribeIncoming(handler: (message: MessageEnvelope) => void): () => void
    },
    clock: () => number = Date.now,
  ) {
    this.store = store
    this.port = port
    this.clock = clock
  }
  async start(accountId: string): Promise<void> {
    if (this.disposed || this.account === accountId) return
    if (this.account) await this.pause()
    this.unsubscribe?.()
    this.account = accountId
    if (!(await this.store.getSettings(accountId)))
      await this.store.saveSettings(defaultSettings(accountId))
    this.unsubscribe = this.port.subscribeIncoming((message) => {
      if (!this.disposed && message.accountId === this.account)
        void acceptMessage(this.store, message, this.clock()).catch(() => {
          this.lastError = '消息处理失败，未自动重试。'
        })
    })
  }
  async setMode(mode: 'off' | 'simulation' | 'auto'): Promise<void> {
    if (this.disposed || !this.account) throw Error('未连接本地档案')
    if (
      mode === 'auto' &&
      (!this.port.capabilities().verified ||
        !this.port.capabilities().incoming ||
        !this.port.capabilities().pdf)
    )
      throw Error('尚未验证平台通道，自动发送不可用。')
    const settings = (await this.store.getSettings(this.account)) ?? defaultSettings(this.account)
    await this.store.saveSettings({
      ...settings,
      mode,
      epoch: crypto.randomUUID(),
      armedAt: this.clock(),
    })
  }
  async pause(): Promise<void> {
    if (this.account && !this.disposed) await this.setMode('off')
  }
  async tick(): Promise<void> {
    if (this.running || this.disposed || !this.account) return
    this.running = true
    try {
      await processNextTask(this.store, this.port, this.account, this.owner, this.clock)
    } catch {
      this.lastError = '队列运行失败，请查看任务状态。'
    } finally {
      this.running = false
    }
  }
  async dispose(): Promise<void> {
    if (this.disposed) return
    await this.pause()
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.disposed = true
  }
}
