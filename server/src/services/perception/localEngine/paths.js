import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../../config.js';

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Standard Model Presets for Qwen3-VL
 */
export const MODEL_PRESETS = [
  {
    id: 'qwen3-vl-2b',
    name: 'Qwen3-VL-2B (超轻量极速版)',
    hfRepo: 'Qwen/Qwen3-VL-2B-Instruct-GGUF',
    modelFile: 'Qwen3VL-2B-Instruct-Q4_K_M.gguf',
    mmprojFile: 'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf',
    modelSizeBytes: 1107409952,
    mmprojSizeBytes: 445053216,
    totalSizeBytes: 1552463168,
    totalSizeFormatted: '1.45 GB',
    vramRequired: '~2.5 GB',
    recommended: false,
    description: '极低显存与低算力开销，毫秒级响应，适合低显存或日常快速初筛'
  },
  {
    id: 'qwen3-vl-4b',
    name: 'Qwen3-VL-4B (高性价比均衡版)',
    hfRepo: 'Qwen/Qwen3-VL-4B-Instruct-GGUF',
    modelFile: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf',
    mmprojFile: 'mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf',
    modelSizeBytes: 2497281664,
    mmprojSizeBytes: 453974304,
    totalSizeBytes: 2951255968,
    totalSizeFormatted: '2.75 GB',
    vramRequired: '~3.8 GB',
    recommended: true,
    description: '综合性能与识别精度极佳，下载迅速，显存占用不到 4GB，强烈推荐'
  },
  {
    id: 'qwen3-vl-8b',
    name: 'Qwen3-VL-8B (高精旗舰画质版)',
    hfRepo: 'Qwen/Qwen3-VL-8B-Instruct-GGUF',
    modelFile: 'Qwen3VL-8B-Instruct-Q4_K_M.gguf',
    mmprojFile: 'mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf',
    modelSizeBytes: 5027784800,
    mmprojSizeBytes: 752289728,
    totalSizeBytes: 5780074528,
    totalSizeFormatted: '5.38 GB',
    vramRequired: '~6.5 GB',
    recommended: false,
    description: '8B 完整视觉感知厚度，顶尖中文OCR与运镜拆解，完美匹配 RTX 4060 8GB'
  }
];

/**
 * Locate the llama-server.exe binary on the host machine
 */
export function findLlamaServerBinary() {
  // 1. Tauri 资源目录（打包态；MEOCOX_APP_ROOT 已指向 resources/）
  const resourceBinPath = path.join(config.paths.appRoot, 'bin', 'llama', 'llama-server.exe');
  if (fs.existsSync(resourceBinPath)) {
    return resourceBinPath;
  }

  // 2. Check project bundled directory (dev)
  const bundledPath = path.resolve(config.paths.appRoot, 'bin', 'llama', 'llama-server.exe');
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  // 3. Check server/bin directory (dev)
  const serverBinPath = path.resolve(config.paths.appRoot, 'server', 'bin', 'llama', 'llama-server.exe');
  if (fs.existsSync(serverBinPath)) {
    return serverBinPath;
  }

  // 3. Check Windows WinGet standard packages directory
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const wingetPkgDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPkgDir)) {
      try {
        const entries = fs.readdirSync(wingetPkgDir);
        for (const entry of entries) {
          if (entry.includes('llamacpp')) {
            const candidate = path.join(wingetPkgDir, entry, 'llama-server.exe');
            if (fs.existsSync(candidate)) {
              return candidate;
            }
          }
        }
      } catch {}
    }
  }

  // 4. Default fallback binary name (assumes available in system PATH)
  return 'llama-server.exe';
}

/**
 * Get base directory where local models are stored
 */
