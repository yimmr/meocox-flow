import React from 'react';
import { Info, Laptop, Globe, Server, Cpu, ShieldCheck, Heart } from 'lucide-react';
import { isDesktopApp } from '../../../utils/desktop.js';
import { apiUrl } from '@/lib/apiClient.js';

export default function AboutSettingsTab() {
  const isDesktop = isDesktopApp();

  return (
    <div className="space-y-3.5">
      {/* 软件主信息卡片 */}
      <div className="p-4 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <h3 className="text-fluid-base font-bold text-white tracking-wide">Meocox Flow</h3>
            <span className="text-fluid-xs font-mono font-semibold px-2 py-0.2 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              v1.0.0
            </span>
          </div>
          <p className="text-fluid-xs text-slate-400 max-w-lg leading-relaxed">
            AI 视频剪辑智能体 Studio。集成 CAS 零冗余感知缓存、多角色智能体协同与 MCP 外部协议扩展。
          </p>
        </div>
      </div>

      {/* 运行环境与状态 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20 space-y-2">
          <div className="flex items-center space-x-2 text-fluid-xs font-semibold text-slate-300">
            {isDesktop ? (
              <Laptop className="w-4 h-4 text-emerald-400" />
            ) : (
              <Globe className="w-4 h-4 text-indigo-400" />
            )}
            <span>客户端运行形态</span>
          </div>
          <div className="text-fluid-base text-white font-semibold">
            {isDesktop ? 'Tauri 2.0 原生桌面端' : 'Web 浏览器模式'}
          </div>
          <p className="text-fluid-xs text-slate-400 leading-relaxed">
            {isDesktop
              ? '支持本地文件高速通道、FFmpeg 与操作系统桌面级文件监视能力。'
              : '运行于标准 Web 环境，通过本地 HTTP/WebSocket 与后端服务端通信。'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20 space-y-2">
          <div className="flex items-center space-x-2 text-fluid-xs font-semibold text-slate-300">
            <Server className="w-4 h-4 text-purple-400" />
            <span>核心服务总线</span>
          </div>
          <div className="text-fluid-base text-white font-mono font-semibold truncate">
            {apiUrl('/api/health').replace(/\/api\/health$/, '')}
          </div>
          <p className="text-fluid-xs text-slate-400 leading-relaxed">
            提供剪辑流水线引擎、CAS 内容寻址存储、多智能体协同与视频感知转码服务。
          </p>
        </div>
      </div>

      {/* 架构特性 */}
      <div className="p-4 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20 space-y-3">
        <h5 className="text-fluid-xs font-semibold text-slate-300 flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-indigo-400" />
          <span>核心架构设计</span>
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-fluid-xs">
          <div className="p-3 rounded-xl bg-[#0D111A] border border-white/[0.06]">
            <div className="font-semibold text-white">CAS 内容寻址</div>
            <div className="text-fluid-xs text-slate-400 mt-1 leading-relaxed">跨工程秒级素材复用，零冗余磁盘可控</div>
          </div>
          <div className="p-3 rounded-xl bg-[#0D111A] border border-white/[0.06]">
            <div className="font-semibold text-white">Agent 多角色协同</div>
            <div className="text-fluid-xs text-slate-400 mt-1 leading-relaxed">主脑、编剧、导演、剪辑与视觉侦测团队</div>
          </div>
          <div className="p-3 rounded-xl bg-[#0D111A] border border-white/[0.06]">
            <div className="font-semibold text-white">MCP 外部生态扩展</div>
            <div className="text-fluid-xs text-slate-400 mt-1 leading-relaxed">无缝连通 ComfyUI 及任意外部工具协议</div>
          </div>
        </div>
      </div>
    </div>
  );
}
