# Mood Capsule 网站框架

系统自动选择体验形式。当前为本地课堂原型，完整设计与边界见 [整体框架](../docs/website-framework.md)，接口见 [API.md](API.md)。

## 启动

需要 Node.js 24、Python 以及上层知识库的 Python 依赖。

```powershell
npm run install:ci
npm run kb:sync
npm run check
npm run build
npm start -- --port 5181
```

访问 http://127.0.0.1:5181 。开发模式可用 `npm run dev`。本地 D1 数据保存在忽略的 `.wrangler/state`，首次接口访问自动建表；源码不包含个人数据。

## 上线

见 [docs/deploy.md](../docs/deploy.md)：Cloudflare Workers + D1（+ 可选 R2），一条命令 `npm run deploy`。

## 模式与外部服务

默认 `demo` 使用固定示例内容，可验证自动选择和反馈闭环，不需要 API 密钥。界面明确标记此模式。运行真实生成需要在本地 `.dev.vars` 设置：

```text
CONTENT_MODE=live
LLM_BASE_URL=https://your-provider.example/v1
LLM_MODEL=your-model
LLM_API_KEY=your-secret
```

地址须支持 `/chat/completions` 及 JSON 输出模式。

课堂实验需要对照组时，在 `.dev.vars` 加上 `STUDY_MODE=on`，每次体验会随机分到个性化、非个性化或中性对照三组，详见 API.md。密钥只从服务端读取，不写进页面或提交到仓库。

可选 `MEDIA_BASE_URL` 和 `MEDIA_API_KEY` 接入音视频服务，协议见 API.md。没有媒体服务时视频和音乐不会被当作已就绪产物。音频故事目前使用浏览器朗读，字幕动画是浏览器原型，不是生成的视频文件。真人匹配尚未实现，候选保持关闭。

## 模块

- `core/contracts.ts`：背景、事件、请求、反馈与内容的数据约束。
- `core/catalog.ts`：候选媒介、能力要求、证据引用、版本化工程参数。
- `core/engine.ts`：动态事件相关性、候选排序、接受度与效果分别学习。
- `core/generation.ts`：示例/真实模型适配、内容校验、外部媒体状态。
- `core/config.ts`：从环境变量读取配置，内置 DeepSeek 和通义千问预设。
- `core/agents.ts`：导演、编剧、审核员三个 agent 的流水线。
- `core/media.ts`：万相插画和千问语音。
- `core/intake.ts`：“关于我”的信息整理 agent。
- `core/safety.ts`：PHQ-4 计分、危机用语检测、求助资源（12356、110/120）。
- `core/service.ts`：身份隔离、接口、任务租约、取消、重试、幂等反馈。
- `db/`：D1/SQLite 持久化与建表。
- `generated/kb.json`：知识库版本与内容哈希快照，可运行 kb:sync 更新。
- `tests/core.test.mjs`：实际选择逻辑和 SQLite 接口流程测试。
- `app/`：最小操作界面；没有让用户选择故事或视频的入口。

## 已验证与未验证

已运行自动化测试、类型检查、生产构建及本机 HTTP 全流程检查。未使用真实付费模型或视频服务，未完成浏览器视觉验收和长期效果研究。此目录保留网站模板的构建工具；当前未注册或发布托管网站。
