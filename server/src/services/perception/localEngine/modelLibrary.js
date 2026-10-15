import fs from 'node:fs';
import path from 'node:path';
import {
  MODEL_PRESETS,
  getModelsBaseDir,
  inspectModelPreset,
  formatBytes,
  deletePresetFiles
} from './paths.js';

export function getLibraryFilePath() {
  return path.join(getModelsBaseDir(), 'library.json');
}

/**
 * Read the current library state (enabledMap, customModels)
 */
export function readLibraryState() {
  const libFile = getLibraryFilePath();
  const defaultState = {
    enabledMap: {
      'qwen3-vl-2b': true,
      'qwen3-vl-4b': true,
      'qwen3-vl-8b': true
    },
    customModels: []
  };

  if (!fs.existsSync(libFile)) {
    try {
      fs.writeFileSync(libFile, JSON.stringify(defaultState, null, 2), 'utf8');
    } catch {}
    return defaultState;
  }

  try {
    const raw = fs.readFileSync(libFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      enabledMap: { ...defaultState.enabledMap, ...(parsed.enabledMap || {}) },
      customModels: Array.isArray(parsed.customModels) ? parsed.customModels : []
    };
  } catch (err) {
    console.error('[modelLibrary] Failed to read library.json, fallback to defaults:', err.message);
    return defaultState;
  }
}

/**
 * Write updated state to library.json
 */
export function writeLibraryState(state) {
  const libFile = getLibraryFilePath();
  try {
    fs.writeFileSync(libFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[modelLibrary] Failed to write library.json:', err.message);
  }
}

/**
 * Get comprehensive list of all models in the library:
 * - Curated presets (with installation & enabled status)
 * - Custom uploaded / imported models (with installation & enabled status)
 */
export function getModelLibrary() {
  const state = readLibraryState();
  const library = [];

  // 1. Process curated presets
  for (const preset of MODEL_PRESETS) {
    const inspected = inspectModelPreset(preset.id);
    const isInstalled = Boolean(inspected?.isReady);
    const isEnabled = state.enabledMap[preset.id] !== false;

    library.push({
      id: preset.id,
      name: preset.name,
      type: 'preset',
      isCustom: false,
      isMultimodal: true,
      isInstalled,
      enabled: isEnabled,
      modelPath: inspected?.modelPath || null,
      mmprojPath: inspected?.mmprojPath || null,
      totalSizeBytes: (inspected?.modelSize || 0) + (inspected?.mmprojSize || 0),
      sizeFormatted: inspected?.totalSizeFormatted || preset.totalSizeFormatted,
      vramRequired: preset.vramRequired,
      recommended: Boolean(preset.recommended),
      description: preset.description,
      dir: inspected?.dir || null
    });
  }

  // 2. Process custom models
  const validCustomModels = [];
  let stateModified = false;

  for (const custom of state.customModels) {
    const modelExists = Boolean(custom.modelPath && fs.existsSync(custom.modelPath));
    if (!modelExists) {
      // Model file missing, skip but keep or clean
      continue;
    }
    validCustomModels.push(custom);

    let modelSize = 0;
    try { modelSize = fs.statSync(custom.modelPath).size; } catch {}

    const mmprojExists = Boolean(custom.mmprojPath && fs.existsSync(custom.mmprojPath));
    let mmprojSize = 0;
    if (mmprojExists) {
      try { mmprojSize = fs.statSync(custom.mmprojPath).size; } catch {}
    }

    const isInstalled = modelSize > 1000000;
    const isEnabled = state.enabledMap[custom.id] !== false;
    const totalBytes = modelSize + mmprojSize;

    library.push({
      id: custom.id,
      name: custom.name,
      type: 'custom',
      isCustom: true,
      isMultimodal: mmprojExists,
      isInstalled,
      enabled: isEnabled,
      modelPath: custom.modelPath,
      mmprojPath: mmprojExists ? custom.mmprojPath : null,
      totalSizeBytes: totalBytes,
      sizeFormatted: formatBytes(totalBytes || modelSize),
      vramRequired: custom.vramRequired || '自适应',
      recommended: false,
      description: custom.description || '用户上传/导入的本地模型',
      dir: path.dirname(custom.modelPath),
      createdAt: custom.createdAt
    });
  }

  return library;
}

/**
 * Get ONLY models that are currently installed on disk AND enabled by user!
 * This is what powers the model selection dropdowns in the chat and agent interfaces.
 * Disabled models will NEVER appear here.
 */
export function getEnabledInstalledModels() {
  const library = getModelLibrary();
  return library.filter(m => m.isInstalled && m.enabled);
}

/**
 * Toggle model enabled/disabled state
 */
export function toggleModelEnabled(modelId, enabled) {
  const state = readLibraryState();
  const cleanId = String(modelId).replace(/^installed:/i, '').trim();

  state.enabledMap[cleanId] = Boolean(enabled);
  writeLibraryState(state);

  return {
    modelId: cleanId,
    enabled: Boolean(enabled),
    library: getModelLibrary()
  };
}

/**
 * Register a custom model into the library
 */
export function addCustomModelToLibrary({ id, name, modelPath, mmprojPath = null, description = '', vramRequired = '自适应' }) {
  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new Error(`模型文件不存在: ${modelPath}`);
  }

  const cleanId = id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const state = readLibraryState();

  const existingIdx = state.customModels.findIndex(m => m.id === cleanId || m.modelPath === modelPath);
  const newEntry = {
    id: cleanId,
    name: name || path.basename(modelPath, path.extname(modelPath)),
    modelPath,
    mmprojPath: (mmprojPath && fs.existsSync(mmprojPath)) ? mmprojPath : null,
    description: description || '用户导入的本地模型',
    vramRequired: vramRequired || '自适应',
    createdAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    state.customModels[existingIdx] = { ...state.customModels[existingIdx], ...newEntry };
  } else {
    state.customModels.push(newEntry);
  }

  // Always enable newly added models by default
  state.enabledMap[cleanId] = true;
  writeLibraryState(state);

  return {
    model: newEntry,
    library: getModelLibrary()
  };
}

