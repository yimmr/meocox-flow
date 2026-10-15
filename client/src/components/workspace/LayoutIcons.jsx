import React from 'react';

/**
 * VS Code 官方风格侧栏布局切换纯图标 (Pixel-perfect VS Code Layout Icons)
 * 1. 纯矢量 SVG，无任何外部额外背景包裹与圆角外框
 * 2. 激活态下对应侧栏自动填充低饱和度哑光实心，折叠态下保持极简线条线框
 */

export function VscodeSidebarLeftIcon({ active = false, className = "w-4 h-4" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 外轮廓框 */}
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="2"
        ry="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* 垂直分割线 */}
      <line
        x1="5.5"
        y1="1.5"
        x2="5.5"
        y2="14.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* 激活时左侧栏低饱和度实心填充 */}
      {active && (
        <path
          d="M 3.5 1.5 L 5.5 1.5 L 5.5 14.5 L 3.5 14.5 A 2 2 0 0 1 1.5 12.5 L 1.5 3.5 A 2 2 0 0 1 3.5 1.5 Z"
          fill="currentColor"
          fillOpacity="0.85"
        />
      )}
    </svg>
  );
}

export function VscodeSidebarRightIcon({ active = false, className = "w-4 h-4" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 外轮廓框 */}
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="2"
        ry="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* 垂直分割线 */}
      <line
        x1="10.5"
        y1="1.5"
        x2="10.5"
        y2="14.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* 激活时右侧栏低饱和度实心填充 */}
      {active && (
        <path
          d="M 10.5 1.5 L 12.5 1.5 A 2 2 0 0 1 14.5 3.5 L 14.5 12.5 A 2 2 0 0 1 12.5 14.5 L 10.5 14.5 Z"
          fill="currentColor"
          fillOpacity="0.85"
        />
      )}
    </svg>
  );
}
