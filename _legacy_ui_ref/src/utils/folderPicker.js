import { apiFetch } from '@/lib/apiClient.js';
import { toast } from '@/components/ui/sonner.jsx';
import { isDesktopApp } from '@/utils/desktop.js';

/**
 * 唤起系统原生目录选择器，返回选中的绝对路径；用户取消则返回 null。
 *
 * 两条路径：
 *   1. 桌面端 (Tauri) —— tauri-plugin-dialog 进程内直接弹原生框，
 *      零 HTTP 往返、零进程冷启动（实测每次 fork folderPicker.exe 约 200-500ms，
 *      关闭后还要 ~450ms 进程收尾，是"点了没反应/取消后卡一下"的根源）。
 *   2. Web 端 —— 走后端统一接口，由 server 唤起原生选择器。
 *
 * @param {object} options
 * @param {string} options.title 弹窗标题
 * @param {string} options.initialPath 初始定位目录
 * @returns {Promise<string|null>} 用户选择的绝对路径，若取消则返回 null
 */
export async function pickFolderDialog({ title = '请选择文件夹', initialPath = '' } = {}) {
  if (isDesktopApp()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const args = { directory: true, multiple: false, title };
      if (initialPath) args.defaultPath = initialPath;
      const picked = await open(args);
      // 返回 null / undefined 一律视为"用户取消"，不回退 HTTP（否则会弹第二次）
      return typeof picked === 'string' && picked ? picked : null;
    } catch (err) {
      // 只有"对话框压根没弹出来"（插件未装 / 权限未授）才允许回退，
      // 此时回退不会造成二次弹窗
      console.warn('[pickFolderDialog] Tauri dialog 不可用，回退 HTTP 路径:', err);
    }
  }

  try {
    const res = await apiFetch('/api/system/pick-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, initialPath })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || '调起系统目录选择器失败');
      return null;
    }

    const data = await res.json();
    if (data.success && !data.cancelled && data.folderPath) {
      return data.folderPath;
    }
    return null;
  } catch (err) {
    console.warn('唤起系统文件夹选择器失败:', err);
    toast.error('唤起文件夹选择器异常: ' + err.message);
    return null;
  }
}
