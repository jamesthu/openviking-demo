# OpenCode + OpenViking 最小集成工作区

这个工作区刻意保持为最小结构。

目标：
- 把原始材料放进仓库
- 让 OpenViking 负责解析、抽取、索引和检索
- 通过 OpenCode 作为主要交互入口使用这些上下文能力

## 目录结构

- `materials/incoming/`：放原始材料
- `questions/questions.txt`：每行写一个真实问题
- `runs/`：保存运行记录、输出结果和观察结论
- `.opencode/plugins/`：项目级 OpenCode 插件
- `scripts/openviking_bridge.py`：OpenCode 调用 OpenViking 的桥接脚本

## 你需要准备什么

- 原始文件即可
- 可选：删掉明显损坏或明显无关的文件

你不需要自己做这些事：
- 手工切 chunk
- 手工写摘要
- 手工生成 embedding
- 先搭一套自定义预处理流水线

## OpenViking 模型配置

你前面已经说明，后续会自己配置模型。

`vlm` 和 `embedding` 主要配置在：
- `./ov.conf`

仓库里提供的是模板文件：
- `./ov.conf.example`

建议你本地复制一份再填写真实密钥：

```bash
cp ov.conf.example ov.conf
```

OpenViking 通过下面这个环境变量读取配置：
- `OPENVIKING_CONFIG_FILE`

常见初始化方式：

```bash
export OPENVIKING_CONFIG_FILE="$PWD/ov.conf"
openviking-server doctor
```

后续你会在项目根目录的 `ov.conf` 里配置这些内容：
- `embedding`：`provider`、`api_base`、`api_key`、`model`、`dimension`
- `vlm`：`provider`、`api_base`、`api_key`、`model`
- `storage.workspace`：OpenViking 的工作目录

说明：
- 问答时通常也会依赖 `vlm`
- 这个项目不在应用层额外管理一套独立 `llm` 配置

## OpenCode Web

OpenCode 已经自带 Web 界面，通常不需要在这个项目里重复实现一个聊天网页。

启动方式：

```bash
opencode web
```

如果要固定端口：

```bash
opencode web --port 4096
```

这个项目后续更适合做的是：
- 原始文件到 OpenViking 的导入链路
- OpenCode 与 OpenViking 的本地集成
- 让 OpenCode 可以消费 OpenViking 中的上下文与检索结果

## 当前实现

当前已经落了一个最小集成骨架：

- OpenCode 项目级插件：`.opencode/plugins/openviking-memory.ts`
- Python bridge：`scripts/openviking_bridge.py`
- `uv` 环境配置：`pyproject.toml`

插件目前暴露了这些工具：

- `ov_stage_uploads`：把当前会话最新一条用户消息里的上传附件落盘到 `materials/incoming/`
- `ov_ingest`：把本地文件或目录导入 OpenViking
- `memsearch`：搜索 OpenViking
- `memgrep`：在指定 URI 范围内做精确文本匹配
- `memglob`：按路径或文件名模式查找资源
- `memread`：读取指定 `viking://` URI
- `membrowse`：浏览 OpenViking 目录
- `memcommit`：把当前 OpenCode 会话提交到 OpenViking

## 本地运行

1. 启动 OpenViking 服务

```bash
export OPENVIKING_CONFIG_FILE="$PWD/ov.conf"
openviking-server --config "$PWD/ov.conf"
```

2. 在当前项目准备 Python 环境

```bash
UV_CACHE_DIR=/tmp/uv-cache uv sync
```

3. 启动 OpenCode Web

```bash
opencode web --port 4096
```

4. 在 OpenCode 里直接使用这些工具

如果文件来自 Web 上传，推荐先落盘再导入：

- `ov_stage_uploads`
  返回：`saved_paths`

然后再导入具体路径：

- `ov_ingest`
  默认导入：`materials/incoming`
  推荐传入：`path=<ov_stage_uploads 返回的具体路径>`
  可选：`target_uri=viking://resources/openviking-demo/`
  可选：`wait=true`

然后再用：

- `memsearch`
- `memgrep`
- `memglob`
- `memread`
- `membrowse`

可选环境变量：

- `OPENVIKING_ENDPOINT`：默认 `http://127.0.0.1:1933`
- `OPENVIKING_API_KEY`
- `OPENVIKING_AGENT_ID`
- `OPENVIKING_TIMEOUT`

## 下一步

等你把文件放进 `materials/incoming/` 后，我们就可以开始做 OpenViking 导入链路，并进一步接到 OpenCode 的使用流里。
