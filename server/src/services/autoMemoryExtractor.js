import { storage } from '../storage/index.js';

/**
 * 自动从轮次中提取结构化事实与用户偏好规约 (Rule-Based & Empirical Extraction)
 * 严格保持零噪音、零虚构，仅提炼确凿发生的事实与用户明确表达的偏好规约
 */
export function extractTurnMemoryFacts({
  prompt = '',
  reply = '',
  envelope = null,
  attachedFiles = []
} = {}) {
  const projectFacts = [];
  const userPreferences = [];

  const dateStr = new Date().toISOString().split('T')[0];

  // 1. 从工具信封收割客观物理事实 (Tool-Derived Empirical Facts)
  const toolExecs = Array.isArray(envelope?.data?.toolExecutions) ? envelope.data.toolExecutions : [];
  for (const exec of toolExecs) {
    const toolName = exec.tool;
    const env = exec.envelope || {};
    const envData = env.data || {};

    if (toolName === 'export_jianying_draft' && env.success !== false) {
      const draftName = envData.draftName || '未命名草稿';
      const count = envData.segmentsCount || 0;
      const dur = envData.durationSec || 0;
      projectFacts.push(`[${dateStr}] 已成功导出剪映草稿工程【${draftName}】(包含 ${count} 个视频片段，总时长 ${dur} 秒)`);
    } else if (toolName === 'update_storyboard' && env.success !== false) {
      const count = envData.count || (Array.isArray(envData.items) ? envData.items.length : 0);
      if (count > 0) {
        projectFacts.push(`[${dateStr}] 当前项目已确立分镜时间轴方案 (共 ${count} 幕)`);
      }
    } else if (toolName === 'render_video_mp4' && env.success !== false) {
      const fn = envData.fileName || 'render.mp4';
      const fps = envData.fps || 60;
      const dur = envData.durationSec || 0;
      projectFacts.push(`[${dateStr}] 已完成成品视频渲染直出【${fn}】(${fps}FPS, 时长 ${dur} 秒)`);
    } else if (toolName === 'synthesize_cosyvoice' && env.success !== false) {
      const voice = envData.voice || 'geek_male';
      const dur = envData.totalDurationSec ? Number(envData.totalDurationSec).toFixed(1) : '未知';
      projectFacts.push(`[${dateStr}] 项目选用旁白配音音色「${voice}」(合成时长 ${dur} 秒)`);
    } else if (toolName === 'inspect_video_content' && env.success !== false) {
      const assetId = envData.assetId || '素材';
      const specs = envData.specs || {};
      const res = specs.resolution ? `(${specs.resolution})` : '';
      projectFacts.push(`[${dateStr}] 已完成对关键素材【${assetId}】的深度视觉与音频探针感知 ${res}`);
    } else if (toolName === 'apply_pipeline_template' && env.success !== false) {
      const tplName = envData.templateName || envData.name || '定制流水线';
      projectFacts.push(`[${dateStr}] 项目流水线模版选定为【${tplName}】`);
    } else if (toolName === 'update_project_meta' && env.success !== false) {
      const proj = envData.project || {};
      if (proj.title) projectFacts.push(`[${dateStr}] 项目标题确立为: 「${proj.title}」`);
      if (proj.category) projectFacts.push(`[${dateStr}] 视频品类设定为: 「${proj.category}」`);
    }

    // 收割工具自定义透传的结构化 facts & highlights
    if (Array.isArray(envData.facts)) {
      for (const f of envData.facts) {
        if (typeof f === 'string' && f.trim()) {
          projectFacts.push(`[${dateStr}] ${f.trim()}`);
        }
      }
    }
  }

  // 2. 启发式用户偏好与指令规约提取 (User Preferences & Constraints)
  const cleanPrompt = (typeof prompt === 'string' ? prompt : '').trim();
  if (cleanPrompt) {
    // 帧率偏好
    const fpsMatch = cleanPrompt.match(/(?:以后|默认|统一)?(?:使用|采用|用)?\s*(\d{2,3})\s*(?:fps|帧)/i);
    if (fpsMatch) {
      userPreferences.push(`视频渲染默认帧率偏好: ${fpsMatch[1]} FPS`);
    }

    // 画幅比例偏好
    const ratioMatch = cleanPrompt.match(/(?:画幅|比例|尺寸)?(?:使用|采用|用|设为)?\s*(16:9|9:16|1:1|4:3)/);
    if (ratioMatch) {
      const desc = ratioMatch[1] === '9:16' ? '竖屏短视频' : ratioMatch[1] === '16:9' ? '横屏宽屏' : '';
      userPreferences.push(`视频画面比例偏好: ${ratioMatch[1]}${desc ? ` (${desc})` : ''}`);
    }

    // 剪辑风格偏好
    const styleMatch = cleanPrompt.match(/(?:喜欢|偏好|采用|风格为?)\s*(快节奏卡点|极简极客|电影质感|高能解说|萌系搞笑|黑神话风格)/);
    if (styleMatch) {
      userPreferences.push(`剪辑视觉与叙事风格偏好: ${styleMatch[1]}`);
    }

    // 配音音色偏好
    const voiceMatch = cleanPrompt.match(/(?:旁白|配音|解说|人声)?(?:喜欢|选用|偏好|用)?\s*(geek_male|clarity_female|narrator|极客男声|清晰女声|沉稳解说)/i);
    if (voiceMatch) {
      userPreferences.push(`配音解说默认声线偏好: ${voiceMatch[1]}`);
    }
  }

  return {
    projectFacts: Array.from(new Set(projectFacts)),
    userPreferences: Array.from(new Set(userPreferences))
  };
}

