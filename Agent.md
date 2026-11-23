# 自动投稿系统 · 项目说明书（Agent.md）

> 本文件是项目交接与协作说明，供人和其他 Agent 快速理解本项目。修改代码前请先读本文与 `.workbuddy/memory/MEMORY.md`。

---

## 一、项目概况

| 项目 | 内容 |
|---|---|
| 项目名称 | 投稿助手（hunan-weather-submission-bot） |
| 项目根目录 | `D:/liuxiao/自动投稿系统` |
| 创建时间 | 2026-11-23 |
| 服务对象 | 湖南省邵阳市新邵县气象局 |
| 核心目标 | 模仿湖南省气象局官网「市县动态」栏目文风自动写稿，人工审核后推送微信、提交投稿平台 |
| 技术栈 | Node.js 22（ESM，`type: module`）、Express 4、原生 HTML/CSS/JS 前端、JSON 文件存储 |
| 大模型 | WorkBuddy 云服务免密钥 LLM（`@tencent-ai/workbuddy-cloud-sdk`，模型 `auto`，可选 Hy4/DeepSeek/GLM 等） |
| 微信通道 | PushPlus 微信公众号渠道（**普通个人微信可收**，非企业微信） |
| 本地访问 | `http://localhost:3000`（端口在 `config.json` 的 `server.port` 可改） |

### 已实现能力

1. **按素材写稿** — 粘贴工作简讯或主题，生成 500—900 字「市县动态」稿件草稿。
2. **每日 9 点自动写稿** — 云端定时自动化触发 `node src/daily.js`，自动选题、写稿、推送微信；同日只写一次。
3. **智能选题** — 四级优先级自动找「有由头」题材，三层去重避免连续重复。
4. **天气事实核查** — 抓取新邵真实天气作事实锚点，拦截编造雨雪冰冻，最多重写 3 次，失败拒绝出稿。
5. **审核工作流** — 草稿状态流转：待审核 → 已通过/已投稿/已驳回；支持在线编辑、复制、重新生成、驳回。
6. **微信推送** — PushPlus 推送全文摘要 + 可选审核链接；同一篇默认只推一次（去重）。
7. **一键投稿** — 配置投稿平台接口后，审核通过自动 POST 稿件 JSON；未配置则引导手动复制。
8. **对话式 Skill** — 已封装为 WorkBuddy 用户级 skill，对话中一句话即可写稿/推送/投稿。

### 运行方式

```bash
cd "D:/liuxiao/自动投稿系统"
npm install          # 首次
node server.js       # 启动网页服务（或 npm start）
node src/daily.js    # 手动执行一次每日写稿（或 npm run daily）
```

网页服务由本机 Node 进程提供；每日定时任务在云端自动化中执行，不依赖本机进程常驻。

---

## 二、目录结构

```
D:/liuxiao/自动投稿系统/
├── Agent.md                         ← 本文件：项目概况与协作说明
├── config.json                      ← 运行配置（模型、单位名、token、投稿接口、开关）
├── package.json / package-lock.json ← 依赖与 npm 脚本
├── server.js                        ← Express 后端入口，静态托管 web/ + 全部 API
├── src/                             ← 后端核心模块（详见下表）
├── web/                             ← 前端机器人式交互界面
├── data/                            ← 本地持久化数据与日志
├── dist/                            ← skill 分发包
└── .workbuddy/                      ← WorkBuddy 项目数据（勿删）
    ├── applications.yaml
    ├── memory/                      ← 项目记忆（MEMORY.md + 每日日志 + 自动化记忆）
    └── ...
```

### `src/` 模块清单