/**
 * Import a model from a local file path
 */
export function importLocalModel({ name, filePath, mmprojPath = null, description = '', copyFile = false }) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`指定的文件路径不存在: ${filePath}`);
  }

  let finalModelPath = filePath;
  let finalMmprojPath = mmprojPath;

  if (copyFile) {
    const customId = `custom_${Date.now()}`;
    const targetDir = path.join(getModelsBaseDir(), 'custom', customId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const modelDest = path.join(targetDir, path.basename(filePath));
    fs.copyFileSync(filePath, modelDest);
    finalModelPath = modelDest;

    if (mmprojPath && fs.existsSync(mmprojPath)) {
      const mmprojDest = path.join(targetDir, path.basename(mmprojPath));
      fs.copyFileSync(mmprojPath, mmprojDest);
      finalMmprojPath = mmprojDest;
    }
  }

  return addCustomModelToLibrary({
    name,
    modelPath: finalModelPath,
    mmprojPath: finalMmprojPath,
    description: description || (copyFile ? '从本地复制导入' : '从本地路径直接挂载'),
    vramRequired: '自适应'
  });
}

/**
 * Delete / Uninstall a model from the library to reclaim disk space
 */
export function deleteModelFromLibrary(modelId) {
  const cleanId = String(modelId).replace(/^installed:/i, '').trim();
  const state = readLibraryState();

  // 1. If it's a curated preset: delete the weight files from disk
  const isPreset = MODEL_PRESETS.some(p => p.id === cleanId);
  if (isPreset) {
    deletePresetFiles(cleanId);
    return { success: true, modelId: cleanId, library: getModelLibrary() };
  }

  // 2. If it's a custom model:
  const target = state.customModels.find(m => m.id === cleanId);
  if (target) {
    const baseDir = getModelsBaseDir();
    // Only delete file if located inside app data/models directory
    try {
      const rel = path.relative(baseDir, target.modelPath);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        if (fs.existsSync(target.modelPath)) {
          fs.unlinkSync(target.modelPath);
        }
        if (target.mmprojPath && fs.existsSync(target.mmprojPath)) {
          fs.unlinkSync(target.mmprojPath);
        }
        const parentDir = path.dirname(target.modelPath);
        if (parentDir.startsWith(path.join(baseDir, 'custom'))) {
          try {
            const files = fs.readdirSync(parentDir);
            if (files.length === 0) fs.rmdirSync(parentDir);
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[deleteModelFromLibrary] file cleanup notice:', err.message);
    }

    state.customModels = state.customModels.filter(m => m.id !== cleanId);
    delete state.enabledMap[cleanId];
    writeLibraryState(state);
  }

  return { success: true, modelId: cleanId, library: getModelLibrary() };
}

/**
 * Scan data/models/ for newly dropped .gguf files and register into library
 */
export function scanModelsDirectoryIntoLibrary() {
  const baseDir = getModelsBaseDir();
  const knownPresets = MODEL_PRESETS.map(p => p.modelFile.toLowerCase());
  const state = readLibraryState();
  const knownPaths = new Set(state.customModels.map(m => path.resolve(m.modelPath).toLowerCase()));

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

      addCustomModelToLibrary({
        id,
        name: cleanName,
        modelPath: file.fullPath,
        mmprojPath: mmprojCandidate,
        description: '本地目录扫描自动导入',
        vramRequired: '自适应'
      });
      knownPaths.add(resolved);
      addedCount++;
    }
  }

  scanDir(baseDir, 0);
  return { addedCount, library: getModelLibrary() };
}

/**
 * Get single model details by ID (either preset or custom)
 */
export function getLibraryModelById(modelId) {
  if (!modelId) return null;
  const cleanId = String(modelId).replace(/^installed:/i, '').trim();
  const library = getModelLibrary();
  return library.find(m => m.id === cleanId || m.name === cleanId) || null;
}
