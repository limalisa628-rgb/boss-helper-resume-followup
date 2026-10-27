<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import { createResumeAsset } from '../followup/assets.ts'
import { BossAttachmentAdapter } from '../followup/bossAdapter.ts'
import type { FollowupStore } from '../followup/engine.ts'
import { acceptMessage } from '../followup/engine.ts'
import { classifyResumeRequest } from '../followup/rules.ts'
import { defaultSettings, FollowupService } from '../followup/service.ts'
import type { Direction, FollowupTask, JobBinding, ResumeAssetInfo } from '../followup/types.ts'

const props = defineProps<{
  store: FollowupStore
  port: BossAttachmentAdapter
  profileId?: string
  fixture?: boolean
}>()
const profile = props.profileId ?? 'local-preview'
const config = reactive(defaultSettings(profile))
const service = new FollowupService(props.store, props.port)
const assets = ref<ResumeAssetInfo[]>([])
const bindings = ref<JobBinding[]>([])
const tasks = ref<FollowupTask[]>([])
const direction = ref<Direction>('product')
const version = ref('v1')
const selectedAsset = ref('')
const jobTitle = ref('产品运营')
const city = ref('广州')
const fixedBase = ref<number | null>(null)
const locationVerified = ref(false)
const salaryVerified = ref(false)
const sample = ref('麻烦发一份简历，方便发过来吗？')
const notice = ref('')
const error = ref('')
const busy = ref(false)
const ready = ref(false)
const canAuto = computed(
  () =>
    props.port.capabilities().verified &&
    props.port.capabilities().pdf &&
    props.port.capabilities().incoming,
)
const eligibleAssets = computed(() => assets.value.filter((a) => a.direction === direction.value))
const statusNames: Record<string, string> = {
  simulation: '演练通过（未发送）',
  review: '待人工核实',
  blocked: '条件不符',
  queued: '待发送',
  'waiting-permission': '等待平台权限',
  sending: '发送中',
  sent: '平台已确认发送',
  failed: '失败',
  uncertain: '发送结果待核对',
  cancelled: '已取消',
  duplicate: '重复请求已拦截',
}
const reasonNames: Record<string, string> = {
  'city-unverified': '请核实实际办公城市并设置城市白名单。',
  'fixed-base-unverified': '请核实固定底薪，招聘薪资区间不能代替底薪。',
  'city-outside-allowlist': '实际办公城市不在白名单内。',
  'fixed-base-below-minimum': '固定底薪低于此方向的最低要求。',
  'ambiguous-or-missing-binding': '请先保存对应岗位与 PDF 的绑定。',
  'explicit-resume-request': '识别到明确索要，岗位与文件匹配通过。',
  'negative-or-conflicting-request': '包含否定或矛盾表达，不自动发送。',
  'unsupported-format-or-destination': '请求的格式或发送目的地需要人工处理。',
  'no-explicit-send-request': '没有明确要求发送简历。',
  'no-resume-reference': '未提及简历。',
  'quoted-historical-or-process-text': '可能是引用、历史信息或流程说明。',
}
let interval: ReturnType<typeof setInterval> | undefined

