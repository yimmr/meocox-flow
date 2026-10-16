import React from 'react';
import { ControlStreamPanel } from '@/components/control-stream/ControlStreamPanel';
import { LivingCanvasPanel } from '@/components/canvas/LivingCanvasPanel';

export const App: React.FC = () => {
  return (
    <div className="flex h-full w-full overflow-hidden bg-neutral-950 font-sans antialiased text-neutral-100">
      {/* 左栏：控制流与 TurnSteer 动态干预卡片 */}
      <ControlStreamPanel />

      {/* 右栏：Living Canvas 鲜活双栏 DAG 节点图与资产池 */}
      <LivingCanvasPanel />
    </div>
  );
};

export default App;
