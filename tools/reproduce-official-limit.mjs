// Runs only the installed package's workflow loop with inert in-memory dependencies.
// No DOM, network, browser session, tokens or real messages are accessible.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const source = await readFile(process.argv[2], 'utf8')
const start = source.indexOf('executeAll:async e=>')
const end = source.indexOf(',stop:()=>', start)
assert(start >= 0 && end > start, 'Official workflow signature was not found')
const literal = source.slice(start + 'executeAll:'.length, end)
const state = { value: 'pending' }
let successful = 0
const helper = {
  conf: { formData: { deliveryLimit: { value: 11 }, delayDeliveryStarts: 0, delayDeliveryInterval: 0, delayDeliveryPageNext: 0 } },
  jobList: { value: Array.from({ length: 93 }, (_, i) => ({ key: String(i) })) },
  jobResultMaps: new Map(), jobMaps: new Map(), currentJob: { value: '' },
  loadMoreJob: async () => false, notification: () => {},
}
const execute = async ({ jobData }) => {
  const skip = Number(jobData.key) < 37
  helper.jobResultMaps.set(jobData.key, { status: skip ? 'warn' : 'success' })
  if (!skip) successful++
}
const loop = Function('t', 'u', 'n', 'a', 'r', 'c', 'f', 'lu', 'Md', 'o', `return (${literal})`)(
  helper, async () => {}, state, { value: null }, { value: 0 }, { value: new Map() }, execute,
  async () => {}, { error() {}, withContext() { return {} } }, { value: [] },
)
await loop(new Map())
assert.equal(successful, 56)
console.log(JSON.stringify({ fixture: '93 jobs, 37 filtered; no real actions', configuredLimit: 11, officialPackageSuccessful: successful, limitEnforced: false }))
