# Boss Helper · 简历跟进实验版

基于 [Ocyss/boss-helper](https://github.com/Ocyss/boss-helper) 的独立衍生版本：招聘者明确索要简历后，以本地规则匹配对应 PDF。

**当前不是可无人值守自动发 PDF 的正式版。** 真实 BOSS 消息与附件通道尚未现场联调，生产默认适配器无法启用自动发送。浏览器中的合成数据测试通过，不代表真实平台兼容性已确认。

## 当前能力

- 本地识别中英文索要表达；否定、引用、特殊格式和站外发送要求转人工处理。
- 两类岗位方向、显式 PDF 版本和 SHA-256 绑定；城市与固定底薪未核实就不放行。
- 扩展本地 IndexedDB 保存文件与任务；配置导出不含 PDF、账户、登录信息或完整聊天。
- 多标签页任务租约、发送前额度预留；不确定的发送结果不自动重试。
- 本地工作台仅提供演练，不联系招聘者，不把图片或招呼语当作 PDF 已投递。

## 沟通限额修复

核对官方 0.5.2 Chrome 发布包发现，其执行循环未检查 `deliveryLimit`，界面显示上限却仍可能继续处理岗位。数字输入从 1 起按 10 递增，也可能把 10 调整成 11。

本版增加执行前检查、数据库事务额度预留和整数输入。发送前占用名额，失败／超时不自动退回；多标签页共用额度。上限是当天累计，不是本轮新增。

新扩展不会继承旧扩展计数，开始前必须核实当天旧版／其他渠道已联系人数。已联系 56、上限 11 时，不允许继续发起沟通；每天需要重新确认基数。

`tools/reproduce-official-limit.mjs` 使用原发布包执行循环和无副作用的内存依赖：构造 93 个岗位、过滤 37 个，设上限 11 时原循环得到 56 次成功。**这是合成复现，不是用户真实日志**，不联网、不读取浏览器或登录数据。

## 构建与测试

需要 Node 24+ 和 Bun。可从 [Bun 官方发布页](https://github.com/oven-sh/bun/releases) 下载便携版放在项目 `.tools/`，无需全局安装或修改 PATH。不要提交二进制、缓存和 node_modules。

```powershell
git submodule update --init --recursive
bun install --ignore-scripts
bun run prepare:types
bun run test
bun run check:followup
bun run build:chrome
```

`bun` 可替换为项目内 bun.exe 的绝对路径。Chrome 输出目录为 `.output/chrome-mv3/`。Windows 构建包装脚本等待 WXT 公共 build API 完成后退出，解决上游 CLI 完成后仍保留句柄的问题；构建失败仍返回非零退出码。

TypeScript 使用与当前 Vue 检查器兼容的 5.9 系列。`check:followup` 覆盖新增模块、工作台和测试；上游全量 `check` 的 `devlog-ui` 测试及类型指令仍有遗留错误，不能宣称全仓库检查通过。

运行 `bun run fixture:dev` 后打开 `http://127.0.0.1:5197/`，可用明确标注的合成数据演练，并在真实浏览器中运行 IndexedDB 并发自检。此入口不包含在生产构建中。

## 安装与边界

停止当前批量沟通，停用官方版并刷新 BOSS 页面，避免同页残留两个脚本。Chrome 开发者模式加载 `.output/chrome-mv3/`，点击 BOSS 页右侧“简历跟进”。本版使用独立扩展标识，不覆盖官方版。

首次工作台显示的是本地演练档案。可以导入 PDF、绑定演练岗位、核实条件和模拟匹配；演练岗位不等于真实 BOSS 会话。真实自动 PDF 功能保持禁用，直到消息标识、权限、PDF 选择与回执均完成现场联调。

未来真实通道就绪后，也只在浏览器登录、受支持聊天页保持打开并主动启用时运行。不支持关闭浏览器后继续，不绕过授权、验证码和发送限额。发送成功和对方已阅读分别判断。

详见 [平台验证记录](docs/followup-platform-validation.md)、[规则与数据边界](docs/resume-followup.md) 和 [交付检查](docs/release-checklist.md)。

## 来源与许可

保留 [LICENSE](LICENSE)、原作者版权和 [上游 README](docs/UPSTREAM_README.md)。上游 LICENSE 为 MIT，README 同时含有非商业用途表述，两者存在差异；本版如实保留，不宣称获得额外商业授权。

下面保留上游原文；它描述的是原项目，不代表本衍生版新增的自动 PDF 通道已可用。

---

## 上游原文

> [!CAUTION]
> 本项目仅供学习交流，禁止用于商业用途
>
> 使用该脚本有一定风险(如黑号,封号,权重降低等)，本项目不承担任何责任

| Chrome                                                                                                                                                                                             | Crx搜搜                                                                                                                                           | Edge                                                                                                                                                                                                                                                                                                                           | FireFox                                                                                                                                   | Github                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ogkmgjbagackkdlcibcailacnncgonbn?label=Chrome插件商店)](https://chrome.google.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Crx 搜搜](https://img.shields.io/badge/Crx搜索-v%3F.%3F.%3F-EF7C3D)](https://www.crxsoso.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Edge Web Store](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fjcllnbjfeamhihjpfjlclhdnjmggbgal&query=version&prefix=v&label=Edge插件商店&color=EF7C3D)](https://microsoftedge.microsoft.com/addons/detail/jcllnbjfeamhihjpfjlclhdnjmggbgal) | [![Firefox](https://img.shields.io/amo/v/boss-helper?label=Mozilla插件商店)](https://addons.mozilla.org/zh-TW/firefox/addon/boss-helper/) | [![GitHub Release](https://img.shields.io/github/v/release/Ocyss/boss-helper)](https://github.com/Ocyss/boss-helper/releases/latest/) |

> **国内**: 如果无法访问 `Chrome插件商店` , 请使用 `Crx搜搜` 或 `Edge插件商店` 安装

## 项目介绍

Boss直聘助手, 皆在减少投递简历的麻烦, 和提高投递简历的效率, 技术栈使用WXT + Vue3 + NuxtUI@4 + TailwindCSS@4, 开源在 Github 欢迎前来Pr

> 本项目处于积极维护状态, 一直很忙所以拖了比较久才开源，抱歉了~

## 相关链接

唯一交流群:
微信麻烦, 飞书人数限制, 所以只开tg一个~

<img alt="交流群" src="./docs/img/tg.png" height="200" />

Github开源地址: <https://github.com/ocyss/boss-helper>

飞书反馈问卷(匿名): <https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g>

> 每个提交都会给我发通知，我看见就会评论的形式回复 一般 1-2天

飞书问卷结果: <https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc>

greasyfork地址(0.2旧版本): <https://greasyfork.org/zh-CN/scripts/491340>

## 项目预览

[![卡片状态](docs/img/shot_2024-04-14_23-08-03.png)](docs/img/shot_2024-04-14_23-08-03.png)
[![账户配置](docs/img/shot_2024-04-14_23-09-05.png)](docs/img/shot_2024-04-14_23-09-05.png)
[![统计界面](docs/img/shot_2024-04-02_22-25-25.png)](docs/img/shot_2024-04-02_22-25-25.png)
[![配置界面](docs/img/shot_2024-04-02_22-26-54.png)](docs/img/shot_2024-04-02_22-26-54.png)
[![日志界面](docs/img/shot_2024-04-02_22-32-25.png)](docs/img/shot_2024-04-02_22-32-25.png)

## TODO

- [x] 优化UI去除广告
- [x] 批量投递简历
- 高级筛选
  - [x] 薪资,公司名,工作名,人数,内容简单筛选
  - 公司地址相关
    > 使用高德api，需要自行申请，或者使用关键字筛选, 暂时只有驾车和步行
    - [x] 驾车/步行距离
    - [x] 驾车/步行时间
  - [ ] 公司风险评控
  - [x] AI筛选
- 自动打招呼
  - [x] 模板语言
  - [x] 支持chatGPT
- AI赋能
  - [ ] 自动回复聊天
  - [x] 多模型管理
- 额外功能(有时间会写)
  - [x] 自适应UI适配手机
  - [ ] 黑名单
  - [x] 多账号管理 (废弃, 改为多配置切换)
  - [ ] 聊天阻止发送已读
  - [ ] boss消息弹窗

## 参与贡献

1. Fork 本仓库并克隆到本地。
2. 在新分支上进行您的更改：`git checkout -b 您的分支名称`
3. 提交更改：`git commit -am '描述您的更改'`
4. 推送更改到您的 Fork：`git push origin 您的分支名称`
5. 提交 Pull 请求。

## 鸣谢

- <https://github.com/yangfeng20/boss_batch_push>
- <https://github.com/lisonge/vite-plugin-monkey>
- <https://github.com/chatanywhere/GPT_API_free>

- <https://uiverse.io/>
- <https://www.runoob.com/manual/mqtt/protocol/MQTT-3.1.1-CN.pdf>

## 类似项目

- <https://github.com/Frrrrrrrrank/auto_job__find__chatgpt__rpa>
- <https://github.com/noBaldAaa/find-job>

## 最后

嗯...

## Star 趋势

<a href="https://star-history.dera.page/#ocyss/boss-helper&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=ocyss/boss-helper&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=ocyss/boss-helper&type=Date" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=ocyss/boss-helper&type=Date" />
 </picture>
</a>
