# 知识树

> 由 `scripts/build.py` 自动生成，请勿手改。版本 0.1.0，共 70 个节点。

## 一、从用户目标出发

产品生成一次体验时走的就是这条路径：目标 → 叙事机制 → 背后的调节策略 → 理论构念 → 测量工具。

- **平静下来（`goal.calm-down`）** [draft]
  - 目标指向：唤醒度
  - 机制 慢速探索（`mechanic.slow-exploration`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·supports，hypothesis·mixed
    - 实现策略：分心 → 注意部署 → 情绪调节 ── 证据：hypothesis·supports
  - 默认测量：情绪滑块（`instrument.affective-slider`）
- **想和人聊聊（`goal.connection`）** [draft]
  - 目标指向：愉悦度
  - 机制 陌生人对话（`mechanic.stranger-chat`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·supports，hypothesis·mixed
    - 实现策略：情境选择 → 情绪调节 ── 证据：hypothesis·supports
  - 默认测量：情绪滑块（`instrument.affective-slider`）
- **获得鼓励（`goal.encouragement`）** [draft]
  - 目标指向：愉悦度
  - 机制 幽默励志（`mechanic.humor-pep-talk`） [draft] ── 服务此目标的证据：hypothesis·supports
    - 实现策略：幽默重评 → 认知改变 → 情绪调节 ── 证据：hypothesis·supports
  - 机制 重新理解的故事弧（`mechanic.reframe-arc`） [draft] ── 服务此目标的证据：hypothesis·supports
    - 实现策略：认知重评 → 认知改变 → 情绪调节 ── 证据：hypothesis·supports，hypothesis·supports
  - 默认测量：情绪滑块（`instrument.affective-slider`）
- **体验成就感 / 爽一下（`goal.mastery`）** [draft]
  - 目标指向：支配感 / 控制感
  - 目标指向：愉悦度
  - 机制 逆转弧（`mechanic.reversal-arc`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·supports
    - 实现策略：分心 → 注意部署 → 情绪调节 ── 证据：hypothesis·supports
  - 默认测量：情绪滑块（`instrument.affective-slider`）
- **换个心情（`goal.mood-shift`）** [draft]
  - 目标指向：愉悦度
  - 机制 新奇绕路（`mechanic.novelty-detour`） [draft] ── 服务此目标的证据：hypothesis·supports，hypothesis·supports
    - 实现策略：分心 → 注意部署 → 情绪调节 ── 证据：hypothesis·supports
  - 默认测量：情绪滑块（`instrument.affective-slider`）

## 二、理论树（按 part_of 展开）

- 童年不良经历（ACE）（`construct.adverse-childhood-experiences`）
- 共同反刍（`construct.co-rumination`）
- 核心情感（`construct.core-affect`）
  - 唤醒度（`construct.arousal`） ← 测量：情绪滑块、自评小人量表（SAM）
  - 愉悦度（`construct.valence`） ← 测量：情绪滑块、自评小人量表（SAM）
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
- 负性情感（`construct.negative-affect`） ← 测量：国际版 PANAS 短表、正负性情感量表（PANAS）
- 正性情感（`construct.positive-affect`） ← 测量：国际版 PANAS 短表、正负性情感量表（PANAS）

## 三、证据缺口

以下关系还没有直接测试过该机制本身的研究，只有类比或理论外推（`hypothesis`），或者完全没有文献。最需要的是直接检验这些机制的实验，包括产品自己的对照实验。

