import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { listAllModelPresets } from '../services/perception/localEngine/paths.js';
import { getModelLibrary } from '../services/perception/localEngine/modelLibrary.js';
import { migrateLegacyDataDir } from './migrate.js';
import { assertSafePathSegment } from '../utils/safePath.js';
import { withProjectFileLock } from '../engine/project/manager.js';

const DATA_DIR = config.paths.dataDir;
/** 项目工作区根目录（默认 %USERPROFILE%\Videos\Meocox Flow） */
const PROJECTS_DIR = config.paths.projectsRoot;

/**
 * 项目 ID 守卫。
 *
 * 历史原因，这里曾大量使用 `projectId || 'proj_wukong_01'` 作为兜底，
 * 导致漏传 projectId 时会静默把数据写进同一个魔法项目，掩盖调用缺陷。
 * 现在一律显式校验：缺失即抛错，不做任何隐式兜底。
 *
 * @param {*} projectId 候选项目 ID
 * @param {string} [context] 调用方标识，用于错误信息定位
 * @returns {string} 校验通过的非空项目 ID
 * @throws {Error} projectId 缺失或非法
 */
export function requireProjectId(projectId, context = 'unknown') {
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new Error(
      `[${context}] projectId 为必填参数。当前调用未提供有效的项目 ID。` +
      `请确认前端已选中项目，或 API 请求带上 ?projectId=<id> / body.projectId。`
    );
  }
  return assertSafePathSegment(projectId.trim(), 'projectId');
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Safe JSON file reader with fallback
 */
async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

/**
 * Safe JSON file writer (atomic write via temp file)
 */
async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  try {
    await fs.rename(tempPath, filePath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      await new Promise(r => setTimeout(r, 20));
      try {
        await fs.rename(tempPath, filePath);
      } catch {
        await fs.copyFile(tempPath, filePath);
        await fs.unlink(tempPath).catch(() => {});
      }
    } else {
      throw err;
    }
  }
}

/**
 * 进程内文件锁:串行化对同一文件的「读-改-写」,
 * 避免并发 append / 写回导致相互覆盖。按绝对路径为键。
 */
const fileLocks = new Map();
async function withFileLock(key, fn) {
  const prev = fileLocks.get(key) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  const chain = prev.then(() => next);
  fileLocks.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (fileLocks.get(key) === chain) fileLocks.delete(key);
  }
}

/** 追加一行 JSON 到 .jsonl 文件(内核事件日志等) */
async function appendJsonl(filePath, record) {
  await ensureDir(path.dirname(filePath));
  await withFileLock(filePath, async () => {
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
  });
}

/** 读取 .jsonl 文件为对象数组(逐行解析,坏行跳过) */
async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function getEmptyPlanningPipeline() {
  return {
    currentStage: 'PLANNING',
    overallProgress: 0,
    stages: []
  };
}

/**
 * Default pipeline stages template
 */
export function getDefaultPipeline() {
  return {
    templateId: 'template_tutorial_guide',
    templateName: '保姆级攻略解说教学流',
    currentStage: 'STEP_1',
    overallProgress: 0,
    stages: [
      {
        id: 'step_1',
        operatorId: 'media_scan_perception',
        name: '素材感知与镜头切片',
        description: '由 Vision Scout 智能体扫描本地关联素材库，探针媒体分辨率/时长，提取关键帧与场景切片',
        agentId: 'vision-scout',
        agentName: 'Vision Scout',
        skillId: 'vision-scout',
        status: 'waiting',
        progress: 0,
        details: '等待执行素材探针与切片',
        outputOverview: null,
        logs: []
      },
      {
        id: 'step_2',
        operatorId: 'audio_beat_detection',
        name: '音频转录与节奏对齐',
        description: '由 Vision Scout 提取音频波形、检测音乐 BPM 节拍与重音 Drop 点，对齐时间戳',
        agentId: 'vision-scout',
        agentName: 'Vision Scout',
        skillId: 'beat-sync',
        status: 'waiting',
        progress: 0,
        details: '等待音频节奏与对齐处理',
        outputOverview: null,
        logs: []
      },
      {
        id: 'step_3',
        operatorId: 'script_storyboard_planning',
        name: '爆款剧本与分镜规划',
        description: '由 Screenwriter Agent 挂载赛道法则（高能/教学/卡点），规划黄金 3 秒痛点钩子与分镜解说词',
        agentId: 'screenwriter',
        agentName: 'Director + Screenwriter',
        skillId: 'screenwriter-agent',
        status: 'waiting',
        progress: 0,
        details: '等待剧本与分镜规划',
        outputOverview: null,
        logs: []
      },
      {
        id: 'step_4',
        operatorId: 'semantic_clip_matching',
        name: '智能语义镜头匹配',
        description: '由 Timeline Editor 运行语义加权模型，将台词意图与切片视频标签进行精准匹配',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'timeline-editor',
        status: 'waiting',
        progress: 0,
        details: '等待镜头语义匹对',
        outputOverview: null,
        logs: []
      },
      {
        id: 'step_5',
        operatorId: 'jianying_draft_synthesis',
        name: '剪映草稿工程合成与注入',
        description: '由 Timeline Editor 进行微秒级轨道量化对齐，一键注入本机剪映并注册全局索引',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'timeline-editor',
        status: 'waiting',
        progress: 0,
        details: '等待剪映草稿合成',
        outputOverview: null,
        logs: []
      }
    ]
  };
}

/**
 * Default mock assets
 */
