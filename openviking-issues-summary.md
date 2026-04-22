# OpenViking 当前未解决问题梳理

更新时间：2026-04-22

参考入口：
- 仓库主页：https://github.com/volcengine/OpenViking
- Open issues 列表：https://github.com/volcengine/OpenViking/issues

说明：
- 这份文档不是把所有 open issue 逐条罗列，而是按“对实际使用影响最大”的主题做归纳。
- 我查看时，GitHub issues 页面显示 OpenViking 仍有约 `101` 个未关闭 issue。
- 下面列出的 issue 都是我实际查过、当前仍处于 Open 状态的问题或需求；其中一部分是 bug，一部分是 feature / question，但它们都能反映 OpenViking 当前的产品边界。

## 总体结论

如果先说结论，我认为 OpenViking 当前最明显的问题集中在 5 类：

- 检索与 recall 稳定性还不够强
- memory extraction 与 session 状态一致性仍有缺口
- 导入链路在成本控制和异常行为上有风险
- 平台兼容性还不够成熟，尤其是 Windows / Python 新版本
- 生产化能力仍在补齐，多租户、多机部署、扩展性还不够完善

换句话说，OpenViking 已经很像一个“很有潜力的上下文数据库原型/平台”，但如果把它当成一个“边界清晰、稳定低风险的生产基础设施”，从当前公开 issue 看还需要继续打磨。

## 1. 检索与 Recall 问题

### 1.1 搜索结果不稳定，版本升级后也可能出问题

- #1576 `[Bug]: version0.3.9 search issue`
  链接：https://github.com/volcengine/OpenViking/issues/1576
  观察：用户在 `0.3.9` 上按官方用法提交 session、等待处理、再做 search，结果仍然搜不到预期记忆。这说明搜索链路在新版本里依然可能出现“流程跑完但结果为空”的问题。

### 1.2 auto recall 效果不佳

- #1509 `[Question]: 每一轮auto recall的结果非常差`
  链接：https://github.com/volcengine/OpenViking/issues/1509
  观察：虽然 issue 类型是 `question`，但它反映的是一个实际能力问题：auto recall 在真实使用里效果不够好，说明“召回质量”仍然是明显短板。

### 1.3 插件 / 上层工具与检索 API 存在版本错配

- #1189 `[Bug]: OpenClaw memory_recall tool returns 404 — API path mismatch with OpenViking 0.3.2`
  链接：https://github.com/volcengine/OpenViking/issues/1189
  观察：issue 里明确写到插件调用了不存在的 `/api/v1/memory/recall`，而正确接口其实是 `/api/v1/search/search`。这说明 OpenViking 周边生态在版本演进时，API 契约稳定性还不够强。

### 1.4 memory 语义队列会卡住

- #864 `Memory semantic queue stalls on context_type=memory jobs; pending backlog grows while processed stays at 0`
  链接：https://github.com/volcengine/OpenViking/issues/864
  观察：该 issue 描述 memory 写入成功，但后台语义队列长期 pending，`processed` 一直是 0，说明 recall / memory 可用性不仅受前台接口影响，也受后台处理链稳定性影响。

## 2. Memory Extraction / Session 一致性问题

### 2.1 extraction 依赖模型按 JSON 返回，鲁棒性不够

- #1541 `[Bug]: Memory extraction fails - LLM returns plain text instead of JSON structure`
  链接：https://github.com/volcengine/OpenViking/issues/1541
  观察：issue 明确指出 `tool_choice="auto"` 会让模型返回普通文本，而不是结构化 JSON；一旦这样，解析失败，最终结果就是 `Extracted 0 memories`。这说明 extraction 对模型输出格式的依赖很强。

### 2.2 模型执行成功，但 memory 仍可能不落盘

- #1410 `[Bug] Memory extraction LLM executes successfully but memories_extracted returns empty dict (qwen3:1.7b)`
  链接：https://github.com/volcengine/OpenViking/issues/1410
  观察：该 issue 的关键点不是模型没跑，而是模型已经跑了、archive 也生成了，但最后 `memories_extracted` 仍然是空。这比“直接报错”更麻烦，因为它会让上层误以为流程成功。

- #630 `[Question]: OpenClaw + OpenViking Memory Extraction Issue (0 Memories Returned)`
  链接：https://github.com/volcengine/OpenViking/issues/630
  观察：issue 里模型 API 单测都正常，但实际接入 OpenViking 后出现 `memory_store completed but extract returned 0 memories` 和 `Memory extraction failed: Connection error`。这说明 extraction 链在集成态下仍有不小的不确定性。

### 2.3 Session API 与文件状态可能不一致

- #1550 `Session API reports zero message/commit counts even though archive and fallback files are written`
  链接：https://github.com/volcengine/OpenViking/issues/1550
  观察：这个问题很典型。底层文件已经写了，但 Session API 的 message/commit 计数仍然显示 0。对上层产品来说，这种“数据似乎在，但状态看起来不在”的问题会直接影响判断逻辑。

- #1498 `[Question]: memory extract issue?`
  链接：https://github.com/volcengine/OpenViking/issues/1498
  观察：虽然标题较泛，但它和 commit / extract 边界状态相关，说明这条链路的稳定性在用户侧已经反复暴露。

### 2.4 memory 分层设计与实际行为存在偏差