async function refresh() {
  assets.value = await props.store.listAssets()
  bindings.value = await props.store.getBindings(profile)
  tasks.value = await props.store.listTasks(profile)
}
async function perform(action: () => Promise<void>) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await action()
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败，请重试。'
  } finally {
    busy.value = false
  }
}
async function savePreferences() {
  await props.store.saveSettings({
    ...config,
    allowedCities: [...config.allowedCities],
    minSalary: { ...config.minSalary },
    mode: 'off',
    epoch: crypto.randomUUID(),
    armedAt: Date.now(),
  })
  Object.assign(config, await props.store.getSettings(profile))
  notice.value = '偏好已保存，自动发送保持关闭。'
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await perform(async () => {
    const asset = await createResumeAsset(file, direction.value, version.value)
    await props.store.saveAsset(asset)
    selectedAsset.value = asset.assetId
    notice.value = 'PDF 已保存在扩展本地，尚未发给任何招聘者。'
  })
  input.value = ''
}
async function bindJob() {
  const asset = assets.value.find(
    (a) => a.assetId === selectedAsset.value && a.direction === direction.value,
  )
  if (!asset || !jobTitle.value.trim()) throw Error('请选择同方向 PDF 并填写岗位名称。')
  const bindingId = `${profile}:${direction.value}`
  const existing = bindings.value.find((b) => b.bindingId === bindingId)
  await props.store.saveBinding({
    bindingId,
    accountId: profile,
    conversationId: `preview-${direction.value}`,
    jobId: `preview-job-${direction.value}`,
    title: jobTitle.value.trim(),
    direction: direction.value,
    assetId: asset.assetId,
    assetHash: asset.hash,
    city: city.value.trim(),
    locationVerified: locationVerified.value,
    salaryVerified: salaryVerified.value,
    fixedSalary: fixedBase.value == null || fixedBase.value === 0 ? null : Number(fixedBase.value),
    revision: (existing?.revision ?? 0) + 1,
  })
  notice.value = '演练岗位绑定已保存；这不是实际 BOSS 会话。'
}
async function removeFile(id: string) {
  if (!window.confirm('移除此扩展本地的 PDF？相关未发送任务会取消，已发送记录和今日额度会保留。'))
    return
  await perform(async () => {
    await props.store.deleteAsset(id, Date.now())
    notice.value = '本地文件已移除；未撤回已发出的附件。'
  })
}
function checkRule() {
  const result = classifyResumeRequest({
    accountId: profile,
    conversationId: 'preview',
    messageId: 'preview',
    sender: 'recruiter',
    timestamp: Date.now(),
    text: sample.value,
  })
  notice.value = `${result.kind === 'request' ? '明确索要' : result.kind === 'review' ? '需人工判断' : '不触发'}：${reasonNames[result.reason] ?? result.reason}`
}
async function simulate() {
  await service.setMode('simulation')
  const now = Date.now() + 1
  const task = await acceptMessage(
    props.store,
    {
      accountId: profile,
      conversationId: `preview-${direction.value}`,
      jobId: `preview-job-${direction.value}`,
      messageId: crypto.randomUUID(),
      sender: 'recruiter',
      timestamp: now,
      text: sample.value,
    },
    now,
  )
  notice.value = task
    ? `${statusNames[task.status]}：${reasonNames[task.reason] ?? task.reason}`
    : '这条消息不会触发附件发送。'
  Object.assign(config, await props.store.getSettings(profile))
}
function exportPreferences() {
  const payload = {
    schema: 1,
    allowedCities: [...config.allowedCities],
    minSalary: { ...config.minSalary },
    sendIntervalMs: config.sendIntervalMs,
    dailyLimit: config.dailyLimit,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'resume-followup-preferences.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  notice.value = '导出仅含偏好，不含 PDF、完整聊天、账户和登录信息。'
}
onMounted(() => {
  void perform(async () => {
    await service.start(profile)
    Object.assign(config, await props.store.getSettings(profile))
    ready.value = true
    interval = setInterval(() => {
      void service
        .tick()
        .then(refresh)
        .catch(() => {
          error.value = '本地队列连接中断。'
        })
    }, 2500)
  })
})
onBeforeUnmount(() => {
  if (interval) clearInterval(interval)
  void service.dispose()
})
</script>

<template>
  <main class="workbench">
    <header>
      <span class="eyebrow">LOCAL RULES · EXPERIMENTAL</span>
      <h1>简历跟进工作台</h1>
      <p>明确索要，再匹配对应 PDF。</p>
    </header>
    <section class="banner">
      <strong>{{ fixture ? '本地测试场景' : '本地演练档案' }}</strong>
      <p>
        {{
          canAuto
            ? '当前通道已验证。'
            : '真实 BOSS 消息与附件通道尚未联调。自动发送不可用；下面的演练不会联系招聘者。'
        }}
      </p>
    </section>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <fieldset :disabled="busy || !ready">
      <section>
        <h2>1. 求职偏好</h2>
        <div class="inline">
          <label><input v-model="config.allowedCities" type="checkbox" value="广州" />广州</label
          ><label><input v-model="config.allowedCities" type="checkbox" value="深圳" />深圳</label>
        </div>
        <div class="grid">
          <label
            >转型岗位最低固定月薪<input
              v-model.number="config.minSalary.product"
              type="number"
              min="1"
              step="100" /></label
          ><label
            >采购岗位最低固定月薪<input
              v-model.number="config.minSalary.procurement"
              type="number"
              min="1"
              step="100" /></label
          ><label
            >每日附件发送上限<input
              v-model.number="config.dailyLimit"
              type="number"
              min="1"
              max="150"
              step="1" /></label
          ><label
            >附件发送间隔（毫秒）<input
              v-model.number="config.sendIntervalMs"
              type="number"
              min="1000"
              step="1000"
          /></label>
        </div>
        <button @click="perform(savePreferences)">保存偏好并暂停</button
        ><button class="secondary" @click="exportPreferences">导出偏好</button>
      </section>
      <section>
        <h2>2. 本地 PDF</h2>
        <div class="grid">
          <label
            >岗位方向<select v-model="direction">
              <option value="product">AI／产品运营</option>
              <option value="procurement">采购／供应链</option>
            </select></label
          ><label
            >版本标签<input v-model="version" maxlength="80" placeholder="例如 2026-10-v1"
          /></label>
        </div>
        <label class="upload"
          >选择 PDF（最多 10 MB）<input type="file" accept="application/pdf,.pdf" @change="upload"
        /></label>
        <ul v-if="assets.length">
          <li v-for="asset in assets" :key="asset.assetId">
            <strong>{{ asset.direction === 'product' ? '转型' : '采购' }}</strong>
            {{ asset.filename }} · {{ asset.version
            }}<small>SHA-256 {{ asset.hash.slice(0, 12) }}…</small
            ><button class="secondary" @click="removeFile(asset.assetId)">移除本地文件</button>
          </li>
        </ul>
        <p v-else class="muted">文件仅保存在扩展本地，不上传到 GitHub。</p>
      </section>
      <section>
        <h2>3. 演练岗位与简历匹配</h2>
        <p class="muted">先核实城市和固定底薪；招聘标价不等于底薪。</p>
        <div class="grid">
          <label>岗位名称<input v-model="jobTitle" placeholder="产品运营／采购专员" /></label
          ><label
            >对应 PDF<select v-model="selectedAsset">
              <option value="">请选择</option>
              <option v-for="asset in eligibleAssets" :key="asset.assetId" :value="asset.assetId">
                {{ asset.filename }} · {{ asset.version }}
              </option>
            </select></label
          ><label>实际办公城市<input v-model="city" placeholder="广州或深圳" /></label
          ><label
            >核实后的固定月薪<input
              v-model.number="fixedBase"
              type="number"
              min="1"
              placeholder="不清楚就留空"
          /></label>
        </div>
        <div class="inline">
          <label><input v-model="locationVerified" type="checkbox" />办公城市已核实</label
          ><label><input v-model="salaryVerified" type="checkbox" />固定底薪已核实</label>
        </div>
        <button @click="perform(bindJob)">保存演练岗位</button>
      </section>
      <section>
        <h2>4. 规则演练</h2>
        <label>模拟招聘者消息<textarea v-model="sample" rows="3" maxlength="2000"></textarea></label
        ><button class="secondary" @click="checkRule">只检查文字</button
        ><button @click="perform(simulate)">模拟匹配，不发送</button>
        <div class="controls">
          <button
            :disabled="!canAuto"
            @click="
              perform(async () => {
                await service.setMode('auto')
                notice = '已启用自动发送'
              })
            "
          >
            自动发送{{ canAuto ? '' : '（未联调）' }}</button
          ><button
            class="secondary"
            @click="
              perform(async () => {
                await service.pause()
                notice = '已暂停，未开始的任务不会发送。'
              })
            "
          >
            暂停
          </button>
        </div>
      </section>
      <section>
        <h2>
          任务记录 <span>{{ tasks.length }}</span>
        </h2>
        <p v-if="!tasks.length" class="muted">尚无任务。普通问候不会创建发送任务。</p>
        <article v-for="task in tasks.slice(0, 30)" :key="task.id" class="task">
          <strong>{{ statusNames[task.status] }}</strong>
          <p>{{ reasonNames[task.reason] ?? task.reason }}</p>
          <small
            >{{ new Date(task.createdAt).toLocaleString() }} ·
            {{ task.assetVersion ?? '未匹配版本' }}</small
          ><button
            v-if="['queued', 'review', 'simulation', 'waiting-permission'].includes(task.status)"
            class="secondary"
            @click="
              perform(async () => {
                await store.cancelTask(profile, task.id, Date.now())
              })
            "
          >
            取消此任务
          </button>
        </article>
      </section>
    </fieldset>
    <footer>发送成功以匹配的新附件回执为准；不会把图片或招呼语当作 PDF 已投递。</footer>
  </main>
</template>

<style scoped>
* {
  box-sizing: border-box;
}
.workbench {
  font:
    14px/1.6 system-ui,
    -apple-system,
    'Microsoft YaHei',
    sans-serif;
  color: #17332d;
  max-width: 880px;
  margin: auto;
  padding: 28px;
  background: #f4f8f6;
  min-height: 100vh;
}
.eyebrow {
  color: #56796c;
  font-size: 11px;
  letter-spacing: 2px;
}
h1 {
  font-size: 28px;
  margin: 6px 0;
}
header p {
  margin-top: 0;
  color: #5c7067;
}
section {
  background: white;
  padding: 20px;
  border: 1px solid #dce7e1;
  border-radius: 12px;
  margin: 16px 0;
}
h2 {
  font-size: 17px;
  margin: 0 0 14px;
}
h2 span {
  font-weight: normal;
  color: #6d7f76;
}
.banner {
  background: #fff9e8;
  border-color: #eadcb6;
}
.banner p {
  margin: 5px 0 0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
label {
  display: block;
  font-size: 13px;
}
input:not([type='checkbox']),
select,
textarea {
  display: block;
  width: 100%;
  margin: 6px 0 12px;
  padding: 9px 11px;
  border: 1px solid #c4d4cb;
  border-radius: 7px;
  background: #fff;
  color: #17332d;
  font: inherit;
}
input[type='checkbox'] {
  accent-color: #087e68;
  margin-right: 6px;
}
.inline {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin: 12px 0;
}
button {
  border: 0;
  background: #087e68;
  color: white;
  padding: 9px 13px;
  border-radius: 7px;
  margin: 6px 8px 0 0;
  cursor: pointer;
  font: inherit;
}
.secondary {
  background: #eaf2ee;
  color: #234c3e;
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
}
small,
.muted,
footer {
  color: #61786b;
  font-size: 12px;
}
small {
  display: block;
}
.error,
.notice {
  padding: 12px 15px;
  border-radius: 8px;
}
.error {
  background: #ffeceb;
  color: #8c2925;
}
.notice {
  background: #e1f3e9;
  color: #18543b;
}
ul {
  padding-left: 18px;
}
li {
  margin: 8px 0;
}
.controls {
  border-top: 1px solid #e7eee9;
  margin-top: 14px;
  padding-top: 10px;
}
.task {
  padding: 13px 0;
  border-bottom: 1px solid #e5ede7;
}
.task p {
  margin: 4px 0;
}
.upload {
  padding: 12px;
  background: #f3f8f5;
  border: 1px dashed #bdd2c5;
  border-radius: 8px;
}
footer {
  padding: 12px 0 0;
}
@media (max-width: 560px) {
  .workbench {
    padding: 16px;
  }
  .grid {
    grid-template-columns: 1fr;
  }
  section {
    padding: 16px;
  }
  h1 {
    font-size: 23px;
  }
}
</style>