/**
 * 将已有 MEMORY.md 内容与新增条目进行规范去重合并
 */
export function mergeMemoryMarkdown(existingMarkdown = '', newItems = [], sectionTitle = '## 项目核心事实与资产状态') {
  if (!Array.isArray(newItems) || newItems.length === 0) {
    return existingMarkdown;
  }

  const lines = existingMarkdown ? existingMarkdown.split('\n') : [];
  const existingItems = [];
  const preservedSections = [];

  let inTargetSection = false;
  let targetSectionHeader = '';

  const cleanHeader = sectionTitle.replace(/^[#\s]+/, '').trim();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (trimmed.includes(cleanHeader)) {
        inTargetSection = true;
        targetSectionHeader = trimmed;
        continue;
      } else {
        inTargetSection = false;
      }
    }

    if (inTargetSection) {
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        existingItems.push(trimmed.replace(/^[-*]\s*/, ''));
      }
    } else {
      preservedSections.push(line);
    }
  }

  // 去重函数：剔除日期前缀如 [2026-10-10] 进行核心语义比对
  const normalize = (str) => str.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, '').replace(/[\s\p{P}]/gu, '').toLowerCase();

  const merged = [...existingItems];
  for (const item of newItems) {
    const normNew = normalize(item);
    if (!normNew) continue;
    const existingIdx = merged.findIndex(ex => normalize(ex) === normNew);
    if (existingIdx >= 0) {
      // 若已存在，用带最新日期的版本更新
      merged[existingIdx] = item;
    } else {
      merged.push(item);
    }
  }

  // 有界保留：保留最新 30 条
  const capped = merged.slice(-30);

  const targetBlock = [
    targetSectionHeader || sectionTitle,
    ...capped.map(it => `- ${it}`)
  ].join('\n');

  const otherText = preservedSections.join('\n').trim();
  return otherText ? `${otherText}\n\n${targetBlock}` : targetBlock;
}

/**
 * 驱动多智能体轮次沉淀闭环，将提取的事实持久化至项目与用户 MEMORY.md
 */
export async function triggerAutoMemoryConvergence({
  projectId,
  threadId,
  prompt = '',
  reply = '',
  envelope = null,
  attachedFiles = []
} = {}) {
  if (!projectId) return { success: false, reason: 'PROJECT_ID_REQUIRED' };

  try {
    // 检查项目记忆策略与全局开关
    const [project, settings] = await Promise.all([
      storage.getProject(projectId).catch(() => null),
      storage.getSystemSettings().catch(() => ({}))
    ]);

    if (!project) {
      return { success: false, updated: false, reason: 'PROJECT_NOT_FOUND' };
    }

    const memoryPolicy = project?.memoryPolicy || 'inherit';
    const isGlobalEnabled = settings?.enableMemory !== false;

    // 若当前项目完全关闭了记忆，直接跳过沉淀
    if (memoryPolicy === 'disabled') {
      return { success: true, updated: false, reason: 'MEMORY_DISABLED_BY_PROJECT_POLICY' };
    }

    const { projectFacts, userPreferences } = extractTurnMemoryFacts({
      prompt,
      reply,
      envelope,
      attachedFiles
    });

    if (projectFacts.length === 0 && userPreferences.length === 0) {
      return { success: true, updated: false, reason: 'NO_NEW_FACTS' };
    }

    // 1. 合并更新项目工程级记忆 (Project Memory)
    if (projectFacts.length > 0) {
      const memoryData = await storage.getMemory(projectId).catch(() => ({ projectMemory: '' }));
      const updatedProjectMemory = mergeMemoryMarkdown(
        memoryData.projectMemory || '',
        projectFacts,
        '## 项目核心事实与资产状态'
      );
      await storage.saveMemory(updatedProjectMemory, {
        projectId,
        scope: 'project',
        append: false
      });
    }

    // 2. 合并更新创作者全局偏好记忆 (User Memory)
    // 仅在全局开启记忆 且 项目策略允许使用全局记忆 (inherit) 时才沉淀写回全局
    let wroteUserPrefs = false;
    if (userPreferences.length > 0 && isGlobalEnabled && memoryPolicy !== 'project_only') {
      const memoryData = await storage.getMemory(projectId).catch(() => ({ userMemory: '' }));
      const updatedUserMemory = mergeMemoryMarkdown(
        memoryData.userMemory || '',
        userPreferences,
        '## 创作者全局偏好与习惯规约'
      );
      await storage.saveMemory(updatedUserMemory, {
        scope: 'user',
        append: false
      });
      wroteUserPrefs = true;
    }

    return {
      success: true,
      updated: true,
      projectFactsCount: projectFacts.length,
      userPreferencesCount: wroteUserPrefs ? userPreferences.length : 0
    };

  } catch (err) {
    console.warn('[AutoMemory] Failed to converge turn memory:', err.message);
    return { success: false, error: err.message };
  }
}
