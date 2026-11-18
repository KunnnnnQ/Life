# 知识树

> 由 `scripts/build.py` 自动生成，请勿手改。版本 0.1.0，共 122 个节点。

## 一、从用户目标出发

产品生成一次体验时走的就是这条路径：目标 → 叙事机制 → 背后的调节策略 → 理论构念 → 测量工具。

- **平静下来（`goal.calm-down`）** [draft]
  - 目标指向：紧张唤醒
  - 机制 音乐片段休息（`mechanic.music-pause`） [draft] ── 服务此目标的证据：hypothesis·supports
    - 实现策略：反应调节 → 情绪调节 ── 证据：hypothesis·supports
  - 机制 慢速探索（`mechanic.slow-exploration`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·supports，hypothesis·mixed
    - 实现策略：分心 → 注意部署 → 情绪调节 ── 证据：hypothesis·supports
    - ⚠ 风险：过度依赖分心与回避（medium，mitigated-in-code）
  - 默认测量：情绪滑块（`instrument.affective-slider`）
  - 研究测量：UWIST 心境形容词表（`instrument.uwist-macl`）
- **想和人聊聊（`goal.connection`）** [draft]
  - 目标指向：人际亲近感
  - 目标指向：愉悦度
  - 机制 陌生人对话（`mechanic.stranger-chat`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·supports，hypothesis·mixed
    - 实现策略：情境选择 → 情绪调节 ── 证据：hypothesis·supports
    - ⚠ 风险：使用中出现危机（high，mitigated-in-code）
  - 默认测量：情绪滑块（`instrument.affective-slider`）
  - 研究测量：他人融入自我量表（IOS）（`instrument.ios-scale`）
- **获得鼓励（`goal.encouragement`）** [draft]
  - 目标指向：状态希望
  - 目标指向：愉悦度
  - 机制 幽默励志（`mechanic.humor-pep-talk`） [draft] ── 服务此目标的证据：hypothesis·supports
    - 实现策略：幽默重评 → 认知改变 → 情绪调节 ── 证据：hypothesis·supports
    - ⚠ 风险：鼓励适得其反（high，mitigated-in-code）
  - 机制 重新理解的故事弧（`mechanic.reframe-arc`） [draft] ── 服务此目标的证据：hypothesis·supports
    - 实现策略：认知重评 → 认知改变 → 情绪调节 ── 证据：hypothesis·supports，hypothesis·supports
    - ⚠ 风险：鼓励适得其反（high，mitigated-in-code）
    - ⚠ 风险：只靠内容预警不够（high，mitigated-in-code）
  - 机制 低阅读负担的音频故事（`mechanic.spoken-reframe`） [draft] ── 服务此目标的证据：hypothesis·supports
    - 实现策略：认知重评 → 认知改变 → 情绪调节 ── 证据：hypothesis·supports
    - ⚠ 风险：鼓励适得其反（high，mitigated-in-code）
  - 默认测量：情绪滑块（`instrument.affective-slider`）
  - 研究测量：状态希望量表（`instrument.state-hope-scale`）
- **体验成就感 / 爽一下（`goal.mastery`）** [draft]
  - 目标指向：支配感 / 控制感
  - 目标指向：愉悦度
  - 机制 逆转弧（`mechanic.reversal-arc`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·supports
    - 实现策略：分心 → 注意部署 → 情绪调节 ── 证据：hypothesis·supports
    - ⚠ 风险：过度依赖分心与回避（medium，mitigated-in-code）
  - 默认测量：情绪滑块（`instrument.affective-slider`）
  - 研究测量：自评小人量表（SAM）（`instrument.sam`）
- **换个心情（`goal.mood-shift`）** [draft]
  - 目标指向：愉悦度
  - 机制 有结尾的短幽默视频（`mechanic.brief-humor-video`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·mixed
    - 实现策略：分心 → 注意部署 → 情绪调节 ── 证据：hypothesis·supports
    - ⚠ 风险：过度依赖分心与回避（medium，mitigated-in-code）
    - ⚠ 风险：对短视频的先入之见（low，mitigated-in-code）
  - 机制 新奇绕路（`mechanic.novelty-detour`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·supports
    - 实现策略：分心 → 注意部署 → 情绪调节 ── 证据：hypothesis·supports
    - ⚠ 风险：过度依赖分心与回避（medium，mitigated-in-code）
  - 默认测量：情绪滑块（`instrument.affective-slider`）

