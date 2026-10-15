import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { SETTINGS_GROUPS } from './settingsConfig.js';

export default function SettingsSidebar({
  activeTab,
  onSelectTab
}) {
  const [filterQuery, setFilterQuery] = useState('');

  const query = filterQuery.trim().toLowerCase();

  return (
    <aside className="w-56 shrink-0 bg-[#090D15] border-r border-white/[0.07] flex flex-col justify-between select-none">
      {/* 搜索框 */}
      <div className="p-3 border-b border-white/[0.07]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="搜索设置项..."
            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-white/20 focus:bg-white/[0.06] rounded-lg pl-8.5 pr-2.5 py-1.5 text-fluid-xs text-white placeholder-slate-500 focus:outline-none transition"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fluid-xs text-slate-400 hover:text-white"
            >
              清空
            </button>
          )}
        </div>
      </div>

      {/* 导航分组列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {SETTINGS_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (!query) return true;
            return (
              item.label.toLowerCase().includes(query) ||
              item.description.toLowerCase().includes(query) ||
              group.label.toLowerCase().includes(query)
            );
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.id} className="space-y-0.5">
              <div className="px-3 py-1 text-fluid-xs font-semibold text-slate-500 uppercase tracking-wider">
                {group.label}
              </div>

              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id || (activeTab === 'mcp' && item.id === 'tools') || (activeTab === 'tools' && item.id === 'mcp');

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectTab(item.id)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-1.5 text-fluid-sm transition-colors rounded-lg group text-left cursor-pointer ${
                        isActive
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-white'
                            : 'text-slate-500 group-hover:text-slate-300'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
