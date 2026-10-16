import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  X,
  FileText,
  Code,
  ChevronDown,
  UploadCloud
} from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';

const SKILL_CATEGORIES = [
  { id: 'genre', label: '流派风格 (Genre)' },
  { id: 'rhythm', label: '节奏卡点 (Rhythm)' },
  { id: 'narration', label: '叙事解说 (Narration)' },
  { id: 'camera', label: '运镜与构图 (Camera)' },
  { id: 'audio', label: '音频配乐 (Audio)' },
  { id: 'general', label: '通用规约 (General)' }
];

export default function SkillEditorPanel({
  skill = null,
  onSave,
  onCancel,
  isSaving = false
}) {
  const isEditing = Boolean(skill && skill.id);

  // Form State
  const [formData, setFormData] = useState({
    id: skill?.id || '',
    name: skill?.name || '',
    category: skill?.category || 'genre',
    description: skill?.description || '',
    markdown: skill?.markdown || skill?.rules || '',
    handlerCode: skill?.handlerCode || ''
  });

  const [hasHandlerCode, setHasHandlerCode] = useState(Boolean(skill?.hasHandler || skill?.handlerCode));

  // Collapsed preview states
  const [isMdPreviewOpen, setIsMdPreviewOpen] = useState(false);
  const [isCodePreviewOpen, setIsCodePreviewOpen] = useState(false);

  // File upload states
  const mdFileInputRef = useRef(null);
  const tsFileInputRef = useRef(null);
  const [uploadedMdInfo, setUploadedMdInfo] = useState(null);
  const [uploadedTsInfo, setUploadedTsInfo] = useState(null);
  const [isDraggingMd, setIsDraggingMd] = useState(false);
  const [isDraggingTs, setIsDraggingTs] = useState(false);

  // Sync if skill prop updates
  useEffect(() => {
    if (skill) {
      setFormData({
        id: skill.id || '',
        name: skill.name || '',
        category: skill.category || 'genre',
        description: skill.description || '',
        markdown: skill.markdown || skill.rules || '',
        handlerCode: skill.handlerCode || ''
      });
      setHasHandlerCode(Boolean(skill.hasHandler || skill.handlerCode));
    }
  }, [skill]);

  // Handle SKILL.md file upload
  const handleMdFileUpload = (file) => {
    if (!file) return;
    const name = file.name || '';
    const isMdOrTxt = name.endsWith('.md') || name.endsWith('.txt');
    if (!isMdOrTxt) {
      toast.warning('请选择 .md 或 .txt 格式的规约文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result || '';
      setFormData(prev => ({ ...prev, markdown: content }));
      setUploadedMdInfo({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        charCount: content.length
      });
      toast.success(`已载入规约文件 ${file.name}（${content.length} 字符）`);
    };
    reader.onerror = () => {
      toast.error('读取规约文件失败，请重试');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleMdFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleMdFileUpload(file);
    if (e.target) e.target.value = '';
  };

  const handleClearMdFile = () => {
    setUploadedMdInfo(null);
    setFormData(prev => ({ ...prev, markdown: '' }));
  };

  // Handle handler.ts file upload
  const handleTsFileUpload = (file) => {
    if (!file) return;
    const name = file.name || '';
    const isTsOrJs = name.endsWith('.ts') || name.endsWith('.js');
    if (!isTsOrJs) {
      toast.warning('请选择 .ts 或 .js 格式的算法代码文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result || '';
      setFormData(prev => ({ ...prev, handlerCode: content }));
      setUploadedTsInfo({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        charCount: content.length
      });
      toast.success(`已载入算法代码 ${file.name}（${content.length} 字符）`);
    };
    reader.onerror = () => {
      toast.error('读取代码文件失败，请重试');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleTsFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleTsFileUpload(file);
    if (e.target) e.target.value = '';
  };

  const handleClearTsFile = () => {
    setUploadedTsInfo(null);
    setFormData(prev => ({ ...prev, handlerCode: '' }));
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!formData.name.trim()) {
      toast.warning('请填写技能显示名称');
      return;
    }
    if (!isEditing && !formData.id.trim()) {
      toast.warning('请填写技能ID');
      return;
    }

    // Default template fallbacks if not provided
    const finalName = formData.name.trim();
    const finalDescription = (formData.description || '').trim();
    const finalCategory = formData.category || 'genre';

    let finalMarkdown = formData.markdown.trim();
    if (!finalMarkdown) {
      finalMarkdown = `---\nname: ${finalName}\ndescription: ${finalDescription}\ncategory: ${finalCategory}\n---\n\n# 剪辑规范手册\n1. 节奏要求...\n2. 镜头匹配规约...\n`;
    }

    let finalHandlerCode = '';
    if (hasHandlerCode) {
      finalHandlerCode = formData.handlerCode.trim();
      if (!finalHandlerCode) {
        finalHandlerCode = `/**\n * 技能确定性计算与逻辑处理函数\n */\nexport async function execute(context) {\n  const { project, assets, storyboard } = context;\n  return { success: true };\n}\n`;
      }
    }

    onSave?.({
      ...formData,
      name: finalName,
      description: finalDescription,
      markdown: finalMarkdown,
      handlerCode: finalHandlerCode
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full space-y-4 animate-in fade-in duration-200">
      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
        
        {/* Card 1: Basic Metadata */}
        <div className="p-4 rounded-2xl bg-dark-900 border border-dark-750/80 space-y-3.5">
          <div className="text-xs font-bold text-white border-b border-dark-800 pb-2">
            基本配置
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                技能名称 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如: 高能游戏混剪规约"
                className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500/70 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                分类标签
              </label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500/70 focus:outline-none transition"
              >
                {SKILL_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                技能ID <span className="text-rose-400">*</span> <span className="text-gray-500 font-normal">({isEditing ? '目录名不可修改' : '英文/数字/中划线，创建后不可修改'})</span>
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={formData.id}
                onChange={e => setFormData({ ...formData, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                placeholder="例如: vlog-rhythm 或 high-energy"
                className={`w-full bg-dark-800 border rounded-xl px-3 py-2 text-xs text-white font-mono transition ${
                  isEditing
                    ? 'border-dark-700 opacity-60 cursor-not-allowed bg-dark-850'
                    : 'border-dark-700 focus:border-amber-500/70 focus:outline-none'
                }`}
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                {isEditing ? '已固定作为技能本地文件夹名与系统唯一标识' : '将作为技能本地文件夹名与系统唯一规约标识'}
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                简要描述与触发时机
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="简述适用场景，作为智能体自动挑选技能的感知依据..."
                className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500/70 focus:outline-none transition"
              />
            </div>
          </div>
        </div>

        {/* Card 2: 剪辑规约手册 (SKILL.md) */}
        {!isEditing ? (
          <div className="rounded-2xl bg-dark-900 border border-dark-750/80 p-4 space-y-3">
            <input
              type="file"
              ref={mdFileInputRef}
              onChange={handleMdFileChange}
              accept=".md,.txt"
              className="hidden"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">剪辑规约手册 (SKILL.md)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  规约文件上传
                </span>
              </div>
              {uploadedMdInfo && (
                <span className="text-[10px] text-gray-500 font-mono">
                  {uploadedMdInfo.charCount} 字符
                </span>
              )}
            </div>

            {!uploadedMdInfo ? (
              <div
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDraggingMd(true); }}
                onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDraggingMd(false); }}
                onDrop={e => {
                  e.preventDefault(); e.stopPropagation(); setIsDraggingMd(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleMdFileUpload(file);
                }}
                onClick={() => mdFileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition select-none ${
                  isDraggingMd
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-dark-700/80 hover:border-dark-600 bg-dark-950/40 hover:bg-dark-950/70'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-dark-800/80 border border-dark-700 flex items-center justify-center text-gray-400 mb-2.5">
                  <UploadCloud className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-xs font-semibold text-gray-200">
                  点击选择或拖拽上传 SKILL.md 规约文件
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  支持 .md, .txt 格式。若暂不上传，创建后将自动生成标准规约骨架。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-dark-950 border border-dark-750 flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white flex items-center space-x-2">
                        <span className="truncate">{uploadedMdInfo.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-mono">
                          {uploadedMdInfo.size}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        已加载为技能规约内容（{uploadedMdInfo.charCount} 字符）
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsMdPreviewOpen(!isMdPreviewOpen)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
                    >
                      {isMdPreviewOpen ? '收起预览' : '查看内容'}
                    </button>
                    <button
                      type="button"
                      onClick={() => mdFileInputRef.current?.click()}
                      className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
                    >
                      重新上传
                    </button>
                    <button
                      type="button"
                      onClick={handleClearMdFile}
                      className="p-1.5 text-gray-400 hover:text-rose-400 rounded-lg hover:bg-dark-800 transition cursor-pointer"
                      title="清除文件"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isMdPreviewOpen && (
                  <div className="space-y-2 animate-in fade-in duration-150">
                    <textarea
                      readOnly
                      rows={8}
                      value={formData.markdown}
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
              ref={mdFileInputRef}
              onChange={handleMdFileChange}
              accept=".md,.txt"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => setIsMdPreviewOpen(!isMdPreviewOpen)}
              className="w-full p-4 flex items-center justify-between hover:bg-dark-850/50 transition cursor-pointer text-left"
            >
              <div className="flex items-center space-x-2.5">
                <FileText className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">剪辑规约手册 (SKILL.md)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-800 text-gray-400 border border-dark-700">
                  {uploadedMdInfo ? '已替换待保存' : '只读预览'}
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  {formData.markdown?.length || 0} 字符
                </span>
              </div>

              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                  isMdPreviewOpen ? 'rotate-180 text-amber-400' : ''
                }`}
              />
            </button>

            {isMdPreviewOpen && (
              <div className="px-4 pb-4 space-y-2.5 border-t border-dark-800 pt-3 animate-in fade-in duration-150">
                <textarea
                  readOnly
                  rows={9}
                  value={formData.markdown || '（暂无规约手册内容）'}
                  className="w-full bg-dark-950 border border-dark-800 rounded-xl p-3 text-xs text-gray-300 font-mono leading-relaxed resize-none cursor-default select-text focus:outline-none"
                />
                <div className="text-[11px] text-gray-500 flex items-center justify-between">
                  <span>规约文件为本地目录中的 SKILL.md。如需深入调整，请点击上方“打开本地目录”使用外部编辑器修改。</span>
                  <button
                    type="button"
                    onClick={() => mdFileInputRef.current?.click()}
                    className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer shrink-0 ml-3"
                  >
                    上传新文件替换
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Card 3: 确定性计算算法 (handler.ts) [可选] */}
        <div className="rounded-2xl bg-dark-900 border border-dark-750/80 overflow-hidden">
          <input
            type="file"
            ref={tsFileInputRef}
            onChange={handleTsFileChange}
            accept=".ts,.js"
            className="hidden"
          />

          <div className="p-4 flex items-center justify-between border-b border-dark-800/80">
            <div className="flex items-center space-x-2.5">
              <Code className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white">确定性计算算法 (handler.ts)</span>
              {hasHandlerCode && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  已启用
                </span>
              )}
            </div>

            <label className="text-xs text-gray-300 flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasHandlerCode}
                onChange={e => setHasHandlerCode(e.target.checked)}
                className="w-4 h-4 rounded border-dark-700 bg-dark-800 text-emerald-500 focus:ring-0 cursor-pointer"
              />
              <span className="text-xs font-medium">启用 TypeScript 计算</span>
            </label>
          </div>

          {!hasHandlerCode ? (
            <div className="p-4 text-[11px] text-gray-500">
              当前技能仅作为纯 Markdown 创作规约注入，未启用确定性代码计算。勾选上方选项可挂载 TypeScript 算法逻辑。
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {!isEditing ? (
                /* New Skill TS File Upload */
                !uploadedTsInfo ? (
                  <div
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDraggingTs(true); }}
                    onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDraggingTs(false); }}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation(); setIsDraggingTs(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleTsFileUpload(file);
                    }}
                    onClick={() => tsFileInputRef.current?.click()}
                    className={`p-5 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition select-none ${
                      isDraggingTs
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-dark-700/80 hover:border-dark-600 bg-dark-950/40 hover:bg-dark-950/70'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-dark-800/80 border border-dark-700 flex items-center justify-center text-gray-400 mb-2">
                      <UploadCloud className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-xs font-semibold text-gray-200">
                      点击选择或拖拽上传 handler.ts 算法文件
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      支持 .ts, .js 格式。若暂不上传，创建后将自动生成默认 execute() 算法骨架。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-dark-950 border border-dark-750 flex items-center justify-between">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <Code className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white flex items-center space-x-2">
                            <span className="truncate">{uploadedTsInfo.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 font-mono">
                              {uploadedTsInfo.size}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            已加载为算法执行器（{uploadedTsInfo.charCount} 字符）
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsCodePreviewOpen(!isCodePreviewOpen)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
                        >
                          {isCodePreviewOpen ? '收起预览' : '查看代码'}
                        </button>
                        <button
                          type="button"
                          onClick={() => tsFileInputRef.current?.click()}
                          className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
                        >
                          重新上传
                        </button>
                        <button
                          type="button"
                          onClick={handleClearTsFile}
                          className="p-1.5 text-gray-400 hover:text-rose-400 rounded-lg hover:bg-dark-800 transition cursor-pointer"
                          title="清除文件"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isCodePreviewOpen && (
                      <div className="space-y-2 animate-in fade-in duration-150">
                        <textarea
                          readOnly
                          rows={8}
                          value={formData.handlerCode}
                          className="w-full bg-dark-950 border border-dark-800 rounded-xl p-3 text-xs text-emerald-300 font-mono leading-relaxed resize-none cursor-default select-text focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* Editing Skill: Read-only Preview + Open Folder */
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setIsCodePreviewOpen(!isCodePreviewOpen)}
                      className="text-xs text-gray-300 hover:text-white flex items-center space-x-1.5 cursor-pointer"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isCodePreviewOpen ? 'rotate-180 text-emerald-400' : ''
                        }`}
                      />
                      <span>{isCodePreviewOpen ? '收起代码预览' : '展开 handler.ts 代码预览'}</span>
                      <span className="text-[10px] text-gray-500 font-mono ml-1">
                        ({formData.handlerCode?.length || 0} 字符)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => tsFileInputRef.current?.click()}
                      className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
                    >
                      上传新代码替换
                    </button>
                  </div>

                  {isCodePreviewOpen && (
                    <div className="animate-in fade-in duration-150">
                      <textarea
                        readOnly
                        rows={8}
                        value={formData.handlerCode || '（暂无代码内容）'}
                        className="w-full bg-dark-950 border border-dark-800 rounded-xl p-3 text-xs text-emerald-300 font-mono leading-relaxed resize-none cursor-default select-text focus:outline-none"
                      />
                    </div>
                  )}

                  <p className="text-[11px] text-gray-500">
                    代码文件为本地目录中的 handler.ts。请点击上方“打开本地目录”使用外部编辑器（如 VS Code）进行算法编写与调试。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

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
          className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white shadow-md shadow-amber-500/20 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{isSaving ? '正在保存...' : (isEditing ? '保存修改' : '立即创建')}</span>
        </button>
      </div>
    </form>
  );
}
