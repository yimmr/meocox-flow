import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StateStore } from "../src/state.js";

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "google-flow-mcp-test-"));
  const store = new StateStore(path.join(directory, "state.sqlite"));
  return { directory, store };
}

test("creating a project establishes a fresh-login checkpoint in SQLite", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => { store.close(); return rm(directory, { recursive: true, force: true }); });
  const project = await store.createProject({
    title: "演示", brief: "八秒产品镜头", durationSeconds: 8, aspectRatio: "9:16", language: "zh-CN",
  });
  const state = await store.read();
  assert.equal(state.version, 2);
  assert.equal(state.projects[0].id, project.id);
  assert.equal(state.projects[0].title, "演示");
  assert.equal(state.auth.status, "awaiting_user_fresh_sign_in");
  assert.equal(store.health().integrity, "ok");
  assert.equal(store.health().journalMode, "wal");
});

test("job creation is idempotent and failed retries get a new attempt", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => { store.close(); return rm(directory, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Demo", brief: "", language: "zh-CN" });
  const key = `${project.id}:video:0:1`;
  const first = await store.createJob({ projectId: project.id, operation: "video", idempotencyKey: key, prompt: "A slow push-in" });
  const duplicate = await store.createJob({ projectId: project.id, operation: "video", idempotencyKey: key, prompt: "Do not replace" });
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.job.id, first.job.id);
  await store.updateJob(first.job.id, { state: "failed", error: "provider failed" });
  const retry = await store.createJob({ projectId: project.id, operation: "video", idempotencyKey: key, prompt: "A slow push-in" });
  assert.equal(retry.reused, false);
  assert.equal(retry.job.attempt, 2);
});

test("queued writes remain durable and valid", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => { store.close(); return rm(directory, { recursive: true, force: true }); });
  await Promise.all([
    store.createProject({ title: "A", brief: "", language: "zh-CN" }),
    store.createProject({ title: "B", brief: "", language: "zh-CN" }),
    store.createProject({ title: "C", brief: "", language: "zh-CN" }),
  ]);
  assert.equal((await store.read()).projects.length, 3);
  assert.equal(store.health().integrity, "ok");
});

test("legacy JSON state migrates once into SQLite", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "google-flow-mcp-migration-"));
  const legacyPath = path.join(directory, "state.json");
  const databasePath = path.join(directory, "state.sqlite");
  const now = new Date().toISOString();
  await writeFile(legacyPath, JSON.stringify({
    version: 1,
    auth: { status: "ready" },
    projects: [{ id: "11111111-1111-4111-8111-111111111111", title: "旧项目", brief: "中文状态", language: "zh-CN", stage: "draft", status: "active", createdAt: now, updatedAt: now }],
    jobs: [],
  }), "utf8");
  const store = new StateStore(databasePath, legacyPath);
  t.after(() => { store.close(); return rm(directory, { recursive: true, force: true }); });
  const state = await store.read();
  assert.equal(state.version, 2);
  assert.equal(state.projects[0].title, "旧项目");
  assert.equal(state.assets.length, 0);
});

test("invalid terminal job transitions are rejected and completion clears errors", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => { store.close(); return rm(directory, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Demo", brief: "", language: "zh-CN" });
  const created = await store.createJob({ projectId: project.id, operation: "video", idempotencyKey: `${project.id}:video:0:1` });
  await assert.rejects(() => store.updateJob(created.job.id, { state: "complete" }), /Invalid job transition/);
  await store.updateJob(created.job.id, { state: "prepared" });
  await store.updateJob(created.job.id, { state: "submitted" });
  await store.updateJob(created.job.id, { state: "generating", error: "transient" });
  const complete = await store.updateJob(created.job.id, { state: "complete", providerMediaId: "media-1" });
  assert.equal(complete.error, undefined);
  assert.ok(complete.completedAt);
});

test("SQLite backup is consistent and readable", async (t) => {
  const { directory, store } = await fixture();
  t.after(() => { store.close(); return rm(directory, { recursive: true, force: true }); });
  await store.createProject({ title: "Backup", brief: "durable", language: "zh-CN" });
  const result = await store.backup(path.join(directory, "backups", "state.sqlite"));
  assert.ok(result.bytes > 0);
  const restored = new StateStore(result.path);
  try {
    assert.equal((await restored.read()).projects[0].title, "Backup");
    assert.equal(restored.health().integrity, "ok");
  } finally { restored.close(); }
});
