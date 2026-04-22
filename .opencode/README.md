# OpenCode 本地插件

这个目录放项目级的 OpenCode 插件和配置。

当前包含：

- `plugins/openviking-memory.ts`

说明：

- OpenCode 会自动加载 `.opencode/plugins/*.ts`
- 这个插件当前临时写死使用项目根目录 `/home/yikun/coding/github/openviking-demo` 作为基准目录，再显式子进程调用 `./.venv/bin/python scripts/openviking_bridge.py ...`
- 模型配置放在项目根目录的 `ov.conf`
- OpenCode 项目级权限配置放在项目根目录的 `opencode.json`
- 如果 OpenViking 服务开启了鉴权，可以设置 `OPENVIKING_API_KEY`
- 导入资源后，通常先用 `membrowse` 查看真实可读 URI，再用 `memread`
