import React, { useRef, useState } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import { pickFolderDialog } from '@/utils/folderPicker.js';

/**
 * 统一目录输入控件 (FolderInput)
 * 结构：输入框 + 内嵌右侧文件夹图标按钮
 * 点击文件夹图标即可极速唤起系统原生目录选择器，支持键盘手动输入与外部拾取
 *
 * 状态反馈：
 *   - 选择期间图标切换为旋转 spinner + 输入框琥珀色描边（不加文字，避免破坏布局）
 *   - 原生模态框关闭时 WebView 必然经历 blur → focus，
 *     捕获该序列即可"秒回弹"状态，不必等后端 HTTP 返回
 *     （Web 端实测进程收尾 + HTTP 约 450ms，这段是"取消后卡一下"的来源）
 */
export default function FolderInput({
  value = '',
  onChange,
  onFolderSelected,
  placeholder = '输入或选择文件夹路径...',
  dialogTitle = '选择文件夹',
  disabled = false,
  className = '',
  inputClassName = '',
  buttonClassName = '',
  autoFocus = false,
  required = false,
  id,
  name
}) {
  const [isPicking, setIsPicking] = useState(false);
  const isPickingRef = useRef(false);
  const reqSeqRef = useRef(0);

  const handlePick = async (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (disabled || isPickingRef.current) return;

    const myId = ++reqSeqRef.current;
    isPickingRef.current = true;
    setIsPicking(true);

    // ── 焦点秒回弹：只认"先失焦、后得焦"这一序列，避免页面本身
    //    无失焦时被误触发；异常关闭没有 focus 时由下面 finally 兜底 ──
    let sawBlur = false;
    const onBlur = () => { sawBlur = true; };
    const onFocus = () => {
      if (!sawBlur) return;
      teardown();
      if (reqSeqRef.current === myId) {
        isPickingRef.current = false;
        setIsPicking(false);
      }
    };
    const teardown = () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    try {
      const selected = await pickFolderDialog({
        title: dialogTitle,
        initialPath: value || ''
      });
      if (selected) {
        if (onChange) onChange(selected);
        if (onFolderSelected) onFolderSelected(selected);
      }
    } finally {
      teardown();
      // 只有仍是"最新一次请求"时才允许收尾，避免并发点击时状态被旧请求改写
      if (reqSeqRef.current === myId) {
        isPickingRef.current = false;
        setIsPicking(false);
      }
    }
  };

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <input
        type="text"
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        aria-busy={isPicking}
        className={`w-full pr-10 pl-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono transition-colors disabled:opacity-60 ${
          isPicking ? 'border-amber-400/60 ring-2 ring-amber-400/20' : ''
        } ${inputClassName}`}
      />
      <button
        type="button"
        onClick={handlePick}
        disabled={disabled || isPicking}
        tabIndex={-1}
        aria-busy={isPicking}
        aria-label={isPicking ? '系统选择窗口已打开' : '浏览选择文件夹'}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          isPicking
            ? 'text-amber-400 bg-amber-400/10 ring-1 ring-amber-400/30'
            : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/80'
        } ${buttonClassName}`}
        title={isPicking ? '系统选择窗口已打开...' : '浏览选择文件夹'}
      >
        {isPicking
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <FolderOpen className="w-4 h-4" />}
      </button>
    </div>
  );
}
