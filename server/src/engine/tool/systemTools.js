import { createEnvelope } from './envelope.js';
import { createLeanPackage } from '../orchestrator/contextPackager.js';

/**
 * 工业级通用多智能体系统核心内置工具集 (System Builtin Tools)
 * 
 * 1. invoke_skill: 沙箱化执行专业技能 (Skill)，拥有独立运行上下文，不污染主会话
 * 2. assign_task_to_agent: 多智能体任务接力与委派交接 (Agent Handoff & Lean Dispatch)
 * 3. request_hitl_decision: 人机协同决策中断与挂起 (Human In The Loop)
 */

export function createSystemTools({ skillLoader, agentLoader, toolRegistry, callSkillFn }) {
  const tools = [];

  // ── 1. invoke_skill: 技能沙箱化调度 ──
  tools.push({
    name: 'invoke_skill',
    description: '调度执行已注册的专业技能 (Skill)。技能在独立沙箱上下文中运行（可调用确定性算法处理或独立子模型推理），不污染当前智能体的主会话上下文，执行完毕返回标准结构化数据。',
    isSystem: true,
    inputSchema: {
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          description: '技能唯一标识符 (例如 aigc-storyboard, beat-sync 等)'
        },
        params: {
          type: 'object',
          description: '传递给该技能的结构化输入参数'
        },
        task: {
          type: 'string',
          description: '该技能本次需达成的具体子任务目标说明'
        }
      },
      required: ['skillId']
    },
    handler: async (args = {}, context = {}) => {
      const { skillId, params = {}, task = '' } = args;
      if (!skillId || typeof skillId !== 'string') {
        return createEnvelope({
          success: false,
          summary: '调用技能失败: 必须指定 skillId',
          error: { code: 'INVALID_SKILL_ID', message: 'skillId is required' }
        });
      }

      if (typeof callSkillFn === 'function') {
        return await callSkillFn(skillId.trim(), { ...params, task, _callingContext: context });
      }

      return createEnvelope({
        success: false,
        summary: '系统未就绪: callSkillFn 未挂载',
        error: { code: 'ENGINE_NOT_READY', message: 'Skill executor is not configured' }
      });
    }
  });

  // ── 2. dispatch_agent & assign_task_to_agent: 专职智能体沙盒激活与精炼派发 ──
  const handleAgentDispatch = async (args = {}, callContext = {}) => {
    const targetAgentId = args.targetAgentId ? String(args.targetAgentId).trim() : '';
    const effectiveTask = (args.mandate || args.task || '').trim();
    const effectiveContext = args.contextRefs || args.context || {};
    const constraints = Array.isArray(args.constraints) ? args.constraints : (callContext.constraints || []);
    const inheritedConstraints = Array.isArray(args.inheritedConstraints) ? args.inheritedConstraints : [];
    const acceptanceCriteria = Array.isArray(args.acceptanceCriteria) ? args.acceptanceCriteria : [];
    const inputArtifacts = Array.isArray(args.inputArtifacts) ? args.inputArtifacts : [];
    const accessMode = args.accessMode || 'read_only';
    const reason = (args.reason || '多智能体任务协同推进').trim();

    if (!targetAgentId) {
      return createEnvelope({
        success: false,
        summary: '委派失败: 必须指定 targetAgentId',
        error: { code: 'INVALID_AGENT_ID', message: 'targetAgentId is required' }
      });
    }

    const targetAgent = agentLoader?.getAgent(targetAgentId);
    const targetName = targetAgent?.name || targetAgentId;

    // 构建精炼上下文 (Lean Context)
    let leanPackage = null;
    try {
      leanPackage = createLeanPackage({
        task: effectiveTask,
        mandate: effectiveTask,
        targetAgentId,
        localAssets: callContext.assets || [],
        inputArtifacts,
        contextRefs: effectiveContext,
        constraints,
        inheritedConstraints,
        acceptanceCriteria,
        accessMode,
        project: { id: callContext.projectId }
      });
    } catch {}

    return createEnvelope({
      success: true,
      summary: `已将任务成功委派转交给【${targetName}】`,
      data: {
        isHandoff: true,
        delegatedTo: targetAgentId,
        targetAgentId,
        targetAgentName: targetName,
        targetAgentRole: targetAgent?.role || targetAgent?.title || '执行专家',
        task: effectiveTask,
        mandate: effectiveTask,
        accessMode: leanPackage?.accessMode || accessMode,
        inheritedConstraints: leanPackage?.inheritedConstraints || inheritedConstraints,
        acceptanceCriteria: leanPackage?.acceptanceCriteria || acceptanceCriteria,
        context: effectiveContext,
        contextRefs: effectiveContext,
        reason,
        leanPackage
      }
    });
  };

  tools.push({
    name: 'dispatch_agent',
    description: '主管-执行者核心调度工具：激活并调度具有独立沙盒、专业技能规约与专有工具的下属智能体（如 perception-specialist, evolution-specialist 等）。下发精炼使命(mandate)、继承约束(inheritedConstraints)、前序引用(contextRefs/inputArtifacts)与验收断言(acceptanceCriteria)，执行完毕后在沙箱脱水并向主脑返回轻量报告。',
    isSystem: true,
    inputSchema: {
      type: 'object',
      properties: {
        targetAgentId: {
          type: 'string',
          description: '被激活调度的目标智能体 ID（例如 perception-specialist, evolution-specialist 等）'
        },
        mandate: {
          type: 'string',
          description: '激活该专员的核心使命、明确执行指令与交付目标（亦可使用 task）'
        },
        task: {
          type: 'string',
          description: '任务描述（兼容字段，与 mandate 等效）'
        },
        accessMode: {
          type: 'string',
          enum: ['read_only', 'isolated_write', 'exclusive_write'],
          description: '工作区并发访问级别：read_only(只读共享) / isolated_write(隔离沙箱写) / exclusive_write(排他锁写)'
        },
        contextRefs: {
          type: 'object',
          description: '前序产物引用、感知卡片引用或本地绝对路径引用对象（例如 { assetPath: "D:/assets/clip.mp4" }）'
        },
        inputArtifacts: {
          type: 'array',
          description: '输入资产引用列表（OS 绝对物理路径或版本化产物引用）',
          items: { type: 'object' }
        },
        context: {
          type: 'object',
          description: '附加业务上下文数据（兼容字段）'
        },
        inheritedConstraints: {
          type: 'array',
          items: { type: 'string' },
          description: '显式继承的全局红线与用户在当前会话确立的关键偏好（防止上下文脱水导致语义断层）'
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: '执行硬性边界与约束条件列表'
        },
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: '完成该子任务的客观可验证断言清单'
        },
        reason: {
          type: 'string',
          description: '调度激活该专员的战略缘由或编排动机说明'
        }
      },
      required: ['targetAgentId']
    },
    handler: handleAgentDispatch
  });

  tools.push({
    name: 'assign_task_to_agent',
    description: '主管-执行者调度工具（兼容接口）：将特定的视频创意策划、分镜编排、剪辑工程、视觉感知等任务委派给指定专职下属智能体执行。',
    isSystem: true,
    inputSchema: {
      type: 'object',
      properties: {
        targetAgentId: {
          type: 'string',
          description: '目标智能体 ID (例如 perception-specialist, evolution-specialist 等)'
        },
        task: {
          type: 'string',
          description: '明确且具体的执行指令与预期交付目标'
        },
        context: {
          type: 'object',
          description: '可选的附加业务上下文数据或产物引用'
        },
        reason: {
          type: 'string',
          description: '任务转交的缘由或调度动机说明'
        }
      },
      required: ['targetAgentId', 'task']
    },
    handler: handleAgentDispatch
  });

  // ── 3. request_hitl_decision: 人机协同决策中断 ──
  tools.push({
    name: 'request_hitl_decision',
    description: '当面临多个关键备选方案、高危操作或需用户主观偏好确认时，挂起当前执行流，向用户发起交互式决策卡片，等待用户裁决后恢复执行。',
    isSystem: true,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '向用户提出的决策问题或确认说明'
        },
        options: {
          type: 'array',
          description: '供用户单选的备选方案列表',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '选项唯一标识' },
              label: { type: 'string', description: '选项标题文本' },
              description: { type: 'string', description: '选项详细说明' },
              isRecommended: { type: 'boolean', description: '是否为推荐项' }
            },
            required: ['id', 'label']
          }
        },
        context: {
          type: 'object',
          description: '待挂起保存的上下文数据'
        }
      },
      required: ['prompt', 'options']
    },
    handler: async (args = {}) => {
      const { prompt, options = [], context = {} } = args;
      if (!prompt || !Array.isArray(options) || options.length === 0) {
        return createEnvelope({
          success: false,
          summary: '发起决策失败: 必须包含 prompt 及至少一个 option 选项',
          error: { code: 'INVALID_DECISION_ARGS', message: 'prompt and options array are required' }
        });
      }

      const decisionId = `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      return createEnvelope({
        success: true,
        summary: `已向用户发起人机协同决策请求: "${prompt}"`,
        data: {
          isDecisionRequest: true,
          decisionId,
          prompt: prompt.trim(),
          options,
          context
        }
      });
    }
  });

  // ── 4. inspect_system_capabilities: 盘点当前系统智能体与工具清单 (支持 Tier-3 Schema 按需水合) ──
  tools.push({
    name: 'inspect_system_capabilities',
    description: '盘点当前系统所有现存的智能体、专业技能及可用工具摘要清单（Tier-2 索引）；若传入 toolNames 数组，则按需动态返回指定工具的完整 JSON Schema（Tier-3 按需水合）。',
    isSystem: true,
    inputSchema: {
      type: 'object',
      properties: {
        toolNames: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：需要按需获取完整参数 JSON Schema 的工具名称列表（Tier-3 渐进暴露）'
        }
      }
    },
    handler: async (args = {}) => {
      const requestedToolNames = Array.isArray(args?.toolNames)
        ? args.toolNames.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim())
        : [];

      const agents = agentLoader ? agentLoader.getAllAgents().map(a => ({
        id: a.id,
        name: a.name,
        title: a.title || a.role,
        role: a.role || a.title,
        description: a.description || '',
        model: a.model,
        skills: a.skills || [],
        tools: a.tools || []
      })) : [];
      const skills = skillLoader ? skillLoader.getManifests().map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        tags: s.tags || []
      })) : [];
      const toolList = toolRegistry ? toolRegistry.list().map(t => ({
        name: t.name,
        description: t.description || ''
      })) : [];

      const hydratedToolSchemas = (requestedToolNames.length > 0 && toolRegistry)
        ? toolRegistry.getSchemas(requestedToolNames, { includeSystem: false })
        : [];

      const agentOverview = agents.length > 0 
        ? agents.map(a => `${a.name}(${a.title || a.id})`).join('、')
        : '暂无协同智能体';

      return createEnvelope({
        success: true,
        summary: `系统能力盘点：现有 ${agents.length} 个智能体【${agentOverview}】，${skills.length} 个专业技能，${toolList.length} 个可用工具${hydratedToolSchemas.length > 0 ? `（已按需水合 ${hydratedToolSchemas.length} 个工具 Schema）` : ''}。`,
        data: {
          totalAgents: agents.length,
          agents,
          totalSkills: skills.length,
          skills,
          totalTools: toolList.length,
          tools: toolList,
          ...(hydratedToolSchemas.length > 0 ? { hydratedToolSchemas } : {})
        }
      });
    }
  });

  // ── 5. apply_workflow_decision: 主脑代人类进行裁决并恢复工作流 ──
  tools.push({
    name: 'apply_workflow_decision',
    description: '当用户在与主脑对话中要求主脑代为决策，或明确指示采纳某备选方案时调用此工具。工具将裁决意图与选项提交给挂起的任务/工作流节点，使其解冻并恢复执行。',
    isSystem: true,
    inputSchema: {
      type: 'object',
      properties: {
        decisionId: {
          type: 'string',
          description: '待裁决的决策请求唯一 ID'
        },
        optionId: {
          type: 'string',
          description: '所选选项的 ID (例如 option_1, A, approve 等)'
        },
        choiceText: {
          type: 'string',
          description: '方案文本名称或自定义裁决说明'
        },
        reason: {
          type: 'string',
          description: '主脑做出该决策的分析理由或指导意见'
        }
      },
      required: ['decisionId']
    },
    handler: async (args = {}) => {
      const { decisionId, optionId = null, choiceText = '', reason = '' } = args;
      if (!decisionId || typeof decisionId !== 'string') {
        return createEnvelope({
          success: false,
          summary: '执行裁决失败: 必须指定 decisionId',
          error: { code: 'INVALID_DECISION_ID', message: 'decisionId is required' }
        });
      }

      return createEnvelope({
        success: true,
        summary: `主脑已代为执行裁决：已采纳【${choiceText || optionId || '指定方案'}】，工作流正在恢复执行`,
        data: {
          isDecisionApplied: true,
          decisionId: decisionId.trim(),
          optionId: optionId?.trim() || null,
          choiceText: choiceText?.trim() || '',
          reason: reason?.trim() || '',
          actor: 'super-brain'
        }
      });
    }
  });

  // ── 6. register_dynamic_agent: 动态创建并注册新智能体 (系统自演化) ──
  tools.push({
    name: 'register_dynamic_agent',
    description: '在系统运行时动态创建并持久化注册一个全新的专业智能体（系统自演化扩展）。底层会自动安全落盘至用户自定义数据目录 (%LOCALAPPDATA%/MeocoxFlow/agents/) 并立即热加载生效（标记为自定义角色），使系统即刻拥有该领域的专业执行能力，之后可通过 assign_task_to_agent 委派任务。',
    isSystem: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '新智能体的唯一标识符 (小写英文与下划线，例如 video_slicer, storyboard_artist)'
        },
        name: {
          type: 'string',
          description: '智能体显示名称 (例如 镜头切片师、分镜故事板编导)'
        },
        title: {
          type: 'string',
          description: '智能体头衔或职位 (例如 视频感知分析师、资深分镜师)'
        },
        description: {
          type: 'string',
          description: '智能体职责简述与专长定位'
        },
        persona: {
          type: 'string',
          description: '该智能体的完整 System Prompt 与行为规范 (Markdown 格式)'
        },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: '该智能体绑定的专业技能 ID 列表'
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: '该智能体授权使用的工具名称列表 (默认为 ["*"])'
        },
        model: {
          type: 'string',
          description: '该智能体执行推理绑定的模型 (默认 "auto")'
        }
      },
      required: ['id', 'name', 'persona']
    },
    handler: async (args = {}) => {
      const { id, name, title = '', description = '', persona = '', skills = [], tools = ['*'], model = 'auto' } = args;
      if (!id || typeof id !== 'string') {
        return createEnvelope({
          success: false,
          summary: '注册智能体失败: id 为必填项',
          error: { code: 'INVALID_AGENT_ID', message: 'id is required' }
        });
      }
      if (!agentLoader || typeof agentLoader.createAgent !== 'function') {
        return createEnvelope({
          success: false,
          summary: '注册智能体失败: 底层 agentLoader 不支持动态创建',
          error: { code: 'FEATURE_UNSUPPORTED', message: 'agentLoader.createAgent is not available' }
        });
      }

      try {
        const created = await agentLoader.createAgent({
          id: id.trim(),
          name: name?.trim() || id.trim(),
          title: title?.trim() || name?.trim() || id.trim(),
          role: title?.trim() || name?.trim() || id.trim(),
          description: description?.trim() || '',
          persona: persona.trim(),
          skills,
          tools,
          model
        });

        return createEnvelope({
          success: true,
          summary: `已成功动态孵化并注册新智能体【${created.name}】(${created.id})，全系统已就绪可随时委派任务。`,
          data: {
            isAgentCreated: true,
            agent: created
          }
        });
      } catch (err) {
        return createEnvelope({
          success: false,
          summary: `动态创建智能体失败: ${err.message}`,
          error: { code: 'CREATE_AGENT_FAILED', message: err.message }
        });
      }
    }
  });

  // ── 7. register_dynamic_skill: 动态创建并注册新技能 (系统自演化) ──
  tools.push({
    name: 'register_dynamic_skill',
    description: '在系统运行时动态创建并持久化注册一个全新的专业操作技能/SOP（系统自演化扩展）。底层会自动安全落盘至用户自定义数据目录 (%LOCALAPPDATA%/MeocoxFlow/skills/) 并立即热加载生效（标记为自定义技能），供智能体按需挂载遵照执行。',
    isSystem: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '新技能唯一标识 (例如 video_rhythm_sync, shot_reverse_prompt)'
        },
        name: {
          type: 'string',
          description: '技能标题名称 (例如 节奏卡点对齐法、分镜镜头反推技术规范)'
        },
        description: {
          type: 'string',
          description: '技能功能说明，供大模型匹配意图时参考'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签列表'
        },
        content: {
          type: 'string',
          description: '技能详细的操作手册、约束规范与工作流逻辑 (Markdown 格式)'
        }
      },
      required: ['id', 'name', 'content']
    },
    handler: async (args = {}) => {
      const { id, name, description = '', tags = [], content = '' } = args;
      if (!id || typeof id !== 'string') {
        return createEnvelope({
          success: false,
          summary: '注册技能失败: id 为必填项',
          error: { code: 'INVALID_SKILL_ID', message: 'id is required' }
        });
      }
      if (!skillLoader || typeof skillLoader.createSkill !== 'function') {
        return createEnvelope({
          success: false,
          summary: '注册技能失败: 底层 skillLoader 不支持动态创建',
          error: { code: 'FEATURE_UNSUPPORTED', message: 'skillLoader.createSkill is not available' }
        });
      }

      try {
        const created = await skillLoader.createSkill({
          id: id.trim(),
          name: name?.trim() || id.trim(),
          description: description?.trim() || '',
          tags,
          content: content.trim()
        });

        return createEnvelope({
          success: true,
          summary: `已成功动态沉淀并注册新技能【${created.name}】(${created.id})，智能体可在执行时动态挂载。`,
          data: {
            isSkillCreated: true,
            skill: created
          }
        });
      } catch (err) {
        return createEnvelope({
          success: false,
          summary: `动态创建技能失败: ${err.message}`,
          error: { code: 'CREATE_SKILL_FAILED', message: err.message }
        });
      }
    }
  });

  return tools;
}
