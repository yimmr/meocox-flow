import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Cpu, ChevronDown, Check, Settings, Sparkles } from 'lucide-react';

/**
 * 通用模型选择器组件 (ModelSelectDropdown)
 * 统一对话框 (ChatPanel) 与设置面板 (AgentEditorPanel) 的模型选择交互
 * 支持按提供商分组、视觉多模态标识、跟随系统默认选项、form/compact 两种形态
 */
export default function ModelSelectDropdown({
  value = '',
  onChange,
  providers = [],
  availableModels = [],
  allowDefault = false,
  defaultLabel = '跟随系统默认',
  variant = 'form', // 'form' | 'compact'
  placement = 'bottom', // 'bottom' | 'top'
  align = 'left', // 'left' | 'right'
  placeholder = '选择模型',
  onOpenSettings,
  disabled = false,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // 点击外部关闭弹层
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 解析当前选中的模型对象与文本显示
  const { selectedModelObj, displayLabel, isDefaultSelected } = useMemo(() => {
    const isDef = allowDefault && (!value || value === '' || value === 'system_default');
    if (isDef) {
      return {
        selectedModelObj: null,
        displayLabel: defaultLabel,
        isDefaultSelected: true
      };
    }

    // 1. 从 providers 树中寻找
    if (Array.isArray(providers) && providers.length > 0) {
      for (const p of providers) {
        const found = (p.models || []).find(m => m.id === value || m.name === value);
        if (found) {
          return {
            selectedModelObj: found,
            displayLabel: found.name || found.id,
            isDefaultSelected: false
          };
        }
      }
    }

    // 2. 从扁平的 availableModels 寻找
    if (Array.isArray(availableModels) && availableModels.length > 0) {
      const found = availableModels.find(m => m.id === value || m.name === value);
      if (found) {
        return {
          selectedModelObj: found,
          displayLabel: found.label || found.name || found.id,
          isDefaultSelected: false
        };
      }
    }

    return {
      selectedModelObj: null,
      displayLabel: value || placeholder,
      isDefaultSelected: false
    };
  }, [value, providers, availableModels, allowDefault, defaultLabel, placeholder]);

  const handleSelect = (modelId, providerId = null) => {
    onChange?.(modelId, providerId);
    setIsOpen(false);
  };

  // 下拉面板定位与样式
  const dropdownPositionClass = placement === 'top'
    ? 'bottom-full mb-2'
    : 'top-full mt-1.5';

  const dropdownAlignClass = align === 'right'
    ? 'right-0'
    : 'left-0';

  const dropdownWidthClass = variant === 'form'
    ? 'w-full min-w-[280px]'
    : 'w-64';

  const hasProviders = Array.isArray(providers) && providers.length > 0;
  const hasFlatModels = !hasProviders && Array.isArray(availableModels) && availableModels.length > 0;

  return (
    <div className={`relative ${variant === 'form' ? 'w-full' : 'inline-block'} ${className}`} ref={containerRef}>
      {/* 触发按钮 */}
      {variant === 'form' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl bg-dark-800/90 border transition-all text-left text-xs ${
            disabled
              ? 'opacity-60 cursor-not-allowed border-dark-700 bg-dark-850'
              : isOpen
              ? 'border-brand-500/80 ring-2 ring-brand-500/20 bg-dark-750 shadow-md shadow-brand-500/10'
              : 'border-dark-700/80 hover:border-dark-600 hover:bg-dark-750/70'
          }`}
        >
          <div className="flex items-center space-x-2 truncate">
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border ${
              isDefaultSelected
                ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                : 'bg-brand-500/15 border-brand-500/30 text-brand-cyan'
            }`}>
              {isDefaultSelected ? <Sparkles className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
            </div>
            <span className="font-mono text-white truncate text-xs font-medium">
              {displayLabel}
            </span>
            {selectedModelObj?.isMultimodal && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                视觉
              </span>
            )}
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ml-1.5 ${
              isOpen ? 'rotate-180 text-brand-cyan' : ''
            }`}
          />
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-dark-750/60 transition cursor-pointer"
          title="点击切换思考模型"
        >
          <span className="font-medium max-w-[150px] truncate">
            {displayLabel}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      )}

      {/* 弹出的模型列表面板 */}
      {isOpen && (
        <div
          className={`absolute ${dropdownPositionClass} ${dropdownAlignClass} ${dropdownWidthClass} bg-dark-800 border border-dark-650 rounded-2xl shadow-2xl py-1 z-[100] animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md`}
        >
          {/* 标题 */}
          <div className="px-3.5 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-dark-700/60 flex items-center justify-between">
            <span>选择模型</span>
            {allowDefault && (
              <span className="text-[10px] text-gray-500 font-normal">支持缺省继承</span>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto py-1 divide-y divide-dark-700/40">
            {/* 跟随系统默认选项 (如果开启) */}
            {allowDefault && (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => handleSelect('', null)}
                  className={`w-full text-left px-3.5 py-1.5 text-xs flex items-center justify-between hover:bg-dark-700/80 transition cursor-pointer ${
                    isDefaultSelected
                      ? 'bg-purple-500/10 text-purple-300 font-semibold'
                      : 'text-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="truncate">{defaultLabel}</span>
                  </div>
                  {isDefaultSelected && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-1.5" />}
                </button>
              </div>
            )}

            {/* 按 Provider 树状分组展示 */}
            {hasProviders && providers.map(p => {
              const models = (Array.isArray(p.models) ? p.models : []).filter(m => {
                if (p.type === 'installed' || p.id === 'provider_installed') {
                  if (m.isInstalled === false || m.isReady === false || m.enabled === false) return false;
                }
                return true;
              });
              return (
                <div key={p.id} className="py-1">
                  <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 flex items-center space-x-1.5 bg-dark-900/40">
                    <span className="text-brand-cyan text-[10px]">●</span>
                    <span className="truncate">{p.name}</span>
                    {p.type !== 'installed' && (
                      <span className="text-[9px] text-gray-500 font-normal">
                        ({p.type === 'opencode' ? 'OpenCode' : '自定义'})
                      </span>
                    )}
                  </div>

                  {models.length > 0 ? (
                    models.map(m => {
                      const isSelected = !isDefaultSelected && (m.id === value || m.name === value);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelect(m.id, p.id)}
                          className={`w-full text-left pl-5 pr-3 py-1.5 text-xs flex items-center justify-between hover:bg-dark-700/80 transition cursor-pointer ${
                            isSelected
                              ? 'bg-brand-500/10 text-brand-cyan font-semibold'
                              : 'text-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-1.5 truncate">
                            <span className="truncate">{m.name}</span>
                            {m.isMultimodal && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                                视觉
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-brand-cyan shrink-0 ml-1.5" />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-5 py-1 text-[11px] text-gray-500 italic">暂无可用模型</div>
                  )}
                </div>
              );
            })}

            {/* 扁平 fallback 列表 (若未提供 providers) */}
            {hasFlatModels && (
              <div className="py-1">
                {availableModels.map(m => {
                  const mId = m.id || m;
                  const mLabel = m.label || m.name || mId;
                  const isSelected = !isDefaultSelected && (mId === value);
                  return (
                    <button
                      key={mId}
                      type="button"
                      onClick={() => handleSelect(mId, null)}
                      className={`w-full text-left px-3.5 py-1.5 text-xs flex items-center justify-between hover:bg-dark-700/80 transition cursor-pointer ${
                        isSelected
                          ? 'bg-brand-500/10 text-brand-cyan font-semibold'
                          : 'text-gray-300'
                      }`}
                    >
                      <span className="truncate">{mLabel}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-brand-cyan shrink-0 ml-1.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {!hasProviders && !hasFlatModels && !allowDefault && (
              <div className="px-3 py-4 text-center text-xs text-gray-500">
                暂无可用模型
              </div>
            )}
          </div>

          {/* 底部管理操作 */}
          {onOpenSettings && (
            <div className="border-t border-dark-700/80 pt-1 mt-1 px-1.5 pb-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="w-full text-left px-2 py-1 rounded-lg text-xs text-brand-cyan hover:bg-dark-700/60 flex items-center space-x-1.5 transition font-medium cursor-pointer"
              >
                <Settings className="w-3 h-3" />
                <span>管理与添加模型...</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
