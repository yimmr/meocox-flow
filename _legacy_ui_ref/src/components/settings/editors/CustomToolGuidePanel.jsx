import React, { useState } from 'react';
import {
  Copy,
  Check,
  Sparkles,
  FileCode,
  Layers,
  Code2,
  Info,
  Terminal,
  FileJson,
  Cpu
} from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';
import { apiFetch } from '@/lib/apiClient.js';

const SAMPLE_TOOL_RAW = `{
  "name": "custom_asset_cleaner",
  "description": "自定义素材清洗工具：用于去除素材画面指定区域的噪点或水印",
  "parameters": {
    "type": "object",
    "properties": {
      "assetId": {
        "type": "string",
        "description": "待处理的素材ID或本地绝对路径"
      },
      "cleanMode": {
        "type": "string",
        "description": "清洗模式，可选 fast (极速) 或 deep (高精画质)"
      },
      "region": {
        "type": "string",
        "description": "处理区域坐标，例如 top-right 或 x,y,w,h"
      }
    },
    "required": ["assetId"]
  }
}`;

const SAMPLE_JS_RAW = `/**
 * 自定义工具执行入口 (index.js)
 * @param {Object} params - 大模型根据 tool.json 生成并校验后的入参
 * @param {Object} context - 运行时上下文 (包含项目环境、日志等)
 * @returns {Promise<Object>} 执行结果，将作为 observation 反馈给大模型
 */
export default async function run(params = {}, context = {}) {
  const { assetId, cleanMode = 'fast', region = 'top-right' } = params;

  // 1. 在此编写实际业务代码（如调用本地 FFmpeg、读写文件或触发网络请求）
  console.log('[custom_asset_cleaner] 执行处理:', { assetId, cleanMode, region });

  // 2. 将真实的执行结果返回，智能体将读取此返回值继续后续流程
  return {
    success: true,
    message: \`素材 \${assetId || '未指定'} 已按 \${cleanMode} 模式在 \${region} 区域完成清洗处理\`,
    processedAt: new Date().toISOString()
  };
}`;

