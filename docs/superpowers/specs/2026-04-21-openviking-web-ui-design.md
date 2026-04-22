# OpenCode + OpenViking 集成设计

**目标**

构建一个本地单用户的最小集成工程，让用户把原始文件导入 OpenViking，由 OpenViking 负责上下文处理，并通过 OpenCode 自带的 Web 界面作为主要交互入口使用这些材料。

**范围**

- 仅限本地使用
- 单用户
- 所有上传文件共用一个知识库
- 重点实现 OpenViking 导入与接入链路
- 通过 OpenCode Web 作为主要交互界面
- 保留最少的本地辅助结构用于放材料、问题和运行记录

**不在当前范围内**

- 多用户账号
- 权限控制
- 多知识库切换
- 高级数据集管理
- 自己重做聊天网页界面
- 模型配置界面
- 手工预处理流水线

**用户流程**

1. 用户把原始材料放入本地工作区。
2. 集成层将这些文件交给 OpenViking 导入。
3. OpenViking 完成解析、抽取、索引和检索准备。
4. 用户启动 OpenCode Web。
5. 用户通过 OpenCode 围绕共享知识库提问和交互。
6. 后续如果需要，可在 OpenCode 侧观察或扩展更强的 Agent 使用方式。

**架构**

- OpenViking 负责资源导入、解析、抽取、索引、检索和上下文组织。
- OpenCode 负责主要交互体验，包括 Web 界面和后续可能的 Agent 工作流。
- 这个项目只实现两者之间的最小集成层，而不是重做完整产品界面。
- 应用本身不直接管理 `vlm` 和 `embedding` 设置；这些配置保留在 `~/.openviking/ov.conf` 中，通过 `OPENVIKING_CONFIG_FILE` 读取。

**主要组成部分**

- 原始材料目录
- OpenViking 导入链路
- OpenCode Web 交互入口
- 运行记录与观察结果目录

**数据处理方式**

- 用户提供原始文件，不先走手工预处理流程。
- 系统只做最少的导入前处理：保存文件、避免明显路径问题，然后把文件交给 OpenViking。
- 所有成功导入的文件都归入同一个共享知识库。

**错误处理**

- 导入失败时，要标记对应文件并保留错误信息。
- OpenCode 使用阶段如果问答失败，需要能区分是 OpenCode 问题、OpenViking 检索问题，还是模型配置问题。
- 如果 OpenViking 配置缺失或无效，系统需要给出明确提示，告诉用户应去哪里配置。

**测试重点**

- 文件导入入口
- 自动导入触发
- 导入状态与错误记录
- OpenCode 接入前的可用性验证
- OpenViking 配置缺失时的处理

**配置**

模型相关设置由用户在应用外部完成：

- `~/.openviking/ov.conf`
- `OPENVIKING_CONFIG_FILE`

OpenViking 配置里预期会涉及这些区域：

- `storage.workspace`
- `embedding`
- `vlm`

OpenCode Web 使用方式：

- `opencode web`
- 可选端口：`opencode web --port 4096`
