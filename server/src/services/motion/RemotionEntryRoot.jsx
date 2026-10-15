import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { MotionComposition } from '../../../../client/src/components/motion/MotionComposition.jsx';

/**
 * 确定性直出渲染根组件
 * 包含全局反抖动/反闪烁样式重置与客户端 Tailwind 全量样式同步注入
 */
const RootComponent = ({ manifest = {}, cssContent = '' }) => {
  // Remotion 官方反闪烁防竞态铁律：
  // 彻底阻断任何未经 Remotion 帧驱动的 CSS transitions 与 CSS @keyframes
  const antiFlickerReset = `
    *, *::before, *::after {
      -webkit-transition: none !important;
      -moz-transition: none !important;
      -o-transition: none !important;
      transition: none !important;
      -webkit-animation: none !important;
      -moz-animation: none !important;
      -o-animation: none !important;
      animation: none !important;
    }
    body, html {
      margin: 0;
      padding: 0;
      background-color: #06080D;
    }
  `;

  return (
    <>
      <style
        id="remotion-synchronous-styles"
        dangerouslySetInnerHTML={{
          __html: `${cssContent || ''}\n${antiFlickerReset}`
        }}
      />
      <MotionComposition manifest={manifest} />
    </>
  );
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="MotionExplainer"
      component={RootComponent}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        manifest: {},
        cssContent: ''
      }}
      calculateMetadata={({ props }) => {
        const manifest = props?.manifest || {};
        const fps = Number(manifest.fps) || 30;
        const totalDurationSec = Number(manifest.totalDurationSec) || 10;
        const totalFrames = Number(manifest.totalFrames) || Math.round(totalDurationSec * fps);
        const width = Number(manifest.width) || 1920;
        const height = Number(manifest.height) || 1080;

        return {
          fps,
          durationInFrames: Math.max(1, totalFrames),
          width,
          height,
          props
        };
      }}
    />
  );
};

registerRoot(RemotionRoot);
