import React, { useRef, useState, useEffect } from 'react';

/**
 * 根据滚动容器当前的溢出与滚动位置，动态计算上下软边缘文本淡出状态
 */
export function computeScrollFadeMask(el) {
  if (!el) return 'none';
  const hasOverflow = el.scrollHeight - el.clientHeight > 2;
  if (!hasOverflow) return 'none';
  const canScrollUp = el.scrollTop > 2;
  const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
  if (canScrollUp && canScrollDown) return 'both';
  if (canScrollUp) return 'top';
  if (canScrollDown) return 'bottom';
  return 'none';
}

export const FADE_MASK_CLASS_MAP = {
  none: '',
  top: 'mask-scroll-fade-top',
  bottom: 'mask-scroll-fade-bottom',
  both: 'mask-scroll-fade-both'
};

/**
 * 通用限高与动态上下软边缘文本淡出滚动组件 (ScrollFadeArea)
 * 
 * 核心特性：
 * 1. 统一限高控制：支持自定义 maxHeight (默认 max-h-[220px])
 * 2. 统一细滚动条：thinking-scroll-area 悬停显隐超细优雅滚动条
 * 3. 动态文本淡出遮罩：内容未溢出时不显示遮罩；超出后根据滚动位置动态施加顶部/底部/双向遮罩
 * 4. 可选自动平滑滚底：通过 autoScroll=true 兼容思考推演/流式增量追加并自动保持触底
 */
export default function ScrollFadeArea({
  className = '',
  maxHeight = 'max-h-[220px]',
  autoScroll = false,
  fadeMask = true,
  children,
  onScroll,
  forwardRef
}) {
  const localRef = useRef(null);
  const scrollRef = forwardRef || localRef;
  const [maskState, setMaskState] = useState('none');
  const userScrolledUpRef = useRef(false);

  // 监听内容变化：自动滚底 (若启用 autoScroll 且用户未主动上滑) 与遮罩重算
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const rafId = requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      if (autoScroll && !userScrolledUpRef.current) {
        node.scrollTop = node.scrollHeight;
      }
      const nextMask = computeScrollFadeMask(node);
      setMaskState((prev) => (prev === nextMask ? prev : nextMask));
    });

    return () => cancelAnimationFrame(rafId);
  }, [children, autoScroll, scrollRef]);

  // 监听容器尺寸与排版变化，动态同步遮罩状态
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      const nextMask = computeScrollFadeMask(el);
      setMaskState((prev) => (prev === nextMask ? prev : nextMask));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef]);

  const handleInternalScroll = (e) => {
    const el = e.currentTarget;
    if (autoScroll) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distanceFromBottom > 24;
    }
    const nextMask = computeScrollFadeMask(el);
    setMaskState((prev) => (prev === nextMask ? prev : nextMask));
    if (onScroll) onScroll(e);
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleInternalScroll}
      className={`thinking-scroll-area ${maxHeight} overflow-auto overscroll-contain w-full min-w-0 ${fadeMask ? (FADE_MASK_CLASS_MAP[maskState] || '') : ''} ${className}`}
    >
      {children}
    </div>
  );
}
