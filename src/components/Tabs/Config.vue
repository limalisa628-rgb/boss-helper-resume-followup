<script lang="ts" setup>
import Alert from '@/components/Alert.vue'
import { formInfoData, useConf } from '@/composables/conf'
import { getCacheManager } from '@/composables/useApplying'
import { useHelper } from '@/composables/useHelper'
import { getCurDay } from '@/utils'

import ConfigItem from './ConfigItem/ConfigItem.vue'

const helper = useHelper()
const conf = useConf()
const configItems = helper.getConfigItems()
</script>

<template>
  <div class="flex flex-col gap-2">
    <UTheme
      :ui="{
        formField: {
          root: 'flex max-sm:flex-col justify-between gap-4 items-center',
          container: 'flex-1',
        },
        input: {
          root: 'w-full',
        },
        inputMenu: {
          root: 'w-full',
        },
        inputTags: {
          root: 'w-full',
        },
      }"
    >
      <Alert v-for="(items, index) in configItems[0]" :key="index" v-bind="items" />
      <UForm :disabled="helper.workflowRunning.value || conf.isLoading.value">
        <UAccordion
          type="single"
          collapsible
          :items="configItems[1].filter((item) => !!item)"
          :ui="{ content: 'data-[state=open]:pt-1 data-[state=open]:pb-3 px-2 gap-3' }"
          :unmount-on-hide="false"
          default-value="filter"
        >
          <template #body="{ item }">
            <template v-for="(v, i) in item.items" :key="i">
              <ConfigItem v-if="v" :item="v" />
            </template>
          </template>
        </UAccordion>
        <hr class="border-t border-gray-200 dark:border-gray-800" />
        <div class="mt-3 flex flex-row flex-wrap gap-5 items-center">
          <UFormField label="配置级别" :data-help="formInfoData.configLevel['data-help']">
            <USelectMenu
              v-model="conf.formData.configLevel"
              :items="formInfoData.configLevel.options"
              value-key="value"
              label-key="label"
              :search-input="false"
            />
          </UFormField>
          <span data-help="可以在网站管理中打开通知权限,当停止时会自动发送桌面端通知提醒。">
            <UCheckbox label="发送通知" v-model="conf.formData.notification.value" />
          </span>
          <span
            v-if="conf.configLevel.expert || conf.formData.useCache.value"
            data-help="开启后会缓存投递记录，避免重复投递，提高效率。但是缓存功能并不积极维护。可能会有bug，或者意外情况，如遇到可尝试清空缓存或者禁用"
          >
            <UCheckbox label="启用缓存" v-model="conf.formData.useCache.value" />
          </span>
          <UButton
            v-if="conf.formData.useCache.value"
            color="warning"
            @click="() => getCacheManager().clearCache()"
          >
            清空缓存
          </UButton>
          <UFormField v-if="conf.configLevel.intermediate" label="今日沟通上限">
            <UInputNumber
              label="今日沟通上限"
              data-help="当天累计达到上限后停止发起新沟通；不是本轮新增数量。整数 1–150。"
              v-model="conf.formData.deliveryLimit.value"
              :min="1"
              :max="150"
              :step="1"
            />
          </UFormField>
        </div>
        <div class="mt-3 flex flex-wrap gap-4 items-center">
          <UFormField
            label="今天旧版或其他渠道已联系人数"
            data-help="定制版不会自动继承旧扩展的计数；填写今天在本定制版之外已联系的人数，避免重新安装后从零开始超投。"
          >
            <UInputNumber
              v-model="conf.formData.dailyGreetingBaseline.externalCount"
              :min="0"
              :step="1"
            />
          </UFormField>
          <UCheckbox
            v-model="conf.formData.dailyGreetingBaseline.verified"
            label="我已核实今天的基数"
            @update:model-value="
              (value: unknown) => {
                conf.formData.dailyGreetingBaseline.date = value ? getCurDay() : ''
              }
            "
          />
        </div>
      </UForm>
      <div class="flex flex-row *:flex *:flex-row justify-between *:gap-3 mt-3">
        <div>
          <UButton color="success" data-help="保存配置" @click="conf.confSaving">
            保存配置
          </UButton>
          <UButton color="warning" data-help="重新加载本地配置" @click="conf.confReload">
            重载配置
          </UButton>
          <UButton
            color="primary"
            data-help="不同版本的参数可能会调整, 更新之后一键应用, 不会覆盖主要筛选条件"
            @click="conf.confRecommend"
          >
            使用推荐配置
          </UButton>
        </div>
        <div>
          <UFormField
            label="预设: "
            data-help="虽然不维护多账号了, 但是预设还是要有的, 这样使用隐身/第三方扩展依旧能多账号使用. 多账号是一件多助人为乐的事呀"
          >
            <UInputMenu
              v-model="conf.formDataPreset.value"
              :items="conf.formDataPresets.value"
              value-key="value"
              create-item
              @create="conf.createPreset"
              @update:model-value="
                (v: unknown) => {
                  if (typeof v === 'string') conf.switchPreset(v)
                }
              "
            />
          </UFormField>
          <UButton
            v-if="conf.configLevel.intermediate"
            color="primary"
            data-help="互联网就是要分享"
            @click="conf.confExport"
          >
            导出配置
          </UButton>
          <UButton
            v-if="conf.configLevel.intermediate"
            color="primary"
            data-help="互联网就是要分享"
            @click="conf.confImport"
          >
            导入配置
          </UButton>
          <UButton
            v-if="conf.configLevel.advanced"
            color="error"
            data-help="清空配置,不会帮你保存,可以重载恢复"
            @click="conf.confDelete"
          >
            清空配置
          </UButton>
        </div>
      </div>
    </UTheme>
  </div>
</template>
