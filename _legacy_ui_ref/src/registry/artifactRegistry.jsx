import React, { Suspense, lazy } from 'react';
import {
  Layers,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Code2,
  Code,
  Database,
  Sparkles
} from 'lucide-react';
import { apiUrl, mediaUrl } from '@/lib/apiClient.js';
import MarkdownMessage from '@/components/stream/MarkdownMessage.jsx';

const MotionPlayerPreview = lazy(() =>
  import('@/components/motion/MotionPlayerPreview.jsx').then((m) => ({
    default: m.MotionPlayerPreview
  }))
);

/**
 * 通用媒体资源解析：兼容绝对URL、本地API代理与相对路径
 */
export function resolveMediaSource(source) {
  if (!source || typeof source !== 'string') return '';
  if (/^(https?:|blob:|data:)/i.test(source)) return source;
  if (source.startsWith('/api/') || source.startsWith('/output/')) return apiUrl(source);
  return mediaUrl(source);
}

/**
 * 默认兜底产物主题
 */
const DEFAULT_THEME = {
  icon: <Layers className="w-4 h-4 text-cyan-400" />,
  label: '结构化产物',
  tagClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50',
  borderClass: 'border-cyan-500/40 hover:border-cyan-500/60'
};

/**
 * 产物渲染器注册中心 (Artifact Renderer Registry)
 * 允许业务模块声明与扩展自己的产物预览卡片和侧栏检视器
 */
const rendererRegistry = new Map();

/**
 * 注册产物渲染器
 * @param {string|string[]} typeOrTypes - 产物类型标识，如 'image' 或 ['image', 'gallery']
 * @param {object} definition - 渲染器规范定义
 *   - theme: { icon, label, tagClass, borderClass } 或 (artifact) => theme
 *   - renderCard: (artifact, onExecuteAction) => ReactNode
 *   - renderSidebar?: (artifact, onExecuteAction) => ReactNode
 */
export function registerArtifactRenderer(typeOrTypes, definition) {
  const types = Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes];
  for (const type of types) {
    rendererRegistry.set(type.toLowerCase(), definition);
  }
}

/**
 * 查询产物渲染器规范
 */
export function getArtifactRenderer(type, artifact = null) {
  if (!type && !artifact) return null;
  const lookupType = (type || artifact?.type || '').toLowerCase();
  
  if (rendererRegistry.has(lookupType)) {
    return rendererRegistry.get(lookupType);
  }

  // 兜底特征探测：例如虽然 type 不是 motion，但含有 motionManifest
  if (artifact?.data?.motionManifest || (artifact?.data?.scenes && Array.isArray(artifact?.data?.scenes))) {
    return rendererRegistry.get('motion');
  }

  return null;
}

/**
 * 查询产物对应的主题配置 (图标、标签、颜色边框类名)
 */
export function getArtifactTheme(type, artifact = null) {
  const renderer = getArtifactRenderer(type, artifact);
  if (renderer?.theme) {
    return typeof renderer.theme === 'function' ? renderer.theme(artifact) : renderer.theme;
  }
  return DEFAULT_THEME;
}

/**
 * 查询用于清单列表的小图标
 */
export function getArtifactIcon(type, artifact = null) {
  const theme = getArtifactTheme(type, artifact);
  return theme.icon || <Sparkles className="w-4 h-4 text-indigo-400" />;
}

// ==========================================
// 内置通用核心渲染器注册
// ==========================================

/**
 * 从产物契约中解析可执行动作，优先复用产物自带 actions 配置，避免在通用注册层写死业务工具名
 */
function resolveArtifactAction(artifact, actionKey, defaultAction) {
  if (Array.isArray(artifact?.actions)) {
    const matched = artifact.actions.find(
      (a) => a.id === actionKey || a.type === actionKey || (defaultAction.tool && a.tool === defaultAction.tool)
    );
    if (matched) return matched;
  }
  return defaultAction;
}

function renderMotionPlayerPreviewComponent(artifact, onExecuteAction) {
  const manifest = artifact.data?.motionManifest || artifact.data;
  return (
    <Suspense fallback={<div className="p-4 text-xs text-slate-400">正在加载动效预览引擎...</div>}>
      <MotionPlayerPreview
        manifest={manifest}
        onDirectRender={async (m) => {
          if (!onExecuteAction) return;
          const action = resolveArtifactAction(artifact, 'render_video', {
            tool: 'render_video_mp4',
            args: { outputFileName: `${m?.name || 'motion_video'}_60fps.mp4` }
          });
          await onExecuteAction(action, artifact);
        }}
        onExportJianying={async (m) => {
          if (!onExecuteAction) return;
          const action = resolveArtifactAction(artifact, 'export_draft', {
            tool: 'export_jianying_draft',
            args: { draftName: m?.name || '动效解说草稿' }
          });
          await onExecuteAction(action, artifact);
        }}
      />
    </Suspense>
  );
}