## 二、理论树（按 part_of 展开）

- 童年不良经历（ACE）（`construct.adverse-childhood-experiences`）
- 共同反刍（`construct.co-rumination`）
- 核心情感（`construct.core-affect`）
  - 唤醒度（`construct.arousal`） ← 测量：情绪滑块、自评小人量表（SAM）
    - 精力唤醒（`construct.energetic-arousal`） ← 测量：UWIST 心境形容词表
    - 紧张唤醒（`construct.tense-arousal`） ← 测量：UWIST 心境形容词表
  - 愉悦度（`construct.valence`） ← 测量：UWIST 心境形容词表、情绪滑块、自评小人量表（SAM）
- 抑郁与焦虑症状（`construct.depression-anxiety-symptoms`） ← 测量：PHQ-4 抑郁焦虑超简筛查
- 支配感 / 控制感（`construct.dominance`） ← 测量：自评小人量表（SAM）
- 情绪调节（`construct.emotion-regulation`）
  - 情绪调节困难（`construct.emotion-regulation-difficulties`） ← 测量：情绪调节困难量表简版（DERS-16）
  - 习惯性认知重评（`construct.habitual-reappraisal`） ← 测量：情绪调节问卷（ERQ）
  - 习惯性表达抑制（`construct.habitual-suppression`） ← 测量：情绪调节问卷（ERQ）
  - 音乐情绪调节（`construct.music-mood-regulation`） ← 测量：音乐情绪调节简表（B-MMR）
  - 注意部署（`strategy.attentional-deployment`）
    - 分心（`strategy.distraction`）
  - 认知改变（`strategy.cognitive-change`）
    - 幽默重评（`strategy.humorous-reappraisal`）
    - 认知重评（`strategy.reappraisal`）
  - 反应调节（`strategy.response-modulation`）
    - 表达抑制（`strategy.expressive-suppression`）
  - 情境修改（`strategy.situation-modification`）
  - 情境选择（`strategy.situation-selection`）
- 事件中心性（`construct.event-centrality`）
- 人际亲近感（`construct.interpersonal-closeness`） ← 测量：他人融入自我量表（IOS）
- 孤独感（`construct.loneliness`） ← 测量：孤独感三题简版
- 负性情感（`construct.negative-affect`） ← 测量：I-PANAS-SF 中文 9 题研究版、国际版 PANAS 短表、正负性情感量表（PANAS）
- 正性情感（`construct.positive-affect`） ← 测量：I-PANAS-SF 中文 9 题研究版、国际版 PANAS 短表、正负性情感量表（PANAS）
- 状态希望（`construct.state-hope`） ← 测量：状态希望量表
- 自杀风险（`construct.suicide-risk`） ← 测量：哥伦比亚自杀严重程度评定量表（筛查版）

## 三、证据缺口

以下关系还没有直接测试过该机制本身的研究，只有类比或理论外推（`hypothesis`），或者完全没有文献。最需要的是直接检验这些机制的实验，包括产品自己的对照实验。

