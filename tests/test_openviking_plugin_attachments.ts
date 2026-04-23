import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  buildIngestCliArgs,
  collectUserFileParts,
  materializeAttachments,
  resolveAttachmentUrl,
} from "../.opencode/plugins/openviking-attachments.ts"

test("collectUserFileParts returns only file parts from the latest user message", () => {
  const messages = [
    {
      info: { role: "user" },
      parts: [
        { type: "text", text: "first" },
        { type: "file", url: "/api/file/old", filename: "old.txt", mime: "text/plain" },
      ],
    },
    {
      info: { role: "assistant" },
      parts: [
        { type: "file", url: "/api/file/assistant", filename: "assistant.txt", mime: "text/plain" },
      ],
    },
    {
      info: { role: "user" },
      parts: [
        { type: "text", text: "latest" },
        { type: "file", url: "/api/file/new-a", filename: "a.txt", mime: "text/plain" },
        { type: "file", url: "/api/file/new-b", filename: "b.md", mime: "text/markdown" },
      ],
    },
  ]

  assert.deepEqual(
    collectUserFileParts(messages).map((part) => part.filename),
    ["a.txt", "b.md"],
  )
})

test("resolveAttachmentUrl resolves relative urls against the opencode server url", () => {
  assert.equal(
    resolveAttachmentUrl("http://127.0.0.1:4096/", "/api/file/123").toString(),
    "http://127.0.0.1:4096/api/file/123",
  )
  assert.equal(
    resolveAttachmentUrl("http://127.0.0.1:4096/", "https://files.example.com/demo.pdf").toString(),
    "https://files.example.com/demo.pdf",
  )
})

test("materializeAttachments writes uploaded files into materials/incoming", async () => {
  const root = await mkdtemp(join(tmpdir(), "ov-attachments-"))

  try {
    const fetchCalls: string[] = []
    const paths = await materializeAttachments(
      {
        projectRoot: root,
        serverUrl: "http://127.0.0.1:4096/",
        attachments: [
          {
            url: "/api/file/one",
            filename: "alpha.txt",
            mime: "text/plain",
          },
          {
            url: "https://files.example.com/two",
            filename: "nested/beta.md",
            mime: "text/markdown",
          },
        ],
        fetchImpl: async (input) => {
          const url = String(input)
          fetchCalls.push(url)
          return new Response(`payload:${url}`, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          })
        },
      },
    )

    assert.equal(fetchCalls[0], "http://127.0.0.1:4096/api/file/one")
    assert.equal(fetchCalls[1], "https://files.example.com/two")
    assert.equal(paths.length, 2)

    const first = await readFile(paths[0], "utf8")
    const second = await readFile(paths[1], "utf8")
    assert.equal(first, "payload:http://127.0.0.1:4096/api/file/one")
    assert.equal(second, "payload:https://files.example.com/two")
    assert.match(paths[0], /materials\/incoming\/alpha\.txt$/)
    assert.match(paths[1], /materials\/incoming\/nested_beta\.md$/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("buildIngestCliArgs defaults to materials/incoming", () => {
  assert.deepEqual(buildIngestCliArgs({}), ["ingest", "materials/incoming"])
})

test("buildIngestCliArgs uses explicit path and preserves flags", () => {
  assert.deepEqual(
    buildIngestCliArgs({
      path: "materials/incoming/demo.txt",
      target_uri: "viking://resources/demo/demo.txt",
      wait: true,
    }),
    [
      "ingest",
      "materials/incoming/demo.txt",
      "--target-uri",
      "viking://resources/demo/demo.txt",
      "--wait",
    ],
  )
})
