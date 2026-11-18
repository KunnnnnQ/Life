# 本地接口

JSON 请求，路径前缀 `/api`。写入拒绝跨站 Origin。先 `POST /workspace` 建立 HttpOnly Cookie；私有数据始终按此身份隔离，不接受请求体传入用户 ID。浏览器档案是本地课堂身份，不是完整登录系统。

| 路径 | 方法 | 用途 |
|---|---|---|
| `/health` | GET | 知识版本、运行模式、可用能力 |
| `/catalog` | GET | 候选形式、规则版本、工程权重 |
| `/knowledge?q=关键词` | GET | 搜索知识节点 |
| `/knowledge/:id` | GET | 单个节点及文献关系 |
| `/workspace` | POST / DELETE | 建立档案 / 删除全部私有记录 |
| `/profile` | GET / PUT | 获取 / 替换背景 |
| `/events` | GET / POST | 经历列表 / 新增 |
| `/events/:id` | PUT / DELETE | 重新确认经历 / 删除 |
| `/recommend` | POST | 返回自动选择和候选理由，不生成内容 |
| `/sessions` | GET / POST | 历史 / 创建体验计划 |
| `/sessions/:id` | GET | 体验、内容、任务状态 |
| `/sessions/:id/generate` | POST | 执行或重试生成 |
| `/sessions/:id/media` | POST | 查询已提交音视频任务 |
| `/sessions/:id/progress` | POST | 保存场景和选项结果 |
| `/sessions/:id/feedback` | POST | 提交唯一一份反馈 |
| `/sessions/:id/cancel` | POST | 取消任务或体验 |
| `/export` | GET | 导出当前身份全部记录（含筛查结果、安全暂停次数、研究分组） |
| `/intake` | POST | 信息整理 agent：`{"text":"随便写的自我介绍"}` → 返回待确认的草稿，不保存任何内容 |
| `/intake/apply` | POST | 保存用户确认后的草稿（合并到背景，新增经历） |
| `/sessions/:id/images` | POST | 查询插画任务进度，完成后转存到 R2 |
| `/media/:sessionId/:name` | GET | 读取已转存的插画或语音，只对本人可见 |
| `/safety` | GET | PHQ-4 题目、选项、求助资源，以及是否到了再次询问的时间 |
| `/screening` | POST | 提交 PHQ-4：`{"answers":[0-3,0-3,0-3,0-3]}`，前两题为焦虑、后两题为抑郁 |

创建体验要求 `Idempotency-Key` 请求头。同一标识和相同输入返回同一体验；相同标识不同输入返回 409。全部输入范围和默认值在 `core/contracts.ts`，未知字段会被拒绝。

```json
{
  "goal": "encouragement",
  "seconds": 300,
  "state": {"valence": 4, "tension": 6, "energy": 3, "hope": 3, "agency": 4, "connection": 5},
  "context": {"cognitiveLoad": 0.7, "soundAllowed": true, "screenAvailable": true, "speechAvailable": true, "reducedMotion": false, "allowHumor": true}
}
```

没有 `format` 字段，用户不指定故事或视频。目标枚举为 `calm-down / encouragement / mastery / mood-shift / connection`。状态为 0–10，负担为 0–1，时间为 30–1200 秒。

反馈示例：

```json
{"after":{"valence":6,"tension":4,"energy":4,"hope":6,"agency":5,"connection":5},"goalAttainment":7,"liked":true,"discomfort":false,"completion":0.8,"elapsedSeconds":240}
```

媒体服务约定：服务端调用 `MEDIA_BASE_URL/jobs`，发送 `{kind,seconds,content}`，使用体验 ID 作为幂等标识；响应 `{status:"pending",jobId:"..."}` 或 `{status:"ready",url:"https://..."}`。后续访问同一服务的 `/jobs/:jobId`。只有返回真实 HTTPS 资产地址才作为媒体完成；失败不会伪装成功。接口本身不提供视频模型。

