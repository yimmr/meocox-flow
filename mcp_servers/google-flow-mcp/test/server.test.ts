import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createGoogleFlowServer } from "../src/server.js";

test("MCP server can be constructed without launching a browser", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "google-flow-mcp-server-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const instance = createGoogleFlowServer({
    browserExecutable: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    profileDir: path.join(directory, "profile"),
    stateFile: path.join(directory, "state.json"),
  });

  assert.ok(instance.server);
  assert.ok(instance.store);
  await instance.flow.close();
  instance.store.close();
});