export function getDefaultAssets() {
  return [
    {
      id: 'clip_01',
      name: 'boss_attack_intro.mp4',
      duration: '00:06',
      durationSec: 6.0,
      fps: 60,
      resolution: '1920x1080',
      tags: ['Boss战', '黑风大王', '起手前摇', '招式预警'],
      speech: '注意他举起左手时的风压动作',
      status: 'ready',
      score: 0.95
    },
    {
      id: 'clip_02',
      name: 'boss_crit_stun.mp4',
      duration: '00:04',
      durationSec: 4.0,
      fps: 60,
      resolution: '1920x1080',
      tags: ['高能瞬间', '暴击', '处决', 'Boss硬直', '黄金钩子'],
      speech: '破招成功，打出大硬直！',
      status: 'ready',
      score: 0.98
    },
    {
      id: 'clip_03',
      name: 'build_skills_menu.mp4',
      duration: '00:12',
      durationSec: 12.0,
      fps: 60,
      resolution: '1920x1080',
      tags: ['加点教学', 'UI界面', '劈棍加点', '天赋选择'],
      speech: '天赋树先把定身术第二层点满',
      status: 'ready',
      score: 0.88
    },
    {
      id: 'clip_04',
      name: 'exploration_chest.mp4',
      duration: '00:08',
      durationSec: 8.0,
      fps: 60,
      resolution: '1920x1080',
      tags: ['跑图', '隐藏宝箱', '支线触发'],
      speech: '瀑布后面有个隐藏的小木箱',
      status: 'ready',
      score: 0.82
    }
  ];
}

/**
 * Default storyboard template
 */
export function getDefaultStoryboard() {
  return [
    {
      order: 1,
      timeRange: '00:00 - 00:04',
      durationSec: 4.0,
      title: '【黄金钩子】卡关痛点引流',
      scriptText: '卡关3小时打不过？学会这套无伤弹刀打法，手残党也能一次过！',
      matchedClipId: 'clip_02',
      transition: '重低音冲击 + 快速放大',
      status: 'matched'
    },
    {
      order: 2,
      timeRange: '00:04 - 00:10',
      durationSec: 6.0,
      title: '【机制拆解】Boss起手与破绽',
      scriptText: '仔细看Boss举起左手有0.8秒极明显前摇，直接向前左前滑步滚入盲区。',
      matchedClipId: 'clip_01',
      transition: '0.5x慢动作定格 + 红色标注圈',
      status: 'matched'
    },
    {
      order: 3,
      timeRange: '00:10 - 00:22',
      durationSec: 12.0,
      title: '【加点配置】符文与天赋',
      scriptText: '很多人打不动是因为没点出劈棍的二阶贯通，把点数按这样重新洗一次。',
      matchedClipId: 'clip_03',
      transition: '滑动转场 + 箭头指引',
      status: 'matched'
    }
  ];
}

/**
 * Storage Manager
 */