生成状态：`planned → running → ready / awaiting-media / failed`，可取消；播放后提交反馈为 `completed`。超时任务租约可恢复；最多三次尝试。该框架通过客户端触发任务执行和轮询，尚未接入无人值守后台队列。

## 安全暂停

`/sessions` 和 `/recommend` 的 `situation` 字段含危机用语时，不会创建体验，而是返回 200：

```json
{"safety":{"stop":true,"reason":"crisis-signal","message":"…","resources":[{"name":"全国心理援助热线","contact":"12356","note":"…"}]}}
```

新增或修改经历时若含危机用语，经历照常保存，但 `useInContent` 被强制为 `false`，响应附带同样的 `safety` 字段。服务端只记录“发生过一次暂停”，不保存触发的原文。检测基于关键词，见 `core/safety.ts`。

PHQ-4 任一分量表 ≥3 时，之后 14 天内的决策 `flags.screening` 为 `elevated`：刺激度高于 0.5 的体验降分，并在理由中说明。

## 研究模式

设置 `STUDY_MODE=on` 后，每次新建体验会被随机分到 `adaptive`（个性化）、`generic`（同机制，不使用任何个人信息）或 `neutral`（情绪中性的说明性短文）三组之一，记录在 `session.study.arm`。界面不显示分组。中性组的反馈不参与个人学习。分析时应比较组间差异，而不是单组的前后变化。

## 信息整理 agent

`POST /intake` 接收最多 2000 字的自由描述，返回 `{draft, mode}`：

- `draft.profile`：人生阶段、使用习惯（0–1）、喜欢的题材、不想看到的话题
- `draft.events`：经历，带类型、大概日期（`approximateDate`）、是否还在影响、中心性
- `draft.notes`：提到了但无法归类的内容，只显示不保存

原话不落库。发送给模型前会去掉电话、邮箱、证件号和链接；含危机用语时直接返回安全暂停，不调用模型。整理出的经历一律 `useInContent:false`，由用户在卡片上逐条打开。`demo` 模式用规则提取，`live` 模式调用已配置的文本模型并用 schema 校验，未来日期会被修正为今天。

`POST /intake/apply` 接收用户删改后的草稿，合并规则：已有值保留，新值补充；用户已列为“不想看到”的话题不会再被加为题材。

## 多 agent 生成

`live` 模式下，一次体验依次调用：

1. **导演**（planner）：根据目标、媒介、时长和叙事机制的节拍，规划 3–6 个节拍，并选出需要插画的那一个。分镜总时长超出预算直接失败。
2. **编剧**（writer）：按分镜写正文和选项。
3. **审核**（reviewer）：检查禁止话题的同义说法、说教、承诺效果、复述真实经历、诊断或危险内容、选项后果。不通过时编剧按意见改一次，再不通过就不展示。

之后仍经过固定规则检查（危机用语、直接评价用户、承诺效果、字面禁止话题、时长和阅读量）。每个 agent 可以用不同模型：`LLM_MODEL_PLANNER`、`LLM_MODEL_WRITER`、`LLM_MODEL_REVIEWER`、`LLM_MODEL_INTAKE`。`artifact.trace` 记录每一步用的模型、耗时和结果，不记录内容。研究模式的中性对照组只调用编剧。

## 多模态

配置 `DASHSCOPE_API_KEY` 后：

- **插画**：万相文生图异步任务，默认每次 1 张（`IMAGES_PER_SESSION`，0–3）。前端调用 `/sessions/:id/images` 轮询。
- **语音**：音频故事用千问语音合成，按句切成不超过 600 字的片段。

两者的地址 24 小时后失效，所以绑定了 R2（`MEDIA`）时会转存，换成 `/api/media/...` 地址。插画或语音失败只会加一条提示，不影响文字体验。删除档案时一并删除 R2 里的文件。
