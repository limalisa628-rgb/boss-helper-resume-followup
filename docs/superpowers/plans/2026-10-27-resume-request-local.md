# Resume Request Local Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 招聘者明确索要简历后，以本地规则选择正确 PDF，通过验证过的正常附件通道发送，并持久化去重与真实结果。

**Architecture:** 沿用现有 WXT 扩展。纯 TypeScript 引擎处理意图、岗位绑定、约束和状态；独立平台适配器处理真实网页的入站消息、附件发送和回执；IndexedDB 保存文件及任务，Vue 面板负责配置和待处理。模拟适配器与真实适配器共享接口，后者未验证时默认不可发送。

**Tech Stack:** WXT、Vue 3、TypeScript、现有 idb；Node 24 内建 node:test 执行纯逻辑测试，不新增测试运行时。

**Spec:** docs/superpowers/specs/2026-10-27-resume-request-local-design.md

## Global Constraints

- 所有文本以 UTF-8 读写。
- 不改变正在运行的官方插件；使用独立扩展标识，新自动发送默认关闭。
- 不调用 AI；不把真实 PDF、聊天记录或个人配置提交到 GitHub。
- 只处理招聘者启用后新发的明确索要；不扫描历史消息群发。
- 城市白名单与固定底薪约束未知时待人工核实，不把招聘标价当固定底薪。
- 发送结果不确定时禁止自动重试；平台限额、验证码和授权限制不绕过。
- 第一版依赖浏览器登录和支持的聊天页打开，不承诺关闭浏览器继续工作。
- 未经用户明确授权，不安装软件、运行时、全局 CLI 或项目依赖，不修改 PATH。

## Review Focus

- 一条消息包含引用、否定和索要混合时，不应意外触发（Task 1）。
- 同一 HR 关联多个岗位或中途换文件时，不应给错岗位发送新版文件（Task 2）。
- 同时两个标签页、刷新或发送中断线时，不应重复提交（Task 2、3）。
- 页面有同名附件、历史已发卡片或只收到传输层确认时，不应误报已发送（Task 3）。
- 切换账户、关闭开关或模拟模式切到实发时，旧任务不应自动继续（Task 2、4）。

## 文件边界与共享类型

