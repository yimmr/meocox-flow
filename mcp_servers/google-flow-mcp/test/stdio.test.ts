import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

test("stdio client discovers the expected MCP tools", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("dist/src/index.js")],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({ name: "google-flow-mcp-smoke", version: "0.1.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = new Set(tools.map((tool) => tool.name));
    for (const expected of [
      "project_create",
      "flow_start_login",
      "flow_confirm_login",
      "flow_inspect_page",
      "flow_download_asset",
      "flow_download_media",
      "flow_bind_asset",
      "flow_open_project",
      "flow_open_media",
      "flow_prepare_generation",
      "flow_submit_generation",
      "flow_wait_for_generation",
      "mcp_health_check",
      "media_validate_local",
      "state_backup",
    ]) {
      assert.ok(names.has(expected), `missing tool: ${expected}`);
    }
    assert.equal(tools.length, 22);
  } finally {
    await client.close();
  }
});