- #1549 `[Bug]: events memory L2 stores raw dialogue while L0/L1 are unreachable by vector retrieval, contradicting design doc`
  链接：https://github.com/volcengine/OpenViking/issues/1549
  观察：这个问题触及 OpenViking 的核心卖点之一，也就是 memory 分层。如果设计文档、实际落盘结构、向量可召回层级三者不一致，那会直接削弱它“分层上下文数据库”的可信度。

## 3. 导入 / 解析 / 成本控制问题

### 3.1 导入大文本时 token 消耗可能失控

- #1595 `[Bug]: add-resource recursively uses VLM for large text assets during import and can consume tens of millions of tokens unexpectedly`
  链接：https://github.com/volcengine/OpenViking/issues/1595
  观察：这是一个很现实的问题。OpenViking 在导入大文本时，如果递归触发 VLM 处理，可能意外消耗极大量 token。对真实业务来说，这不是“小优化”，而是可能直接造成成本事故。

- #744 `[Tracking]: Token 消耗与成本优化问题汇总 / Token Consumption & Cost Optimization Tracker`
  链接：https://github.com/volcengine/OpenViking/issues/744
  观察：官方单独开了 tracking issue，说明“成本不可控”不是个别用户偶发问题，而是一个持续存在的系统性主题。

### 3.2 特定资源来源 / 模型平台兼容性仍有限

- #1625 `[Bug]: Azure DevOps repository URLs are not imported as Git repositories`
  链接：https://github.com/volcengine/OpenViking/issues/1625
  观察：说明资源导入虽然覆盖面广，但并不是所有仓库来源都稳定支持，企业常见源也可能踩坑。

- #1582 `[Bug]: 接入豆包模型平台，add 文档的时候出错。`
  链接：https://github.com/volcengine/OpenViking/issues/1582
  观察：这表明导入链路不仅依赖 OpenViking 自己，也依赖模型平台兼容性；不同 provider 下的稳定性并不一致。

## 4. 平台兼容性问题

### 4.1 Windows 兼容性仍有明显坑

- #1538 `[Bug] Windows + Python 3.12: openviking 0.3.8 installs ragfs_python.cp310-win_amd64.pyd and openviking-server fails with DLL load failed`
  链接：https://github.com/volcengine/OpenViking/issues/1538
  观察：这是非常直接的安装/运行问题。`openviking-server` 启动后又因 native 模块加载失败退出，说明 Windows 平台体验还不稳。

### 4.2 Python 新版本支持滞后

- #1612 `[Bug]: install not support python 3.14`
  链接：https://github.com/volcengine/OpenViking/issues/1612
  观察：这反映出 OpenViking 的运行时支持策略还没有完全跟上 Python 新版本，对新环境用户不够友好。

## 5. 生产化能力仍在补齐

这类问题不一定都是 bug，但它们直接说明：如果你要把 OpenViking 用到多人、多环境、长期运行场景，目前还要额外评估很多边界。

### 5.1 多租户与租户隔离能力还不够成熟

- #1216 `[Feature]: Openclaw plugin supports X-OpenViking-Account and X-OpenViking-User`
  链接：https://github.com/volcengine/OpenViking/issues/1216
  观察：issue 里明确提到即便认证成功，数据仍可能落到 `default` tenant。说明多租户支持并不是“只是少个小功能”，而是会影响生产正确性。

### 5.2 多机部署方案仍在需求阶段

- #1618 `[Feature]: 多机部署方案`
  链接：https://github.com/volcengine/OpenViking/issues/1618
  观察：这说明 OpenViking 当前更偏单机 / 本地 / 实验环境友好，多机生产部署还没有形成成熟标准方案。

### 5.3 扩展性诉求仍然明显

- #1614 `[Feature]: 扩展性`
  链接：https://github.com/volcengine/OpenViking/issues/1614
  观察：用户已经开始集中反馈扩展性问题，说明它在复杂场景里可能还不够好改、好接、好演进。

### 5.4 embedding 模型迁移体验还不够顺滑

- #1523 `[Feature] Improve embedder model migration experience`
  链接：https://github.com/volcengine/OpenViking/issues/1523
  观察：这说明模型切换和迁移目前还有明显摩擦，尤其对需要持续迭代 embedding 配置的团队来说，会增加维护成本。

## 6. 我对 OpenViking 当前问题的归纳

如果从产品形态上概括，我会这样看：

### 已经比较有特色的部分

- 把非结构化材料组织成 `viking://` 风格的上下文文件系统
- 资源树浏览、分层内容、抽象层内容这些设计很有辨识度
- 作为 Agent 的 context engine / context database，这个方向是成立的

### 当前最容易踩坑的部分

- 搜索、recall、memory extraction 的结果不总是稳定、可预测
- session / memory 的“状态一致性”还有不少边界问题
- 导入行为可能和直觉不完全一致，而且成本风险需要额外留意
- 平台兼容性和生产部署能力仍在补课

## 7. 简短结论

一句话总结：

> OpenViking 当前最有价值的是“把非结构化材料组织成可浏览、可分层消费的上下文系统”；但它目前最需要继续打磨的，是“检索质量、memory extraction 稳定性、状态一致性，以及生产化边界”。

如果你的目标是调研、原型验证、理解上下文数据库范式，它很值得继续试。
如果你的目标是马上当成低风险生产底座来用，那目前最好保留更谨慎的预期。