- src/followup/types.ts：MessageEnvelope、RequestDecision、ResumeAsset、JobBinding、FollowupTask、FollowupSettings、AttachmentPort、FollowupRepository 的共同类型。
- src/followup/rules.ts：classifyResumeRequest(message: MessageEnvelope): RequestDecision。
- src/followup/matching.ts：resolveResume(message, bindings, assets, settings): MatchDecision；固定岗位、账户、城市和底薪，不解释招聘者的新命令。
- src/followup/engine.ts：acceptMessage、processNextTask，依赖注入仓库、时钟及 AttachmentPort，不依赖 Vue 或网页全局对象。
- src/followup/repository.ts：独立 IndexedDB 数据库，文件／绑定／任务／水位／租约；事务 claimTask 和 finalizeTask。
- src/followup/bossAdapter.ts：BOSS 消息及正常附件 UI 适配器；capabilities、subscribeIncoming、getContext、sendPdf、verifySent。
- src/followup/service.ts：生命周期、总开关、路由、账户切换和有界串行执行。
- src/components/FollowupPanel.vue：简历配置、绑定、模拟结果、任务和暂停。
- tests/followup/*.test.ts：Node 内建测试；fixtures 使用虚构数据。

请求必须携带 accountId、conversationId、jobId、messageId、sender、timestamp、text、isQuoted／isSystem。无法获得稳定标识时不得实发。资产固定 assetId、SHA-256、version、filename、PDF Blob；任务快照固定绑定版本及所需文件哈希。

## Task 1: 本地请求识别与岗位／薪资约束

**Files:** Create src/followup/types.ts, rules.ts, matching.ts; tests/followup/rules.test.ts, matching.test.ts. Modify tsconfig.json only if allowImportingTsExtensions is needed for explicit test imports.

**Interfaces:** Produces classifyResumeRequest and resolveResume, with request / ignore / review discriminated results and machine-readable reasons.

- [ ] 写失败测试：assert 请求“麻烦发一份简历”“方便把简历发过来吗”“Please send me your resume”；“你好”“收到”“有简历吗”“不用发简历”不发送；引用、矛盾、英文版及站外目的地进入 review 或 ignore。
- [ ] 运行 `node --test tests/followup/rules.test.ts tests/followup/matching.test.ts`，确认由于未实现失败。
- [ ] 实现 NFKC／大小写与空白归一化、否定优先、消息归属过滤；岗位绑定以 accountId + conversationId + jobId 为键。
- [ ] 添加并实现采购／供应链和 AI／产品运营两类测试；广州／深圳白名单；本地实例门槛 6000／10000；未知固定底薪、双方向命中、多岗位歧义、已换版本资产均不得擅自发送。
- [ ] 重跑两组测试并提交本任务，仅提交通用测试数据，不写真实用户配置。

## Task 2: 持久化任务引擎与事务去重

**Files:** Create src/followup/repository.ts, engine.ts; tests/followup/engine.test.ts, repository.test.ts.

**Interfaces:** FollowupRepository exposes getSettings, getBindings, getAsset, getWatermark, acceptRequest, claimTask, finalizeTask, listTasks. AttachmentPort exposes capabilities, getContext, sendPdf, verifySent; every result includes target identity. Engine exports acceptMessage and processNextTask with injected repository, port and clock.

- [ ] 写失败测试：新消息产生一个任务；启用前消息、自己消息、系统消息不产生发送；重复消息 ID 只接受一次。
- [ ] 测试同一会话／岗位／文件哈希已成功则不再自动发送；新文件不会替换已有任务快照；缺文件待人工。
- [ ] 实现独立数据库版本及对象仓库。用事务领取任务并记录 accountId、owner、expiresAt；同一时间只允许一个领取者。
- [ ] 测试两个领取者、租约过期及发送中刷新：已提交而结果未知进入 uncertain，不能简单返回 queued。
- [ ] 测试账户切换、关闭自动开关、模拟模式切换与权限开放后重新验证目标；模拟模式绝不调用 sendPdf。
- [ ] 运行 `node --test tests/followup/*.test.ts`。纯引擎使用内存契约实现；IndexedDB 实现另用浏览器 fixture 验证事务，不把内存通过当成数据库已验证。通过后提交。

## Task 3: 平台能力验证与正常 PDF 适配器

**Files:** Create src/followup/bossAdapter.ts; tests/followup/adapter.test.ts; tests/fixtures/followup-chat.html; docs/followup-platform-validation.md.

**Interfaces:** subscribeIncoming(handler) returns unsubscribe; capabilities returns verified supported paths or unavailable reason; sendPdf returns submitted / denied / failed / uncertain; verifySent must bind conversationId, jobId, asset hash or trusted platform attachment ID, and a fresh evidence ID.

- [ ] 在官方插件当前批次结束后，通过受支持浏览器工具只读检查正常聊天 UI；不访问浏览器扩展管理页、不用 CDP 或凭证直调绕过浏览器工具限制。
- [ ] 若仍无法读取真实网页，记录准确阻塞和需要用户完成的最小观察步骤；继续实现模拟及不可用适配器，但不得启用猜测的实发通道。
- [ ] 写失败测试：无权限、错误会话、两个同名文件、历史卡片、仅传输层确认均不得返回 confirmed；只有匹配目标的新业务回执／文件卡片才能确认。
- [ ] 依据实际观察实现消息标识、招聘者归属、岗位关联和 PDF 正常选择流程。已有附件列表与本地上传只启用验证过的路径；无路径时返回 review，不降级成图片。
- [ ] 测试权限请求与同意、拒绝、断线、超时、账号切换；sendPdf 返回 uncertain 后不重发。
- [ ] 使用虚构 fixture 验证 DOM 适配器，再在用户已授权的明确索要会话中核实一次真实 PDF。分开记录模拟测试、页面适配验证及真实端到端证据，最后提交。

## Task 4: 配置面板与聊天页生命周期

**Files:** Create src/followup/service.ts, src/components/FollowupPanel.vue; Modify src/entrypoints/content.ts, src/entrypoints/boss/index.ts or an isolated chat entrypoint selected from real route observation; src/message/background.ts, contentScript.ts if bridging is required; package.json; wxt.config.ts; tests/followup/service.test.ts.

**Interfaces:** mountFollowupService returns dispose; service exposes pause, resumeSimulation, arm, handleAccountChange. Panel only invokes service/repository interfaces; no direct website sending from UI click handlers.

- [ ] 写失败测试：重复挂载不重复监听；离开聊天页释放观察器；换账户立即停队列；重新启用建立新水位；暂停后不再领取任务。
- [ ] 实现文件选择与 PDF 头／类型检查、SHA-256、版本标签、两类岗位绑定、城市与固定底薪核对、模拟／自动发送开关、待人工列表和真实状态日志。
- [ ] 实现最小必要文件操作与本地清除、导出脱敏配置；默认不含 PDF 与聊天全文。开发版使用独立 key／名称，避免覆盖正在运行的官方版。
- [ ] 在项目局部依赖取得明确授权后，初始化已记录的 devlog-ui 子模块并安装 lockfile 对应依赖；若需便携 Bun，事先取得单独明确授权，不修改 PATH、不全局安装。
- [ ] 运行全部 Node 测试、既有 `check` 与 `build:chrome`；运行 fixture 的面板交互检查和截图，验证开关、错误、待处理与暂停可见。
- [ ] 无真实 PDF 能力证据时，实发开关必须保持 disabled 并展示原因，不能仅靠构建通过声称功能完成。提交本任务。

## Task 5: 整体审阅、交付与 GitHub 发布

**Files:** Modify README.md; Create docs/resume-followup.md, docs/release-checklist.md; refine .gitignore; preserve LICENSE and original attribution.

**Interfaces:** 文档准确描述实际支持范围、浏览器开启条件、规则限制、安装与回滚、发送和已读区别。

- [ ] 对照获批设计自查并进行独立代码审阅；修复影响错发、重复发、误记成功的缺陷并补回归测试。
- [ ] 再运行受影响测试及必要类型检查和构建；保存真实命令结果，区分上游既有失败与新问题。
- [ ] 检查 Git 差异、仓库文件和构建包不包含真实简历、Cookie、Token、完整聊天及用户导出配置；保留原作者与 LICENSE、README 原有许可说明差异。
- [ ] 明确最终仓库名称及可见性后，在已连接 GitHub 用户名下创建衍生仓库／Fork 并发布。若连接缺少创建仓库能力，准备好可推送提交和安装包，再请用户完成唯一必要的创建步骤；不安装未经授权的 gh CLI。
- [ ] 交付仓库链接、Chrome 安装包、验证结论及剩余外部阻塞。需用户加载扩展时遵守既有浏览器工具限制，由用户手动加载，不绕过拒绝。

## 执行与环境检查结论

本机 Node v24.14.0、npm 11.9.0 可用，纯规则与状态机测试不需安装新软件。项目 node_modules 不存在，Bun 不存在；packages/devlog-ui 是已声明但未初始化的 Git 子模块。开发计划先完成不需安装的核心，构建与浏览器完整联调所需局部依赖必须获得明确授权。

建议采用 Native：在当前会话由主代理依次实施，结束后独立审阅。任务的接口依赖紧密，先做小规模可复现的规则和队列更容易定位问题。执行方式仍待用户确认；本计划完成前未写功能代码。