export function getModelsBaseDir() {
  const baseDir = config.paths.modelsDir;
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

/**
 * Get path to model directory for a preset
 */
export function getModelPresetDir(presetId) {
  const baseDir = getModelsBaseDir();
  const dir = path.join(baseDir, presetId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get specific files and check readiness for a preset
 */
export function inspectModelPreset(presetId) {
  const preset = MODEL_PRESETS.find(p => p.id === presetId);
  if (!preset) return null;

  const dir = getModelPresetDir(presetId);
  const modelPath = path.join(dir, preset.modelFile);
  const mmprojPath = path.join(dir, preset.mmprojFile);

  const modelExists = fs.existsSync(modelPath);
  const mmprojExists = fs.existsSync(mmprojPath);

  let modelSize = 0;
  let mmprojSize = 0;

  if (modelExists) {
    try { modelSize = fs.statSync(modelPath).size; } catch {}
  }
  if (mmprojExists) {
    try { mmprojSize = fs.statSync(mmprojPath).size; } catch {}
  }

  const isReady = modelExists && mmprojExists && modelSize > 1000000 && mmprojSize > 1000000;

  return {
    ...preset,
    dir,
    modelPath,
    mmprojPath,
    modelExists,
    mmprojExists,
    modelSize,
    mmprojSize,
    isReady
  };
}

/**
 * Scan all presets and return full inventory
 */
export function listAllModelPresets() {
  return MODEL_PRESETS.map(p => inspectModelPreset(p.id));
}

/**
 * Custom models registry file path
 */
export function getCustomModelsRegistryPath() {
  const baseDir = getModelsBaseDir();
  return path.join(baseDir, 'custom_models.json');
}

/**
 * Get list of all registered custom models with current file validation
 */
export function getCustomModels() {
  const regPath = getCustomModelsRegistryPath();
  if (!fs.existsSync(regPath)) return [];
  try {
    const raw = fs.readFileSync(regPath, 'utf8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    return list.map(item => {
      const modelExists = Boolean(item.modelPath && fs.existsSync(item.modelPath));
      let modelSize = 0;
      if (modelExists) {
        try { modelSize = fs.statSync(item.modelPath).size; } catch {}
      }
      const mmprojExists = Boolean(item.mmprojPath && fs.existsSync(item.mmprojPath));
      let mmprojSize = 0;
      if (mmprojExists) {
        try { mmprojSize = fs.statSync(item.mmprojPath).size; } catch {}
      }
      const isReady = modelExists && modelSize > 1000000;
      const totalSize = modelSize + mmprojSize;

      return {
        ...item,
        modelExists,
        mmprojExists,
        modelSize,
        mmprojSize,
        totalSize,
        sizeFormatted: formatBytes(totalSize || modelSize),
        isReady,
        isCustom: true,
        isMultimodal: mmprojExists
      };
    }).filter(m => m.modelExists);
  } catch (err) {
    console.error('[localEngine] Failed to read custom models registry:', err.message);
    return [];
  }
}

/**
 * Save custom models list to registry file
 */
export function saveCustomModels(models) {
  const regPath = getCustomModelsRegistryPath();
  const cleaned = models.map(m => ({
    id: m.id,
    name: m.name,
    modelPath: m.modelPath,
    mmprojPath: m.mmprojPath || null,
    vramRequired: m.vramRequired || '自适应',
    description: m.description || '',
    createdAt: m.createdAt || new Date().toISOString()
  }));
  fs.writeFileSync(regPath, JSON.stringify(cleaned, null, 2), 'utf8');
}

/**
 * Register a new custom model
 */
export function addCustomModel({ id, name, modelPath, mmprojPath = null, description = '', vramRequired = '自适应' }) {
  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new Error(`模型文件不存在: ${modelPath}`);
  }
  const cleanId = id || `custom_${Date.now()}`;
  const models = getCustomModels();
  const existingIdx = models.findIndex(m => m.id === cleanId || m.modelPath === modelPath);

  const newEntry = {
    id: cleanId,
    name: name || path.basename(modelPath, path.extname(modelPath)),
    modelPath,
    mmprojPath: (mmprojPath && fs.existsSync(mmprojPath)) ? mmprojPath : null,
    description: description || '用户导入的本地 GGUF 模型',
    vramRequired: vramRequired || '自适应',
    createdAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    models[existingIdx] = { ...models[existingIdx], ...newEntry };
  } else {
    models.push(newEntry);
  }

  saveCustomModels(models);
  return newEntry;
}

/**
 * Remove a custom model from registry and optionally delete files
 */
export function removeCustomModel(modelId, deleteFiles = false) {
  const models = getCustomModels();
  const target = models.find(m => m.id === modelId);
  if (!target) return false;

  const baseDir = getModelsBaseDir();
  if (deleteFiles && target.modelPath) {
    try {
      const rel = path.relative(baseDir, target.modelPath);
      // Only delete files if they are within data/models/ to avoid deleting user files elsewhere
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        if (fs.existsSync(target.modelPath)) {
          fs.unlinkSync(target.modelPath);
        }
        if (target.mmprojPath && fs.existsSync(target.mmprojPath)) {
          fs.unlinkSync(target.mmprojPath);
        }
        const parentDir = path.dirname(target.modelPath);
        if (parentDir !== baseDir && parentDir.startsWith(path.join(baseDir, 'custom'))) {
          try {
            const files = fs.readdirSync(parentDir);
            if (files.length === 0) fs.rmdirSync(parentDir);
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[removeCustomModel] failed to delete files:', err.message);
    }
  }

  const updated = models.filter(m => m.id !== modelId);
  saveCustomModels(updated);
  return true;
}

/**
 * Delete downloaded preset files to reclaim disk space
 */
export function deletePresetFiles(presetId) {
  const preset = inspectModelPreset(presetId);
  if (!preset) return false;
  let deleted = false;
  if (preset.modelExists) {
    try { fs.unlinkSync(preset.modelPath); deleted = true; } catch {}
  }
  if (preset.mmprojExists) {
    try { fs.unlinkSync(preset.mmprojPath); deleted = true; } catch {}
  }
  return deleted;
}

/**
 * Scan data/models directory for newly dropped .gguf files
 */
export function scanModelsDirectory() {
  const baseDir = getModelsBaseDir();
  const knownPresets = MODEL_PRESETS.map(p => p.modelFile.toLowerCase());
  const customModels = getCustomModels();
  const knownPaths = new Set(customModels.map(m => path.resolve(m.modelPath).toLowerCase()));

  let addedCount = 0;

  function scanDir(dir, depth = 0) {
    if (depth > 2 || !fs.existsSync(dir)) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const ggufFiles = [];
    let mmprojCandidate = null;

    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanDir(fullPath, depth + 1);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.gguf')) {
        if (ent.name.toLowerCase().startsWith('mmproj')) {
          mmprojCandidate = fullPath;
        } else {
          ggufFiles.push({ name: ent.name, fullPath });
        }
      }
    }

    for (const file of ggufFiles) {
      if (knownPresets.includes(file.name.toLowerCase())) continue;
      const resolved = path.resolve(file.fullPath).toLowerCase();
      if (knownPaths.has(resolved)) continue;

      const baseName = path.basename(file.name, '.gguf');
      const cleanName = baseName.replace(/[-_.]Instruct/i, '').replace(/[-_.]Q4_K_M/i, '');
      const id = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      addCustomModel({
        id,
        name: cleanName,
        modelPath: file.fullPath,
        mmprojPath: mmprojCandidate,
        description: '本地扫描自动发现',
        vramRequired: '自适应'
      });
      knownPaths.add(resolved);
      addedCount++;
    }
  }

  scanDir(baseDir, 0);
  return addedCount;
}

/**
 * List all ready models installed in the app (Presets + Custom models)
 */
export function listAllInstalledModels() {
  const presets = listAllModelPresets();
  const customModels = getCustomModels();

  const installed = [];

  // 1. Ready presets
  for (const p of presets) {
    if (p.isReady) {
      installed.push({
        id: p.id,
        rawId: p.id,
        name: p.name,
        type: 'preset',
        isCustom: false,
        isMultimodal: true,
        isReady: true,
        modelPath: p.modelPath,
        mmprojPath: p.mmprojPath,
        totalSizeBytes: p.modelSize + p.mmprojSize,
        sizeFormatted: p.totalSizeFormatted,
        vramRequired: p.vramRequired,
        description: p.description,
        dir: p.dir
      });
    }
  }

  // 2. Ready custom models
  for (const m of customModels) {
    if (m.isReady) {
      installed.push({
        id: m.id,
        rawId: m.id,
        name: m.name,
        type: 'custom',
        isCustom: true,
        isMultimodal: Boolean(m.isMultimodal),
        isReady: true,
        modelPath: m.modelPath,
        mmprojPath: m.mmprojPath,
        totalSizeBytes: m.totalSize || m.modelSize,
        sizeFormatted: m.sizeFormatted,
        vramRequired: m.vramRequired || '自适应',
        description: m.description,
        dir: path.dirname(m.modelPath)
      });
    }
  }

  return installed;
}

/**
 * Get comprehensive details for a model (preset or custom)
 */
export function getModelDetails(modelId) {
  if (!modelId) return null;
  const cleanId = String(modelId).replace(/^installed:/i, '').trim();

  // 1. Check presets
  const preset = inspectModelPreset(cleanId);
  if (preset) {
    return {
      id: preset.id,
      name: preset.name,
      modelPath: preset.modelPath,
      mmprojPath: preset.mmprojPath,
      isReady: preset.isReady,
      isCustom: false,
      isMultimodal: true,
      sizeFormatted: preset.totalSizeFormatted,
      vramRequired: preset.vramRequired,
      description: preset.description,
      dir: preset.dir
    };
  }

  // 2. Check custom models
  const customModels = getCustomModels();
  const custom = customModels.find(m => m.id === cleanId || m.name === cleanId);
  if (custom) {
    return {
      id: custom.id,
      name: custom.name,
      modelPath: custom.modelPath,
      mmprojPath: custom.mmprojPath,
      isReady: custom.isReady,
      isCustom: true,
      isMultimodal: custom.isMultimodal,
      sizeFormatted: custom.sizeFormatted,
      vramRequired: custom.vramRequired,
      description: custom.description,
      dir: path.dirname(custom.modelPath)
    };
  }

  return null;
}
