import React from 'react';

interface ResizeSplitterProps {
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  title?: string;
  side?: 'left' | 'right';
}

export const ResizeSplitter: React.FC<ResizeSplitterProps> = ({
  isDragging,
  onMouseDown,
  onDoubleClick,
  title = '拖拽调整宽度，双击恢复默认',
  side = 'left',
}) => {
  return (
    <div
      role="separator"
      tabIndex={0}
      title={title}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={`group relative w-1 cursor-col-resize select-none shrink-0 transition-colors z-20 ${
        isDragging
          ? 'bg-blue-500'
          : 'bg-neutral-800/80 hover:bg-neutral-600 active:bg-blue-500'
      }`}
    >
      {/* 隐形扩大点击命中区域 */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize z-10" />

      {/* 视觉把手指示器 */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-1 h-8 rounded-full transition-opacity ${
          side === 'left' ? '-left-0.5' : '-right-0.5'
        } ${isDragging ? 'bg-blue-400 opacity-100' : 'bg-neutral-500 opacity-0 group-hover:opacity-100'}`}
      />
    </div>
  );
};
