import dotenv from 'dotenv';
import os from 'node:os';
import path from 'node:path';
import fsSync from 'node:fs';

const SERVER_DIR = process.env.MEOCOX_SERVER_DIR
  ? path.resolve(process.env.MEOCOX_SERVER_DIR)
  : path.resolve(process.cwd());

function resolveAppRoot() {
  if (process.env.MEOCOX_APP_ROOT && fsSync.existsSync(process.env.MEOCOX_APP_ROOT)) {
    return path.resolve(process.env.MEOCOX_APP_ROOT);
  }
  const candidateDirs = [
    path.resolve(SERVER_DIR, '..'),
    path.resolve(process.cwd(), '..'),
    process.cwd(),
    SERVER_DIR
  ];
  for (const dir of candidateDirs) {
    if (fsSync.existsSync(path.join(dir, 'agents', 'super-brain'))) {
      return dir;
    }
  }
  for (const dir of candidateDirs) {
    if (fsSync.existsSync(path.join(dir, 'agents')) && fsSync.existsSync(path.join(dir, 'skills'))) {
      return dir;
    }
  }
  return path.resolve(SERVER_DIR, '..');
}

const APP_ROOT = resolveAppRoot();


// .env 仅开发态有意义（打包后不存在此文件，用户配置一律走 %LOCALAPPDATA%）
dotenv.config({ path: path.join(SERVER_DIR, '.env') });

/** %LOCALAPPDATA% 下的应用数据目录名（与 Rust 侧必须保持一致） */
const APP_DATA_DIR_NAME = 'MeocoxFlow';
/** 用户可见的项目工作区目录名 */
const PROJECTS_DIR_NAME = 'Meocox Flow';

/**
 * 用户数据根目录解析优先级：
 *   1. MEOCOX_DATA_DIR 环境变量（开发态覆盖 / 便携模式）
 *   2. %LOCALAPPDATA%\MeocoxFlow（Windows 标准惯例，不参与漫游同步）
 *   3. $XDG_DATA_HOME/MeocoxFlow
 *   4. ~/.local/share/MeocoxFlow
 */
function resolveDataDir() {
  if (process.env.MEOCOX_DATA_DIR) {
    return path.resolve(process.env.MEOCOX_DATA_DIR);
  }
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, APP_DATA_DIR_NAME);
  }
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, APP_DATA_DIR_NAME);
  }
  return path.join(os.homedir(), '.local', 'share', APP_DATA_DIR_NAME);
}

/**
 * 项目工作区根目录解析优先级：
 *   1. MEOCOX_PROJECTS_ROOT 环境变量（开发态 / 自定义覆盖）
 *   2. settings.json 的 defaultProjectsRoot（由 storage 动态读取）
 *   3. %LOCALAPPDATA%\MeocoxFlow\projects（标准应用工程沙箱区，默认规范）
 */
function resolveProjectsRoot(appDataDir) {
  if (process.env.MEOCOX_PROJECTS_ROOT) {
    return path.resolve(process.env.MEOCOX_PROJECTS_ROOT);
  }
  return path.join(appDataDir, 'projects');
}

const dataDir = resolveDataDir();
const projectsRoot = resolveProjectsRoot(dataDir);

export const config = {
  // The local engine must never listen on a LAN interface.
  host: '127.0.0.1',
  port: process.env.PORT || 3001,

  // Custom model config (Gemini 3.8 Flash / OpenCode / OpenAI-compatible API)
  ai: {
    baseUrl: process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gemini-3.8-flash',
  },

  paths: {
    // ── 第一层：app 自带（随安装包分发，只读）────────────────────────
    appRoot: APP_ROOT,
    appDataDirName: APP_DATA_DIR_NAME,
    agentsDir: path.join(APP_ROOT, 'agents'),
    skillsDir: path.join(APP_ROOT, 'skills'),
    toolsDir: path.join(APP_ROOT, 'tools'),
    assetsDir: path.join(APP_ROOT, 'assets'),
    scriptsDir: path.join(APP_ROOT, 'scripts'),
    configDir: path.join(APP_ROOT, 'config'),
    /** app 自带的 MCP 默认清单（只读，升级时被覆盖） */
    defaultMcpConfig: path.join(APP_ROOT, 'config', 'mcp_servers.default.json'),

    // ── 第二层：用户数据（%LOCALAPPDATA%\MeocoxFlow，可写）──────────
    dataDir,
    userAgentsDir: path.join(dataDir, 'agents'),
    userSkillsDir: path.join(dataDir, 'skills'),
    userToolsDir: path.join(dataDir, 'tools'),

    /** 项目工作区根（默认 %LOCALAPPDATA%\MeocoxFlow\Projects，标准沙箱） */
    projectsRoot,

    // 配置文件
    providersFile: path.join(dataDir, 'providers.json'),
    settingsFile: path.join(dataDir, 'settings.json'),
    memoryFile: path.join(dataDir, 'MEMORY.md'),
    /** 用户自建 / 覆盖的 MCP（与 defaultMcpConfig 合并，用户优先） */
    mcpUserConfig: path.join(dataDir, 'mcp_servers.json'),
    curatedMixkitFile: path.join(dataDir, 'curated_mixkit.json'),

    // 本机数据
    modelsDir: path.join(dataDir, 'models'),
    storageDir: path.join(dataDir, 'storage'),
    cacheDir: path.join(dataDir, 'cache'),
    outputDir: path.join(dataDir, 'outputs'),
    logsDir: path.join(dataDir, 'logs'),

    // ── 第三层：外部系统（剪映专业版）───────────────────────────────
    jianyingDraftsDir: process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft')
      : null,
    jianyingAppExe: process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'JianyingPro', 'Apps', 'JianyingPro.exe')
      : null,
  },

  /**
   * 旧版数据目录（迁移源）。桌面应用化改造前的所有用户数据都躺在这里。
   * 仅供 storage/migrate.js 使用，迁移完成后可手动删除。
   */
  legacy: {
    dataDir: path.join(APP_ROOT, 'data'),
    projectsDir: path.join(APP_ROOT, 'data', 'projects'),
    marker: '.migrated-v2',
  },
};
