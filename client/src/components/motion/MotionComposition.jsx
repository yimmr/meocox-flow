import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { TechTerminalScene } from './scenes/TechTerminalScene.jsx';
import { DataChartScene } from './scenes/DataChartScene.jsx';
import { ArchitectureFlowScene } from './scenes/ArchitectureFlowScene.jsx';
import { KineticTypographyScene } from './scenes/KineticTypographyScene.jsx';

const COMPONENT_MAP = {
  TechTerminal: TechTerminalScene,
  DataChart: DataChartScene,
  ArchitectureFlow: ArchitectureFlowScene,
  KineticTypography: KineticTypographyScene
};

export function MotionComposition({ manifest = {} }) {
  const scenes = manifest.scenes || [];

  if (scenes.length === 0) {
    return (
      <AbsoluteFill className="bg-[#06080D] flex items-center justify-center text-slate-500 font-mono text-sm">
        [暂无可渲染的动效分镜]
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill className="bg-[#06080D] overflow-hidden">
      {scenes.map((scene, idx) => {
        const SceneComponent = COMPONENT_MAP[scene.componentType] || KineticTypographyScene;
        const fromFrame = scene.startFrame ?? 0;
        const duration = scene.durationInFrames ?? 120;

        return (
          <Sequence
            key={scene.id || `scene_${idx}`}
            from={fromFrame}
            durationInFrames={duration}
            name={scene.title || `Scene ${idx + 1}`}
          >
            <SceneComponent props={scene.props || {}} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
