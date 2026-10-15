import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 轻量级零依赖 Frontmatter 解析器
 */
export function parseFrontmatter(text) {
  if (!text) return { meta: {}, body: '' };

  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = text.match(frontmatterRegex);

  if (!match) {
    return { meta: {}, body: text.trim() };
  }

  const yamlBlock = match[1];
  const body = match[2].trim();
  const meta = {};

  let currentKey = null;
  for (const rawLine of yamlBlock.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('- ') && currentKey) {
      const itemVal = line.slice(2).trim().replace(/^['"]|['"]$/g, '');
      if (!Array.isArray(meta[currentKey])) {
        meta[currentKey] = [];
      }
      meta[currentKey].push(itemVal);
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    currentKey = key;

    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else if (val === '') {
      meta[key] = [];
    } else {
      meta[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }

  return { meta, body };
}

/**
 * 通用技能加载器 (Skill Loader)
 * 
 * 职责：
 * 1. 扫描根目录 skills/ 下的 Markdown 技能定义 (SKILL.md)
 * 2. 导出超轻量 Manifest (name + description)，用于大模型进行渐进式意图匹配，极省 Token
 * 3. 当智能体决定调用该技能时，按需调取完整 SOP 正文并注入 Prompt
 */
export class SkillLoader {
  constructor({ skillsDir = null, userSkillsDir = null } = {}) {
    this.skillsDir = skillsDir;
    this.userSkillsDir = userSkillsDir;
    this.skills = new Map();
  }

  /**
   * 扫描并加载所有技能元数据 (可指定是否为用户自定义目录)
   */
  async loadFromDirectory(dirPath = null, isCustom = false) {
    const targetDir = dirPath || this.skillsDir;
    if (!targetDir || !fsSync.existsSync(targetDir)) {
      return [];
    }

    const entries = await fs.readdir(targetDir, { recursive: true, withFileTypes: true });
    const loaded = [];

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.toLowerCase() !== 'skill.md') continue;
      const skillMdPath = path.join(entry.parentPath || entry.path, entry.name);
      const skillFolder = path.dirname(skillMdPath);

      try {
        const rawContent = await fs.readFile(skillMdPath, 'utf-8');
        const { meta, body } = parseFrontmatter(rawContent);

        const skillId = meta.name || entry.name;

        // 检测是否存在确定性算法处理脚本 (handler.js / index.js 等)
        const handlerCandidate = ['handler.js', 'handler.mjs', 'index.js', 'index.mjs']
          .map(f => path.join(skillFolder, f))
          .find(p => fsSync.existsSync(p));

        const hasHandler = Boolean(handlerCandidate);
        const handlerPath = handlerCandidate ? pathToFileURL(handlerCandidate).href : null;

        const skillRecord = {
          id: skillId,
          name: meta.title || skillId,
          description: meta.description || '',
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          tools: Array.isArray(meta.tools) ? meta.tools : [],
          parameters: meta.parameters || {
            type: 'object',
            properties: {},
            additionalProperties: true
          },
          hasHandler,
          handlerPath,
          content: body,
          filePath: skillMdPath,
          custom: isCustom,
          isBuiltin: !isCustom
        };

        this.skills.set(skillId, skillRecord);
        loaded.push(skillId);
      } catch (err) {
        console.error(`[SkillLoader] 加载技能 ${entry.name} 失败:`, err.message);
      }
    }

    return loaded;
  }

  /**
   * 一键加载所有技能（内置 + 用户自定义）
   */
  async loadAll() {
    const builtin = await this.loadFromDirectory(this.skillsDir, false);
    let user = [];
    if (this.userSkillsDir && this.userSkillsDir !== this.skillsDir) {
      user = await this.loadFromDirectory(this.userSkillsDir, true);
    }
    return [...builtin, ...user];
  }

  /**
   * 获取所有技能的摘要（包含 id, name, description, tags, hasHandler, parameters, custom）
   */
  getManifests() {
    return Array.from(this.skills.values()).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags,
      hasHandler: s.hasHandler,
      parameters: s.parameters,
      custom: Boolean(s.custom),
      isBuiltin: Boolean(s.isBuiltin ?? !s.custom)
    }));
  }

  /**
   * 按需获取指定技能的完整 SOP 内容
   */
  getSkill(id) {
    return this.skills.get(id) || null;
  }

  /**
   * 动态创建并持久化技能 (自我演化支持)
   * 核心规范：优先写入用户数据目录 (%LOCALAPPDATA%/MeocoxFlow/skills)
   */
  async createSkill({
    id,
    name,
    description = '',
    tags = [],
    tools = [],
    content = '',
    parameters = null
  } = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('技能 id 不能为空');
    }
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const targetDir = this.userSkillsDir || this.skillsDir;
    if (!targetDir) {
      throw new Error('SkillLoader 未配置目标存储路径');
    }

    const skillFolder = path.join(targetDir, cleanId);
    await fs.mkdir(skillFolder, { recursive: true });

    // 组装 Frontmatter
    const frontmatterLines = [
      '---',
      `name: ${cleanId}`,
      `title: ${name || cleanId}`,
      `description: ${description || ''}`
    ];
    if (Array.isArray(tags) && tags.length > 0) {
      frontmatterLines.push(`tags: [${tags.map(t => `'${t}'`).join(', ')}]`);
    }
    if (Array.isArray(tools) && tools.length > 0) {
      frontmatterLines.push(`tools: [${tools.map(t => `'${t}'`).join(', ')}]`);
    }
    frontmatterLines.push('---');

    const fileContent = `${frontmatterLines.join('\n')}\n\n${(content || '').trim()}\n`;
    const skillMdPath = path.join(skillFolder, 'SKILL.md');
    await fs.writeFile(skillMdPath, fileContent, 'utf-8');

    const skillRecord = {
      id: cleanId,
      name: name || cleanId,
      description: description || '',
      tags: Array.isArray(tags) ? tags : [],
      tools: Array.isArray(tools) ? tools : [],
      parameters: parameters || {
        type: 'object',
        properties: {},
        additionalProperties: true
      },
      hasHandler: false,
      handlerPath: null,
      content: (content || '').trim(),
      filePath: skillMdPath,
      custom: true,
      isBuiltin: false
    };
    this.skills.set(cleanId, skillRecord);
    return skillRecord;
  }

  /**
   * 运行时动态注册内存技能 (测试或动态插件挂载)
   */
  registerSkill(skillRecord) {
    if (!skillRecord || !skillRecord.id) return;
    this.skills.set(skillRecord.id, {
      ...skillRecord,
      custom: skillRecord.custom ?? true,
      isBuiltin: skillRecord.isBuiltin ?? false
    });
  }

  /**
   * 运行时卸载内存技能
   */
  unregisterSkill(id) {
    if (!id) return;
    this.skills.delete(id);
  }
}