| 节点 | 关系 | 状态 | 类比证据 |
|---|---|---|---|
| `mechanic.humor-pep-talk` | implements → `strategy.humorous-reappraisal` | 仅间接证据（1 条） | samson-gross-2012 |
| `mechanic.humor-pep-talk` | serves → `goal.encouragement` | 仅间接证据（1 条） | samson-gross-2012 |
| `mechanic.novelty-detour` | implements → `strategy.distraction` | 仅间接证据（1 条） | webb-2012 |
| `mechanic.novelty-detour` | serves → `goal.mood-shift` | 仅间接证据（2 条） | bryant-zillmann-1984、zillmann-1988 |
| `mechanic.reframe-arc` | implements → `strategy.reappraisal` | 仅间接证据（2 条） | webb-2012、green-brock-2000 |
| `mechanic.reframe-arc` | serves → `goal.encouragement` | 仅间接证据（1 条） | bhattacharjee-2025 |
| `mechanic.reversal-arc` | implements → `strategy.distraction` | 仅间接证据（1 条） | webb-2012 |
| `mechanic.reversal-arc` | serves → `goal.mastery` | 仅间接证据（2 条） | ryan-2006、bandura-1977 |
| `mechanic.slow-exploration` | implements → `strategy.distraction` | 仅间接证据（1 条） | webb-2012 |
| `mechanic.slow-exploration` | serves → `goal.calm-down` | 仅间接证据（3 条），其中 1 条不一致 | sheppes-2011、rupp-2017、collins-2019 |
| `mechanic.stranger-chat` | implements → `strategy.situation-selection` | 仅间接证据（1 条） | epley-schroeder-2014 |
| `mechanic.stranger-chat` | serves → `goal.connection` | 仅间接证据（3 条），其中 1 条不一致 | epley-schroeder-2014、sandstrom-dunn-2014、rose-2002 |
| `mechanic.stranger-chat` | related_to → `construct.co-rumination` | 仅间接证据（1 条） | rose-2002 |

## 四、测量工具与许可

| 工具 | 题数 | 产品角色 | 许可 | 商用 |
|---|---|---|---|---|
| 情绪滑块（`instrument.affective-slider`） | 2 | per-session-default | unknown | unknown |
| 音乐情绪调节简表（B-MMR）（`instrument.b-mmr`） | 21 | profile-optional | unknown | unknown |
| 情绪调节困难量表简版（DERS-16）（`instrument.ders-16`） | 16 | research-only | unknown | unknown |
| 情绪调节问卷（ERQ）（`instrument.erq`） | 10 | profile-optional | free-research | unknown |
| 国际版 PANAS 短表（`instrument.i-panas-sf`） | 10 | research-only | unknown | unknown |
| 正负性情感量表（PANAS）（`instrument.panas`） | 20 | research-only | unknown | unknown |
| 自评小人量表（SAM）（`instrument.sam`） | 3 | per-session-optional | unknown | unknown |

## 五、文献

