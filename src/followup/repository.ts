import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

import { canStartDelivery } from './deliveryLimit.ts'
import type {
  FollowupTask,
  FollowupSettings,
  ResumeAsset,
  ResumeAssetInfo,
  JobBinding,
} from './types.ts'

interface Budget {
  id: string
  count: number
  lastSubmittedAt: number
  jobs?: string[]
}
interface FollowupSchema extends DBSchema {
  settings: { key: string; value: FollowupSettings }
  assets: { key: string; value: ResumeAsset }
  bindings: { key: string; value: JobBinding }
  tasks: { key: string; value: FollowupTask; indexes: { account: string } }
  budgets: { key: string; value: Budget }
}
const terminalOrInFlight = new Set(['sent', 'sending', 'uncertain', 'queued', 'waiting-permission'])
export function localDay(now: number): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export class FollowupRepository {
  private db: Promise<IDBPDatabase<FollowupSchema>>
  constructor(name = 'BossHelperResumeFollowup') {
    this.db = openDB<FollowupSchema>(name, 1, {
      upgrade(db) {
        db.createObjectStore('settings', { keyPath: 'accountId' })
        db.createObjectStore('assets', { keyPath: 'assetId' })
        db.createObjectStore('bindings', { keyPath: 'bindingId' })
        const tasks = db.createObjectStore('tasks', { keyPath: 'id' })
        tasks.createIndex('account', 'accountId')
        db.createObjectStore('budgets', { keyPath: 'id' })
      },
    })
  }
  async saveSettings(settings: FollowupSettings): Promise<void> {
    await (await this.db).put('settings', settings)
  }
  async getSettings(accountId: string): Promise<FollowupSettings | undefined> {
    return (await this.db).get('settings', accountId)
  }
  async saveAsset(asset: ResumeAsset): Promise<void> {
    await (await this.db).put('assets', asset)
  }
  async getAsset(id: string): Promise<ResumeAsset | undefined> {
    return (await this.db).get('assets', id)
  }
  async listAssets(): Promise<ResumeAssetInfo[]> {
    return (await (await this.db).getAll('assets')).map(({ blob: _blob, ...metadata }) => metadata)
  }
  async saveBinding(binding: JobBinding): Promise<void> {
    await (await this.db).put('bindings', binding)
  }
  async getBindings(accountId: string): Promise<JobBinding[]> {
    return (await (await this.db).getAll('bindings')).filter((b) => b.accountId === accountId)
  }
  async acceptRequest(task: FollowupTask): Promise<FollowupTask> {
    const tx = (await this.db).transaction('tasks', 'readwrite')
    const existing = await tx.store.get(task.id)
    if (existing) {
      await tx.done
      return existing
    }
    const tasks = await tx.store.index('account').getAll(task.accountId)
    if (
      task.assetHash &&
      task.status !== 'simulation' &&
      tasks.some(
        (t) =>
          t.conversationId === task.conversationId &&
          t.jobId === task.jobId &&
          t.assetHash === task.assetHash &&
          terminalOrInFlight.has(t.status),
      )
    ) {
      task = { ...task, status: 'duplicate', reason: 'same-resume-already-sent-or-pending' }
    }
    await tx.store.add(task)
    await tx.done
    return task
  }
  async listTasks(accountId: string): Promise<FollowupTask[]> {
    return (await (await this.db).getAllFromIndex('tasks', 'account', accountId)).sort(
      (a, b) => b.createdAt - a.createdAt,
    )
  }
  async claimTask(account: string, owner: string, now: number): Promise<FollowupTask | null> {
    const tx = (await this.db).transaction(['tasks', 'settings'], 'readwrite')
    const store = tx.objectStore('tasks')
    const settings = await tx.objectStore('settings').get(account)
    const tasks = (await store.index('account').getAll(account)).sort(
      (a, b) => a.createdAt - b.createdAt,
    )
    let active = false
    for (const task of tasks) {
      if (task.status === 'sending') {
        if ((task.leaseUntil ?? 0) <= now) {
          await store.put({
            ...task,
            status: 'uncertain',
            reason: 'interrupted-send-needs-verification',
            leaseOwner: undefined,
            leaseUntil: undefined,
            updatedAt: now,
          })
        } else active = true
      }
    }
    if (active || settings?.mode !== 'auto') {
      await tx.done
      return null
    }
    let claimed: FollowupTask | null = null
    for (const task of tasks) {
      if (task.status !== 'queued' && task.status !== 'waiting-permission') continue
      if (task.epoch !== settings.epoch || task.messageTimestamp <= settings.armedAt) {
        await store.put({ ...task, status: 'cancelled', reason: 'old-activation', updatedAt: now })
        continue
      }
      claimed = {
        ...task,
        status: 'sending',
        leaseOwner: owner,
        leaseUntil: now + 60000,
        updatedAt: now,
      }
      await store.put(claimed)
      break
    }
    await tx.done
    return claimed
  }
  async reserveSubmission(id: string, owner: string, now: number): Promise<boolean> {
    const tx = (await this.db).transaction(
      ['tasks', 'settings', 'budgets', 'bindings', 'assets'],
      'readwrite',
    )
    const task = await tx.objectStore('tasks').get(id)
    if (
      !task ||
      task.status !== 'sending' ||
      task.leaseOwner !== owner ||
      (task.leaseUntil ?? 0) <= now ||
      task.submittedAt != null
    ) {
      await tx.done
      return false
    }
    const settings = await tx.objectStore('settings').get(task.accountId)
    if (settings?.mode !== 'auto' || settings.epoch !== task.epoch) {
      await tx.done
      return false
    }
    const binding = task.bindingId
      ? await tx.objectStore('bindings').get(task.bindingId)
      : undefined
    const asset = task.assetId ? await tx.objectStore('assets').get(task.assetId) : undefined
    if (
      !binding ||
      !asset ||
      binding.accountId !== task.accountId ||
      binding.conversationId !== task.conversationId ||
      binding.jobId !== task.jobId ||
      binding.revision !== task.bindingRevision ||
      binding.assetId !== task.assetId ||
      binding.assetHash !== task.assetHash ||
      asset.hash !== task.assetHash ||
      !binding.locationVerified ||
      !settings.allowedCities
        .map((c) => c.replace(/市$/u, '').trim())
        .includes(binding.city.replace(/市$/u, '').trim()) ||
      !binding.salaryVerified ||
      typeof binding.fixedSalary !== 'number' ||
      !Number.isFinite(binding.fixedSalary) ||
      !Number.isFinite(settings.minSalary[binding.direction]) ||
      binding.fixedSalary < settings.minSalary[binding.direction]
    ) {
      await tx.done
      return false
    }
    const budgetId = JSON.stringify([task.accountId, localDay(now), 'pdf'])
    const budget = (await tx.objectStore('budgets').get(budgetId)) ?? {
      id: budgetId,
      count: 0,
      lastSubmittedAt: 0,
    }
    if (
      !canStartDelivery(budget.count, settings.dailyLimit) ||
      (budget.count > 0 && now - budget.lastSubmittedAt < Math.max(0, settings.sendIntervalMs))
    ) {
      await tx.done
      return false
    }
    await tx
      .objectStore('budgets')
      .put({ id: budgetId, count: budget.count + 1, lastSubmittedAt: now })
    await tx.objectStore('tasks').put({ ...task, submittedAt: now, updatedAt: now })
    await tx.done
    return true
  }
  async finalizeTask(
    id: string,
    owner: string,
    patch: Partial<FollowupTask>,
    now: number,
  ): Promise<boolean> {
    const tx = (await this.db).transaction('tasks', 'readwrite')
    const task = await tx.store.get(id)
    if (
      !task ||
      task.status !== 'sending' ||
      task.leaseOwner !== owner ||
      (task.leaseUntil ?? 0) <= now
    ) {
      await tx.done
      return false
    }
    await tx.store.put({
      ...task,
      status: patch.status ?? 'uncertain',
      reason: patch.reason ?? '',
      evidenceId: patch.evidenceId,
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: now,
    })
    await tx.done
    return true
  }
  async cancelTask(accountId: string, id: string, now: number): Promise<void> {
    const tx = (await this.db).transaction('tasks', 'readwrite')
    const task = await tx.store.get(id)
    if (
      task?.accountId === accountId &&
      ['queued', 'review', 'waiting-permission', 'simulation'].includes(task.status)
    )
      await tx.store.put({
        ...task,
        status: 'cancelled',
        reason: 'cancelled-by-user',
        updatedAt: now,
      })
    await tx.done
  }
  async close(): Promise<void> {
    ;(await this.db).close()
  }
  async deleteAsset(id: string, now: number): Promise<void> {
    const tx = (await this.db).transaction(['assets', 'bindings', 'tasks'], 'readwrite')
    const tasks = await tx.objectStore('tasks').getAll()
    if (tasks.some((t) => t.assetId === id && t.status === 'sending')) {
      await tx.done
      throw Error('文件仍有发送中的任务，请先核对结果。')
    }
    await tx.objectStore('assets').delete(id)
    for (const binding of await tx.objectStore('bindings').getAll())
      if (binding.assetId === id) await tx.objectStore('bindings').delete(binding.bindingId)
    for (const task of tasks)
      if (
        task.assetId === id &&
        ['queued', 'review', 'simulation', 'waiting-permission'].includes(task.status)
      )
        await tx
          .objectStore('tasks')
          .put({ ...task, status: 'cancelled', reason: 'local-file-removed', updatedAt: now })
    await tx.done
  }
  async reserveGreeting(
    account: string,
    job: string,
    limit: unknown,
    knownCount: unknown,
    now: number,
  ): Promise<boolean> {
    if (
      !account ||
      !job ||
      typeof knownCount !== 'number' ||
      !Number.isSafeInteger(knownCount) ||
      knownCount < 0 ||
      !Number.isFinite(now)
    )
      return false
    const tx = (await this.db).transaction('budgets', 'readwrite')
    const id = JSON.stringify([account, localDay(now), 'greeting'])
    const budget = (await tx.store.get(id)) ?? { id, count: 0, lastSubmittedAt: 0, jobs: [] }
    budget.count = Math.max(budget.count, knownCount)
    if (!canStartDelivery(budget.count, limit) || budget.jobs?.includes(job)) {
      await tx.store.put(budget)
      await tx.done
      return false
    }
    budget.count++
    budget.lastSubmittedAt = now
    budget.jobs = [...(budget.jobs ?? []), job]
    await tx.store.put(budget)
    await tx.done
    return true
  }
}