| 节点 | 关系 | 状态 | 类比证据 |
|---|---|---|---|
| `mechanic.brief-humor-video` | implements → `strategy.distraction` | 仅间接证据（1 条） | webb-2012 |
| `mechanic.brief-humor-video` | serves → `goal.mood-shift` | 仅间接证据（2 条），其中 1 条不一致 | yamakoshi-2025、tam-inzlicht-2024 |
| `mechanic.humor-pep-talk` | implements → `strategy.humorous-reappraisal` | 仅间接证据（1 条） | samson-gross-2012 |
| `mechanic.humor-pep-talk` | serves → `goal.encouragement` | 仅间接证据（1 条） | samson-gross-2012 |
| `mechanic.music-pause` | implements → `strategy.response-modulation` | 仅间接证据（1 条） | de-witte-2020 |
| `mechanic.music-pause` | serves → `goal.calm-down` | 仅间接证据（1 条） | de-witte-2020 |
| `mechanic.novelty-detour` | implements → `strategy.distraction` | 仅间接证据（1 条） | webb-2012 |
| `mechanic.novelty-detour` | serves → `goal.mood-shift` | 仅间接证据（2 条） | bryant-zillmann-1984、zillmann-1988 |
| `mechanic.reframe-arc` | implements → `strategy.reappraisal` | 仅间接证据（2 条） | webb-2012、green-brock-2000 |
| `mechanic.reframe-arc` | serves → `goal.encouragement` | 仅间接证据（1 条） | bhattacharjee-2025 |
| `mechanic.reversal-arc` | implements → `strategy.distraction` | 仅间接证据（1 条） | webb-2012 |
| `mechanic.reversal-arc` | serves → `goal.mastery` | 仅间接证据（2 条） | ryan-2006、bandura-1977 |
| `mechanic.slow-exploration` | implements → `strategy.distraction` | 仅间接证据（1 条） | webb-2012 |
| `mechanic.slow-exploration` | serves → `goal.calm-down` | 仅间接证据（3 条），其中 1 条不一致 | sheppes-2011、rupp-2017、collins-2019 |
| `mechanic.spoken-reframe` | implements → `strategy.reappraisal` | 仅间接证据（1 条） | webb-2012 |
| `mechanic.spoken-reframe` | serves → `goal.encouragement` | 仅间接证据（1 条） | bhattacharjee-2025 |
| `mechanic.stranger-chat` | implements → `strategy.situation-selection` | 仅间接证据（1 条） | epley-schroeder-2014 |
| `mechanic.stranger-chat` | serves → `goal.connection` | 仅间接证据（3 条），其中 1 条不一致 | epley-schroeder-2014、sandstrom-dunn-2014、rose-2002 |
| `mechanic.stranger-chat` | related_to → `construct.co-rumination` | 仅间接证据（1 条） | rose-2002 |

## 四、测量工具与许可

| 工具 | 题数 | 产品角色 | 许可 | 商用 |
|---|---|---|---|---|
| 情绪滑块（`instrument.affective-slider`） | 2 | per-session-default | unknown | unknown |
| 音乐情绪调节简表（B-MMR）（`instrument.b-mmr`） | 21 | profile-optional | unknown | unknown |
| 哥伦比亚自杀严重程度评定量表（筛查版）（`instrument.c-ssrs`） | 6 | reference-only | unknown | unknown |
| 情绪调节困难量表简版（DERS-16）（`instrument.ders-16`） | 16 | research-only | unknown | unknown |
| 情绪调节问卷（ERQ）（`instrument.erq`） | 10 | profile-optional | free-research | unknown |
| 国际版 PANAS 短表（`instrument.i-panas-sf`） | 10 | research-only | unknown | unknown |
| I-PANAS-SF 中文 9 题研究版（`instrument.i-panas-sf-zh-9`） | 9 | research-only | unknown | unknown |
| 他人融入自我量表（IOS）（`instrument.ios-scale`） | 1 | per-session-optional | unknown | unknown |
| 正负性情感量表（PANAS）（`instrument.panas`） | 20 | research-only | unknown | unknown |
| PHQ-4 抑郁焦虑超简筛查（`instrument.phq-4`） | 4 | safety-gate | unknown | unknown |
| 自评小人量表（SAM）（`instrument.sam`） | 3 | per-session-optional | unknown | unknown |
| 状态希望量表（`instrument.state-hope-scale`） | 6 | research-only | unknown | unknown |
| 孤独感三题简版（`instrument.ucla-loneliness-3`） | 3 | profile-optional | unknown | unknown |
| UWIST 心境形容词表（`instrument.uwist-macl`） | 24 | research-only | unknown | unknown |

## 五、风险清单

`mitigated-in-design` 表示对策只写进了节点规则；`mitigated-in-code` 表示已在产品代码中实现并有测试。

