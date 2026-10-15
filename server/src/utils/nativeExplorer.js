import path from 'node:path';
import fsSync from 'node:fs';
import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { storage } from '../storage/index.js';

let activePickerChild = null;

// 探测结果缓存：一次选择要连点 6 个 existsSync，缓存后每次点击省掉全部磁盘探测
let cachedExePickerPath; // undefined=未探测, null=确认不存在
let cachedPs1PickerPath;

function getPickerExecutablePath() {
  if (cachedExePickerPath !== undefined) return cachedExePickerPath;
  const candidates = [
    path.join(config.paths.appRoot, 'server', 'src', 'utils', 'folderPicker.exe'),
    path.join(config.paths.appRoot, 'server', 'utils', 'folderPicker.exe'),
    path.join(config.paths.appRoot, 'src', 'utils', 'folderPicker.exe'),
    path.join(process.cwd(), 'server', 'src', 'utils', 'folderPicker.exe'),
    path.join(process.cwd(), 'server', 'utils', 'folderPicker.exe'),
    path.join(process.cwd(), 'src', 'utils', 'folderPicker.exe')
  ];
  cachedExePickerPath = candidates.find((p) => fsSync.existsSync(p)) || null;
  return cachedExePickerPath;
}

function getPs1PickerPath() {
  if (cachedPs1PickerPath) return cachedPs1PickerPath;
  const candidates = [
    path.join(config.paths.appRoot, 'server', 'src', 'utils', 'pickFolder.ps1'),
    path.join(config.paths.appRoot, 'server', 'utils', 'pickFolder.ps1'),
    path.join(config.paths.appRoot, 'src', 'utils', 'pickFolder.ps1'),
    path.join(process.cwd(), 'server', 'src', 'utils', 'pickFolder.ps1'),
    path.join(process.cwd(), 'server', 'utils', 'pickFolder.ps1'),
    path.join(process.cwd(), 'src', 'utils', 'pickFolder.ps1')
  ];
  cachedPs1PickerPath = candidates.find((p) => fsSync.existsSync(p)) || candidates[0];
  return cachedPs1PickerPath;
}

/**
 * PowerShell 兜底路径
 *
 * 关键区分：用户点"取消"时脚本正常退出(exit 0)且 stdout 为空 → cancelled；
 * 而 Add-Type 编译失败、COM 异常等会让 PowerShell 以非 0 退出 → 必须当 error 上抛，
 * 否则会被静默当成"用户取消"，表现为"点了却毫无反应"。
 */
