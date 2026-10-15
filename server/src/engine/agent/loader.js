import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { buildLeadOrchestratorPrompt } from '../orchestrator/index.js';
import { parseYaml } from '../../runtime/frontmatter.js';

/**
 * 通用智能体定义加载器 (Agent Loader)
 * 
 * 职责：
 * 1. 扫描根目录 agents/<agent-id>/ 下的角色定义 (agent.yml + agent.md)
 * 2. 组装角色人设 (Persona)、绑定技能清单 (Skills)、授权工具白名单 (Tools)
 * 3. 动态组装为完整的 System Prompt，为大模型推理准备就绪
 */
export class AgentLoader {
  constructor({ agentsDir = null, userAgentsDir = null, skillLoader = null, toolRegistry = null } = {}) {
    this.agentsDir = agentsDir;
    this.userAgentsDir = userAgentsDir;
    this.skillLoader = skillLoader;
    this.toolRegistry = toolRegistry;
    this.agents = new Map();
  }

  /**
   * 扫描目录并加载智能体定义 (可指定是否为用户自定义目录)
   */
  async loadFromDirectory(dirPath = null, isCustom = false) {
    const targetDir = dirPath || this.agentsDir;
    if (!targetDir || !fsSync.existsSync(targetDir)) {
      return [];
    }

    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const loaded = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const agentFolder = path.join(targetDir, entry.name);
      const ymlPath = path.join(agentFolder, 'agent.yml');
      const mdPath = path.join(agentFolder, 'agent.md');

      if (!fsSync.existsSync(ymlPath) && !fsSync.existsSync(mdPath)) {
        continue;
      }

      try {
        let meta = {};
        if (fsSync.existsSync(ymlPath)) {
          const ymlContent = await fs.readFile(ymlPath, 'utf-8');
          meta = parseYaml(ymlContent);
        }

        let persona = '';
        if (fsSync.existsSync(mdPath)) {
          persona = await fs.readFile(mdPath, 'utf-8');
        }

        const agentId = meta.id || entry.name;
        const role = meta.role || meta.title || meta.name || agentId;
        const agentDef = {
          id: agentId,
          name: meta.name || agentId,
          role,
          title: meta.title || role,
          avatar: meta.avatar || null,
          description: meta.description || '',
          model: meta.model || null,
          skills: Array.isArray(meta.skills) ? meta.skills : [],
          tools: Array.isArray(meta.tools) ? meta.tools : ['*'],
          persona: persona.trim(),
          folderPath: agentFolder,
          custom: isCustom,
          isBuiltin: !isCustom
        };

        this.agents.set(agentId, agentDef);
        loaded.push(agentId);
      } catch (err) {
        console.error(`[AgentLoader] 加载智能体 ${entry.name} 失败:`, err.message);
      }
    }

