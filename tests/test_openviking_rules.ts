import test from "node:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { appendRuleContent, resolveRulePath } from "../.opencode/plugins/openviking-rules.ts"

test("resolveRulePath stores rule files inside .opencode/rules", () => {
  const target = resolveRulePath("/demo/project", "Legal QA")
  assert.equal(target, "/demo/project/.opencode/rules/legal-qa.md")
})

test("appendRuleContent creates a rule file when it does not exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "ov-rules-"))

  try {
    const target = await appendRuleContent({
      projectRoot: root,
      ruleName: "Legal QA",
      content: "法规问答必须附具体 URI。",
      now: () => new Date("2026-05-07T09:00:00Z"),
    })

    const saved = await readFile(target, "utf8")
    assert.equal(target, join(root, ".opencode/rules/legal-qa.md"))
    assert.match(saved, /^# Rule: Legal QA\n\n## Scope\n/)
    assert.match(saved, /## Updates\n\n### 2026-05-07T09:00:00\.000Z\n法规问答必须附具体 URI。\n$/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("appendRuleContent appends to an existing rule file", async () => {
  const root = await mkdtemp(join(tmpdir(), "ov-rules-"))

  try {
    const target = join(root, ".opencode/rules/fund-report.md")
    await mkdir(join(root, ".opencode/rules"), { recursive: true })
    await writeFile(
      target,
      "# Rule: fund-report\n\n## Scope\n已有说明\n\n## Updates\n\n### 2026-05-06T00:00:00.000Z\n第一条\n",
      "utf8",
    )

    await appendRuleContent({
      projectRoot: root,
      ruleName: "fund-report",
      content: "第二条",
      now: () => new Date("2026-05-07T10:30:00Z"),
    })

    const saved = await readFile(target, "utf8")
    assert.match(saved, /### 2026-05-06T00:00:00\.000Z\n第一条\n/)
    assert.match(saved, /### 2026-05-07T10:30:00\.000Z\n第二条\n$/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
