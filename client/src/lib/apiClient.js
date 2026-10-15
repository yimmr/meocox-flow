/**
 * Meocox Flow 统一后端寻址层
 * ─────────────────────────────────────────────────────────────
 * 全应用唯一的后端地址出口。此前存在 5 套并行写法（相对路径、硬编码
 * localhost:3001、fetch 全局猴补、EventSource 绕过、模板串内联），导致
 * 桌面端（Tauri，origin = tauri://localhost，无 dev proxy）多处功能失效。
 *
 * 规则：
 *   - Web 开发态：返回相对路径，交给 Vite dev proxy 转发
 *   - 桌面端 / 静态部署：返回 http://localhost:<port> 绝对地址
 *   - 端口来自 VITE_API_PORT，默认 3001
 *
 * 任何需要访问后端的地方都必须经由本模块，不要再直接写 fetch()/URL。
 */
import { isDesktopApp } from '@/utils/desktop.js';

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = 'localhost';

/** 端口：优先构建期注入，其次运行时从当前页面推断，最后回退默认 */
function resolvePort() {
  const injected = import.meta.env?.VITE_API_PORT;
  if (injected) return String(injected);

  // Web 开发态页面跑在 5173，后端在 3001；静态部署时页面与后端同源
  try {
    const fromLocation = new URL(window.location.href).port;
    if (fromLocation && fromLocation !== '5173') return fromLocation;
  } catch {
    /* 非浏览器环境 */
  }
  return String(DEFAULT_PORT);
}

function resolveBase() {
  if (!isDesktopApp()) return ''; // Web 走相对路径 + Vite proxy
  return `http://${DEFAULT_HOST}:${resolvePort()}`;
}

/**
 * 构造后端 URL。
 * @param {string} path 以 / 开头的后端路径，如 '/api/projects'
 * @returns {string} 桌面端为绝对地址，Web 端为相对地址
 */
export function apiUrl(path) {
  if (!path) return resolveBase();
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${resolveBase()}${suffix}`;
}

/**
 * 统一 fetch 封装。
 * @param {string} path  后端路径
 * @param {RequestInit} [init]
 */
export function apiFetch(path, init) {
  return fetch(apiUrl(path), init);
}

/** 供 EventSource / XMLHttpRequest / <img src> / <video src> 直接取用的绝对地址 */
export function apiStreamUrl(path) {
  return apiUrl(path);
}

/** 供媒体文件使用：把绝对磁盘路径转成可播放的后端流地址 */
export function mediaUrl(absolutePath) {
  if (!absolutePath) return '';
  return apiUrl(`/api/assets/stream?path=${encodeURIComponent(absolutePath)}`);
}

/**
 * 等待本地后端就绪。
 *
 * 打包态下后端由 Rust 在 setup() 里 spawn，前端可能先于它完成加载。
 * 若不等待，首屏的 fetchProjects / fetchAgentsList 会全部失败且不会重试。
 *
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] 最长等待时间，默认 20s
 * @param {number} [opts.intervalMs] 轮询间隔，默认 400ms
 * @returns {Promise<boolean>} 是否就绪
 */
export async function waitForBackend({ timeoutMs = 20000, intervalMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // 后端尚未监听，继续重试
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export default { apiUrl, apiFetch, apiStreamUrl, mediaUrl, waitForBackend };