- Aron, A. et al. (1997). The experimental generation of interpersonal closeness: A procedure and some preliminary findings. *Personality and Social Psychology Bulletin*. https://doi.org/10.1177/0146167297234003 ── 被 1 个节点引用
- Baldwin, J. R. et al. (2021). Population vs individual prediction of poor health from results of adverse childhood experiences screening. *JAMA Pediatrics*. https://doi.org/10.1001/jamapediatrics.2020.5602 ── 被 1 个节点引用
- Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. *Psychological Review*. https://doi.org/10.1037/0033-295X.84.2.191 ── 被 1 个节点引用
- Betella, A. & Verschure, P. F. M. J. (2016). The Affective Slider: A digital self-assessment scale for the measurement of human emotions. *PLOS ONE*. https://doi.org/10.1371/journal.pone.0148037 ── 被 1 个节点引用
- Bhattacharjee, A. et al. (2025). Perfectly to a Tee: Understanding user perceptions of personalized LLM-enhanced narrative interventions. *Proceedings of the 2025 ACM Designing Interactive Systems Conference (DIS '25)*. https://doi.org/10.1145/3715336.3735810 ── 被 1 个节点引用
- Bjureberg, J. et al. (2016). Development and validation of a brief version of the Difficulties in Emotion Regulation Scale: The DERS-16. *Journal of Psychopathology and Behavioral Assessment*. https://doi.org/10.1007/s10862-015-9514-x ── 被 1 个节点引用
- Bradley, M. M. & Lang, P. J. (1994). Measuring emotion: The self-assessment manikin and the semantic differential. *Journal of Behavior Therapy and Experimental Psychiatry*. https://doi.org/10.1016/0005-7916(94)90063-9 ── 被 2 个节点引用
- Bryant, J. & Zillmann, D. (1984). Using television to alleviate boredom and stress: Selective exposure as a function of induced excitational states. *Journal of Broadcasting*. https://doi.org/10.1080/08838158409386511 ── 被 2 个节点引用
- Collins, E. et al. (2019). Digital games and mindfulness apps: Comparison of effects on post work recovery. *JMIR Mental Health*. https://doi.org/10.2196/12853 ── 被 2 个节点引用
- Epley, N. & Schroeder, J. (2014). Mistakenly seeking solitude. *Journal of Experimental Psychology: General*. https://doi.org/10.1037/a0037323 ── 被 2 个节点引用
- Felitti, V. J. et al. (1998). Relationship of childhood abuse and household dysfunction to many of the leading causes of death in adults: The Adverse Childhood Experiences (ACE) Study. *American Journal of Preventive Medicine*. https://doi.org/10.1016/S0749-3797(98)00017-8 ── 被 1 个节点引用
- Gratz, K. L. & Roemer, L. (2004). Multidimensional assessment of emotion regulation and dysregulation: Development, factor structure, and initial validation of the Difficulties in Emotion Regulation Scale. *Journal of Psychopathology and Behavioral Assessment*. https://doi.org/10.1023/B:JOBA.0000007455.08539.94 ── 被 1 个节点引用
- Green, M. C. & Brock, T. C. (2000). The role of transportation in the persuasiveness of public narratives. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/0022-3514.79.5.701 ── 被 1 个节点引用
- Gross, J. J. (1998). The emerging field of emotion regulation: An integrative review. *Review of General Psychology*. https://doi.org/10.1037/1089-2680.2.3.271 ── 被 6 个节点引用
- Gross, J. J. & John, O. P. (2003). Individual differences in two emotion regulation processes: Implications for affect, relationships, and well-being. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/0022-3514.85.2.348 ── 被 3 个节点引用
- Gross, J. J. (2015). Emotion regulation: Current status and future prospects. *Psychological Inquiry*. https://doi.org/10.1080/1047840X.2014.940781 ── 被 1 个节点引用
- Reinecke, L. (2009). Games and recovery: The use of video and computer games to recuperate from stress and strain. *Journal of Media Psychology*. https://doi.org/10.1027/1864-1105.21.3.126 ── 被 1 个节点引用
- Rose, A. J. (2002). Co-rumination in the friendships of girls and boys. *Child Development*. https://doi.org/10.1111/1467-8624.00509 ── 被 2 个节点引用
- Rupp, M. A. et al. (2017). Searching for affective and cognitive restoration: Examining the restorative effects of casual video game play. *Human Factors*. https://doi.org/10.1177/0018720817715360 ── 被 2 个节点引用
- Russell, J. A. (1980). A circumplex model of affect. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/h0077714 ── 被 3 个节点引用
- Ryan, R. M. et al. (2006). The motivational pull of video games: A self-determination theory approach. *Motivation and Emotion*. https://doi.org/10.1007/s11031-006-9051-8 ── 被 1 个节点引用
- Saarikallio, S. (2012). Development and validation of the Brief Music in Mood Regulation Scale (B-MMR). *Music Perception*. https://doi.org/10.1525/mp.2012.30.1.97 ── 被 2 个节点引用
- Samson, A. C. & Gross, J. J. (2012). Humour as emotion regulation: The differential consequences of negative versus positive humour. *Cognition and Emotion*. https://doi.org/10.1080/02699931.2011.585069 ── 被 2 个节点引用
- Sandstrom, G. M. & Dunn, E. W. (2014). Social interactions and well-being: The surprising power of weak ties. *Personality and Social Psychology Bulletin*. https://doi.org/10.1177/0146167214529799 ── 被 2 个节点引用
- Sheppes, G. et al. (2011). Emotion-regulation choice. *Psychological Science*. https://doi.org/10.1177/0956797611418350 ── 被 3 个节点引用
- Thompson, E. R. (2007). Development and validation of an internationally reliable short-form of the Positive and Negative Affect Schedule (PANAS). *Journal of Cross-Cultural Psychology*. https://doi.org/10.1177/0022022106297301 ── 被 1 个节点引用
- Villani, D. et al. (2018). Videogames for emotion regulation: A systematic review. *Games for Health Journal*. https://doi.org/10.1089/g4h.2017.0108 ── 被 1 个节点引用
- Watson, D. et al. (1988). Development and validation of brief measures of positive and negative affect: The PANAS scales. *Journal of Personality and Social Psychology*. https://doi.org/10.1037/0022-3514.54.6.1063 ── 被 3 个节点引用
- Webb, T. L. et al. (2012). Dealing with feeling: A meta-analysis of the effectiveness of strategies derived from the process model of emotion regulation. *Psychological Bulletin*. https://doi.org/10.1037/a0027600 ── 被 9 个节点引用
- Zillmann, D. (1988). Mood management through communication choices. *American Behavioral Scientist*. https://doi.org/10.1177/000276488031003005 ── 被 2 个节点引用