function runPs1Picker(safeTitle, safePath, resolve) {
  const ps1PickerPath = getPs1PickerPath();
  const args = [
    '-Sta',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    ps1PickerPath,
    '-Title',
    String(safeTitle || '').replace(/["`]/g, ''),
    '-InitialFolder',
    String(safePath || '').replace(/["`]/g, '')
  ];

  activePickerChild = execFile('powershell.exe', args, { timeout: 120000, encoding: 'utf8', windowsHide: false }, (err, stdout) => {
    activePickerChild = null;
    if (err) {
      return resolve({ error: `目录选择器脚本执行失败: ${err.message}` });
    }
    const folderPath = (stdout || '').trim();
    if (!folderPath) return resolve({ cancelled: true });
    resolve({ cancelled: false, folderPath });
  });
}

/**
 * 统一在操作系统原生文件资源管理器中打开指定目录
 * @param {string} folderPath 目标目录路径
 * @returns {Promise<{ success: boolean, openedPath: string }>}
 */
export async function openFolderInExplorer(folderPath) {
  if (!folderPath) {
    throw new Error('folderPath is required');
  }
  const resolved = path.resolve(folderPath);
  if (!fsSync.existsSync(resolved)) {
    fsSync.mkdirSync(resolved, { recursive: true });
  }

  const platform = process.platform;
  if (process.env.NODE_ENV !== 'test') {
    if (platform === 'win32') {
      execFile('explorer.exe', [resolved], { windowsHide: true }, () => {});
    } else if (platform === 'darwin') {
      execFile('open', [resolved], () => {});
    } else {
      execFile('xdg-open', [resolved], () => {});
    }
  }

  return { success: true, openedPath: resolved };
}

/**
 * 统一解析并打开项目工作区目录
 * @param {string} projectId 项目 ID
 */
export async function openProjectFolderInExplorer(projectId) {
  if (!projectId) {
    throw new Error('projectId is required');
  }
  const workDir = await storage.getProjectWorkDir(projectId);
  if (!workDir) {
    throw new Error(`未找到项目「${projectId}」对应的工作区目录`);
  }
  return openFolderInExplorer(workDir);
}

/**
 * 统一使用操作系统默认应用打开本地文件
 * @param {string} filePath 文件绝对路径或相对路径
 * @param {string} relativePath 备用相对路径
 * @returns {Promise<{ success: boolean, openedPath: string }>}
 */
export async function openFileInDefaultApp(filePath, relativePath) {
  let target = filePath;
  if (!target && relativePath) {
    target = path.resolve(config.paths.appRoot, relativePath);
  }
  if (!target) {
    throw new Error('filePath or relativePath is required');
  }

  // 特殊配置文件处理（mcp_servers.json）
  if (target.includes('mcp_servers.json')) {
    const userConfig = config.paths.mcpUserConfig;
    if (!fsSync.existsSync(userConfig)) {
      try {
        fsSync.mkdirSync(path.dirname(userConfig), { recursive: true });
        if (fsSync.existsSync(config.paths.defaultMcpConfig)) {
          fsSync.copyFileSync(config.paths.defaultMcpConfig, userConfig);
        } else {
          fsSync.writeFileSync(userConfig, JSON.stringify({ mcpServers: {} }, null, 2), 'utf-8');
        }
      } catch (_) {}
    }
    target = fsSync.existsSync(userConfig) ? userConfig : config.paths.defaultMcpConfig;
  }

  // 验证文件存在性，支持相对于 appRoot 或 dataDir 查找
  if (!fsSync.existsSync(target)) {
    const candidateApp = path.resolve(config.paths.appRoot, target);
    const candidateData = path.resolve(config.paths.dataDir, target);
    if (fsSync.existsSync(candidateApp)) {
      target = candidateApp;
    } else if (fsSync.existsSync(candidateData)) {
      target = candidateData;
    } else {
      throw new Error(`指定的文件在本地不存在: ${target}`);
    }
  }

  const resolved = path.resolve(target);
  const platform = process.platform;
  if (process.env.NODE_ENV !== 'test') {
    if (platform === 'win32') {
      const safeTarget = resolved.replace(/'/g, "''");
      execFile('powershell.exe', ['-NoProfile', '-Command', `Start-Process -LiteralPath '${safeTarget}'`], { windowsHide: true }, () => {});
    } else if (platform === 'darwin') {
      execFile('open', [resolved], () => {});
    } else {
      execFile('xdg-open', [resolved], () => {});
    }
  }

  return { success: true, openedPath: resolved };
}

/**
 * 唤起本地操作系统原生的文件夹选择器 (Vista+ IFileOpenDialog / WinForms / macOS / Linux)
 * @param {object} options
 * @param {string} options.title 弹窗标题
 * @param {string} options.initialPath 初始定位目录
 * @returns {Promise<{ cancelled: boolean, folderPath?: string, error?: string }>}
 *   - cancelled=true → 用户主动取消（正常态，前端无需提示）
 *   - folderPath     → 选择成功
 *   - error          → 真实故障（进程/脚本异常），应 500 返回并 toast 给用户
 */
export function openFolderBrowserDialog({ title = '请选择文件夹', initialPath = '' } = {}) {
  return new Promise((resolve) => {
    const platform = process.platform;
    if (platform === 'win32') {
      const exePicker = getPickerExecutablePath();
      const safeTitle = (title || '请选择文件夹').trim();
      const safePath = (initialPath || '').trim();

      // 方案 A: 原生现代对话框 (IFileOpenDialog RCW, winexe 无控制台黑框, 极速响应并锁定置顶)
      if (exePicker) {
        if (activePickerChild && !activePickerChild.killed) {
          try {
            activePickerChild.kill();
          } catch (_) {}
        }

        activePickerChild = execFile(
          exePicker,
          [safeTitle, safePath],
          { windowsHide: false, encoding: 'utf8', timeout: 120000 },
          (err, stdout) => {
            activePickerChild = null;
            if (err) {
              // 退出码 2 = 用户在弹窗里点了取消/关闭 (folderPicker.cs: ERROR_CANCELLED)
              if (err.code === 2) {
                return resolve({ cancelled: true });
              }
              // 其余（文件缺失、exe 内部异常 code=1 等）→ 降级 PowerShell，
              // 降级本身若也失败，runPs1Picker 会以 error 上抛而不是伪装成"取消"
              console.warn('[openFolderBrowserDialog] exePicker failed, falling back to PowerShell:', err.message);
              return runPs1Picker(safeTitle, safePath, resolve);
            }
            const folderPath = (stdout || '').trim();
            if (!folderPath) return resolve({ cancelled: true });
            resolve({ cancelled: false, folderPath });
          }
        );
        return;
      }

      // 方案 B: 降级走 PowerShell 脚本
      runPs1Picker(safeTitle, safePath, resolve);
    } else if (platform === 'darwin') {
      const prompt = (title || 'Choose Folder').replace(/"/g, '\\"');
      execFile('osascript', ['-e', `POSIX path of (choose folder with prompt "${prompt}")`], { timeout: 120000 }, (err, stdout) => {
        if (err) return resolve({ cancelled: true });
        const folderPath = (stdout || '').trim();
        if (!folderPath) return resolve({ cancelled: true });
        resolve({ cancelled: false, folderPath });
      });
    } else {
      execFile('zenity', ['--file-selection', '--directory', `--title=${title || 'Choose Folder'}`], { timeout: 120000 }, (err, stdout) => {
        if (err) return resolve({ cancelled: true });
        const folderPath = (stdout || '').trim();
        if (!folderPath) return resolve({ cancelled: true });
        resolve({ cancelled: false, folderPath });
      });
    }
  });
}