| 风险 | 严重度 | 状态 | 影响对象 | 依据 | 主要对策 |
|---|---|---|---|---|---|
| 使用中出现危机（`risk.crisis-in-session`） | high | mitigated-in-code | stranger-chat、connection、encouragement、web/core/safety.ts、web/core/service.ts、decide、web/app/page.tsx | dazzi-2014、kroenke-2009、posner-2011 | 开始前可选 PHQ-4（每 14 天询问一次，可跳过）；任一分量表 ≥3 时展示求助资源，并在之后 14 天降低高刺激内容的排序 |
| 鼓励适得其反（`risk.positive-statement-backfire`） | high | mitigated-in-code | encouragement、reframe-arc、spoken-reframe、humor-pep-talk、findAffirmation、web/core/generation.ts、outcome、web/app/page.tsx | wood-2009 | 生成提示词禁止对用户本人下积极断言；生成后再检查“你一定能行”“你很棒”“一切都会好起来”等说法，命中则不展示、需重新安排 |
| 前后测偏差（`risk.pre-post-bias`） | high | mitigated-in-code | affective-slider、calm-down、encouragement、mood-shift、web/core/service.ts、web/core/generation.ts、goalBaseline、web/app/page.tsx | barnett-2004、orne-1962 | 研究模式（STUDY_MODE=on）把每次体验随机分到三组：个性化、非个性化（同机制但不用任何个人信息）、中性对照（说明性短文）；分组不向参与者显示，导出数据中保留 |
| 只靠内容预警不够（`risk.warnings-insufficient`） | high | mitigated-in-code | reframe-arc、adverse-childhood-experiences、web/core/generation.ts | bridgland-2024 | 禁止话题在生成前写入约束、生成后再做检查，未通过则不展示 |
| 过度依赖分心与回避（`risk.avoidance-overuse`） | medium | mitigated-in-code | distraction、slow-exploration、novelty-detour、reversal-arc、brief-humor-video、avoidancePattern、POLICY | aldao-2010、bonanno-burton-2013 | 统计近 14 天最近 6 次体验中分心类的比例；至少 5 次且 ≥80% 时，给非分心类体验加 0.08 分，并在“为什么这样安排”里说明，不强制 |
| 跨文化外推（`risk.cultural-generalization`） | medium | mitigated-in-design | habitual-suppression、erq | butler-2007 | 不把 ERQ 抑制得分解读为“不好的习惯”，只用于偏好排序 |
| “必须开心”的压力（`risk.happiness-pressure`） | medium | mitigated-in-code | mood-shift、encouragement、findPromise、web/core/generation.ts、web/app/page.tsx、web/tests/intake.test.mjs | mauss-2011 | 文案只描述体验内容和时长，不承诺情绪结果；生成内容命中“让你开心”“保证好起来”“心情提升 X%”等说法则不展示 |
| 经历影响统一衰减（`risk.uniform-event-decay`） | medium | mitigated-in-code | adverse-childhood-experiences、eventWeights、POLICY、web/core/contracts.ts | berntsen-rubin-2006、lucas-2007 | 按事件类型设置半衰期：日常压力 30 天、成就 90 天、身份或环境变化 180 天、关系变化 365 天、失去与健康 730 天、其他 90 天 |
| 对短视频的先入之见（`risk.screen-media-assumptions`） | low | mitigated-in-code | brief-humor-video、decide | orben-przybylski-2019、tam-inzlicht-2024 | 媒介习惯只影响“接受度”，效果按个人反馈单独学习 |

## 六、文献

