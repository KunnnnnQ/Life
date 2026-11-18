# Mood Capsule 知识库

Mood Capsule 是一个用 AI 生成个性化短篇互动体验、帮助用户调节情绪的产品。本仓库是它的证据底座：产品里每一个“为什么这样设计”都应该能在这里找到对应的节点、文献和证据强度。

它同时被设计成一个可以多人协作、按版本发布的开放知识库：贡献方式和 GitHub 上提代码一样，攒够一批、通过审核后统一发布新版本。

> 本库内容不构成医学或心理治疗建议。产品是情绪体验工具，不是治疗手段。

## 看什么

- [网站整体框架](docs/website-framework.md)：系统自动选择媒介、动态事件相关性、生成任务与反馈闭环，以及已实现和待实现部分。
- [本地网站启动说明](web/README.md)：可运行的课堂原型、接口与测试。
- [自动选择媒介的研究说明](docs/adaptive-media-evidence.md)：短视频、幽默、音乐、年龄和动态适配的支持与限制。
- [INDEX.md](INDEX.md)：自动生成的知识树。从用户目标一路展开到机制、策略、构念和测量工具，并列出证据缺口和量表许可状态。
- [nodes/](nodes/)：所有节点，一个节点一个 YAML 文件。
- [schema/node.schema.json](schema/node.schema.json)：节点格式定义。
- [课堂项目量表使用建议](docs/classroom-measurement.md)：B-MMR 的评分依据、ERQ 中文版出处，以及 I-PANAS-SF 中文 9 题版与英语 10 题版的区别。

## 数据模型

底层是一张图，`INDEX.md` 把它按树的形式展示出来。一个量表可以测多个构念，一个策略可以服务多个目标，所以不能只用树存储。

| 类型 | 目录 | 是什么 | 例子 |
|---|---|---|---|
| `construct` 构念 | `nodes/constructs/` | 心理学里被测量和讨论的概念 | 愉悦度、习惯性认知重评 |
| `instrument` 测量工具 | `nodes/instruments/` | 量表和问卷的**元数据**（不含受版权保护的题目） | ERQ、情绪滑块 |
| `strategy` 调节策略 | `nodes/strategies/` | 情绪调节研究中的策略 | 分心、认知重评 |
| `goal` 用户目标 | `nodes/goals/` | 用户在产品里选择的体验目标 | 平静下来、获得鼓励 |
| `mechanic` 叙事机制 | `nodes/mechanics/` | 产品中的故事或游戏结构，带生成参数 | 慢速探索、逆转弧 |
| `source` 文献 | `nodes/sources/` | 一篇论文或一本书，必须有 DOI 或链接 | Gross (1998) |
| `risk` 风险 | `nodes/risks/` | 可能伤害用户或让结论失真的问题，带严重度、状态和对策；必须引用文献 | 鼓励适得其反、前后测偏差 |

节点之间的关系：

| 关系 | 方向 | 含义 |
|---|---|---|
| `measures` | 工具 → 构念 | 这个工具测量这个构念 |
| `part_of` | 构念/策略 → 构念/策略 | 层级关系，用来生成理论树 |
| `targets` | 策略/目标 → 构念 | 主要作用于哪个构念 |
| `implements` | 机制 → 策略 | 这个叙事机制借用了哪种调节策略 |
| `serves` | 机制 → 目标 | 这个机制用来满足哪个用户目标 |
| `derived_from` | 工具 → 工具 | 简版、译本等 |
| `threatens` | 风险 → 构念/工具/策略/机制/目标 | 这个风险会影响哪里 |
| `contrasts_with` / `related_to` | 任意 | 对照或相关 |

### 证据怎么记

每条关系和每个论断（`claims`）都可以挂多条证据，每条证据写明：

- `source`：引用哪篇文献
- `stance`：`supports` 支持 / `contradicts` 反对 / `mixed` 混合
- `level`：**这条证据本身**的强度，从强到弱为 `meta-analysis`、`systematic-review`、`rct`、`replicated`、`single-study`、`validation-study`、`theory`、`hypothesis`

最重要的一条规则：**证据针对的是原始研究里测试过的东西。** 元分析证明“分心能改善情绪”，不等于证明“慢速探索游戏能让人平静”。产品机制引用这类研究时，`level` 必须写 `hypothesis`，并在 `note` 里写清楚外推了什么。校验脚本会对违反这一点的情况发出警告。

## 量表版权

很多量表的题目本身受版权保护，发表在论文里不等于可以放进开源仓库或商业产品。因此：

- 本库只存量表的元数据：测什么、多少题、计分方式、子量表、语言版本、许可状态、原文出处。
- `items_in_repo` 只有在许可为 `public-domain` 或 `open` 时才允许为 `true`，校验脚本会强制检查。
- `license.status` 和 `license.commercial_use` 不确定时一律写 `unknown`，不要猜。

## 产品怎么用

```bash
python scripts/build.py
```

生成 `dist/kb-<版本号>.json`。产品锁定某一个版本号，这样每次生成的故事都能追溯到它依据的是哪一版知识库。节点上的 `product_use` 字段是给产品读的：叙事机制的节拍、时长范围、选择数量、唤醒曲线、可以使用哪些个人信息、什么情况下不该用。

## 本地运行

```bash
pip install -r requirements.txt
```

```bash
python scripts/validate.py
```

```bash
python scripts/validate.py --online
```

`--online` 会把每篇文献的 DOI 拿去 Crossref 核对标题、年份和第一作者。

## 相关项目

这些项目在结构化心理学知识上做过类似尝试，值得参考：

- Cognitive Atlas：协作构建的认知科学概念本体
- Behaviour Change Technique Taxonomy（BCTTv1）及后续的 Behaviour Change Intervention Ontology：把干预手段拆成标准化技术
- COSMIN：评价测量工具质量的标准，可以作为量表节点的审核清单
- Octopus：把研究拆成模块发表的平台

## 许可

`nodes/` 下的内容采用 CC BY 4.0，`scripts/` 和 `schema/` 下的代码采用 MIT。见 [kb.yaml](kb.yaml)。
