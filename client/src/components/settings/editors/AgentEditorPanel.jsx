import React, { useState, useMemo, useRef } from 'react';
import {
  Sparkles,
  Wrench,
  Check,
  Search,
  ShieldCheck,
  FileText,
  ChevronDown,
  UploadCloud,
  X
} from 'lucide-react';
import ModelSelectDropdown from '@/components/common/ModelSelectDropdown.jsx';
import { splitAgentNameAndTitle } from '@/utils/agentUtils.js';
import { toast } from '@/components/ui/sonner.jsx';

export default function AgentEditorPanel({
  agent = null,
  providers = [],
  availableModels = [],
  skillsList = [],
  toolsList = [],
  onSave,
  onCancel,
  handleOpenFolder,
  isSaving = false
}) {
  const isEditing = Boolean(agent && agent.id);

  // Form State: Separate name and title
  const [formData, setFormData] = useState(() => {
    const { name: initialName, title: initialTitle } = splitAgentNameAndTitle(agent);
    return {
      id: agent?.id || '',
      name: initialName,
      title: initialTitle,
      model: agent?.model || '',
      skills: Array.isArray(agent?.skills)
        ? [...agent.skills]
        : (agent?.skills ? agent.skills.split(/[,，\s]+/).filter(Boolean) : []),
      tools: Array.isArray(agent?.tools)
        ? [...agent.tools]
        : (agent?.tools ? agent.tools.split(/[,，\s]+/).filter(Boolean) : ['*']),
      persona: agent?.persona || ''
    };
  });

  // agent.md is read-only and collapsed by default
  const [isPersonaOpen, setIsPersonaOpen] = useState(false);

  // File upload state for agent.md
  const fileInputRef = useRef(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileUpload = (file) => {
    if (!file) return;
    const name = file.name || '';
    const isMdOrTxt = name.endsWith('.md') || name.endsWith('.txt') || name.toLowerCase() === 'agent.md';
    if (!isMdOrTxt) {
      toast.warning('请选择 .md 或 .txt 格式的提示词文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result || '';
      setFormData(prev => ({ ...prev, persona: content }));
      setUploadedFileInfo({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        charCount: content.length
      });
      toast.success(`已载入文件 ${file.name}（${content.length} 字符）`);
    };
    reader.onerror = () => {
      toast.error('读取文件失败，请重试');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleClearFile = () => {
    setUploadedFileInfo(null);
    setFormData(prev => ({ ...prev, persona: '' }));
  };

  // Search filters
  const [skillSearch, setSkillSearch] = useState('');
  const [toolSearch, setToolSearch] = useState('');

  // Tools mode: 'all' (*) or custom
  const isAllTools = formData.tools.includes('*');

  // Group tools by source
  const groupedTools = useMemo(() => {
    const groups = {};
    (toolsList || []).forEach(tool => {
      const src = tool.source || 'local';
      const groupKey = src === 'local' ? 'builtin' : src.replace('mcp:', '');
      const groupLabel = src === 'local' ? '内置原生剪辑工具' : `MCP 扩展: ${groupKey}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          label: groupLabel,
          isMcp: src !== 'local',
          tools: []
        };
      }
      groups[groupKey].tools.push(tool);
    });
    return Object.values(groups);
  }, [toolsList]);

  // Skill toggle
  const toggleSkill = (skillId) => {
    setFormData(prev => {
      const exists = prev.skills.includes(skillId);
      const nextSkills = exists
        ? prev.skills.filter(s => s !== skillId)
        : [...prev.skills, skillId];
      return { ...prev, skills: nextSkills };
    });
  };

  const clearSkills = () => {
    setFormData(prev => ({ ...prev, skills: [] }));
  };

  // Tool toggle
  const toggleTool = (toolName) => {
    setFormData(prev => {
      let current = isAllTools ? [] : [...prev.tools];
      if (current.includes(toolName)) {
        current = current.filter(t => t !== toolName);
      } else {
        current.push(toolName);
      }
      return { ...prev, tools: current.length === 0 ? [] : current };
    });
  };

  // Toggle all tools for a specific group
  const toggleGroupTools = (groupTools) => {
    const names = groupTools.map(t => t.name);
    setFormData(prev => {
      let current = isAllTools ? [] : [...prev.tools];
      const allSelected = names.every(n => current.includes(n));
      if (allSelected) {
        current = current.filter(n => !names.includes(n));
      } else {
        names.forEach(n => {
          if (!current.includes(n)) current.push(n);
        });
      }
      return { ...prev, tools: current };
    });
  };

  // Set all tools mode
  const setAllToolsMode = (enable) => {
    if (enable) {
      setFormData(prev => ({ ...prev, tools: ['*'] }));
    } else {
      setFormData(prev => ({
        ...prev,
        tools: toolsList.length > 0 ? toolsList.slice(0, 5).map(t => t.name) : []
      }));
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!formData.name.trim()) {
      toast.warning('请填写角色名称');
      return;
    }
    if (!isEditing && !formData.id.trim()) {
      toast.warning('请填写角色ID');
      return;
    }
    onSave?.({
      ...formData,
      name: formData.name.trim(),
      title: (formData.title || '').trim()
    });
  };

  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skillsList;
    const q = skillSearch.trim().toLowerCase();
    return skillsList.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.id?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q)
    );
  }, [skillsList, skillSearch]);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full space-y-4 animate-in fade-in duration-200">
      {/* Scrollable Single Column Form (Top to Bottom Flow) */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
        
        {/* Card 1: Basic Properties & Model */}
        <div className="p-4 rounded-2xl bg-dark-900 border border-dark-750/80 space-y-3.5">
          <div className="text-xs font-bold text-white border-b border-dark-800 pb-2">
            基本配置
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                角色名称 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如: Director 或 艾米"
                className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white focus:border-brand-500/70 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                职位
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如: 总编导 或 剪辑大师"
                className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white focus:border-brand-500/70 focus:outline-none transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                角色ID <span className="text-rose-400">*</span> <span className="text-gray-500 font-normal">({isEditing ? '目录名不可修改' : '英文/数字/中划线，创建后不可修改'})</span>
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={formData.id}
                onChange={e => setFormData({ ...formData, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                placeholder="例如: director 或 video-editor"
                className={`w-full bg-dark-800 border rounded-xl px-3 py-2 text-xs text-white font-mono transition ${
                  isEditing
                    ? 'border-dark-700 opacity-60 cursor-not-allowed bg-dark-850'
                    : 'border-dark-700 focus:border-brand-500/70 focus:outline-none'
                }`}
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                {isEditing ? '已固定作为角色本地文件夹名与系统唯一标识' : '将作为角色本地文件夹名与系统唯一调度标识'}
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                调用模型
              </label>
              <ModelSelectDropdown
                value={formData.model}
                onChange={(modelId) => setFormData(prev => ({ ...prev, model: modelId }))}
                providers={providers}
                availableModels={availableModels}
                allowDefault={true}
                defaultLabel="跟随系统默认模型"
                variant="form"
                placement="bottom"
                align="left"
              />
            </div>
          </div>
        </div>

        {/* Card 3: Skills Section (Modernized interactive grid) */}
        <div className="p-4 rounded-2xl bg-dark-900 border border-dark-750/80 space-y-3">
          <div className="flex items-center justify-between border-b border-dark-800 pb-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-white">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>挂载技能</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                {formData.skills.length} 已选
              </span>
            </div>

            {formData.skills.length > 0 && (
              <button
                type="button"
                onClick={clearSkills}
                className="text-[11px] text-gray-400 hover:text-white transition cursor-pointer"
              >
                清空选择
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={skillSearch}
              onChange={e => setSkillSearch(e.target.value)}
              placeholder="搜索技能名称或标识..."
              className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Interactive Skills Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {filteredSkills.length === 0 ? (
              <div className="col-span-full py-4 text-center text-xs text-gray-500">
                暂无匹配技能
              </div>
            ) : (
              filteredSkills.map(skill => {
                const isSelected = formData.skills.includes(skill.id);
                return (
                  <div
                    key={skill.id}
                    onClick={() => toggleSkill(skill.id)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all select-none ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 ring-1 ring-amber-500/20'
                        : 'bg-dark-800/80 border-dark-700/80 hover:border-dark-600 text-gray-300 hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium truncate">{skill.name}</div>
                      {skill.description && (
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{skill.description}</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {isSelected ? (
                        <div className="w-4 h-4 rounded-md bg-amber-400 text-dark-950 flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-md border border-dark-600 bg-dark-700/50" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Card 4: Tools Section */}
        <div className="p-4 rounded-2xl bg-dark-900 border border-dark-750/80 space-y-3">
          <div className="flex items-center justify-between border-b border-dark-800 pb-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-white">
              <Wrench className="w-4 h-4 text-teal-400" />
              <span>工具权限</span>
            </div>

            {/* Segmented Mode Switch */}
            <div className="flex items-center bg-dark-800 rounded-xl p-0.5 border border-dark-700 text-xs">
              <button
                type="button"
                onClick={() => setAllToolsMode(true)}
                className={`px-3 py-1 rounded-lg cursor-pointer transition ${
                  isAllTools
                    ? 'bg-teal-500 text-white font-medium shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                全部允许 (*)
              </button>
              <button
                type="button"
                onClick={() => setAllToolsMode(false)}
                className={`px-3 py-1 rounded-lg cursor-pointer transition ${
                  !isAllTools
                    ? 'bg-teal-500 text-white font-medium shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                指定工具
              </button>
            </div>
          </div>

          {isAllTools ? (
            <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/25 text-xs text-teal-300 flex items-center space-x-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 text-teal-400" />
              <span>已开启全部工具权限，可自动调用原生剪辑工具与所有 MCP 扩展工具。</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Tool Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={toolSearch}
                  onChange={e => setToolSearch(e.target.value)}
                  placeholder="搜索工具名称或描述..."
                  className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-teal-500/50"
                />
              </div>

              {/* Grouped Tool Items */}
              <div className="max-h-52 overflow-y-auto space-y-3 pr-1">
                {groupedTools.map(group => {
                  const filteredGroupTools = group.tools.filter(t => {
                    if (!toolSearch.trim()) return true;
                    const q = toolSearch.trim().toLowerCase();
                    return t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
                  });

                  if (filteredGroupTools.length === 0) return null;

                  const allGroupSelected = filteredGroupTools.every(t => formData.tools.includes(t.name));

                  return (
                    <div key={group.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-gray-400 px-0.5">
                        <span className="font-semibold text-gray-300">{group.label}</span>
                        <button
                          type="button"
                          onClick={() => toggleGroupTools(filteredGroupTools)}
                          className="text-[11px] text-teal-400 hover:underline cursor-pointer"
                        >
                          {allGroupSelected ? '取消该组' : '全选该组'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {filteredGroupTools.map(tool => {
                          const isSelected = formData.tools.includes(tool.name);
                          return (
                            <div
                              key={tool.name}
                              onClick={() => toggleTool(tool.name)}
                              className={`p-2 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition select-none ${
                                isSelected
                                  ? 'bg-teal-500/10 border-teal-500/40 text-teal-200 ring-1 ring-teal-500/20'
                                  : 'bg-dark-800/80 border-dark-700/80 hover:border-dark-600 text-gray-300'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="font-mono text-xs truncate">{tool.name}</div>
                                {tool.description && (
                                  <div className="text-[10px] text-gray-400 truncate mt-0.5">{tool.description}</div>
                                )}
                              </div>
                              <div className="shrink-0">
                                {isSelected ? (
                                  <div className="w-4 h-4 rounded-md bg-teal-400 text-dark-950 flex items-center justify-center">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                  </div>
                                ) : (
                                  <div className="w-4 h-4 rounded-md border border-dark-600 bg-dark-700/50" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Card 5: System Prompt (agent.md) */}
        {!isEditing ? (
          <div className="rounded-2xl bg-dark-900 border border-dark-750/80 p-4 space-y-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".md,.txt"
              className="hidden"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white">系统提示词 (agent.md)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/30">
                  文件上传
                </span>
              </div>
              {uploadedFileInfo && (
                <span className="text-[10px] text-gray-500 font-mono">
                  {uploadedFileInfo.charCount} 字符
                </span>
              )}
            </div>

            {!uploadedFileInfo ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition select-none ${
                  isDragging
                    ? 'border-teal-500 bg-teal-500/10'
                    : 'border-dark-700/80 hover:border-dark-600 bg-dark-950/40 hover:bg-dark-950/70'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-dark-800/80 border border-dark-700 flex items-center justify-center text-gray-400 mb-2.5">
                  <UploadCloud className="w-5 h-5 text-teal-400" />
                </div>
                <p className="text-xs font-semibold text-gray-200">
                  点击选择或拖拽上传 agent.md 文件
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  支持 .md, .txt 提示词文件。若暂不上传，创建后将自动生成默认骨架。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-dark-950 border border-dark-750 flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white flex items-center space-x-2">
                        <span className="truncate">{uploadedFileInfo.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-300 font-mono">
                          {uploadedFileInfo.size}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        已加载为角色提示词（{uploadedFileInfo.charCount} 字符）
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsPersonaOpen(!isPersonaOpen)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
                    >
                      {isPersonaOpen ? '收起预览' : '查看内容'}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
                    >
                      重新上传
                    </button>
                    <button
                      type="button"
                      onClick={handleClearFile}
                      className="p-1.5 text-gray-400 hover:text-rose-400 rounded-lg hover:bg-dark-800 transition cursor-pointer"
                      title="清除文件"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isPersonaOpen && (
                  <div className="space-y-2 animate-in fade-in duration-150">
                    <textarea
                      readOnly
                      rows={8}
                      value={formData.persona}
                      className="w-full bg-dark-950 border border-dark-800 rounded-xl p-3 text-xs text-gray-300 font-mono leading-relaxed resize-none cursor-default select-text focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-dark-900 border border-dark-750/80 overflow-hidden">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".md,.txt"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => setIsPersonaOpen(!isPersonaOpen)}
              className="w-full p-4 flex items-center justify-between hover:bg-dark-850/50 transition cursor-pointer text-left"
            >
              <div className="flex items-center space-x-2.5">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white">系统提示词 (agent.md)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-800 text-gray-400 border border-dark-700">
                  {uploadedFileInfo ? '已替换待保存' : '只读预览'}
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  {formData.persona?.length || 0} 字符
                </span>
              </div>

              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                  isPersonaOpen ? 'rotate-180 text-purple-400' : ''
                }`}
              />
            </button>

            {isPersonaOpen && (
              <div className="px-4 pb-4 space-y-2.5 border-t border-dark-800 pt-3 animate-in fade-in duration-150">
                <textarea
                  readOnly
                  rows={9}
                  value={formData.persona || '（暂无提示词内容）'}
                  className="w-full bg-dark-950 border border-dark-800 rounded-xl p-3 text-xs text-gray-300 font-mono leading-relaxed resize-none cursor-default select-text focus:outline-none"
                />
                <div className="text-[11px] text-gray-500 flex items-center justify-between">
                  <span>提示词文件为本地目录中的 agent.md。如需调整，可直接在本地编辑器修改，也可上传新文件覆盖。</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer shrink-0 ml-3"
                  >
                    上传新文件替换
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Footer Actions */}
      <div className="pt-3 border-t border-dark-800 flex items-center justify-end space-x-2.5 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-xs font-medium text-gray-300 hover:text-white border border-dark-700/80 transition cursor-pointer"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white shadow-md shadow-brand-500/20 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{isSaving ? '正在保存...' : (isEditing ? '保存修改' : '立即创建')}</span>
        </button>
      </div>
    </form>
  );
}
