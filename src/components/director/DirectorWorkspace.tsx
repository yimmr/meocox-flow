import React, { useState, useEffect, useRef } from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { DirectorHeader } from '@/components/layout/DirectorHeader';
import { ResizeSplitter } from '@/components/layout/ResizeSplitter';
import { ProjectLibrarySidebar } from '@/components/sidebar/ProjectLibrarySidebar';
import { TimelineFeed } from './TimelineFeed';
import { TurnSteerInputBar } from './TurnSteerInputBar';
import { ArtifactsDrawer } from '@/components/artifacts/ArtifactsDrawer';

export const DirectorWorkspace: React.FC = () => {
  const {
    isLeftSidebarOpen,
    isRightSidebarOpen,
    leftWidth,
    rightWidth,
    setLeftWidth,
    setRightWidth,
    fetchDaemonStatus,
    fetchAssets,
    fetchCheckpoints,
  } = useStudioStore();

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 初始化拉取后端数据并定时轮询守护状态
  useEffect(() => {
    fetchDaemonStatus();
    fetchAssets();
    fetchCheckpoints();

    const interval = setInterval(() => {
      fetchDaemonStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchDaemonStatus, fetchAssets, fetchCheckpoints]);

  // 左右侧栏无级拖拽调整宽度
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (isDraggingLeft) {
        const newLeftWidth = Math.max(180, Math.min(500, e.clientX - rect.left));
        setLeftWidth(newLeftWidth);
      }

      if (isDraggingRight) {
        const newRightWidth = Math.max(260, Math.min(650, rect.right - e.clientX));
        setRightWidth(newRightWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, setLeftWidth, setRightWidth]);

  return (
    <div className="flex flex-col h-full w-full bg-neutral-950 text-neutral-100 font-sans overflow-hidden select-none">
      {/* 顶部正统状态栏 */}
      <DirectorHeader />

      {/* 三栏核心工作台 */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* 左栏：项目与媒体资产池 (可折叠 / 可拖拽调宽) */}
        {isLeftSidebarOpen && (
          <>
            <ProjectLibrarySidebar width={leftWidth} />
            <ResizeSplitter
              isDragging={isDraggingLeft}
              onMouseDown={() => setIsDraggingLeft(true)}
              onDoubleClick={() => setLeftWidth(280)}
              title="左右拖动调整资产库宽度，双击恢复默认(280px)"
              side="left"
            />
          </>
        )}

        {/* 中栏：导演主对话指挥流 + 底部 TurnSteer 动态切轨输入框 */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 min-w-[320px]">
          {/* 对话信息流 */}
          <TimelineFeed />

          {/* 底部输入中枢 */}
          <TurnSteerInputBar />
        </main>

        {/* 右栏：Codex 风格产物预览画板 (可折叠 / 可拖拽调宽) */}
        {isRightSidebarOpen && (
          <>
            <ResizeSplitter
              isDragging={isDraggingRight}
              onMouseDown={() => setIsDraggingRight(true)}
              onDoubleClick={() => setRightWidth(380)}
              title="左右拖动调整产物画板宽度，双击恢复默认(380px)"
              side="right"
            />
            <ArtifactsDrawer width={rightWidth} />
          </>
        )}
      </div>
    </div>
  );
};