// 1. 动效工程与视频代码 (Remotion)
registerArtifactRenderer(['motion', 'motion_manifest', 'motion_scene', 'motion_preview'], {
  theme: {
    icon: <Code2 className="w-4 h-4 text-sky-400" />,
    label: '代码动效 (Remotion)',
    tagClass: 'bg-sky-950/60 text-sky-300 border-sky-800/50',
    borderClass: 'border-sky-500/40 hover:border-sky-500/60'
  },
  renderCard: (artifact, onExecuteAction) => renderMotionPlayerPreviewComponent(artifact, onExecuteAction),
  renderSidebar: (artifact, onExecuteAction) => renderMotionPlayerPreviewComponent(artifact, onExecuteAction)
});

// 2. 图像 / 视觉素材 / 概念设计
registerArtifactRenderer(['image', 'gallery'], {
  theme: {
    icon: <ImageIcon className="w-4 h-4 text-pink-400" />,
    label: '视觉资产',
    tagClass: 'bg-pink-950/60 text-pink-300 border-pink-800/50',
    borderClass: 'border-pink-500/40 hover:border-pink-500/60'
  },
  renderCard: (artifact) => {
    const data = artifact.data || {};
    const images = Array.isArray(data.images)
      ? data.images
      : typeof data === 'string'
        ? [data]
        : data.url
          ? [data.url]
          : [];

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {images.map((imgUrl, i) => (
            <div key={i} className="group relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 aspect-video flex items-center justify-center">
              <img
                src={resolveMediaSource(imgUrl)}
                alt={`产物画面 #${i + 1}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="hidden absolute inset-0 items-center justify-center text-xs text-slate-500 bg-slate-900/80 p-2 text-center font-mono">
                [图像资源就绪: {imgUrl}]
              </div>
            </div>
          ))}
        </div>
        {data.prompt && (
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 font-mono">
            <span className="text-pink-400 font-semibold mr-1.5">Prompt:</span>
            {data.prompt}
          </div>
        )}
      </div>
    );
  },
  renderSidebar: (artifact) => {
    const data = artifact.data || {};
    const images = Array.isArray(data.images)
      ? data.images
      : typeof data === 'string'
        ? [data]
        : data.url
          ? [data.url]
          : [];

    return (
      <div className="space-y-2">
        {images.map((imgUrl, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900 aspect-video flex items-center justify-center">
            <img src={resolveMediaSource(imgUrl)} alt={`产物画面 #${i + 1}`} className="w-full h-full object-contain" />
          </div>
        ))}
        {data.prompt && (
          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
            <span className="text-pink-400 font-semibold mr-1">Prompt:</span>
            {data.prompt}
          </div>
        )}
      </div>
    );
  }
});

// 3. 音频 / 配音 / 音乐
registerArtifactRenderer(['audio', 'speech'], {
  theme: {
    icon: <Music className="w-4 h-4 text-emerald-400" />,
    label: '音频配音',
    tagClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50',
    borderClass: 'border-emerald-500/40 hover:border-emerald-500/60'
  },
  renderCard: (artifact) => {
    const data = artifact.data || {};
    const audioSource = typeof data === 'string' ? data : data.url || data.audioPath;
    const audioUrl = resolveMediaSource(audioSource);
    const duration = data.duration || '00:00';
    const speaker = data.speaker || data.voice || '通用配音';

    return (
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200">{data.title || '音频片段'}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-300 font-mono">{speaker}</span>
              <span>时值: {duration}</span>
            </div>
          </div>
        </div>

        {audioUrl ? (
          <audio controls src={audioUrl} className="h-8 max-w-xs" />
        ) : (
          <div className="text-[11px] text-slate-500 font-mono italic">
            音频数据就绪，支持在侧栏一键试听
          </div>
        )}
      </div>
    );
  },
  renderSidebar: (artifact) => {
    const data = artifact.data || {};
    const audioSource = typeof data === 'string' ? data : data.url || data.audioPath;
    const audioUrl = resolveMediaSource(audioSource);
    return (
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div className="text-xs font-bold text-slate-200">{data.title || '音频试听'}</div>
        {audioUrl ? (
          <audio controls src={audioUrl} className="w-full h-8" />
        ) : (
          <div className="text-xs text-slate-500 italic">暂无有效音频流</div>
        )}
      </div>
    );
  }
});

