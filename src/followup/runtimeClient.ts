import type { FollowupStore } from './engine.ts'
import { FOLLOWUP_RPC, decodeAsset, encodeAsset } from './rpc.ts'
import type {
  FollowupSettings,
  ResumeAsset,
  ResumeAssetInfo,
  JobBinding,
  FollowupTask,
} from './types.ts'

export class FollowupRuntimeClient implements FollowupStore {
  private async call<T>(method: string, args: unknown[] = []): Promise<T> {
    const response = await chrome.runtime.sendMessage({ scope: FOLLOWUP_RPC, method, args })
    if (!response?.ok) throw Error(response?.error || '本地扩展连接不可用')
    return response.value as T
  }
  saveSettings(settings: FollowupSettings) {
    return this.call<void>('saveSettings', [settings])
  }
  getSettings(account: string) {
    return this.call<FollowupSettings | undefined>('getSettings', [account])
  }
  async saveAsset(asset: ResumeAsset) {
    return this.call<void>('saveAsset', [await encodeAsset(asset)])
  }
  async getAsset(id: string) {
    const value = await this.call<unknown>('getAsset', [id])
    return value ? decodeAsset(value) : undefined
  }
  listAssets() {
    return this.call<ResumeAssetInfo[]>('listAssets')
  }
  deleteAsset(id: string, now: number) {
    return this.call<void>('deleteAsset', [id, now])
  }
  saveBinding(binding: JobBinding) {
    return this.call<void>('saveBinding', [binding])
  }
  getBindings(account: string) {
    return this.call<JobBinding[]>('getBindings', [account])
  }
  acceptRequest(task: FollowupTask) {
    return this.call<FollowupTask>('acceptRequest', [task])
  }
  listTasks(account: string) {
    return this.call<FollowupTask[]>('listTasks', [account])
  }
  claimTask(account: string, owner: string, now: number) {
    return this.call<FollowupTask | null>('claimTask', [account, owner, now])
  }
  reserveSubmission(id: string, owner: string, now: number) {
    return this.call<boolean>('reserveSubmission', [id, owner, now])
  }
  isSubmissionAuthorized(id: string, owner: string, now: number) {
    return this.call<boolean>('isSubmissionAuthorized', [id, owner, now])
  }
  finalizeTask(id: string, owner: string, patch: Partial<FollowupTask>, now: number) {
    return this.call<boolean>('finalizeTask', [id, owner, patch, now])
  }
  cancelTask(account: string, id: string, now: number) {
    return this.call<void>('cancelTask', [account, id, now])
  }
}
