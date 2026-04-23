import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import {
  buildIngestCliArgs,
  collectUserFileParts,
  materializeAttachments,
} from "./openviking-attachments.ts"

const bridgeScript = "scripts/openviking_bridge.py"
const bridgePython = ".venv/bin/python"
const projectRoot = "/home/yikun/coding/github/openviking-demo"

async function runBridge(
  cwd: string,
  context: { sessionID?: string },
  args: string[],
) {
  const pythonPath = resolve(cwd, bridgePython)
  const scriptPath = resolve(cwd, bridgeScript)

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", (error) => {
      reject(
        new Error(
          `OpenViking bridge failed to start: ${error.message}\npython=${pythonPath}\nscript=${scriptPath}`,
        ),
      )
    })

    child.on("close", (code) => {
      const output = stdout.trim()
      const err = stderr.trim()
      if (code === 0) {
        resolve(output || err || '{"ok": true}')
        return
      }
      reject(
        new Error(
          [
            `OpenViking bridge exited with code ${code}`,
            `python=${pythonPath}`,
            `script=${scriptPath}`,
            args.length ? `args=${JSON.stringify(args)}` : "",
            output ? `stdout:\n${output}` : "",
            err ? `stderr:\n${err}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      )
    })
  })
}

export const OpenVikingMemoryPlugin: Plugin = async ({
  client,
  worktree,
  directory,
  serverUrl,
}) => {
  const cwd = projectRoot

  async function stageLatestUserUploads(sessionID?: string) {
    if (!sessionID) {
      return {
        ok: true,
        saved_paths: [],
        message: "No active session; nothing to stage.",
      }
    }

    const response = await client.session.messages({
      path: {
        id: sessionID,
      },
      query: {
        directory: cwd,
      },
    })

    if (response.error) {
      throw new Error(`Failed to load session messages: ${JSON.stringify(response.error)}`)
    }

    const attachments = collectUserFileParts(response.data ?? [])
    if (attachments.length === 0) {
      return {
        ok: true,
        saved_paths: [],
        message: "No file attachments found on the latest user message.",
      }
    }

    const savedPaths = await materializeAttachments({
      projectRoot: cwd,
      serverUrl,
      attachments,
    })

    return {
      ok: true,
      saved_paths: savedPaths,
      count: savedPaths.length,
    }
  }

  return {
    tool: {
      ov_stage_uploads: tool({
        description:
          "把当前会话里最新一条用户消息上传的附件落盘到项目的 materials/incoming/ 目录，并返回具体本地路径。先用这个工具拿到 saved_paths，再把这些路径传给 ov_ingest，会比每次整目录导入更稳。",
        args: {},
        async execute(_args, context) {
          const result = await stageLatestUserUploads(context.sessionID)
          return JSON.stringify(result, null, 2)
        },
      }),
      ov_ingest: tool({
        description:
          "把指定本地文件或目录导入到 OpenViking 资源库。默认导入 materials/incoming。不要传项目根目录。若文件来自 Web 上传，建议先用 ov_stage_uploads 落盘，再把返回的 saved_paths 传给这个工具，避免每次整目录导入。",
        args: {
          path: tool.schema
            .string()
            .optional()
            .describe("要导入的本地文件或目录路径。默认是 materials/incoming；如果前一步用了 ov_stage_uploads，优先传它返回的 saved_paths 里的具体路径"),
          target_uri: tool.schema
            .string()
            .optional()
            .describe("可选的目标 URI，建议使用 resources 目录并以 / 结尾，例如 viking://resources/project/"),
          wait: tool.schema
            .boolean()
            .optional()
            .describe("是否等待 OpenViking 完成处理"),
        },
        async execute(args, context) {
          const cliArgs = buildIngestCliArgs(args)
          return runBridge(cwd, context, cliArgs)
        },
      }),
      memsearch: tool({
        description:
          "在 OpenViking 中搜索资源、记忆和技能。这个工具搜索的是 OpenViking 里的内容，不接收本地路径；如需导入本地文件请使用 ov_ingest。查询资源时，通常建议把范围限定在 viking://resources/。命中后建议配合 membrowse 和 memread 下钻。",
        args: {
          query: tool.schema.string().describe("搜索问题或关键词"),
          target_uri: tool.schema
            .string()
            .optional()
            .describe("可选的 OpenViking URI 前缀。搜索资源时优先使用 viking://resources/；不要传 /home/... 这种本地路径"),
        },
        async execute(args, context) {
          const cliArgs = ["search", args.query]
          if (args.target_uri) cliArgs.push("--target-uri", args.target_uri)
          return runBridge(cwd, context, cliArgs)
        },
      }),
      memgrep: tool({
        description:
          "在 OpenViking 指定 URI 范围内做精确文本匹配。适合证券代码、基金代码、人名、标题等字面检索。这里只能传 viking:// URI，不能传本地路径。查询资源正文时，优先使用 viking://resources/；在 viking:// 根作用域下 grep 可能扫描不到任何文件。",
        args: {
          uri: tool.schema
            .string()
            .describe("搜索范围的 viking:// URI。查资源正文时优先使用 viking://resources/ 或其子目录；不要直接用 viking:// 根作用域，也不要传本地路径"),
          pattern: tool.schema
            .string()
            .describe("要精确匹配的文本，例如 510630"),
          case_insensitive: tool.schema
            .boolean()
            .optional()
            .describe("是否大小写不敏感"),
        },
        async execute(args, context) {
          const cliArgs = ["grep", args.uri, args.pattern]
          if (args.case_insensitive) cliArgs.push("--case-insensitive")
          return runBridge(cwd, context, cliArgs)
        },
      }),
      memglob: tool({
        description:
          "按路径或文件名模式在 OpenViking 中查找资源。适合先按资源树定位候选文件，再配合 memread 或 memgrep 使用。查资源时通常建议把范围放在 viking://resources/。",
        args: {
          pattern: tool.schema
            .string()
            .describe("glob 模式，例如 *华夏红利* 或 *.md"),
          uri: tool.schema
            .string()
            .optional()
            .describe("可选的 viking:// 搜索范围。查资源时优先使用 viking://resources/；不要传本地路径"),
        },
        async execute(args, context) {
          const cliArgs = ["glob", args.pattern]
          if (args.uri) cliArgs.push("--uri", args.uri)
          return runBridge(cwd, context, cliArgs)
        },
      }),
      memread: tool({
        description:
          "读取 OpenViking 中某个 URI 的内容。这里只能传 viking:// URI，不能传本地文件路径。若资源根节点不可直接读取，先用 membrowse 找到内部真实叶子 URI 再读。",
        args: {
          uri: tool.schema
            .string()
            .describe("目标 viking:// URI，例如 viking://resources/project/doc.txt/doc.md；不要传 /home/... 这种本地路径"),
          level: tool.schema
            .enum(["auto", "abstract", "overview", "read"])
            .optional()
            .describe("读取层级"),
        },
        async execute(args, context) {
          const cliArgs = ["read", args.uri]
          if (args.level) cliArgs.push("--level", args.level)
          return runBridge(cwd, context, cliArgs)
        },
      }),
      membrowse: tool({
        description:
          "浏览 OpenViking 的目录结构。这里只能传 viking:// URI，不能传本地文件路径。导入资源后优先用它确认真实可读 URI；很多资源节点会展开成目录而不是直接文件。本地文件导入请使用 ov_ingest。",
        args: {
          uri: tool.schema
            .string()
            .describe("目标目录的 viking:// URI，例如 viking://resources/ 或 viking://resources/project/；不要传 /home/... 这种本地路径"),
          view: tool.schema
            .enum(["list", "tree", "stat"])
            .optional()
            .describe("浏览模式"),
          recursive: tool.schema
            .boolean()
            .optional()
            .describe("是否递归浏览"),
          simple: tool.schema
            .boolean()
            .optional()
            .describe("是否使用简化输出"),
        },
        async execute(args, context) {
          const cliArgs = ["browse", args.uri]
          if (args.view) cliArgs.push("--view", args.view)
          if (args.recursive) cliArgs.push("--recursive")
          if (args.simple) cliArgs.push("--simple")
          return runBridge(cwd, context, cliArgs)
        },
      }),
      memcommit: tool({
        description: "把当前 OpenCode 会话同步提交到 OpenViking。",
        args: {
          note: tool.schema
            .string()
            .optional()
            .describe("可选备注，会先作为用户消息写入 OpenViking session"),
        },
        async execute(args, context) {
          const sessionID = context.sessionID ?? "default-session"
          const cliArgs = ["commit", "--session-id", sessionID]
          if (args.note) cliArgs.push("--note", args.note)
          return runBridge(cwd, context, cliArgs)
        },
      }),
    },
  }
}
