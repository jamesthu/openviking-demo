# OpenCode + OpenViking Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal project-local OpenCode plugin that exposes core OpenViking tools and document how to run it with OpenCode Web.

**Architecture:** Keep OpenCode as the main UI and agent runtime. Add a project-local plugin under `.opencode/plugins/` that calls the OpenViking HTTP server for memory/resource browsing and search. Keep model configuration outside the project in `~/.openviking/ov.conf`.

**Tech Stack:** OpenCode local plugin API, TypeScript plugin file, OpenViking HTTP server, Markdown docs

---

### Task 1: Add project-local plugin scaffold

**Files:**
- Create: `.opencode/plugins/openviking-memory.ts`
- Create: `.opencode/README.md`

- [ ] **Step 1: Write the failing structural check**

Run:

```bash
test -f .opencode/plugins/openviking-memory.ts
```

Expected: exit code non-zero because the plugin file does not exist yet.

- [ ] **Step 2: Create the minimal plugin file**

Create a TypeScript plugin that exports `OpenVikingMemoryPlugin` and registers placeholder tools:

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

export const OpenVikingMemoryPlugin: Plugin = async () => {
  return {
    tool: {
      memsearch: tool({
        description: "Search OpenViking resources and memories",
        args: {},
        async execute() {
          return "not implemented"
        },
      }),
    },
  }
}
```

- [ ] **Step 3: Re-run structural check**

Run:

```bash
test -f .opencode/plugins/openviking-memory.ts
```

Expected: exit code `0`.

### Task 2: Implement OpenViking HTTP client helpers and tool definitions

**Files:**
- Modify: `.opencode/plugins/openviking-memory.ts`

- [ ] **Step 1: Write the failing content check**

Run:

```bash
rg -n "memread|membrowse|memcommit" .opencode/plugins/openviking-memory.ts
```

Expected: no matches because only the first placeholder tool exists.

- [ ] **Step 2: Implement minimal tool set**

Add:

- config loader from environment variables
- a small `fetchJson` helper
- tools `memsearch`, `memread`, `membrowse`, `memcommit`
- clear error messages when endpoint or auth is missing

- [ ] **Step 3: Re-run content check**

Run:

```bash
rg -n "memread|membrowse|memcommit" .opencode/plugins/openviking-memory.ts
```

Expected: all tool names are present.

### Task 3: Document local usage with OpenCode Web

**Files:**
- Modify: `README.md`
- Create: `.opencode/opencode.json`

- [ ] **Step 1: Write the failing config check**

Run:

```bash
test -f .opencode/opencode.json
```

Expected: exit code non-zero because the project config does not exist yet.

- [ ] **Step 2: Add minimal OpenCode config and usage docs**

Create a project-local `opencode.json` that allows the custom tools, and update `README.md` with:

- how OpenCode auto-loads `.opencode/plugins/*.ts`
- how to start `openviking-server`
- how to start `opencode web`
- where `OPENVIKING_CONFIG_FILE` and `OPENVIKING_API_KEY` fit

- [ ] **Step 3: Re-run config check**

Run:

```bash
test -f .opencode/opencode.json
```

Expected: exit code `0`.

### Task 4: Verify plugin shape and project structure

**Files:**
- Verify: `.opencode/plugins/openviking-memory.ts`
- Verify: `.opencode/opencode.json`
- Verify: `README.md`

- [ ] **Step 1: Run file discovery**

Run:

```bash
find .opencode -maxdepth 3 -type f | sort
```

Expected: plugin and config files are listed.

- [ ] **Step 2: Run content sanity checks**

Run:

```bash
rg -n "OpenVikingMemoryPlugin|memsearch|memread|membrowse|memcommit" .opencode/plugins/openviking-memory.ts README.md .opencode/opencode.json
```

Expected: plugin export, tool names, and usage references all appear.

- [ ] **Step 3: Manual runtime caveat**

State clearly that full runtime validation depends on the user having:

- OpenCode installed
- OpenViking server installed and running
- valid `~/.openviking/ov.conf`

This task is complete only after reporting what was verified locally and what still depends on the external runtime.