| 文件 | 行数 | 职责 |
|---|---:|---|
| `cloud.js` | 68 | 封装 WorkBuddy 云服务 SDK：`complete()` 收集流式写稿输出，`listModels()` 列可用模型，错误码转友好提示。endpoint 与 publishableKey 为可安全分发的公钥配置。 |
| `config.js` | 32 | 读写 `config.json`：`getConfig()` / `saveConfig()` / `publicConfig()`（对外隐藏 token 明文，只返回 `hasPushplusToken`）。 |
| `style-prompt.js` | 113 | **文风规范核心**。系统提示词含选题八类、标题/导语/主体/结尾写法、天气事实红线、篇幅口径、4 篇范文节选；`buildUserPrompt()` 组装提示词；`parseDraft()` 解析「标题：…」+正文。 |
| `generate.js` | 44 | 写稿主流程：抓真实天气 → 调模型 → 事实审查 → 最多重写 3 次 → 加署名 → 入库。失败即拒绝出稿。 |
| `daily.js` | 89 | 每日任务：并发抓参考/本地事件/天气 → 四级选题 → 写稿 → 推送 → 写 `daily.log`。可指定主题或用 `--force` 强制重跑；被导入时不自动执行。 |
| `store.js` | 119 | 草稿存储：增删改查、UUID 生成、`pickTopic()` 主题池去重、`hasDraftToday()` 当日去重。保存草稿时自动补署名。 |
| `weather.js` | 100 | 抓中国天气网新邵实况（`d1.weather.com.cn/sk_2d/101250904.html`）与 7 天预报，`formatWeather()` 生成注入提示词的事实块。 |
| `fact-check.js` | 40 | 断言型天气造假正则审查（首场雨雪、冷空气逼近、遭遇冰冻等）；实况支持则放行，「防范/易出现」等表述不拦截。 |
| `filters.js` | 21 | 抓取内容过滤：只保留最近 3 天（含当天）、排除常委会/人事/信访/纪检/案件等敏感内容。党建题材属正常宣传，不排除。 |
| `cma-news.js` | 145 | 抓中国气象局「基层台站」+ 中国气象报社（可选）近期县区级报道作选题参考；跨源去重、时效/敏感过滤；`pickReferenceTopic()` 去重挑选。 |
| `local-context.js` | 297 | 抓新邵县政府 4 个栏目 + 湖南气象「市县动态」+ 可选「新邵发布」公众号文章；读正文识别气象强相关线索、去人名、`pickLocalTopic()` 挑由头、`formatLocalContext()` 注入提示词。 |
| `pushplus.js` | 131 | PushPlus 推送：`pushDraft()` 推稿件 HTML（含审核按钮）、`pushText()` 推纯文本、返回码映射（905 未实名等）、`push-log.json` 去重。 |
| `submit.js` | 36 | 投稿：未配接口返回 `manual=true`；配置了则 POST `{title, content, source, submittedAt}` 到平台。 |
| `signature.js` | 10 | 统一署名 `（编辑：刘骁 审核：刘前初、谢意权）`，`withSignature()` 去重后追加。 |

### `web/` 前端

| 文件 | 说明 |
|---|---|
| `index.html` | 机器人式界面：左侧对话写稿区 + 右侧稿件审核区；稿件详情弹窗（编辑/复制/推送/重生成/驳回/投稿）；设置弹窗（模型、token、审核地址、投稿接口、每日开关）。 |
| `app.js` | 前端逻辑：API 封装、草稿列表与状态筛选、消息气泡、弹窗交互、设置保存、推送去重确认。支持 `?draft=<id>` 直接打开稿件（供微信审核链接使用）。 |
| `style.css` | 响应式样式，手机浏览器与微信内可用。 |

### `data/` 数据文件

| 文件 | 内容 |
|---|---|
| `drafts.json` | 全部稿件，最新在前。字段：`id / title / content / source / input / context / status / createdAt / submittedAt / submitNote`。 |
| `push-log.json` | 每篇稿件推送记录（成功/失败、时间、标题），用于去重与网页「已推送」标注。 |
| `topics.txt` | 10 条固定的有由头主题池（兜底选题源），全部为新邵县气象局题材。 |
| `used-topics.json` | 已用主题池记录。 |
| `used-references.json` | 已用的中国气象报参考文章 URL（保留最近 30 条）。 |
| `used-local-events.json` | 已用的本地事件 URL（保留最近 30 条）。 |
| `daily.log` | 每日写稿运行日志（选题来源、天气、推送结果、失败原因）。 |

### 外部产物

| 位置 | 说明 |
|---|---|
| `C:/Users/31529/.workbuddy/skills/hunan-weather-submission/` | 用户级 skill（全局可用）：`SKILL.md` + `references/style-guide.md` + `scripts/tougao.mjs`。 |
| `dist/hunan-weather-submission.zip` | skill 分发包（官方校验通过）。 |
| 云端自动化 `24855eea-f17d-4daa-9a42-fe739949e529` | 每天 09:00 执行 `node src/daily.js`，推微信。 |

---

## 三、架构与数据流