// 4. 视频成片 / 样片回放
registerArtifactRenderer(['video', 'clip', 'video_render'], {
  theme: {
    icon: <Video className="w-4 h-4 text-violet-400" />,
    label: '视频成片',
    tagClass: 'bg-violet-950/60 text-violet-300 border-violet-800/50',
    borderClass: 'border-violet-500/40 hover:border-violet-500/60'
  },
  renderCard: (artifact) => {
    const data = artifact.data || {};
    const videoSource = typeof data === 'string'
      ? data
      : data.url || data.videoPath || data.videoRender?.videoPath;
    const videoUrl = resolveMediaSource(videoSource);
    const finalPath = data.videoPath || data.videoRender?.videoPath;
    const sizeFormatted = data.sizeFormatted || data.videoRender?.sizeFormatted;

    return (
      <div className="space-y-2">
        {videoUrl ? (
          <div className="space-y-2">
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video max-h-80 flex items-center justify-center">
              <video controls src={videoUrl} className="w-full h-full object-contain" />
            </div>
            {finalPath && (
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between gap-2">
                <span className="truncate text-slate-300">
                  <span className="text-emerald-400 font-bold mr-1.5">[MP4直出成片]</span>
                  {data.fileName || finalPath}
                </span>
                {sizeFormatted && (
                  <span className="text-emerald-400 shrink-0 font-bold px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60">
                    {sizeFormatted}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-400 bg-slate-900/40">
            🎬 视频工程已装配就绪，支持点击右上角【一键交付/导出工程】
          </div>
        )}
      </div>
    );
  },
  renderSidebar: (artifact) => {
    const data = artifact.data || {};
    const videoSource = typeof data === 'string'
      ? data
      : data.url || data.videoPath || data.videoRender?.videoPath;
    const videoUrl = resolveMediaSource(videoSource);
    return (
      <div className="space-y-2">
        <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video flex items-center justify-center">
          <video controls src={videoUrl} className="w-full h-full object-contain" />
        </div>
        {(data.videoPath || data.videoRender?.videoPath) && (
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 break-all space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-bold">MP4 视频直出成片</span>
              {data.sizeFormatted && <span className="text-slate-300 font-bold">{data.sizeFormatted}</span>}
            </div>
            <div className="text-slate-400 truncate">{data.videoPath || data.videoRender?.videoPath}</div>
          </div>
        )}
      </div>
    );
  }
});

// 5. 文本 / 剧本 / Markdown 文档
registerArtifactRenderer(['text', 'document', 'screenplay'], {
  theme: {
    icon: <FileText className="w-4 h-4 text-amber-400" />,
    label: '文案策划',
    tagClass: 'bg-amber-950/60 text-amber-300 border-amber-800/50',
    borderClass: 'border-amber-500/40 hover:border-amber-500/60'
  },
  renderCard: (artifact) => {
    const data = artifact.data;
    const textContent = typeof data === 'string'
      ? data
      : data?.content || data?.markdown || JSON.stringify(data, null, 2);

    return (
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-sm text-slate-200 leading-relaxed max-h-72 overflow-y-auto">
        <MarkdownMessage>{textContent}</MarkdownMessage>
      </div>
    );
  },
  renderSidebar: (artifact) => {
    const data = artifact.data;
    const textContent = typeof data === 'string' ? data : (data?.content || data?.markdown || '');
    return (
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 text-sm text-slate-200 leading-relaxed overflow-x-auto">
        <MarkdownMessage>{textContent}</MarkdownMessage>
      </div>
    );
  }
});

// 6. 结构化卡片流 (分镜故事板 / 切片池 / 条目流)
registerArtifactRenderer(['cards', 'storyboard', 'clips_pool', 'structured'], {
  theme: {
    icon: <Layers className="w-4 h-4 text-cyan-400" />,
    label: '结构化产物',
    tagClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50',
    borderClass: 'border-cyan-500/40 hover:border-cyan-500/60'
  },
  renderCard: (artifact) => {
    const data = artifact.data || {};
    const items = Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.shots)
        ? data.shots
        : Array.isArray(data.clips)
          ? data.clips
          : null;

    if (!items) {
      return (
        <pre className="p-3 rounded-xl bg-[#06080D] border border-slate-800 font-mono text-[11px] text-cyan-300/90 overflow-x-auto leading-relaxed max-h-60">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
    }

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {items.map((item, idx) => (
            <div
              key={item.id || item.shotNumber || idx}
              className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all text-xs space-y-1.5 shadow-sm"
            >
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="text-cyan-400 font-mono">
                  {item.title || item.name || (item.shotNumber ? `Shot #${item.shotNumber}` : `#${idx + 1}`)}
                </span>
                {(item.badge || item.duration || item.timeRange || item.score || item.tag) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700/60">
                    {item.badge || item.duration || item.timeRange || item.score || item.tag}
                  </span>
                )}
              </div>
              {(item.description || item.visual || item.scriptText) && (
                <div className="text-slate-300 leading-relaxed text-[11px] line-clamp-2">
                  {item.description || item.visual || item.scriptText}
                </div>
              )}
              {item.meta && typeof item.meta === 'object' && (
                <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono truncate">
                  {Object.entries(item.meta).slice(0, 2).map(([k, v]) => (
                    <span key={k} className="truncate">{k}: {String(v)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  },
  renderSidebar: (artifact) => {
    const data = artifact.data || {};
    const items = data.items || data.shots || data.clips || [];
    return (
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={item.id || item.shotNumber || idx} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-200 font-bold">
              <span className="text-indigo-400 font-mono">
                {item.title || item.name || (item.shotNumber ? `Item #${item.shotNumber}` : `#${idx + 1}`)}
              </span>
              {(item.badge || item.duration || item.score || item.tag) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {item.badge || item.duration || item.score || item.tag}
                </span>
              )}
            </div>
            {(item.description || item.visual) && (
              <div className="text-slate-300 leading-relaxed text-[11px]">
                {item.description || item.visual}
              </div>
            )}
            {item.meta && typeof item.meta === 'object' && (
              <div className="pt-1 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono truncate">
                {Object.entries(item.meta).map(([k, v]) => (
                  <span key={k} className="truncate">{k}: {String(v)}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
});

// 7. 代码与数据 (Code / Data)
registerArtifactRenderer('code', {
  theme: {
    icon: <Code className="w-4 h-4 text-emerald-400" />,
    label: '代码工程',
    tagClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50',
    borderClass: 'border-emerald-500/40 hover:border-emerald-500/60'
  },
  renderCard: (artifact) => (
    <pre className="p-3 rounded-xl bg-[#06080D] border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto leading-relaxed max-h-72">
      {typeof artifact.data === 'string' ? artifact.data : JSON.stringify(artifact.data, null, 2)}
    </pre>
  ),
  renderSidebar: (artifact) => (
    <pre className="p-3 rounded-xl bg-[#06080D] border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto leading-relaxed max-h-96">
      {typeof artifact.data === 'string' ? artifact.data : JSON.stringify(artifact.data, null, 2)}
    </pre>
  )
});

registerArtifactRenderer('data', {
  theme: {
    icon: <Database className="w-4 h-4 text-blue-400" />,
    label: '数据集',
    tagClass: 'bg-blue-950/60 text-blue-300 border-blue-800/50',
    borderClass: 'border-blue-500/40 hover:border-blue-500/60'
  },
  renderCard: (artifact) => (
    <pre className="p-3 rounded-xl bg-[#06080D] border border-slate-800 font-mono text-[11px] text-indigo-300/90 overflow-x-auto leading-relaxed max-h-72">
      {JSON.stringify(artifact.data, null, 2)}
    </pre>
  ),
  renderSidebar: (artifact) => (
    <pre className="p-3 rounded-xl bg-[#06080D] border border-slate-800 font-mono text-[11px] text-indigo-300/90 overflow-x-auto leading-relaxed max-h-96">
      {JSON.stringify(artifact.data, null, 2)}
    </pre>
  )
});

/**
 * 统一执行流内产物多态内容渲染
 */
export function renderArtifactCardContent(artifact, onExecuteAction = null) {
  if (!artifact) return null;
  if (!artifact.data) {
    return <div className="text-xs text-slate-500 italic">产物暂无可预览数据</div>;
  }

  const renderer = getArtifactRenderer(artifact.type, artifact);
  if (renderer && typeof renderer.renderCard === 'function') {
    return renderer.renderCard(artifact, onExecuteAction);
  }

  // 兜底通用 JSON 渲染
  return (
    <pre className="p-3 rounded-xl bg-[#06080D] border border-slate-800 font-mono text-[11px] text-cyan-300/90 overflow-x-auto leading-relaxed max-h-60">
      {JSON.stringify(artifact.data, null, 2)}
    </pre>
  );
}

/**
 * 统一执行侧边栏产物详情渲染
 */
export function renderArtifactSidebarContent(artifact, onExecuteAction = null) {
  if (!artifact) return null;
  if (!artifact.data) {
    return <div className="text-xs text-slate-500 italic">产物暂无可预览数据</div>;
  }

  const renderer = getArtifactRenderer(artifact.type, artifact);
  if (renderer && typeof renderer.renderSidebar === 'function') {
    return renderer.renderSidebar(artifact, onExecuteAction);
  }
  if (renderer && typeof renderer.renderCard === 'function') {
    return renderer.renderCard(artifact, onExecuteAction);
  }

  // 兜底通用 JSON 渲染
  return (
    <pre className="p-3 rounded-xl bg-[#06080D] border border-slate-800/80 font-mono text-[11px] text-indigo-300/90 overflow-x-auto leading-relaxed max-h-96">
      {JSON.stringify(artifact.data, null, 2)}
    </pre>
  );
}
