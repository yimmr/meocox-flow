import React, { useState } from 'react';

/**
 * 工业级双向拖拽调整分栏宽度组件 (Resizable Column Splitter)
 * 具备：
 * 1. 毫秒级 60fps 流畅拖拽响应
 * 2. 悬停与拖拽采用与滚动条完全一致的暗灰基色 (#374151 / #4B5563)，杜绝紫色等杂色
 * 3. 双击恢复默认宽度
 */
export default function ResizeSplitter({
  onMouseDown,
  onDoubleClick,
  isDragging = false,
  title = "长按左右拖动改变分栏宽度，双击恢复默认"
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-1.5 h-full cursor-col-resize select-none shrink-0 z-30 group flex items-center justify-center transition-colors"
      title={title}
    >
      {/* 视觉中线：与滚动条颜色 (#374151 / #4B5563) 完全统一 */}
      <div
        className={`h-full transition-colors duration-150 ${
          isDragging
            ? 'w-[2px] bg-[#4B5563]'
            : isHovered
              ? 'w-[2px] bg-[#4B5563]'
              : 'w-[1px] bg-[#1F2937] group-hover:bg-[#374151]'
        }`}
      />
    </div>
  );
}
