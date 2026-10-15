import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = process.cwd();
const node = process.execPath;

const transport = new StdioClientTransport({
  command: node,
  args: [path.join(root, 'dist', 'src', 'index.js')],
  cwd: root,
  env: {
    ...process.env,
    FLOW_BROWSER_EXECUTABLE: process.env.FLOW_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    FLOW_PROFILE_DIR: path.join(root, '.data', 'browser-profile'),
    FLOW_STATE_FILE: path.join(root, '.data', 'state.json'),
    FLOW_DATABASE_FILE: path.join(root, '.data', 'state.sqlite'),
    FLOW_DOWNLOAD_DIR: path.join(root, 'downloads'),
  },
  stderr: 'pipe',
});

const client = new Client({ name: 'google-flow-production-smoke', version: '1.0.0' });
const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
  return result.structuredContent ?? result.content;
};

await client.connect(transport);
try {
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 22);
  const health = await call('mcp_health_check');
  assert.equal(health.status, 'healthy');
  assert.equal(health.database.integrity, 'ok');
  const listed = await call('project_list');
  const projectId = process.env.FLOW_SMOKE_PROJECT_ID ?? listed.projects.find((item) => item.flowProjectUrl)?.id;
  assert.ok(projectId, 'Set FLOW_SMOKE_PROJECT_ID or link at least one project');
  const project = await call('project_get', { projectId });
  const projectUrl = process.env.FLOW_SMOKE_PROJECT_URL ?? project.project.flowProjectUrl;
  assert.ok(projectUrl, 'Set FLOW_SMOKE_PROJECT_URL or link the selected project');
  const completedVideo = project.jobs.find((item) => item.operation === 'video' && item.state === 'complete' && item.providerMediaId);
  const mediaId = process.env.FLOW_SMOKE_MEDIA_ID ?? completedVideo?.providerMediaId;
  assert.ok(mediaId, 'Set FLOW_SMOKE_MEDIA_ID or complete at least one video job');
  const outputName = `production-smoke-${mediaId}.mp4`;
  const outputPath = path.join(root, 'downloads', outputName);
  assert.equal(project.project.flowProjectUrl, projectUrl);
  await call('flow_open_project', { projectId, projectUrl });
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  const page = await call('flow_inspect_page');
  console.log('LIVE_INSPECTION', JSON.stringify({ url: page.url, media: page.media, text: page.visibleText }, null, 2));
  const video = page.media.find((item) => item.tileId === mediaId);
  assert.ok(video, `Expected video media ${mediaId}`);
  assert.equal(video.kind, 'video');
  const opened = await call('flow_open_media', { projectId, mediaId });
  assert.ok(opened.page.visibleText.includes('10:00') || opened.page.visibleText.includes('00:10:00'));
  const downloaded = await call('flow_download_media', {
    projectId, mediaId, destinationDir: path.join(root, 'downloads'), fileName: outputName,
  });
  assert.equal(downloaded.path, outputPath);
  assert.ok(downloaded.bytes > 0);
  const validation = await call('media_validate_local', {
    filePath: outputPath, expectedDurationSeconds: 10, durationToleranceSeconds: 0.25,
    expectedAspectRatio: '9:16', requireAudio: true,
  });
  assert.equal(validation.valid, true);
  console.log(JSON.stringify({
    tools: tools.tools.length,
    health,
    media: video,
    downloaded: { path: downloaded.path, bytes: downloaded.bytes },
    validation,
  }, null, 2));
} finally {
  await client.close();
}
