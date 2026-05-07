import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

type AppendRuleContentInput = {
  projectRoot: string
  ruleName: string
  content: string
  now?: () => Date
}

function normalizeRuleName(ruleName: string): string {
  const normalized = ruleName
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  if (!normalized) {
    throw new Error("rule_name must contain at least one letter or number")
  }

  return normalized
}

export function resolveRulePath(projectRoot: string, ruleName: string): string {
  return resolve(projectRoot, ".opencode/rules", `${normalizeRuleName(ruleName)}.md`)
}

function buildInitialRuleContent(ruleName: string, timestamp: string, content: string): string {
  return [
    `# Rule: ${ruleName.trim()}`,
    "",
    "## Scope",
    "User-maintained business retrieval and answering rule.",
    "",
    "## Updates",
    "",
    `### ${timestamp}`,
    content.trim(),
    "",
  ].join("\n")
}

export async function appendRuleContent({
  projectRoot,
  ruleName,
  content,
  now = () => new Date(),
}: AppendRuleContentInput): Promise<string> {
  const rulePath = resolveRulePath(projectRoot, ruleName)
  const timestamp = now().toISOString()
  const trimmedContent = content.trim()

  if (!trimmedContent) {
    throw new Error("content must not be empty")
  }

  await mkdir(dirname(rulePath), { recursive: true })

  try {
    const existing = await readFile(rulePath, "utf8")
    const separator = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n"
    const updateBlock = [`### ${timestamp}`, trimmedContent, ""].join("\n")
    await writeFile(rulePath, `${existing}${separator}${updateBlock}`, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }

    await writeFile(rulePath, buildInitialRuleContent(ruleName, timestamp, trimmedContent), "utf8")
  }

  return rulePath
}
