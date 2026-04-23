import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

type FilePartLike = {
  type: "file"
  url: string
  filename?: string
  mime: string
}

type MessageLike = {
  info?: {
    role?: string
  }
  parts?: Array<{ type?: string } & Record<string, unknown>>
}

type MaterializeInput = {
  projectRoot: string
  serverUrl: string | URL
  attachments: FilePartLike[]
  fetchImpl?: typeof fetch
}

type IngestCliArgsInput = {
  path?: string
  target_uri?: string
  wait?: boolean
}

function sanitizeFilename(filename: string | undefined, index: number): string {
  const raw = filename?.trim() || `upload-${index + 1}`
  return raw
    .replace(/[\\/]+/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/[^\w.\- ]+/g, "_")
}

export function resolveAttachmentUrl(serverUrl: string | URL, url: string): URL {
  return new URL(url, serverUrl)
}

export function collectUserFileParts(messages: MessageLike[]): FilePartLike[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.info?.role !== "user") continue
    return (message.parts ?? []).filter((part): part is FilePartLike => part.type === "file")
  }
  return []
}

export async function materializeAttachments({
  projectRoot,
  serverUrl,
  attachments,
  fetchImpl = fetch,
}: MaterializeInput): Promise<string[]> {
  const incomingDir = resolve(projectRoot, "materials/incoming")
  await mkdir(incomingDir, { recursive: true })

  const savedPaths: string[] = []

  for (const [index, attachment] of attachments.entries()) {
    const targetName = sanitizeFilename(attachment.filename, index)
    const targetPath = join(incomingDir, targetName)
    const response = await fetchImpl(resolveAttachmentUrl(serverUrl, attachment.url))

    if (!response.ok) {
      throw new Error(
        `Failed to download uploaded file ${attachment.filename ?? attachment.url}: HTTP ${response.status}`,
      )
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, buffer)
    savedPaths.push(targetPath)
  }

  return savedPaths
}

export function buildIngestCliArgs({
  path,
  target_uri,
  wait,
}: IngestCliArgsInput): string[] {
  const cliArgs = ["ingest", path || "materials/incoming"]
  if (target_uri) cliArgs.push("--target-uri", target_uri)
  if (wait) cliArgs.push("--wait")
  return cliArgs
}
