/**
 * Desktop Tauri Bridge & Native Helper
 * 提供 Web 与 Tauri 2.0 桌面原生环境的双模无缝降级支持
 */

export const isDesktopApp = () => {
  return typeof window !== 'undefined' && (
    '__TAURI_INTERNALS__' in window ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost'
  );
};

/**
 * 调用 Tauri 原生 Rust 命令
 * @param {string} cmd 
 * @param {object} args 
 */
export const invokeDesktop = async (cmd, args = {}, { throwOnError = false } = {}) => {
  if (!isDesktopApp()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke(cmd, args);
  } catch (err) {
    console.warn(`[Tauri] Invoke '${cmd}' failed:`, err);
    if (throwOnError) throw err;
    return null;
  }
};

/**
 * 唤起原生 Windows 独立 WebView2 媒体浏览工作舱
 * 彻底绕过 Cloudflare Turnstile、403、CORS 并支持抖音等真人登录
 */
export const openDesktopWebview = async (url, title = '媒体浏览工作舱') => {
  if (isDesktopApp()) {
    try {
      await invokeDesktop('open_web_browser_window', { url, title }, { throwOnError: true });
      return true;
    } catch (e) {
      console.error('[Tauri] Failed to open native webview:', e);
    }
  }
  return false;
};

/**
 * 关闭当前已打开的原生 WebView2 独立浏览窗口
 */
export const closeDesktopWebview = async () => {
  if (isDesktopApp()) {
    try {
      await invokeDesktop('close_web_browser_window', {}, { throwOnError: true });
      return true;
    } catch (e) {
      console.error('[Tauri] Failed to close native webview:', e);
    }
  }
  return false;
};

/**
 * 在 Windows 资源管理器中打开指定目录
 */
export const openPathInExplorer = async (path) => {
  if (isDesktopApp()) {
    try {
      await invokeDesktop('open_in_explorer', { path }, { throwOnError: true });
      return true;
    } catch (e) {
      console.error('[Tauri] Failed to open in explorer:', e);
    }
  }
  return false;
};

export { openFolder, openFile } from './nativeExplorer.js';