    return loaded;
  }

  /**
   * 一键加载所有智能体（先扫描内置只读目录，再扫描用户自定义数据目录，用户同名覆盖）
   */
  async loadAll() {
    const builtinLoaded = await this.loadFromDirectory(this.agentsDir, false);
    let userLoaded = [];
    if (this.userAgentsDir && this.userAgentsDir !== this.agentsDir) {
      userLoaded = await this.loadFromDirectory(this.userAgentsDir, true);
    }
    return [...builtinLoaded, ...userLoaded];
  }

  getAgent(id) {
    return this.agents.get(id) || null;
  }

  getAllAgents() {
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      title: a.title,
      avatar: a.avatar,
      description: a.description,
      model: a.model,
      skills: a.skills,
      tools: a.tools,
      custom: Boolean(a.custom),
      isBuiltin: Boolean(a.isBuiltin ?? !a.custom)
    }));
  }

  /**
   * 动态创建并持久化智能体 (自我演化支持)
   * 核心规范：优先写入用户数据目录 (%LOCALAPPDATA%/MeocoxFlow/agents)，不污染安装包目录
   */
  async createAgent({
    id,
    name,
    title = '',
    role = '',
    avatar = null,
    description = '',
    model = 'auto',
    skills = [],
    tools = ['*'],
    persona = ''
  } = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('智能体 id 不能为空');
    }
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    // 优先写入用户自定义目录 (可写环境)
    const targetDir = this.userAgentsDir || this.agentsDir;
    if (!targetDir) {
      throw new Error('AgentLoader 未配置目标存储路径');
    }

    const agentFolder = path.join(targetDir, cleanId);
    await fs.mkdir(agentFolder, { recursive: true });

    // 1. 生成 agent.yml
    const yamlLines = [
      `id: ${cleanId}`,
      `name: ${name || cleanId}`,
      `title: ${title || role || name || cleanId}`,
      `role: ${role || title || name || cleanId}`,
      `model: ${model || 'auto'}`
    ];
    if (avatar) yamlLines.push(`avatar: ${avatar}`);
    if (description) yamlLines.push(`description: ${description}`);

    yamlLines.push('skills:');
    if (Array.isArray(skills) && skills.length > 0) {
      skills.forEach(s => yamlLines.push(`  - ${s}`));
    }
    yamlLines.push('tools:');
    if (Array.isArray(tools) && tools.length > 0) {
      tools.forEach(t => yamlLines.push(`  - ${t}`));
    }

    await fs.writeFile(path.join(agentFolder, 'agent.yml'), yamlLines.join('\n') + '\n', 'utf-8');

    // 2. 生成 agent.md
    await fs.writeFile(path.join(agentFolder, 'agent.md'), (persona || '').trim() + '\n', 'utf-8');

    // 3. 内存立即生效 (标记为用户自定义实体 custom: true)
    const agentDef = {
      id: cleanId,
      name: name || cleanId,
      role: role || title || name || cleanId,
      title: title || role || name || cleanId,
      avatar: avatar || null,
      description: description || '',
      model: model || 'auto',
      skills: Array.isArray(skills) ? skills : [],
      tools: Array.isArray(tools) ? tools : ['*'],
      persona: (persona || '').trim(),
      folderPath: agentFolder,
      custom: true,
      isBuiltin: false
    };
    this.agents.set(cleanId, agentDef);
    return agentDef;
  }

  /**
   * 为指定智能体动态装配完整的 System Prompt
   * 包含：角色基础人设 + 绑定的专业 SOP 规约
   */
  buildSystemPrompt(agentId, context = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    if (agentId === 'super-brain') {
      return buildLeadOrchestratorPrompt({
        project: context.project || (context.projectId ? { id: context.projectId } : {}),
        assets: context.assets || [],
        storyboard: context.storyboard || [],
        registeredAgents: this.getAllAgents(),
        registeredSkills: this.skillLoader ? this.skillLoader.getManifests?.() || [] : [],
        pendingDecision: context.pendingDecision || null,
        activePerception: context.activePerception || null,
        dynamicNotes: context.dynamicNotes || [],
        memoryText: context.memoryText || ''
      });
    }

    const sections = [];

    // 1. 角色人设
    sections.push(`## 角色定位与职责\n${agent.persona}`);

    // 2. 动态挂载的技能规约
    if (this.skillLoader && agent.skills.length > 0) {
      const boundSkillsContent = agent.skills
        .map(skillId => {
          const sk = this.skillLoader.getSkill(skillId);
          return sk ? `### 专业技能指南【${sk.name}】:\n${sk.content}` : null;
        })
        .filter(Boolean);

      if (boundSkillsContent.length > 0) {
        sections.push(`## 当前绑定的专业操作手册 (SOP Rules)\n${boundSkillsContent.join('\n\n')}`);
      }
    }

    // 3. 深度思考与推演规约 (Universal CoT & Reasoning)
    sections.push(`## 深度思考与推演规约 (Universal Thinking)
在输出正式答复或执行工具前，若你需要进行分析、构思或推导，请在 <think> 与 </think> 标签内进行清晰严密的深度思考推演（例如分析用户诉求、拆解视频结构节奏、决策工具调度逻辑）。思考完毕后关闭 </think> 标签，并在之后给出正式答复。`);

    return sections.join('\n\n');
  }

  /**
   * 获取该智能体允许调用的工具 Function Calling Schemas
   */
  getAuthorizedToolSchemas(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent || !this.toolRegistry) return [];
    return this.toolRegistry.getSchemas(agent.tools);
  }
}