- Aldao, A. et al. (2010). Emotion-regulation strategies across psychopathology: A meta-analytic review. *Clinical Psychology Review*. https://doi.org/10.1016/j.cpr.2009.11.004 ── 被 1 个节点引用
- Aron, A. et al. (1992). Inclusion of Other in the Self Scale and the structure of interpersonal closeness. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/0022-3514.63.4.596 ── 被 2 个节点引用
- Aron, A. et al. (1997). The experimental generation of interpersonal closeness: A procedure and some preliminary findings. *Personality and Social Psychology Bulletin*. https://doi.org/10.1177/0146167297234003 ── 被 1 个节点引用
- Baldwin, J. R. et al. (2021). Population vs individual prediction of poor health from results of adverse childhood experiences screening. *JAMA Pediatrics*. https://doi.org/10.1001/jamapediatrics.2020.5602 ── 被 1 个节点引用
- Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. *Psychological Review*. https://doi.org/10.1037/0033-295X.84.2.191 ── 被 1 个节点引用
- Barnett, A. G. et al. (2004). Regression to the mean: what it is and how to deal with it. *International Journal of Epidemiology*. https://doi.org/10.1093/ije/dyh299 ── 被 1 个节点引用
- Benson, L. et al. (2019). Age differences in emotion regulation strategy use, variability, and flexibility: An experience sampling approach. *Developmental Psychology*. https://doi.org/10.1037/dev0000727 ── 被 1 个节点引用
- Berntsen, D. & Rubin, D. C. (2006). The centrality of event scale: A measure of integrating a trauma into one's identity and its relation to post-traumatic stress disorder symptoms. *Behaviour Research and Therapy*. https://doi.org/10.1016/j.brat.2005.01.009 ── 被 2 个节点引用
- Betella, A. & Verschure, P. F. M. J. (2016). The Affective Slider: A digital self-assessment scale for the measurement of human emotions. *PLOS ONE*. https://doi.org/10.1371/journal.pone.0148037 ── 被 1 个节点引用
- Bhattacharjee, A. et al. (2025). Perfectly to a Tee: Understanding user perceptions of personalized LLM-enhanced narrative interventions. *Proceedings of the 2025 ACM Designing Interactive Systems Conference (DIS '25)*. https://doi.org/10.1145/3715336.3735810 ── 被 2 个节点引用
- Bjureberg, J. et al. (2016). Development and validation of a brief version of the Difficulties in Emotion Regulation Scale: The DERS-16. *Journal of Psychopathology and Behavioral Assessment*. https://doi.org/10.1007/s10862-015-9514-x ── 被 1 个节点引用
- Bonanno, G. A. & Burton, C. L. (2013). Regulatory flexibility: An individual differences perspective on coping and emotion regulation. *Perspectives on Psychological Science*. https://doi.org/10.1177/1745691613504116 ── 被 1 个节点引用
- Bradley, M. M. & Lang, P. J. (1994). Measuring emotion: The self-assessment manikin and the semantic differential. *Journal of Behavior Therapy and Experimental Psychiatry*. https://doi.org/10.1016/0005-7916(94)90063-9 ── 被 2 个节点引用
- Bridgland, V. M. E. et al. (2024). A Meta-Analysis of the Efficacy of Trigger Warnings, Content Warnings, and Content Notes. *Clinical Psychological Science*. https://doi.org/10.1177/21677026231186625 ── 被 1 个节点引用
- Bryant, J. & Zillmann, D. (1984). Using television to alleviate boredom and stress: Selective exposure as a function of induced excitational states. *Journal of Broadcasting*. https://doi.org/10.1080/08838158409386511 ── 被 2 个节点引用
- Butler, E. A. et al. (2007). Emotion regulation and culture: Are the social consequences of emotion suppression culture-specific?. *Emotion*. https://doi.org/10.1037/1528-3542.7.1.30 ── 被 2 个节点引用
- Collins, E. et al. (2019). Digital games and mindfulness apps: Comparison of effects on post work recovery. *JMIR Mental Health*. https://doi.org/10.2196/12853 ── 被 2 个节点引用
- Dazzi, T. et al. (2014). Does asking about suicide and related behaviours induce suicidal ideation? What is the evidence?. *Psychological Medicine*. https://doi.org/10.1017/S0033291714001299 ── 被 2 个节点引用
- Epley, N. & Schroeder, J. (2014). Mistakenly seeking solitude. *Journal of Experimental Psychology: General*. https://doi.org/10.1037/a0037323 ── 被 2 个节点引用
- Felitti, V. J. et al. (1998). Relationship of childhood abuse and household dysfunction to many of the leading causes of death in adults: The Adverse Childhood Experiences (ACE) Study. *American Journal of Preventive Medicine*. https://doi.org/10.1016/S0749-3797(98)00017-8 ── 被 1 个节点引用
- Gratz, K. L. & Roemer, L. (2004). Multidimensional assessment of emotion regulation and dysregulation: Development, factor structure, and initial validation of the Difficulties in Emotion Regulation Scale. *Journal of Psychopathology and Behavioral Assessment*. https://doi.org/10.1023/B:JOBA.0000007455.08539.94 ── 被 1 个节点引用
- Green, M. C. & Brock, T. C. (2000). The role of transportation in the persuasiveness of public narratives. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/0022-3514.79.5.701 ── 被 1 个节点引用
- Gross, J. J. (1998). The emerging field of emotion regulation: An integrative review. *Review of General Psychology*. https://doi.org/10.1037/1089-2680.2.3.271 ── 被 6 个节点引用
- Gross, J. J. & John, O. P. (2003). Individual differences in two emotion regulation processes: Implications for affect, relationships, and well-being. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/0022-3514.85.2.348 ── 被 3 个节点引用
- Gross, J. J. (2015). Emotion regulation: Current status and future prospects. *Psychological Inquiry*. https://doi.org/10.1080/1047840X.2014.940781 ── 被 1 个节点引用
- Hughes, M. E. et al. (2004). A Short Scale for Measuring Loneliness in Large Surveys. *Research on Aging*. https://doi.org/10.1177/0164027504268574 ── 被 1 个节点引用
- Kroenke, K. et al. (2009). An Ultra-Brief Screening Scale for Anxiety and Depression: The PHQ-4. *Psychosomatics*. https://doi.org/10.1176/appi.psy.50.6.613 ── 被 2 个节点引用
- Liu, J. D. et al. (2020). Chinese version of the international positive and negative affect schedule short form: factor structure and measurement invariance. *Health and Quality of Life Outcomes*. https://doi.org/10.1186/s12955-020-01526-6 ── 被 2 个节点引用
- Lucas, R. E. (2007). Adaptation and the Set-Point Model of Subjective Well-Being. *Current Directions in Psychological Science*. https://doi.org/10.1111/j.1467-8721.2007.00479.x ── 被 1 个节点引用
- Matthews, G. et al. (1990). Refining the measurement of mood: The UWIST Mood Adjective Checklist. *British Journal of Psychology*. https://doi.org/10.1111/j.2044-8295.1990.tb02343.x ── 被 3 个节点引用
- Mauss, I. B. et al. (2011). Can seeking happiness make people unhappy? Paradoxical effects of valuing happiness. *Emotion*. https://doi.org/10.1037/a0022010 ── 被 1 个节点引用
- Nahum-Shani, I. et al. (2018). Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health: Key Components and Design Principles for Ongoing Health Behavior Support. *Annals of Behavioral Medicine*. https://doi.org/10.1007/s12160-016-9830-8 ── 被 2 个节点引用
- Orben, A. & Przybylski, A. K. (2019). The association between adolescent well-being and digital technology use. *Nature Human Behaviour*. https://doi.org/10.1038/s41562-018-0506-1 ── 被 1 个节点引用
- Orne, M. T. (1962). On the social psychology of the psychological experiment: With particular reference to demand characteristics and their implications. *American Psychologist*. https://doi.org/10.1037/h0043424 ── 被 1 个节点引用
- Posner, K. et al. (2011). The Columbia–Suicide Severity Rating Scale: Initial Validity and Internal Consistency Findings From Three Multisite Studies With Adolescents and Adults. *American Journal of Psychiatry*. https://doi.org/10.1176/appi.ajp.2011.10111704 ── 被 2 个节点引用
- Reinecke, L. (2009). Games and recovery: The use of video and computer games to recuperate from stress and strain. *Journal of Media Psychology*. https://doi.org/10.1027/1864-1105.21.3.126 ── 被 1 个节点引用
- Rose, A. J. (2002). Co-rumination in the friendships of girls and boys. *Child Development*. https://doi.org/10.1111/1467-8624.00509 ── 被 2 个节点引用
- Rupp, M. A. et al. (2017). Searching for affective and cognitive restoration: Examining the restorative effects of casual video game play. *Human Factors*. https://doi.org/10.1177/0018720817715360 ── 被 2 个节点引用
- Russell, J. A. (1980). A circumplex model of affect. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/h0077714 ── 被 3 个节点引用
- Ryan, R. M. et al. (2006). The motivational pull of video games: A self-determination theory approach. *Motivation and Emotion*. https://doi.org/10.1007/s11031-006-9051-8 ── 被 1 个节点引用
- Saarikallio, S. (2012). Development and validation of the Brief Music in Mood Regulation Scale (B-MMR). *Music Perception*. https://doi.org/10.1525/mp.2012.30.1.97 ── 被 2 个节点引用
- Samson, A. C. & Gross, J. J. (2012). Humour as emotion regulation: The differential consequences of negative versus positive humour. *Cognition and Emotion*. https://doi.org/10.1080/02699931.2011.585069 ── 被 2 个节点引用
- Sandstrom, G. M. & Dunn, E. W. (2014). Social interactions and well-being: The surprising power of weak ties. *Personality and Social Psychology Bulletin*. https://doi.org/10.1177/0146167214529799 ── 被 2 个节点引用
- Sheppes, G. et al. (2011). Emotion-regulation choice. *Psychological Science*. https://doi.org/10.1177/0956797611418350 ── 被 3 个节点引用
- Snyder, C. R. et al. (1996). Development and validation of the State Hope Scale. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/0022-3514.70.2.321 ── 被 2 个节点引用
- Tam, K. Y. Y. & Inzlicht, M. (2024). Fast-forward to boredom: How switching behavior on digital media makes people more bored. *Journal of Experimental Psychology: General*. https://doi.org/10.1037/xge0001639 ── 被 2 个节点引用
- Thompson, E. R. (2007). Development and validation of an internationally reliable short-form of the Positive and Negative Affect Schedule (PANAS). *Journal of Cross-Cultural Psychology*. https://doi.org/10.1177/0022022106297301 ── 被 1 个节点引用
- Villani, D. et al. (2018). Videogames for emotion regulation: A systematic review. *Games for Health Journal*. https://doi.org/10.1089/g4h.2017.0108 ── 被 1 个节点引用
- Wang, L. et al. (2007). 情绪调节问卷中文版的信效度研究. *中国健康心理学杂志*. https://jkxl.cbpt.cnki.net/portal/journal/portal/client/paper/031d218dc2c43c106a21690dfc5f9053 ── 被 1 个节点引用
- Watson, D. et al. (1988). Development and validation of brief measures of positive and negative affect: The PANAS scales. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/0022-3514.54.6.1063 ── 被 3 个节点引用
- Webb, T. L. et al. (2012). Dealing with feeling: A meta-analysis of the effectiveness of strategies derived from the process model of emotion regulation. *Psychological Bulletin*. https://doi.org/10.1037/a0027600 ── 被 11 个节点引用
- Wood, J. V. et al. (2009). Positive self-statements: Power for some, peril for others. *Psychological Science*. https://doi.org/10.1111/j.1467-9280.2009.02370.x ── 被 1 个节点引用
- Yamakoshi, T. et al. (2025). Effects of laughter on focus and stress in middle-aged adults: a single-blind, randomized controlled trial. *BMC Complementary Medicine and Therapies*. https://doi.org/10.1186/s12906-025-04863-5 ── 被 1 个节点引用
- Zillmann, D. (1988). Mood management through communication choices. *American Behavioral Scientist*. https://doi.org/10.1177/000276488031003005 ── 被 2 个节点引用
- de Witte, M. et al. (2020). Effects of music interventions on stress-related outcomes: a systematic review and two meta-analyses. *Health Psychology Review*. https://doi.org/10.1080/17437199.2019.1627897 ── 被 1 个节点引用