```
                       ┌─ 中国天气网（新邵实况/预报）→ weather.js → 事实锚点
                       ├─ 新邵县政府 4 栏目 ─────────→ local-context.js ─┐
  每日 09:00 自动化 ──┼─ 湖南气象「市县动态」 ──────→ local-context.js ─┼→ 选题优先级链
  或网页「生成今日草稿」├─ 中国气象报/中国气象局 ─────→ cma-news.js ──────┤
                       └─ 主题池 topics.txt ─────────→ store.js ─────────┘
                                                          ↓
                    素材/由头 + 背景参考 + 天气事实块 → style-prompt.js 提示词
                                                          ↓
                              cloud.js（WorkBuddy 免密钥 LLM，流式）→ 初稿
                                                          ↓
                              fact-check.js 审查 ──不通过──→ 重写（最多 3 次）→ 仍失败则拒绝出稿
                                                          ↓
                              signature.js 署名 → store.js 入库 → drafts.json
                                                          ↓
                     ┌────────────────────────────────────┴──────────────┐
                     ↓                                                   ↓
        pushplus.js → PushPlus → 个人微信（带审核链接）       人工审核（网页）
                                                                         ↓
                                                     approve → submit.js → 投稿平台
```

**选题优先级**：新邵本地气象强相关事件 > 中国气象报县区报道 > 湖南气象题材 > 主题池。
用户显式指定主题时，直接使用指定主题，跳过自动选题。

**防重复三道闸**：① 同日已有每日草稿则跳过（可 `--force`）；② 同一篇稿件默认只推送一次（可 `--force`）；③ 参考/本地选题挑选后写入 used 文件，用完返回 null 转向下一来源。

---

## 四、API 接口清单（server.js）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/config` | 读取公开配置（不含 token 明文） |
| PUT | `/api/config` | 保存配置（白名单字段：model、orgName、pushplusToken、reviewBaseUrl、wechatArticleUrls、submitPlatform、daily） |
| GET | `/api/context` | 实时拉取选题上下文（中国气象报 + 本地事件 + 湖南气象） |
| GET | `/api/push-status` | 批量查询稿件推送状态 |
| GET | `/api/models` | 列出可写稿模型 |
| POST | `/api/generate` | 按素材写稿，`{input, source, model}` |
| GET | `/api/drafts` | 列出全部草稿 |
| GET | `/api/drafts/:id` | 查看单篇稿件 |
| PUT | `/api/drafts/:id` | 编辑标题/正文（保存时自动补署名） |
| DELETE | `/api/drafts/:id` | 删除稿件 |
| POST | `/api/drafts/:id/approve` | 审核通过并提交投稿平台 |
| POST | `/api/drafts/:id/reject` | 驳回稿件 |
| POST | `/api/drafts/:id/regenerate` | 复用原由头重新生成（替换旧稿） |
| POST | `/api/drafts/:id/push` | 推送到微信，`{force}` |
| POST | `/api/test-push` | 测试 PushPlus 连通性 |
| POST | `/api/daily/run` | 执行每日写稿，`{topic, force}` |

---

## 五、配置说明（config.json）

| 字段 | 作用 | 备注 |
|---|---|---|
| `model` | 写稿模型 | `auto` 为自动选择 |
| `orgName` | 稿件单位名 | 固定「新邵县气象局」，上级「邵阳市气象局」 |
| `pushplusToken` | PushPlus 用户 token | 微信扫码登录 pushplus.plus 获取；**必须完成实名认证（免费）才能发送，否则返回 905** |
| `reviewBaseUrl` | 审核页面外网地址 | 填入后微信消息带「点击审核稿件」按钮；留空则提示到电脑端审核 |
| `wechatArticleUrls` | 「新邵发布」公众号文章链接数组 | 可选补充源，自动翻页会触发验证码，故手动填链接 |
| `submitPlatform.name/url/method` | 投稿平台配置 | url 为空时审核通过只提示手动复制；接口需接收 `{title, content, source, submittedAt}` |
| `server.port` | 网页服务端口 | 默认 3000 |
| `daily.enabled / autoPush` | 每日写稿与自动推送开关 | 均为 true |

> 安全提示：`pushplusToken` 是用户凭证，勿在文档、日志、对外分享中明文暴露。

---

## 六、文风规范与红线（写稿必读）

完整规范见 `src/style-prompt.js` 与 skill 的 `references/style-guide.md`。要点：

