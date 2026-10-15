import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { parseFrontmatter, parseYaml, stringifyYaml } from './frontmatter.js';
import { assertSafePathSegment } from '../utils/safePath.js';

// 统一走 config.paths.appRoot（打包态由 MEOCOX_APP_ROOT 注入），
// 不再用 __dirname 推导 —— SEA 单文件产物里 __dirname 不可靠
const REPO_ROOT = config.paths.appRoot;
const DEFAULT_AGENTS_DIR = path.resolve(REPO_ROOT, 'agents');
const DEFAULT_SKILLS_DIR = path.resolve(REPO_ROOT, 'skills');

function resolveDir(dirPath, fallback) {
  if (dirPath && fsSync.existsSync(dirPath)) return dirPath;
  if (dirPath) {
    const fromCwd = path.resolve(dirPath);
    if (fsSync.existsSync(fromCwd)) return fromCwd;
    // 相对 app 根解析，不依赖 process.cwd()
    const fromRoot = path.resolve(REPO_ROOT, dirPath);
    if (fsSync.existsSync(fromRoot)) return fromRoot;
  }
  return fallback;
}

function isPathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export class AgentSystem {
  constructor({ agentsDir = null, skillsDir = null, userAgentsDir = null, userSkillsDir = null } = {}) {
    this.agentsDir = agentsDir || DEFAULT_AGENTS_DIR;
    this.skillsDir = skillsDir || DEFAULT_SKILLS_DIR;
    this.userAgentsDir = userAgentsDir;
    this.userSkillsDir = userSkillsDir;
    this.agents = new Map();
    this.skills = new Map();
  }

  registerAgentText(id, rawText, filePath = '') {
    const { meta, body } = parseFrontmatter(rawText);
    const agentId = meta.id || id;
    const agentDef = {
      id: agentId,
      name: meta.name || agentId,
      model: meta.model || null,
      skills: meta.skills || [],
      tools: meta.tools || ['*'],
      persona: body,
      filePath
    };
    this.agents.set(agentId, agentDef);
    return agentDef;
  }

  registerSkillText(id, rawText, filePath = '', handlerMeta = {}) {
    const { meta, body } = parseFrontmatter(rawText);
    const skillId = meta.name || id;
    const skillDef = {
      id: skillId,
      name: meta.name || skillId,
      description: meta.description || '',
      category: meta.category || 'general',
      rules: body,
      filePath,
      hasHandler: Boolean(handlerMeta.hasHandler),
      handlerPath: handlerMeta.handlerPath || null,
      custom: Boolean(handlerMeta.isCustom)
    };
    this.skills.set(skillId, skillDef);
    return skillDef;
  }

  getAgent(id) {
    return this.agents.get(id);
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getSkill(id) {
    if (!id) return null;
    if (this.skills.has(id)) return this.skills.get(id);
    if (id.startsWith('genre-')) {
      const stripped = id.slice(6);
      if (this.skills.has(stripped)) return this.skills.get(stripped);
    } else {
      const prefixed = `genre-${id}`;
      if (this.skills.has(prefixed)) return this.skills.get(prefixed);
    }
    return null;
  }

  getAllSkills() {
    return Array.from(this.skills.values());
  }

  buildAgentPrompt(agentId, { project = {}, assets = [], storyboard = [], context = null } = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const boundSkillsText = (agent.skills || [])
      .map(sid => {
        const s = this.skills.get(sid);
        return s ? `### 专业规范手册【${s.name}】:\n${s.rules}` : null;
      })
      .filter(Boolean)
      .join('\n\n');

    // 通用上下文构建：支持动态领域扩展，仅当属性明确存在时才追加领域信息
    const contextLines = [
      `- 标题: ${project.title || '未命名'}`
    ];
    if (project.description) {
      contextLines.push(`- 描述: ${project.description}`);
    }
    if (project.game || project.theme) {
      contextLines.push(`- 主题/业务类别: ${project.game || project.theme}`);
    }
    if (project.category) {
      contextLines.push(`- 分类: ${project.category}`);
    }
    if (Array.isArray(assets) && assets.length > 0) {
      contextLines.push(`- 关联资源数量: ${assets.length}`);
    }
    if (Array.isArray(storyboard) && storyboard.length > 0) {
      contextLines.push(`- 分镜/步骤条目数量: ${storyboard.length}`);
    }
    if (context && typeof context === 'object') {
      for (const [key, val] of Object.entries(context)) {
        if (val !== undefined && val !== null && !['project', 'assets', 'storyboard'].includes(key)) {
          contextLines.push(`- ${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`);
        }
      }
    }

    return `你是系统中的专业员工：【${agent.name}】（ID: ${agent.id}）。\n${agent.persona}\n\n${boundSkillsText ? `【你必须严格遵守的专业技能规范】：\n${boundSkillsText}\n` : ''}\n【当前项目上下文】：\n${contextLines.join('\n')}\n`;
  }

  async createCustomAgent({ id, name, title = '', model = 'gemini-3.8-flash', skills = [], tools = ['*'], persona = '' }) {
    if (!id || !name) throw new Error('Agent id and name are required');
    const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (this.agents.get(safeId)?.custom === false) {
      throw new Error(`智能体 "${safeId}" 为系统内置角色，不允许覆盖`);
    }
    const builtinIds = new Set(['super-brain', 'director', 'screenwriter', 'timeline-editor', 'vision-scout', 'org-architect', 'visual-artist', 'perception-specialist', 'evolution-specialist', 'code-motion-engineer']);
    if (builtinIds.has(safeId)) throw new Error(`智能体 "${safeId}" 为系统内置角色，不允许覆盖`);
    const targetDir = this.userAgentsDir || this.agentsDir;
    const agentFolder = path.join(targetDir, assertSafePathSegment(safeId, 'agentId'));
    await fs.mkdir(agentFolder, { recursive: true });

    const normalizedSkills = Array.isArray(skills)
      ? skills
      : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : []);
    const normalizedTools = Array.isArray(tools)
      ? tools
      : (typeof tools === 'string' ? tools.split(',').map(t => t.trim()).filter(Boolean) : ['*']);

    const ymlContent = stringifyYaml({
      id: safeId,
      name: name.trim(),
      ...(title.trim() ? { title: title.trim() } : {}),
      model: (model && model.trim()) ? model.trim() : 'gemini-3.8-flash',
      skills: normalizedSkills,
      tools: normalizedTools
    });

    const ymlPath = path.join(agentFolder, 'agent.yml');
    const mdPath = path.join(agentFolder, 'agent.md');

    await fs.writeFile(ymlPath, ymlContent + '\n', 'utf-8');
    await fs.writeFile(mdPath, (persona || `你是【${name}】。`).trim() + '\n', 'utf-8');

    const agentDef = {
      id: safeId,
      name: name.trim(),
      title: title.trim() || name.trim(),
      model: (model && model.trim()) ? model.trim() : 'gemini-3.8-flash',
      skills: normalizedSkills,
      tools: normalizedTools,
      persona: persona.trim(),
      filePath: mdPath,
      configPath: ymlPath,
      custom: true
    };
    this.agents.set(safeId, agentDef);
    return agentDef;
  }

  async createCustomSkill({ id, name = '', category = '', description = '', markdown = '', rules = '', handlerCode = null }) {
    if (!id) throw new Error('Skill id is required');
    const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (this.skills.get(safeId)?.custom === false) {
      throw new Error(`技能规约 "${safeId}" 为系统内置规约，不允许覆盖`);
    }
    const builtinSkillIds = new Set(['high-energy', 'system-blueprint-guide', 'system-compliance-check', 'video-perception', 'audio-perception', 'image-perception', 'doc-perception']);
    if (builtinSkillIds.has(safeId)) throw new Error(`技能规约 "${safeId}" 为系统内置规约，不允许覆盖`);
    const targetDir = this.userSkillsDir || this.skillsDir;
    const categoryParts = category
      ? String(category).split(/[\\/]+/).filter(Boolean).map((part) => assertSafePathSegment(part, 'skillCategory'))
      : [];
    const skillFolder = path.join(targetDir, ...categoryParts, assertSafePathSegment(safeId, 'skillId'));
    await fs.mkdir(skillFolder, { recursive: true });

    let mdContent = '';
    if (markdown && markdown.trim()) {
      mdContent = markdown.trim() + '\n';
    } else {
      const displayName = (name && name.trim()) ? name.trim() : safeId;
      mdContent = `---\nname: ${displayName}\ndescription: ${description.trim()}\n---\n${rules.trim() || '# 剪辑规约'}\n`;
    }

    const mdPath = path.join(skillFolder, 'SKILL.md');
    await fs.writeFile(mdPath, mdContent, 'utf-8');

    let hasHandler = false;
    let handlerPath = null;
    if (handlerCode && handlerCode.trim()) {
      handlerPath = path.join(skillFolder, 'handler.ts');
      await fs.writeFile(handlerPath, handlerCode.trim() + '\n', 'utf-8');
      hasHandler = true;
    }

    const parsed = parseFrontmatter(mdContent);
    const skillDef = {
      id: safeId,
      name: parsed.meta.name || (name && name.trim()) || safeId,
      description: parsed.meta.description || description.trim(),
      category: parsed.meta.category || category || 'custom',
      rules: parsed.body || rules.trim(),
      filePath: mdPath,
      hasHandler,
      handlerPath,
      custom: true
    };
    this.skills.set(safeId, skillDef);
    return skillDef;
  }

  async deleteAgent(id) {
    const builtinIds = ['super-brain', 'director', 'screenwriter', 'timeline-editor', 'vision-scout', 'org-architect', 'visual-artist', 'perception-specialist', 'evolution-specialist', 'code-motion-engineer'];
    if (builtinIds.includes(id)) {
      throw new Error(`智能体 "${id}" 为系统内置角色不允许删除`);
    }
    const safeId = assertSafePathSegment(id, 'agentId');
    const agent = this.agents.get(safeId);
    const userRoot = this.userAgentsDir || this.agentsDir;
    if ((agent && agent.custom === false) || (agent?.filePath && !isPathInside(userRoot, agent.filePath))) {
      throw new Error(`智能体 "${id}" 为系统内置角色不允许删除`);
    }
    const agentFolder = agent?.filePath
      ? path.dirname(agent.filePath)
      : path.join(this.userAgentsDir || this.agentsDir, safeId);
    if (fsSync.existsSync(agentFolder)) {
      await fs.rm(agentFolder, { recursive: true, force: true });
    }
    this.agents.delete(safeId);
    return { success: true, message: `已成功删除智能体 "${safeId}"` };
  }

  async deleteSkill(id) {
    const builtinSkillIds = [
      'high-energy',
      'system-blueprint-guide',
      'system-compliance-check',
      'video-perception',
      'audio-perception',
      'image-perception',
      'doc-perception'
    ];
    if (builtinSkillIds.includes(id)) {
      throw new Error(`技能规约 "${id}" 为系统内置技能规约不允许删除`);
    }
    const safeId = assertSafePathSegment(id, 'skillId');
    const skill = this.skills.get(safeId);
    const userRoot = this.userSkillsDir || this.skillsDir;
    if ((skill && skill.custom === false) || (skill?.filePath && !isPathInside(userRoot, skill.filePath))) {
      throw new Error(`技能规约 "${safeId}" 为系统内置技能规约不允许删除`);
    }
    if (skill?.filePath && fsSync.existsSync(skill.filePath)) {
      const folder = path.dirname(skill.filePath);
      await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    }
    const legacyFolder = path.join(this.userSkillsDir || this.skillsDir, safeId);
    if (fsSync.existsSync(legacyFolder)) await fs.rm(legacyFolder, { recursive: true, force: true }).catch(() => {});
    this.skills.delete(safeId);
    return { success: true, message: `已成功删除技能规约 "${safeId}"` };
  }

  async loadFromDisk() {
    const effectiveSkillsDir = resolveDir(this.skillsDir, DEFAULT_SKILLS_DIR);
    const effectiveAgentsDir = resolveDir(this.agentsDir, DEFAULT_AGENTS_DIR);

    // 清理已在磁盘上物理删除的智能体
    for (const [id, agent] of this.agents.entries()) {
      if (agent.filePath && !fsSync.existsSync(agent.filePath)) {
        this.agents.delete(id);
      }
    }

    try {
      const skillEntries = await fs.readdir(effectiveSkillsDir, { recursive: true, withFileTypes: true });
      for (const f of skillEntries) {
        if (f.isFile() && f.name.toLowerCase() === 'skill.md') {
          const fullPath = path.join(f.parentPath || f.path, f.name);
          const raw = await fs.readFile(fullPath, 'utf-8');
          const id = path.basename(path.dirname(fullPath));

          const dir = path.dirname(fullPath);
          let hasHandler = false;
          let handlerPath = null;

          try {
            const hTs = path.join(dir, 'handler.ts');
            await fs.access(hTs);
            hasHandler = true;
            handlerPath = hTs;
          } catch (e) {
            try {
              const hJs = path.join(dir, 'handler.js');
              await fs.access(hJs);
              hasHandler = true;
              handlerPath = hJs;
            } catch (e2) {}
          }

          this.registerSkillText(id, raw, fullPath, { hasHandler, handlerPath });
        }
      }
    } catch (e) {}

    // User-owned definitions live outside the read-only application resources.
    // Load them after bundled definitions so an explicit user override wins.
    if (this.userSkillsDir && this.userSkillsDir !== effectiveSkillsDir) {
      try {
        const skillEntries = await fs.readdir(this.userSkillsDir, { recursive: true, withFileTypes: true });
        for (const f of skillEntries) {
          if (!f.isFile() || f.name.toLowerCase() !== 'skill.md') continue;
          const fullPath = path.join(f.parentPath || f.path, f.name);
          const raw = await fs.readFile(fullPath, 'utf-8');
          const dir = path.dirname(fullPath);
          const handlerPath = ['handler.ts', 'handler.js']
            .map((name) => path.join(dir, name))
            .find((candidate) => fsSync.existsSync(candidate)) || null;
          this.registerSkillText(path.basename(dir), raw, fullPath, {
            hasHandler: Boolean(handlerPath), handlerPath, isCustom: true
          });
        }
      } catch (e) {}
    }

    try {
      const agentDirEntries = await fs.readdir(effectiveAgentsDir, { withFileTypes: true });
      for (const entry of agentDirEntries) {
        if (entry.isDirectory()) {
          const folderPath = path.join(effectiveAgentsDir, entry.name);
          const id = entry.name;

          let ymlPath = null;
          let ymlMeta = null;
          try {
            const p1 = path.join(folderPath, 'agent.yml');
            const rawYml = await fs.readFile(p1, 'utf-8');
            ymlPath = p1;
            ymlMeta = parseYaml(rawYml);
          } catch (e) {
            try {
              const p2 = path.join(folderPath, 'agent.yaml');
              const rawYml = await fs.readFile(p2, 'utf-8');
              ymlPath = p2;
              ymlMeta = parseYaml(rawYml);
            } catch (e2) {}
          }

          let mdPath = path.join(folderPath, 'agent.md');
          let mdBody = '';
          try {
            const rawMd = await fs.readFile(mdPath, 'utf-8');
            if (ymlMeta && Object.keys(ymlMeta).length > 0) {
              mdBody = rawMd.trim();
            } else {
              const parsed = parseFrontmatter(rawMd);
              ymlMeta = parsed.meta;
              mdBody = parsed.body;
            }
          } catch (e) {}

          if (ymlMeta || mdBody) {
            const agentId = ymlMeta?.id || id;
            const isBuiltin = ['super-brain', 'director', 'screenwriter', 'timeline-editor', 'vision-scout', 'org-architect', 'visual-artist', 'perception-specialist', 'evolution-specialist', 'code-motion-engineer'].includes(agentId);
            const agentDef = {
              id: agentId,
              name: ymlMeta?.name || agentId,
              title: ymlMeta?.title || ymlMeta?.role || '',
              model: ymlMeta?.model || null,
              skills: ymlMeta?.skills || [],
              tools: ymlMeta?.tools || ['*'],
              persona: mdBody,
              filePath: mdPath,
              configPath: ymlPath,
              custom: !isBuiltin
            };
            this.agents.set(agentId, agentDef);
          }
        }
      }
    } catch (e) {}

    if (this.userAgentsDir && this.userAgentsDir !== effectiveAgentsDir) {
      try {
        const entries = await fs.readdir(this.userAgentsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const folderPath = path.join(this.userAgentsDir, entry.name);
          const ymlPath = path.join(folderPath, 'agent.yml');
          const mdPath = path.join(folderPath, 'agent.md');
          let meta = {};
          try { meta = parseYaml(await fs.readFile(ymlPath, 'utf-8')); }
          catch {
            try { meta = parseYaml(await fs.readFile(path.join(folderPath, 'agent.yaml'), 'utf-8')); }
            catch {}
          }
          let persona = '';
          try { persona = (await fs.readFile(mdPath, 'utf-8')).trim(); }
          catch {}
          if (!Object.keys(meta).length && !persona) continue;
          const agentId = meta.id || entry.name;
          this.agents.set(agentId, {
            id: agentId,
            name: meta.name || agentId,
            title: meta.title || meta.role || meta.name || agentId,
            model: meta.model || null,
            skills: meta.skills || [],
            tools: meta.tools || ['*'],
            persona,
            filePath: mdPath,
            configPath: ymlPath,
            custom: true
          });
        }
      } catch (e) {}
    }
  }
}

export const defaultAgentSystem = new AgentSystem({
  agentsDir: DEFAULT_AGENTS_DIR,
  skillsDir: DEFAULT_SKILLS_DIR,
  userAgentsDir: config.paths.userAgentsDir,
  userSkillsDir: config.paths.userSkillsDir
});