const JSON_CODE_LINES = [
  { line: 1, content: <span className="text-gray-500">{'{'}</span> },
  {
    line: 2,
    content: (
      <>
        {'  '}<span className="text-sky-400">"name"</span><span className="text-gray-500">: </span><span className="text-emerald-300">"custom_asset_cleaner"</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 3,
    content: (
      <>
        {'  '}<span className="text-sky-400">"description"</span><span className="text-gray-500">: </span><span className="text-emerald-300">"自定义素材清洗工具：用于去除素材画面指定区域的噪点或水印"</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 4,
    content: (
      <>
        {'  '}<span className="text-sky-400">"parameters"</span><span className="text-gray-500">: </span><span className="text-gray-500">{'{'}</span>
      </>
    )
  },
  {
    line: 5,
    content: (
      <>
        {'    '}<span className="text-sky-400">"type"</span><span className="text-gray-500">: </span><span className="text-purple-300">"object"</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 6,
    content: (
      <>
        {'    '}<span className="text-sky-400">"properties"</span><span className="text-gray-500">: </span><span className="text-gray-500">{'{'}</span>
      </>
    )
  },
  {
    line: 7,
    content: (
      <>
        {'      '}<span className="text-sky-400">"assetId"</span><span className="text-gray-500">: </span><span className="text-gray-500">{'{'}</span>
      </>
    )
  },
  {
    line: 8,
    content: (
      <>
        {'        '}<span className="text-sky-400">"type"</span><span className="text-gray-500">: </span><span className="text-purple-300">"string"</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 9,
    content: (
      <>
        {'        '}<span className="text-sky-400">"description"</span><span className="text-gray-500">: </span><span className="text-emerald-300">"待处理的素材ID或本地绝对路径"</span>
      </>
    )
  },
  {
    line: 10,
    content: (
      <>
        {'      '}<span className="text-gray-500">{'}'}</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 11,
    content: (
      <>
        {'      '}<span className="text-sky-400">"cleanMode"</span><span className="text-gray-500">: </span><span className="text-gray-500">{'{'}</span>
      </>
    )
  },
  {
    line: 12,
    content: (
      <>
        {'        '}<span className="text-sky-400">"type"</span><span className="text-gray-500">: </span><span className="text-purple-300">"string"</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 13,
    content: (
      <>
        {'        '}<span className="text-sky-400">"description"</span><span className="text-gray-500">: </span><span className="text-emerald-300">"清洗模式，可选 fast (极速) 或 deep (高精)"</span>
      </>
    )
  },
  {
    line: 14,
    content: (
      <>
        {'      '}<span className="text-gray-500">{'}'}</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 15,
    content: (
      <>
        {'      '}<span className="text-sky-400">"region"</span><span className="text-gray-500">: </span><span className="text-gray-500">{'{'}</span>
      </>
    )
  },
  {
    line: 16,
    content: (
      <>
        {'        '}<span className="text-sky-400">"type"</span><span className="text-gray-500">: </span><span className="text-purple-300">"string"</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 17,
    content: (
      <>
        {'        '}<span className="text-sky-400">"description"</span><span className="text-gray-500">: </span><span className="text-emerald-300">"处理区域坐标，例如 top-right 或 x,y,w,h"</span>
      </>
    )
  },
  {
    line: 18,
    content: (
      <>
        {'      '}<span className="text-gray-500">{'}'}</span>
      </>
    )
  },
  {
    line: 19,
    content: (
      <>
        {'    '}<span className="text-gray-500">{'}'}</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 20,
    content: (
      <>
        {'    '}<span className="text-sky-400">"required"</span><span className="text-gray-500">: </span><span className="text-gray-500">[</span><span className="text-emerald-300">"assetId"</span><span className="text-gray-500">]</span>
      </>
    )
  },
  {
    line: 21,
    content: (
      <>
        {'  '}<span className="text-gray-500">{'}'}</span>
      </>
    )
  },
  { line: 22, content: <span className="text-gray-500">{'}'}</span> }
];

const JS_CODE_LINES = [
  { line: 1, content: <span className="text-gray-500">{'/**'}</span> },
  { line: 2, content: <span className="text-gray-500">{' * 自定义工具执行入口 (index.js)'}</span> },
  { line: 3, content: <span className="text-gray-500">{' * @param {Object} params - 大模型根据 tool.json 生成并校验后的入参'}</span> },
  { line: 4, content: <span className="text-gray-500">{' * @param {Object} context - 运行时上下文 (包含项目环境、日志等)'}</span> },
  { line: 5, content: <span className="text-gray-500">{' * @returns {Promise<Object>} 执行结果，将作为 observation 反馈给大模型'}</span> },
  { line: 6, content: <span className="text-gray-500">{' */'}</span> },
  {
    line: 7,
    content: (
      <>
        <span className="text-purple-400">export default async function </span>
        <span className="text-sky-300">run</span>
        <span className="text-gray-300">(params = {}, context = {}) {'{'}</span>
      </>
    )
  },
  {
    line: 8,
    content: (
      <>
        {'  '}<span className="text-purple-400">const </span>
        <span className="text-gray-300">{'{'} assetId, cleanMode = </span>
        <span className="text-emerald-300">'fast'</span>
        <span className="text-gray-300">, region = </span>
        <span className="text-emerald-300">'top-right'</span>
        <span className="text-gray-300"> {'}'} = params;</span>
      </>
    )
  },
  { line: 9, content: <span className="text-gray-600">{'  '}</span> },
  { line: 10, content: <span className="text-gray-500">{'  // 1. 在此编写真实业务代码（如调用本地 FFmpeg、读写文件或触发网络请求）'}</span> },
  {
    line: 11,
    content: (
      <>
        {'  '}<span className="text-sky-400">console</span>.<span className="text-yellow-300">log</span>
        <span className="text-gray-300">(</span>
        <span className="text-emerald-300">'[custom_asset_cleaner] 执行处理:'</span>
        <span className="text-gray-300">, {'{'} assetId, cleanMode, region {'}'});</span>
      </>
    )
  },
  { line: 12, content: <span className="text-gray-600">{'  '}</span> },
  { line: 13, content: <span className="text-gray-500">{'  // 2. 将真实的执行结果返回，智能体将读取此返回值继续后续流程'}</span> },
  {
    line: 14,
    content: (
      <>
        {'  '}<span className="text-purple-400">return </span><span className="text-gray-300">{'{'}</span>
      </>
    )
  },
  {
    line: 15,
    content: (
      <>
        {'    '}<span className="text-sky-400">success</span><span className="text-gray-500">: </span><span className="text-emerald-300">true</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 16,
    content: (
      <>
        {'    '}<span className="text-sky-400">message</span><span className="text-gray-500">: </span>
        <span className="text-emerald-300">{"`素材 ${assetId || '未指定'} 已按 ${cleanMode} 模式在 ${region} 区域完成清洗处理`"}</span><span className="text-gray-500">,</span>
      </>
    )
  },
  {
    line: 17,
    content: (
      <>
        {'    '}<span className="text-sky-400">processedAt</span><span className="text-gray-500">: </span>
        <span className="text-purple-300">new Date</span><span className="text-gray-300">().toISOString()</span>
      </>
    )
  },
  {
    line: 18,
    content: (
      <>
        {'  '}<span className="text-gray-300">{'}'};</span>
      </>
    )
  },
  { line: 19, content: <span className="text-gray-300">{'}'}</span> }
];

export default function CustomToolGuidePanel({ onRefresh }) {
  const [activeCodeTab, setActiveCodeTab] = useState('tool'); // 'tool' | 'index'
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeRaw = activeCodeTab === 'tool' ? SAMPLE_TOOL_RAW : SAMPLE_JS_RAW;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeRaw);
      setCopied(true);
      toast.success(activeCodeTab === 'tool' ? '已复制 tool.json 参数规范' : '已复制 index.js 执行代码');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const handleCreateSampleTool = async () => {
    setIsGenerating(true);
    try {
      const res = await apiFetch('/api/agents/tools/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'custom_asset_cleaner',
          description: '自定义素材清洗工具（示例）：用于去除素材画面指定区域的噪点或水印',
          parameters: JSON.parse(SAMPLE_TOOL_RAW).parameters
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建示例工具失败');
      toast.success('已成功在工具目录生成「custom_asset_cleaner」目录（含 tool.json 与 index.js）！');
      onRefresh?.();
    } catch (err) {
      toast.error(`生成示例失败: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col space-y-4 animate-in fade-in select-text max-w-4xl pb-10">
      {/* 1. 架构透视：声明（参数）与 执行（代码）双层结构 */}
      <div className="p-4 rounded-2xl bg-dark-900 border border-dark-700/80 space-y-3.5">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">工具运作机制：为什么只约定参数不够？</h4>
            <p className="text-[11px] text-gray-400">大模型只负责“根据自然语言提取参数”，工具必须由“协议声明”与“执行脚本”协同完成</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 左侧：协议声明层 (tool.json) */}
          <div className="p-3.5 rounded-xl bg-dark-950/70 border border-dark-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileJson className="w-4 h-4 text-sky-400" />
                <span className="font-mono text-xs font-bold text-sky-400">1. 协议声明 (tool.json)</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-medium">
                面向大模型
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              大模型无法直接读懂你的业务系统。通过约定 <code className="text-sky-300 font-mono">name</code>、<code className="text-emerald-300 font-mono">description</code> 与 <code className="text-purple-300 font-mono">parameters</code>，大模型才能获知“这个工具有什么用”并在推理时自动生成符合格式的入参。
            </p>
            <div className="text-[11px] text-gray-400 bg-dark-900 px-2 py-1.5 rounded border border-dark-800 font-mono">
              作用：相当于编程里的 <span className="text-sky-300 font-semibold">函数接口声明 (Interface)</span>
            </div>
          </div>

          {/* 右侧：代码执行层 (index.js) */}
          <div className="p-3.5 rounded-xl bg-dark-950/70 border border-dark-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-xs font-bold text-emerald-400">2. 执行实现 (index.js)</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                面向运行宿主
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              当大模型生成参数并触发调用后，宿主系统接收参数并执行真正的代码。你可以在 <code className="text-emerald-300 font-mono">index.js</code> 中读取本地文件、调用剪辑引擎、执行系统命令或发起网络请求，并将计算结果回传。
            </p>
            <div className="text-[11px] text-gray-400 bg-dark-900 px-2 py-1.5 rounded border border-dark-800 font-mono">
              作用：相当于编程里的 <span className="text-emerald-300 font-semibold">函数实现体 (Implementation)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 工作流步骤卡片 */}
      <div className="p-4 rounded-2xl bg-dark-900 border border-dark-700/80 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">从编写到生效只需三步</h4>
              <p className="text-[11px] text-gray-400">全流程无需重启应用，热插拔即配即用</p>
            </div>
          </div>

          <button
            type="button"
            disabled={isGenerating}
            onClick={handleCreateSampleTool}
            className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isGenerating ? '正在生成...' : '一键生成示例工具'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-0.5">
          <div className="p-3.5 rounded-xl bg-dark-950/50 border border-dark-800/80 space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-dark-800 text-gray-300 font-mono text-[11px] font-bold flex items-center justify-center border border-dark-700">
                1
              </span>
              <span className="text-xs font-bold text-white">新建工具专属文件夹</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              打开本地目录，新建 <code className="text-gray-200 font-mono bg-dark-800 px-1 py-0.5 rounded">[工具名]/</code> 文件夹，放入 <code className="text-sky-300 font-mono bg-dark-800 px-1 py-0.5 rounded">tool.json</code> 与 <code className="text-emerald-300 font-mono bg-dark-800 px-1 py-0.5 rounded">index.js</code>。
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-dark-950/50 border border-dark-800/80 space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-dark-800 text-gray-300 font-mono text-[11px] font-bold flex items-center justify-center border border-dark-700">
                2
              </span>
              <span className="text-xs font-bold text-white">刷新工具列表</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              返回工具列表点击右上角「刷新」，系统将自动感知并动态挂载工具与其执行脚本。
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-dark-950/50 border border-dark-800/80 space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-dark-800 text-gray-300 font-mono text-[11px] font-bold flex items-center justify-center border border-dark-700">
                3
              </span>
              <span className="text-xs font-bold text-white">赋予角色权限</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              在「智能体」设置中编辑目标角色，在「工具调用权限」中勾选此工具即可让智能体调度它。
            </p>
          </div>
        </div>
      </div>

      {/* 3. 规范模板与代码展示 (支持 tool.json 与 index.js 切换) */}
      <div className="p-4 rounded-2xl bg-dark-900 border border-dark-700/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 bg-dark-950 p-1 rounded-xl border border-dark-800">
            <button
              type="button"
              onClick={() => setActiveCodeTab('tool')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                activeCodeTab === 'tool'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>tool.json (协议声明)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCodeTab('index')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                activeCodeTab === 'index'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>index.js (执行代码)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            className="px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 text-[11px] flex items-center space-x-1.5 transition cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? '已复制' : '复制当前文件'}</span>
          </button>
        </div>

        {/* IDE 语法高亮代码块 */}
        <div className="rounded-xl bg-dark-950 border border-dark-800 overflow-hidden">
          <div className="p-3.5 font-mono text-xs overflow-x-auto leading-relaxed space-y-0.5">
            {activeCodeTab === 'tool'
              ? JSON_CODE_LINES.map(item => (
                  <div key={item.line} className="flex items-start space-x-3">
                    <span className="w-5 text-right text-gray-600 text-[11px] select-none shrink-0 font-mono">
                      {item.line}
                    </span>
                    <div className="flex-1 whitespace-pre">
                      {item.content}
                    </div>
                  </div>
                ))
              : JS_CODE_LINES.map(item => (
                  <div key={item.line} className="flex items-start space-x-3">
                    <span className="w-5 text-right text-gray-600 text-[11px] select-none shrink-0 font-mono">
                      {item.line}
                    </span>
                    <div className="flex-1 whitespace-pre">
                      {item.content}
                    </div>
                  </div>
                ))}
          </div>
        </div>

        <div className="text-[11px] text-gray-400 flex items-center gap-1.5 pt-0.5">
          <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>进阶说明：若只需快速提取参数而暂不需要本地逻辑，也可仅提供单文件 <code className="text-gray-300 font-mono bg-dark-800 px-1 py-0.5 rounded">[tool_name].json</code>，系统将自动以回显模式运行。若需要更重型的外部进程工具，请在「MCP 管理」中添加独立服务。</span>
        </div>
      </div>
    </div>
  );
}