export const storage = {
  /**
   * Initialize and seed default storage directories
   */
  async init() {
    // 桌面应用化改造：先把旧版仓库内数据目录迁移到标准应用数据目录
    // 任何失败都不阻塞启动，详见 storage/migrate.js
    try {
      await migrateLegacyDataDir();
    } catch (migErr) {
      console.warn('⚠️  数据目录迁移异常（已忽略，不阻塞启动）:', migErr.message);
    }

    await ensureDir(DATA_DIR);
    await ensureDir(PROJECTS_DIR);
    await ensureDir(config.paths.storageDir);
    await ensureDir(config.paths.cacheDir);
    await ensureDir(config.paths.modelsDir);
    await ensureDir(config.paths.logsDir);
    await ensureDir(config.paths.outputDir);
    await ensureDir(config.paths.assetsDir);

    // 首次启动：播种配置模板（不覆盖用户已有配置）
    await this.seedConfigTemplates();

    // Seed default project if empty
    // 注意：演示项目是「首次运行的引导内容」，不是隐式兜底。
    // 普通新建项目一律走 seed: 'blank'（空流水线 + 探索引导语）。
    const entries = await fs.readdir(PROJECTS_DIR).catch(() => []);
    if (entries.length === 0) {
      console.log('📦 初始化本地存储目录，自动生成初始演示项目...');
      const defaultProjId = 'proj_demo_wukong_01';
      const defaultProj = {
        id: defaultProjId,
        title: '《黑神话：悟空》第一章保姆级攻略混剪',
        game: '黑神话：悟空',
        category: '攻略教学',
        status: 'planning',
        seed: 'demo',
        createdAt: Date.now() - 7200000,
        updatedAt: Date.now(),
      };
      await this.saveProject(defaultProj);
      await this.savePipeline(defaultProjId, getDefaultPipeline());
      await this.saveAssets(defaultProjId, getDefaultAssets());
      await this.saveStoryboard(defaultProjId, getDefaultStoryboard());
      await this.saveMessages(defaultProjId, []);
      console.log('✅ 初始项目初始化完成');
    }
  },

  /**
   * 首次启动时把 config/examples/*.json.example 播种为用户配置骨架。
   * 已存在的配置文件绝不覆盖，避免丢失用户的 API Key 等配置。
   */
  async seedConfigTemplates() {
    const examplesDir = path.join(config.paths.configDir, 'examples');
    const pairs = [
      ['providers.json.example', config.paths.providersFile],
      ['settings.json.example', config.paths.settingsFile]
    ];
    for (const [exampleName, targetFile] of pairs) {
      try {
        if (fsSync.existsSync(targetFile)) continue;
        const examplePath = path.join(examplesDir, exampleName);
        if (!fsSync.existsSync(examplePath)) continue;
        const raw = await fs.readFile(examplePath, 'utf-8');
        const parsed = JSON.parse(raw);
        delete parsed._comment; // 模板说明字段不进入用户配置
        await writeJson(targetFile, parsed);
        console.log(`📄 已生成初始配置: ${targetFile}`);
      } catch (err) {
        console.warn(`⚠️  播种配置模板失败 ${exampleName}:`, err.message);
      }
    }
  },

  /**
   * Projects CRUD
   */
  async getProjectsRoot() {
    if (process.env.MEOCOX_PROJECTS_ROOT) {
      return path.resolve(process.env.MEOCOX_PROJECTS_ROOT);
    }
    const settings = await this.getSystemSettings().catch(() => null);
    if (settings?.defaultProjectsRoot && fsSync.existsSync(settings.defaultProjectsRoot)) {
      return path.resolve(settings.defaultProjectsRoot);
    }
    return config.paths.projectsRoot;
  },


  async getProjectWorkDir(projectId) {
    const pId = requireProjectId(projectId, 'getProjectWorkDir');
    const rootDir = await this.getProjectsRoot();
    const regProjFile = path.join(rootDir, pId, 'project.json');
    const projData = await readJson(regProjFile);
    if (projData?.projectDir && fsSync.existsSync(projData.projectDir)) {
      return path.resolve(projData.projectDir);
    }
    // 兼容历史遗留目录检查
    const legacyDir = path.join(process.env.USERPROFILE || '', 'Videos', 'Meocox Flow', pId);
    if (legacyDir && fsSync.existsSync(path.join(legacyDir, 'project.json'))) {
      return path.resolve(legacyDir);
    }
    return path.resolve(rootDir, pId);
  },

  async getProjectDir(projectId) {
    return await this.getProjectWorkDir(projectId);
  },

  async listProjects() {
    const rootDir = await this.getProjectsRoot();
    await ensureDir(rootDir);
    const searchRoots = [rootDir];

    const legacyRoot = path.join(process.env.USERPROFILE || '', 'Videos', 'Meocox Flow');
    if (legacyRoot && path.resolve(legacyRoot) !== path.resolve(rootDir) && fsSync.existsSync(legacyRoot)) {
      searchRoots.push(legacyRoot);
    }

    const projects = [];
    const seenIds = new Set();

    for (const rDir of searchRoots) {
      const dirs = await fs.readdir(rDir, { withFileTypes: true }).catch(() => []);
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const projFile = path.join(rDir, d.name, 'project.json');
        const proj = await readJson(projFile);
        if (proj && proj.id && !seenIds.has(proj.id)) {
          seenIds.add(proj.id);
          const workDir = await this.getProjectWorkDir(proj.id);
          projects.push({
            ...proj,
            projectDir: workDir
          });
        }
      }
    }

    // Sort by updatedAt desc
    return projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  async getProject(projectId) {
    if (!projectId) return null;
    const pId = requireProjectId(projectId, 'getProject');
    const rootDir = await this.getProjectsRoot();
    let projFile = path.join(rootDir, pId, 'project.json');
    let proj = await readJson(projFile);

    if (!proj) {
      const legacyProjFile = path.join(process.env.USERPROFILE || '', 'Videos', 'Meocox Flow', pId, 'project.json');
      if (fsSync.existsSync(legacyProjFile)) {
        proj = await readJson(legacyProjFile);
      }
    }

    if (!proj) return null;
    const workDir = await this.getProjectWorkDir(pId);
    return {
      ...proj,
      projectDir: workDir
    };
  },

  async saveProject(project) {
    if (!project || !project.id) throw new Error('Project must have an id');
    const projectId = requireProjectId(project.id, 'saveProject');
    const rootDir = await this.getProjectsRoot();
    const regProjDir = path.join(rootDir, projectId);
    await ensureDir(regProjDir);

    const oldWorkDir = await this.getProjectWorkDir(projectId).catch(() => regProjDir);
    const targetWorkDir = project.projectDir ? path.resolve(project.projectDir) : path.resolve(regProjDir);
    await ensureDir(targetWorkDir);

    // If migrating to a new directory, copy existing files over
    if (path.resolve(oldWorkDir) !== path.resolve(targetWorkDir)) {
      const filesToMigrate = ['project.json', 'pipeline.json', 'assets.json', 'storyboard.json', 'messages.json', 'messages_workflow.json'];
      for (const f of filesToMigrate) {
        const src = path.join(oldWorkDir, f);
        const dest = path.join(targetWorkDir, f);
        if (fsSync.existsSync(src) && !fsSync.existsSync(dest)) {
          await fs.copyFile(src, dest).catch(() => {});
        }
      }
    }

    const { seed: _seed, __isNew: _isNew, ...projectFields } = project;
    const targetMetaFile = path.join(targetWorkDir, 'project.json');
    const regMetaFile = path.join(regProjDir, 'project.json');

    const projectData = await withProjectFileLock(targetMetaFile, async () => {
      const existingTarget = (await readJson(targetMetaFile)) || (await readJson(regMetaFile)) || {};
      const merged = {
        ...existingTarget,
        ...projectFields,
        projectDir: targetWorkDir,
        updatedAt: Date.now()
      };
      await writeJson(targetMetaFile, merged);
      if (path.resolve(targetWorkDir) !== path.resolve(regProjDir)) {
        await writeJson(regMetaFile, merged);
      }
      return merged;
    });

    // Also ensure sub-files exist in targetWorkDir
    // 初始内容由显式的 seed 决定（此前按项目 ID 是否等于魔法 ID 'proj_wukong_01'
    // 来分叉，导致新项目静默走了另一条业务分支）
    // 注意：seed 只是创建期指令，不应持久化进 project.json
    const seedKind = project.seed === 'demo' ? 'demo' : 'blank';

    const pipeFile = path.join(targetWorkDir, 'pipeline.json');
    if (!fsSync.existsSync(pipeFile)) {
      const initialPipe = seedKind === 'demo' ? getDefaultPipeline() : getEmptyPlanningPipeline();
      await writeJson(pipeFile, initialPipe);
    }
    const assetsFile = path.join(targetWorkDir, 'assets.json');
    if (!fsSync.existsSync(assetsFile)) {
      await writeJson(assetsFile, []);
    }
    const sbFile = path.join(targetWorkDir, 'storyboard.json');
    if (!fsSync.existsSync(sbFile)) {
      await writeJson(sbFile, []);
    }
    const msgFile = path.join(targetWorkDir, 'messages.json');
    if (!fsSync.existsSync(msgFile)) {
      // 演示项目不灌欢迎语（其内容已预置在默认分镜里），普通新项目给探索引导
      const initialMessages = seedKind === 'demo' ? [] : [
        {
          id: `msg_welcome_${Date.now()}`,
          role: 'assistant',
          content: `你好！我是你的剪辑前置策划助手（Creative Scout）。🎬\n\n当前项目正处于**【灵感与选题探索阶段】**，我们**尚未进入任何死板的流水线**。\n\n你可以把零散的文本想法、图片、或者本地录屏素材告诉我或导入素材池。我们可以先探讨：\n1. **当前素材能剪出什么爆款方向？**\n2. **适合做攻略教程、卡点混剪、还是剧情解说？**\n3. **目标受众的完播痛点与前3秒黄金钩子是什么？**\n\n等你确定了想做的方向，我会自动为你**定制专属流水线**并规划分镜！\n*(💡 提示：项目标题与本地工作目录可随时在左上角与项目设置中查看修改)*`,
          timestamp: Date.now()
        }
      ];
      await writeJson(msgFile, initialMessages);
    }

    return projectData;
  },

  async deleteProject(projectId) {
    if (!projectId) return false;
    const pId = requireProjectId(projectId, 'deleteProject');
    const workDir = await this.getProjectWorkDir(pId).catch(() => null);
    const rootDir = await this.getProjectsRoot();
    const regProjDir = path.join(rootDir, pId);
    let ok = false;
    if (workDir && fsSync.existsSync(workDir)) {
      try {
        await fs.rm(workDir, { recursive: true, force: true });
        ok = true;
      } catch {}
    }
    if (regProjDir && fsSync.existsSync(regProjDir) && path.resolve(regProjDir) !== path.resolve(workDir || '')) {
      try {
        await fs.rm(regProjDir, { recursive: true, force: true });
        ok = true;
      } catch {}
    }
    return ok;
  },

  /**
   * Messages
   */
  async getMessages(projectId, thread = 'main') {
    const pId = requireProjectId(projectId, 'getMessages');
    const workDir = await this.getProjectWorkDir(pId);
    const fileName = thread === 'workflow' ? 'messages_workflow.json' : 'messages.json';
    const filePath = path.join(workDir, fileName);
    return (await readJson(filePath, [])) || [];
  },

  async saveMessages(projectId, messages, thread = 'main') {
    const pId = requireProjectId(projectId, 'saveMessages');
    const workDir = await this.getProjectWorkDir(pId);
    const fileName = thread === 'workflow' ? 'messages_workflow.json' : 'messages.json';
    const filePath = path.join(workDir, fileName);
    await writeJson(filePath, messages || []);
    // Touch project updatedAt
    const proj = await this.getProject(pId);
    if (proj) {
      proj.updatedAt = Date.now();
      await writeJson(path.join(workDir, 'project.json'), proj);
      if (path.resolve(workDir) !== path.resolve(path.join(PROJECTS_DIR, pId))) {
        await writeJson(path.join(PROJECTS_DIR, pId, 'project.json'), proj);
      }
    }
  },

  /**
   * Pipeline
   */
  async getPipeline(projectId) {
    const pId = requireProjectId(projectId, 'getPipeline');
    const workDir = await this.getProjectWorkDir(pId);
    const stateFile = path.join(workDir, 'state', 'pipeline.json');
    if (fsSync.existsSync(stateFile)) {
      return (await readJson(stateFile)) || getDefaultPipeline();
    }
    const rootFile = path.join(workDir, 'pipeline.json');
    return (await readJson(rootFile)) || getDefaultPipeline();
  },

  async savePipeline(projectId, pipelineData) {
    const pId = requireProjectId(projectId, 'savePipeline');
    const workDir = await this.getProjectWorkDir(pId);
    const stateDir = path.join(workDir, 'state');
    await ensureDir(stateDir);
    await writeJson(path.join(stateDir, 'pipeline.json'), pipelineData);
    await writeJson(path.join(workDir, 'pipeline.json'), pipelineData);
  },

  async updatePipelineStage(projectId, { stageId, status, progress, details, outputOverview, logs }) {
    const pipeline = await this.getPipeline(projectId);
    if (!pipeline.stages || pipeline.stages.length === 0) {
      pipeline.stages = getDefaultPipeline().stages;
    }
    const stage = pipeline.stages.find(s => s.id === stageId);
    if (stage) {
      if (status !== undefined) stage.status = status;
      if (progress !== undefined) stage.progress = progress;
      if (details !== undefined) stage.details = details;
      if (outputOverview !== undefined) stage.outputOverview = outputOverview;
      if (logs !== undefined) stage.logs = logs;
      if (status === 'completed') stage.completedAt = Date.now();
    }

    // Calculate overall progress
    const total = pipeline.stages.reduce((acc, s) => acc + (s.progress || 0), 0);
    pipeline.overallProgress = Math.round(total / pipeline.stages.length);

    await this.savePipeline(projectId, pipeline);
    return pipeline;
  },

  async resetPipeline(projectId) {
    const pId = requireProjectId(projectId, 'resetPipeline');
    const pipeline = getDefaultPipeline();
    pipeline.stages.forEach(s => {
      s.status = 'waiting';
      s.progress = 0;
      s.outputOverview = null;
      s.logs = [];
    });
    pipeline.overallProgress = 0;
    await this.savePipeline(pId, pipeline);
    return pipeline;
  },

  /**
   * Assets
   */
  async getAssets(projectId) {
    const pId = requireProjectId(projectId, 'getAssets');
    const workDir = await this.getProjectWorkDir(pId);
    const stateFile = path.join(workDir, 'state', 'assets.json');
    if (fsSync.existsSync(stateFile)) {
      return (await readJson(stateFile, [])) || [];
    }
    const rootFile = path.join(workDir, 'assets.json');
    return (await readJson(rootFile, [])) || [];
  },

  async saveAssets(projectId, assets) {
    const pId = requireProjectId(projectId, 'saveAssets');
    const workDir = await this.getProjectWorkDir(pId);
    const stateDir = path.join(workDir, 'state');
    await ensureDir(stateDir);
    await writeJson(path.join(stateDir, 'assets.json'), assets || []);
    await writeJson(path.join(workDir, 'assets.json'), assets || []);
  },

  async addAsset(projectId, asset) {
    const assets = await this.getAssets(projectId);
    const existsIndex = assets.findIndex(a => a.id === asset.id);
    if (existsIndex >= 0) {
      assets[existsIndex] = { ...assets[existsIndex], ...asset };
    } else {
      assets.unshift(asset);
    }
    await this.saveAssets(projectId, assets);
    return assets;
  },

  /**
   * Storyboard
   */
  async getStoryboard(projectId) {
    const pId = requireProjectId(projectId, 'getStoryboard');
    const workDir = await this.getProjectWorkDir(pId);
    const stateFile = path.join(workDir, 'state', 'storyboard.json');
    if (fsSync.existsSync(stateFile)) {
      return (await readJson(stateFile, [])) || [];
    }
    const rootFile = path.join(workDir, 'storyboard.json');
    return (await readJson(rootFile, [])) || [];
  },

  async saveStoryboard(projectId, storyboard) {
    const pId = requireProjectId(projectId, 'saveStoryboard');
    const workDir = await this.getProjectWorkDir(pId);
    const stateDir = path.join(workDir, 'state');
    await ensureDir(stateDir);
    await writeJson(path.join(stateDir, 'storyboard.json'), storyboard || []);
    await writeJson(path.join(workDir, 'storyboard.json'), storyboard || []);
  },

  /**
   * Code-as-Video Motion Manifest (代码驱动动效工程清单)
   */
  async getMotionManifest(projectId) {
    const pId = requireProjectId(projectId, 'getMotionManifest');
    const workDir = await this.getProjectWorkDir(pId);
    const filePath = path.join(workDir, 'motion_manifest.json');
    return (await readJson(filePath, null)) || null;
  },

  async saveMotionManifest(projectId, manifest) {
    const pId = requireProjectId(projectId, 'saveMotionManifest');
    const workDir = await this.getProjectWorkDir(pId);
    const filePath = path.join(workDir, 'motion_manifest.json');
    await writeJson(filePath, manifest || null);
    return manifest;
  },

  /**
   * Providers & Model Settings (Local file storage with dynamic installed models discovery)
   */
  async getProvidersConfig() {
    const filePath = config.paths.providersFile;
    const existing = await readJson(filePath);
    let baseConfig = existing;
    if (!baseConfig || !Array.isArray(baseConfig.providers) || baseConfig.providers.length === 0) {
      // 兜底：只保留无凭证的应用内置模型，绝不在代码里硬编码任何第三方厂商与密钥
      // 用户请在「设置 → 模型」中添加 API 端点
      baseConfig = {
        activeProviderId: 'provider_installed',
        activeModelId: '',
        providers: [
          {
            id: 'provider_installed',
            name: '应用模型',
            type: 'installed',
            baseUrl: '',
            apiKey: '',
            models: []
          }
        ]
      };
    }

    // Dynamic discovery of in-app installed and enabled models from modelLibrary
    try {
      const library = getModelLibrary();
      if (Array.isArray(library)) {
        // 核心过滤：仅包含真实下载就绪（isInstalled）且未停用（enabled !== false）的应用模型
        const readyInstalledModels = library
          .filter(m => Boolean(m.isInstalled) && m.enabled !== false)
          .map(m => ({
            id: `installed:${m.id}`,
            name: m.name,
            rawId: m.id,
            isReady: true,
            isInstalled: true,
            enabled: true,
            isCustom: Boolean(m.isCustom),
            isMultimodal: Boolean(m.isMultimodal),
            vramRequired: m.vramRequired,
            totalSizeFormatted: m.sizeFormatted || m.totalSizeFormatted
          }));

        const filteredProviders = (baseConfig.providers || []).filter(p => p.id !== 'provider_installed');
        const installedProvider = {
          id: 'provider_installed',
          name: '应用模型',
          type: 'installed',
          baseUrl: '',
          apiKey: '',
          models: readyInstalledModels
        };
        return {
          ...baseConfig,
          providers: [installedProvider, ...filteredProviders]
        };
      }
    } catch (err) {
      console.warn('[storage] Failed to query local model library:', err.message);
    }

    return baseConfig;
  },

  async saveProvidersConfig(data) {
    const filePath = config.paths.providersFile;
    await writeJson(filePath, data);
  },

  /**
   * System Global Settings
   * @param {string} [filePathOverride] 仅供测试隔离使用，指向临时文件，
   *        避免并行测试改写用户真实的 %LOCALAPPDATA% 配置
   */
  async getSystemSettings(filePathOverride = null) {
    const filePath = filePathOverride || config.paths.settingsFile;
    const existing = await readJson(filePath);

    // 自愈：defaultProjectsRoot 指向的目录若已不存在（换盘/手删/历史脏值），
    // 静默回退到标准项目根，避免新建项目写到失效路径下。
    let projectsRoot = existing?.defaultProjectsRoot;
    if (projectsRoot && !fsSync.existsSync(projectsRoot)) {
      console.warn(`⚠️  settings.defaultProjectsRoot 指向不存在的目录，已回退默认: ${projectsRoot}`);
      projectsRoot = null;
    }

    let customOutputDir = existing?.customOutputDir;
    if (customOutputDir && !fsSync.existsSync(customOutputDir)) {
      console.warn(`⚠️  settings.customOutputDir 指向不存在的目录，已回退空值: ${customOutputDir}`);
      customOutputDir = '';
    }

    return {
      ...(existing || {}),
      enableMemory: existing?.enableMemory !== undefined ? Boolean(existing.enableMemory) : true,
      defaultProjectsRoot: path.resolve(projectsRoot || config.paths.projectsRoot),
      customOutputDir: customOutputDir ? path.resolve(customOutputDir) : '',
      memoryFilePath: config.paths.memoryFile ? path.resolve(config.paths.memoryFile) : ''
    };
  },

  async saveSystemSettings(data = {}, filePathOverride = null) {
    const filePath = filePathOverride || config.paths.settingsFile;
    const current = await this.getSystemSettings(filePathOverride);
    const updated = {
      ...current,
      ...(data.enableMemory !== undefined ? { enableMemory: Boolean(data.enableMemory) } : {}),
      ...(data.defaultProjectsRoot ? { defaultProjectsRoot: path.resolve(data.defaultProjectsRoot) } : {}),
      ...(data.customOutputDir !== undefined
        ? { customOutputDir: data.customOutputDir ? path.resolve(data.customOutputDir) : '' }
        : {}),
      // 修复：此前只持久化 defaultProjectsRoot，导致 defaultAssetLibraryDir 每次刷新即丢失
      ...(data.defaultAssetLibraryDir !== undefined
        ? { defaultAssetLibraryDir: data.defaultAssetLibraryDir ? path.resolve(data.defaultAssetLibraryDir) : '' }
        : {}),
      ...(Array.isArray(data.globalLibraries)
        ? { globalLibraries: data.globalLibraries }
        : {})
    };
    delete updated.undefined;
    await writeJson(filePath, updated);
    return updated;
  },


  /**
   * Project Asset Directory resolver
   * Returns path if project has a configured and existing assetDir; otherwise null
   */
  async getProjectAssetDir(projectId) {
    const project = await this.getProject(projectId);
    if (project?.assetDir && fsSync.existsSync(project.assetDir)) {
      return path.resolve(project.assetDir);
    }
    return null;
  },

  /**
   * Project Asset Directories resolver
   * Returns array of existing asset directory paths (primary assetDir + extraAssetDirs)
   */
  async getProjectAssetDirs(projectId) {
    const project = await this.getProject(projectId);
    if (!project) return [];
    const dirs = [];
    if (project.assetDir && fsSync.existsSync(project.assetDir)) {
      dirs.push(path.resolve(project.assetDir));
    }
    if (Array.isArray(project.extraAssetDirs)) {
      for (const d of project.extraAssetDirs) {
        if (d && fsSync.existsSync(d)) {
          const resolved = path.resolve(d);
          if (!dirs.includes(resolved)) {
            dirs.push(resolved);
          }
        }
      }
    }
    return dirs;
  },

  /**
   * Global Media Libraries (多根目录绑定资源池)
   */
  async getGlobalLibraries(filePathOverride = null) {
    const settings = await this.getSystemSettings(filePathOverride);
    let libs = settings.globalLibraries;
    if (!Array.isArray(libs)) {
      libs = [];
      // 自动平滑迁移既有 defaultAssetLibraryDir（若存在且有效）
      if (settings.defaultAssetLibraryDir && fsSync.existsSync(settings.defaultAssetLibraryDir)) {
        const resolved = path.resolve(settings.defaultAssetLibraryDir);
        libs.push({
          id: 'default_lib',
          name: path.basename(resolved) || '默认资料库',
          path: resolved,
          createdAt: Date.now()
        });
      }
    }
    return libs;
  },

  async saveGlobalLibraries(libraries, filePathOverride = null) {
    const current = await this.getSystemSettings(filePathOverride);
    const validLibs = Array.isArray(libraries) ? libraries : [];
    return await this.saveSystemSettings({
      ...current,
      globalLibraries: validLibs
    }, filePathOverride);
  },

  async addGlobalLibrary({ name, path: rawPath }, filePathOverride = null) {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new Error('资料库路径不能为空');
    }
    const resolved = path.resolve(rawPath);
    if (!fsSync.existsSync(resolved)) {
      throw new Error(`目标路径不存在: ${resolved}`);
    }
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`目标路径不是一个文件夹: ${resolved}`);
    }

    const libs = await this.getGlobalLibraries(filePathOverride);
    const existing = libs.find(l => path.resolve(l.path) === resolved);
    if (existing) {
      return { library: existing, isNew: false, libraries: libs };
    }

    const id = `glib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newLib = {
      id,
      name: (name && name.trim()) ? name.trim() : path.basename(resolved),
      path: resolved,
      createdAt: Date.now()
    };
    libs.push(newLib);
    await this.saveGlobalLibraries(libs, filePathOverride);
    return { library: newLib, isNew: true, libraries: libs };
  },

  async removeGlobalLibrary(idOrPath, filePathOverride = null) {
    const libs = await this.getGlobalLibraries(filePathOverride);
    const target = libs.find(l => l.id === idOrPath || path.resolve(l.path) === path.resolve(idOrPath));
    if (!target) return { success: false, libraries: libs };
    const filtered = libs.filter(l => l.id !== target.id);
    await this.saveGlobalLibraries(filtered, filePathOverride);
    return { success: true, removed: target, libraries: filtered };
  },

  async updateGlobalLibrary(id, updates = {}, filePathOverride = null) {
    const libs = await this.getGlobalLibraries(filePathOverride);
    const idx = libs.findIndex(l => l.id === id);
    if (idx === -1) return null;
    libs[idx] = {
      ...libs[idx],
      ...(updates.name ? { name: updates.name.trim() } : {}),
      updatedAt: Date.now()
    };
    await this.saveGlobalLibraries(libs, filePathOverride);
    return libs[idx];
  },

  // =========================================================================
  // MAS Core 命名空间:runs / artifacts / blackboard / memory
  // 全部长在既有「按项目工作区 + 原子写」之上,legacy 字段与路由不受影响。
  // =========================================================================

  /** 暴露底层原语给内核模块(事件日志/锁) */
  kernel: {
    withFileLock,
    appendJsonl,
    readJsonl
  },

  /** <workDir>/runs */
  async getRunDir(projectId, runId) {
    const pId = requireProjectId(projectId, 'getRunDir');
    const workDir = await this.getProjectWorkDir(pId);
    return path.join(workDir, 'runs', assertSafePathSegment(runId, 'runId'));
  },

  async getRunFile(projectId, runId) {
    return path.join(await this.getRunDir(projectId, runId), 'run.json');
  },

  async saveRun(projectId, run) {
    const pId = requireProjectId(projectId, 'saveRun');
    if (!run || !run.id) throw new Error('Run must have an id');
    await writeJson(await this.getRunFile(pId, run.id), run);
    return run;
  },

  async getRun(projectId, runId) {
    const pId = requireProjectId(projectId, 'getRun');
    return readJson(await this.getRunFile(pId, runId));
  },

  async listRuns(projectId) {
    const pId = requireProjectId(projectId, 'listRuns');
    const workDir = await this.getProjectWorkDir(pId);
    const runsDir = path.join(workDir, 'runs');
    const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
    const runs = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const run = await readJson(path.join(runsDir, e.name, 'run.json'));
      if (run && run.id) runs.push(run);
    }
    return runs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  async saveTask(projectId, runId, task) {
    const pId = requireProjectId(projectId, 'saveTask');
    if (!task || !task.id) throw new Error('Task must have an id');
    assertSafePathSegment(task.id, 'taskId');
    const dir = path.join(await this.getRunDir(pId, runId), 'tasks');
    await writeJson(path.join(dir, `${task.id}.json`), task);
    return task;
  },

  async getTask(projectId, runId, taskId) {
    const pId = requireProjectId(projectId, 'getTask');
    assertSafePathSegment(taskId, 'taskId');
    const dir = path.join(await this.getRunDir(pId, runId), 'tasks');
    return readJson(path.join(dir, `${taskId}.json`));
  },

  async listTasks(projectId, runId) {
    const pId = requireProjectId(projectId, 'listTasks');
    const dir = path.join(await this.getRunDir(pId, runId), 'tasks');
    const entries = await fs.readdir(dir).catch(() => []);
    const tasks = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const t = await readJson(path.join(dir, name));
      if (t && t.id) tasks.push(t);
    }
    return tasks;
  },

  /** 追加事件(append-only,进程内串行) */
  async appendEvent(projectId, runId, event) {
    const pId = requireProjectId(projectId, 'appendEvent');
    const file = path.join(await this.getRunDir(pId, runId), 'events.jsonl');
    await appendJsonl(file, event);
    return event;
  },

  /** 读取事件,可给定 sinceSeq 只取其后 */
  async readEvents(projectId, runId, { sinceSeq = -1 } = {}) {
    const pId = requireProjectId(projectId, 'readEvents');
    const file = path.join(await this.getRunDir(pId, runId), 'events.jsonl');
    const all = await readJsonl(file);
    return sinceSeq >= 0 ? all.filter((e) => (e.seq || 0) > sinceSeq) : all;
  },

  async saveCheckpoint(projectId, runId, seq, checkpoint) {
    const pId = requireProjectId(projectId, 'saveCheckpoint');
    if (!Number.isSafeInteger(Number(seq)) || Number(seq) < 0) throw new Error('checkpoint seq must be a non-negative integer');
    const dir = path.join(await this.getRunDir(pId, runId), 'checkpoints');
    await writeJson(path.join(dir, `${Number(seq)}.json`), checkpoint);
    return checkpoint;
  },

  async getCheckpoint(projectId, runId, seq) {
    const pId = requireProjectId(projectId, 'getCheckpoint');
    if (!Number.isSafeInteger(Number(seq)) || Number(seq) < 0) throw new Error('checkpoint seq must be a non-negative integer');
    const dir = path.join(await this.getRunDir(pId, runId), 'checkpoints');
    return readJson(path.join(dir, `${Number(seq)}.json`));
  },

  async listCheckpoints(projectId, runId) {
    const pId = requireProjectId(projectId, 'listCheckpoints');
    const dir = path.join(await this.getRunDir(pId, runId), 'checkpoints');
    const entries = await fs.readdir(dir).catch(() => []);
    const cps = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const cp = await readJson(path.join(dir, name));
      if (cp) cps.push(cp);
    }
    return cps.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  },

  /**
   * 运行态快照:<runDir>/snapshot.json
   * 存放「非事件流」的任意 UI/业务状态（如 Studio Demo 的 stepData），
   * 用于刷新后恢复。刻意与 events.jsonl 分离，保持事件日志纯 append-only。
   */
  async saveRunSnapshot(projectId, runId, snapshot) {
    const pId = requireProjectId(projectId, 'saveRunSnapshot');
    const file = path.join(await this.getRunDir(pId, runId), 'snapshot.json');
    await writeJson(file, snapshot);
    return snapshot;
  },

  async getRunSnapshot(projectId, runId) {
    const pId = requireProjectId(projectId, 'getRunSnapshot');
    const file = path.join(await this.getRunDir(pId, runId), 'snapshot.json');
    return readJson(file, null);
  },

  /** <workDir>/artifacts/<kind>/<artifactId>/ */
  async getArtifactDir(projectId, kind, artifactId) {
    const pId = requireProjectId(projectId, 'getArtifactDir');
    const workDir = await this.getProjectWorkDir(pId);
    return path.join(
      workDir,
      'artifacts',
      assertSafePathSegment(kind, 'artifactKind'),
      assertSafePathSegment(artifactId, 'artifactId')
    );
  },

  async saveArtifactIndex(projectId, artifact) {
    const pId = requireProjectId(projectId, 'saveArtifactIndex');
    if (!artifact || !artifact.id) throw new Error('Artifact must have an id');
    const dir = await this.getArtifactDir(pId, artifact.kind, artifact.id);
    await writeJson(path.join(dir, 'index.json'), artifact);
    return artifact;
  },

  async getArtifactIndex(projectId, kind, artifactId) {
    const pId = requireProjectId(projectId, 'getArtifactIndex');
    const dir = await this.getArtifactDir(pId, kind, artifactId);
    return readJson(path.join(dir, 'index.json'));
  },

  async saveArtifactVersion(projectId, kind, artifactId, version, payload) {
    const pId = requireProjectId(projectId, 'saveArtifactVersion');
    if (!Number.isSafeInteger(Number(version)) || Number(version) < 1) throw new Error('artifact version must be a positive integer');
    const dir = await this.getArtifactDir(pId, kind, artifactId);
    await writeJson(path.join(dir, `v${Number(version)}.json`), payload);
    return payload;
  },

  async getArtifactVersion(projectId, kind, artifactId, version) {
    const pId = requireProjectId(projectId, 'getArtifactVersion');
    if (!Number.isSafeInteger(Number(version)) || Number(version) < 1) throw new Error('artifact version must be a positive integer');
    const dir = await this.getArtifactDir(pId, kind, artifactId);
    return readJson(path.join(dir, `v${Number(version)}.json`));
  },

  /** 按 kind 列出全部产物索引 */
  async listArtifacts(projectId, kind) {
    const pId = requireProjectId(projectId, 'listArtifacts');
    assertSafePathSegment(kind, 'artifactKind');
    const workDir = await this.getProjectWorkDir(pId);
    const kindDir = path.join(workDir, 'artifacts', kind);
    const entries = await fs.readdir(kindDir, { withFileTypes: true }).catch(() => []);
    const result = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const idx = await readJson(path.join(kindDir, e.name, 'index.json'));
      if (idx && idx.id) result.push(idx);
    }
    return result;
  },

  // ── 共享黑板(项目级) ─────────────────────────────────────────
  async getBlackboard(projectId) {
    const pId = requireProjectId(projectId, 'getBlackboard');
    const workDir = await this.getProjectWorkDir(pId);
    return readJson(path.join(workDir, 'blackboard.json'));
  },

  async saveBlackboard(projectId, blackboard) {
    const pId = requireProjectId(projectId, 'saveBlackboard');
    const workDir = await this.getProjectWorkDir(pId);
    await writeJson(path.join(workDir, 'blackboard.json'), blackboard);
    return blackboard;
  },

  // ── 跨项目老板画像(全局 memory) ──────────────────────────────
  async getBossEpisodic() {
    return (await readJson(path.join(config.paths.dataDir, 'memory', 'boss-episodic.json'))) || [];
  },

  async saveBossEpisodic(rules) {
    await writeJson(path.join(config.paths.dataDir, 'memory', 'boss-episodic.json'), rules || []);
    return rules;
  },

  // ── 跨会话自动记忆 (MEMORY.md) ──────────────────────────────
  async getMemory(projectId = null) {
    let userMemory = '';
    let projectMemory = '';

    const settings = await this.getSystemSettings().catch(() => ({}));
    const isGlobalMemoryEnabled = settings?.enableMemory !== false;

    let project = null;
    if (projectId) {
      project = await this.getProject(projectId).catch(() => null);
    }
    const memoryPolicy = project?.memoryPolicy || 'inherit';

    // 若项目显式关闭了记忆，直接返回空
    if (memoryPolicy === 'disabled') {
      return {
        userMemory: '',
        projectMemory: '',
        combinedText: ''
      };
    }

    const readMemoryFile = async (filePath) => {
      try {
        if (!fsSync.existsSync(filePath)) return '';
        const content = await fs.readFile(filePath, 'utf-8');
        // 规格: 前 200 行 或 25KB
        const lines = content.split('\n').slice(0, 200).join('\n');
        if (Buffer.byteLength(lines, 'utf-8') > 25 * 1024) {
          return lines.slice(0, 25 * 1024) + '\n... (MEMORY.md 截断)';
        }
        return lines.trim();
      } catch {
        return '';
      }
    };

    // 只有在全局记忆开启且项目策略不是 project_only 时才读取全局记忆
    if (isGlobalMemoryEnabled && memoryPolicy !== 'project_only' && config.paths.memoryFile) {
      userMemory = await readMemoryFile(config.paths.memoryFile);
    }

    if (projectId) {
      try {
        const workDir = await this.getProjectWorkDir(projectId);
        projectMemory = await readMemoryFile(path.join(workDir, 'MEMORY.md'));
      } catch {}
    }

    const sections = [];
    if (projectMemory) {
      sections.push(`### [项目工程级记忆 (Project Memory)]\n${projectMemory}`);
    }
    if (userMemory) {
      sections.push(`### [创作者全局偏好与经验记忆 (User Memory)]\n${userMemory}`);
    }

    return {
      userMemory,
      projectMemory,
      combinedText: sections.join('\n\n')
    };
  },


  async saveMemory(content, { projectId = null, scope = 'user', append = true } = {}) {
    if (!content || typeof content !== 'string') return { success: false };
    let targetPath = config.paths.memoryFile;

    if (scope === 'project' && projectId) {
      const existingProj = await this.getProject(projectId).catch(() => null);
      if (!existingProj) {
        return { success: false, reason: 'PROJECT_NOT_FOUND', scope };
      }
      const workDir = existingProj.projectDir || await this.getProjectWorkDir(projectId);
      targetPath = path.join(workDir, 'MEMORY.md');
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    let finalContent = content.trim();
    if (append && fsSync.existsSync(targetPath)) {
      const existing = await fs.readFile(targetPath, 'utf-8');
      finalContent = `${existing.trim()}\n\n${finalContent}`;
    }

    await fs.writeFile(targetPath, finalContent + '\n', 'utf-8');
    return { success: true, targetPath, scope };
  }
};
