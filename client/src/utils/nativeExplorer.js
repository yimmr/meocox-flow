import { apiFetch } from '@/lib/apiClient.js';
import { toast } from '@/components/ui/sonner.jsx';
import { isDesktopApp, openPathInExplorer } from '@/utils/desktop.js';

/**
 * 统一打开系统文件夹 (跨桌面与 Web 端)
 * 优先走 Tauri 原生 0ms 打开，降级走后端统一接口
 *
 * @param {string|object} target 路径字符串，或包含 { path, folderPath, projectDir, projectId, type, id } 的对象
 * @returns {Promise<boolean>} 是否成功打开
 */
export async function openFolder(target) {
  try {
    let folderPath = typeof target === 'string'
      ? target
      : (target?.path || target?.folderPath || target?.projectDir);
    const type = typeof target === 'object' ? target?.type : null;
    const id = typeof target === 'object' ? target?.id : null;
    // 只有在明确传入 projectId，或者没有指定 type 且没有 folderPath 时，才把 id 视作 projectId
    const projectId = typeof target === 'object'
      ? (target?.projectId || (!type && !folderPath && target?.id ? target.id : null))
      : null;

    // 1. 如果有已知物理路径，且在 Tauri 桌面端环境，优先直接调用 Rust 原生 Explorer (0ms 零延迟)
    if (folderPath && isDesktopApp()) {
      const ok = await openPathInExplorer(folderPath);
      if (ok) return true;
    }

    // 2. 调用后端统一系统接口
    const body = {};
    if (folderPath) body.folderPath = folderPath;
    if (projectId && !type) body.projectId = projectId;
    if (type) body.type = type;
    if (id) body.id = id;

    const endpoint = (projectId && !type && !folderPath)
      ? `/api/projects/${projectId}/open-folder`
      : '/api/system/open-folder';

    const res = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '打开文件夹失败');
    }

    return true;
  } catch (err) {
    console.error('打开文件夹异常:', err);
    toast.error('打开文件夹失败: ' + err.message);
    return false;
  }
}

/**
 * 统一使用操作系统默认应用打开本地文件
 * @param {string} filePath 文件绝对路径或相对路径
 * @param {string} relativePath 可选备用相对路径
 * @returns {Promise<boolean>}
 */
export async function openFile(filePath, relativePath) {
  try {
    const res = await apiFetch('/api/system/open-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, relativePath })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '打开文件失败');
    }
    return true;
  } catch (err) {
    console.error('打开文件异常:', err);
    toast.error('打开文件失败: ' + err.message);
    return false;
  }
}
