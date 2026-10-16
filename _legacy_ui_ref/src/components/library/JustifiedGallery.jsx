import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/**
 * 全局宽高比内存缓存，避免组件重复渲染时图片/视频比例抖动
 */
const globalRatioCache = new Map();

/**
 * 获取媒体资产的默认或已解析宽高比
 */
export function getAssetAspectRatio(file) {
  if (!file) return 16 / 9;

  // 1. 优先读取已缓存的真实宽高比
  if (file.path && globalRatioCache.has(file.path)) {
    return globalRatioCache.get(file.path);
  }

  // 2. 读取服务端返回的分析元数据 (perception / metadata)
  if (file.perception?.width && file.perception?.height) {
    const r = file.perception.width / file.perception.height;
    if (r > 0.2 && r < 5) {
      if (file.path) globalRatioCache.set(file.path, r);
      return r;
    }
  }

  // 3. 按文件类型智能推断基准比例
  if (file.type === 'video') {
    return 16 / 9; // 1.778
  }
  if (file.type === 'image') {
    return 4 / 3; // 1.333
  }
  if (file.type === 'audio') {
    return 2.0; // 宽卡片，适合音频波形与控制
  }
  // 文档或其它类型
  return 1.35;
}

/**
 * JustifiedGallery - 自适应行填充瀑布流布局 (Justified Row Gallery)
 * 
 * 特性：
 * 1. 宽度根据内容自身比例 (Aspect Ratio) 决定
 * 2. 单行内所有卡片高度严格一致，整行宽度 100% 严丝合缝自动占满
 * 3. 支持大网格/中网格 targetRowHeight 按比缩放
 * 4. ResizeObserver 监听容器宽度自适应弹性拉伸
 * 5. 优雅处理末行残留卡片，避免异常畸变
 */
export default function JustifiedGallery({
  items = [],
  targetRowHeight = 180,
  gap = 15,
  renderItem,
  className = ''
}) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [ratioVersion, setRatioVersion] = useState(0);

  // 监听容器实际宽度变化 (支持侧边栏拖拽调整、窗口缩放)
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const updateWidth = () => {
      if (el) {
        const w = el.clientWidth;
        if (w > 0) setContainerWidth(w);
      }
    };

    updateWidth();

    let rAF = null;
    const observer = new ResizeObserver((entries) => {
      if (rAF) cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(() => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0) {
            setContainerWidth(w);
          }
        }
      });
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rAF) cancelAnimationFrame(rAF);
    };
  }, []);

  // 媒体真实尺寸上报回调
  const handleReportRatio = useCallback((filePath, ratio) => {
    if (!filePath || !ratio || ratio <= 0) return;
    const prev = globalRatioCache.get(filePath);
    // 只有比例发生实质变动才触发重新计算
    if (!prev || Math.abs(prev - ratio) > 0.05) {
      globalRatioCache.set(filePath, ratio);
      setRatioVersion((v) => v + 1);
    }
  }, []);

  // 计算多行自适应排版数据
  const rows = useMemo(() => {
    if (!containerWidth || items.length === 0) return [];

    const computedRows = [];
    let currentRow = [];
    let currentNaturalWidth = 0;

    for (let i = 0; i < items.length; i++) {
      const file = items[i];
      const ar = getAssetAspectRatio(file);
      const naturalWidth = targetRowHeight * ar;

      currentRow.push({ file, ar, naturalWidth });
      currentNaturalWidth += naturalWidth;

      const currentGaps = (currentRow.length - 1) * gap;
      const totalWidthNeeded = currentNaturalWidth + currentGaps;

      // 当一行累计的自然宽度达到或略微超出容器总宽度时，进行行高反算占满整行
      if (totalWidthNeeded >= containerWidth) {
        const sumAr = currentRow.reduce((sum, item) => sum + item.ar, 0);
        // H_row = (W - totalGaps) / sum(aspectRatios)
        const justifiedHeight = (containerWidth - currentGaps) / sumAr;
        // 限制合理高度区间，避免极端畸变
        const finalHeight = Math.max(
          targetRowHeight * 0.65,
          Math.min(targetRowHeight * 1.55, justifiedHeight)
        );

        computedRows.push({
          height: finalHeight,
          isLast: false,
          isJustified: true,
          items: currentRow.map((it) => ({
            ...it,
            width: Math.floor(finalHeight * it.ar)
          }))
        });

        currentRow = [];
        currentNaturalWidth = 0;
      }
    }

    // 处理末行残余卡片
    if (currentRow.length > 0) {
      const currentGaps = (currentRow.length - 1) * gap;
      const totalWidthNeeded = currentNaturalWidth + currentGaps;
      const sumAr = currentRow.reduce((sum, item) => sum + item.ar, 0);

      // 如果最后一行卡片总宽度已达到容器的 75% 以上，同样占满全行
      if (totalWidthNeeded >= containerWidth * 0.75) {
        const justifiedHeight = (containerWidth - currentGaps) / sumAr;
        const finalHeight = Math.max(
          targetRowHeight * 0.65,
          Math.min(targetRowHeight * 1.4, justifiedHeight)
        );
        computedRows.push({
          height: finalHeight,
          isLast: true,
          isJustified: true,
          items: currentRow.map((it) => ({
            ...it,
            width: Math.floor(finalHeight * it.ar)
          }))
        });
      } else {
        // 残留卡片不足整行时，保持基准高度，靠左自然排列，不强制拉伸
        computedRows.push({
          height: targetRowHeight,
          isLast: true,
          isJustified: false,
          items: currentRow.map((it) => ({
            ...it,
            width: Math.floor(targetRowHeight * it.ar)
          }))
        });
      }
    }

    return computedRows;
  }, [items, containerWidth, targetRowHeight, gap, ratioVersion]);

  return (
    <div ref={containerRef} data-gallery-container="true" className={`w-full ${className}`}>
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center w-full"
          style={{
            gap: `${gap}px`,
            height: `${row.height}px`,
            marginBottom: rowIndex === rows.length - 1 ? 0 : `${gap}px`
          }}
        >
          {row.items.map((it, itemIndex) => (
            <div
              key={it.file.path || `${rowIndex}-${itemIndex}`}
              style={{
                flex: row.isJustified ? `${it.ar} 1 0%` : `0 0 ${it.width}px`,
                height: '100%',
                minWidth: 0,
                maxWidth: '100%'
              }}
            >
              {typeof renderItem === 'function' &&
                renderItem(it.file, {
                  width: it.width,
                  height: row.height,
                  isLastRow: row.isLast,
                  isLastInRow: itemIndex === row.items.length - 1,
                  aspectRatio: it.ar,
                  onReportRatio: handleReportRatio
                })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