- **标题**：`地名：工作动作＋成效`，8—20 字，单句双句均可，不硬凑四字对仗，不用感叹号。
- **导语**：具体时间/节气/政策背景开头，一句话交代「目的＋时间＋单位＋事件」。
- **主体**：按事实进程分 3—5 段，段首用「检查中，」「在……现场，」「赛前把风险想在前面。」等短起句；写具体动作，不堆口号。
- **结尾**：因题材而异，不固定套「党建与业务融合…保驾护航」。
- **选题**：必须有由头，优先八类——①文件/方案下发执行 ②业务培训 ③重大活动保障 ④科普宣传 ⑤时间节点 ⑥重大气象事件应对 ⑦多部门联合检查 ⑧党建引领。**日常巡检、常规值班、一般性总结审稿不会通过**。
- **篇幅**：正文 500—900 字，不编造人名与精确数字；素材无人名用「信息员表示」「企业负责人表示」等泛称。
- **署名**：末尾固定 `（编辑：刘骁 审核：刘前初、谢意权）`，系统自动补，禁止手写或删除。
- **单位名**：统一「新邵县气象局」，严禁出现「XX县」「XXX县」占位符。

### 天气事实红线（最高优先级）

曾发生把山东威海由头的「雪」移植到新邵、编造「今冬首场雨雪」「冷空气逼近湘中」的严重虚假新闻事故，已建立三道防线：

1. `weather.js` 抓新邵真实天气注入提示词作事实锚点；
2. `style-prompt.js` 系统提示词明令禁止移植外地天气、凭节气编造雨雪冰冻/冷空气；
3. `fact-check.js` 断言型审查，命中即重写，3 次仍失败拒绝出稿（不落库、不推送）。

外地由头只借鉴工作做法（提前部署、会商、联动），天气背景一律以新邵实况为准或不写。遇到「事实审查未通过」报错，应更换由头，不得绕过。

---

## 七、Skill 命令行（对话入口）

统一入口：`node C:/Users/31529/.workbuddy/skills/hunan-weather-submission/scripts/tougao.mjs <命令> [参数]`

| 命令 | 用法 |
|---|---|
| `write` | `write "<素材>" [--push]` 写稿，可选推送 |
| `daily` | `daily [主题] [--force]` 每日稿 |
| `list` / `show` | 列出 / 查看稿件详情 |
| `push` | `push <id> [--force]` 推送微信 |
| `submit` | `submit <id>` 投稿 |
| `config` / `models` | 查看配置 / 模型列表 |

项目路径写死在脚本中，可用环境变量 `TOUGAO_PROJECT` 覆盖。Skill 复用项目模块，不重复实现功能。触发场景：用户说「写篇市县动态」「生成今日草稿」「推送到微信」「投稿」等。

---

## 八、故障排查

| 现象 | 原因与处理 |
|---|---|
| 推送返回 905 | PushPlus 账号未实名认证，去 pushplus.plus 免费实名 |
| 推送返回 903 | token 无效，检查 `config.json` 的 `pushplusToken` |
| 写稿报「事实审查未通过」 | 由头涉及外地天气，换不涉及具体天气的由头重写 |
| 「今天已生成过每日稿件」 | 正常去重；需重跑则调用 `/api/daily/run` 或 `daily --force` |
| 「该稿件已推送过」 | 正常去重；确需重推用 `--force`（网页会先确认） |
| 微信消息里无审核按钮 | 未在设置中填 `reviewBaseUrl`，或填的是 localhost（手机打不开） |
| 投稿显示「手动提交」 | 未配置投稿平台接口地址 |
| 抓不到参考选题 | 检查网络；zgqxb.com.cn 本地证书过期，cma.gov.cn 为主源 |
| 公众号文章抓不到 | 触发验证码，改用 `wechatArticleUrls` 手动填链接 |

---

## 九、协作注意事项

- 修改写稿逻辑后，需同步更新 `src/style-prompt.js`（提示词）、skill 的 `references/style-guide.md`（文风参考）与本文。
- 任何涉及天气的改动都必须保留事实核查链路，不得为了让稿件「有料」而放宽审查。
- `data/` 是运行数据，不是缓存；不要随意删除 `drafts.json` / `push-log.json`。
- `.workbuddy/` 存放项目记忆与应用配置，**不要删除**。
- 新增选题来源时，必须接入 `filters.js` 的时效（3 天）与保密过滤，并经 `sanitize()` 去除人名。
- 推送与投稿属于对外动作，执行前必须得到用户明确确认。
