import path from 'node:path';

/** Validate an externally supplied identifier before using it as a path segment. */
export function assertSafePathSegment(value, label = 'identifier') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens`);
  }
  return value;
}

/**
 * Gate 1 路径围栏：校验本地文件路径参数，拦截空字节注入、相对路径逃逸(..)及未授权根目录越界
 */
export function assertSafeLocalFilePath(filePath, { allowedRoots = [], label = 'filePath' } = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (filePath.includes('\0')) {
    throw new Error(`${label} contains illegal null byte`);
  }

  const rawTrimmed = filePath.trim();
  // 拦截显式路径遍历片段 (../ 或 ..\ )
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(rawTrimmed)) {
    throw new Error(`${label} contains forbidden path traversal ("..")`);
  }

  const resolved = path.resolve(rawTrimmed);

  if (Array.isArray(allowedRoots) && allowedRoots.length > 0) {
    const isInsideAnyRoot = allowedRoots.some((root) => {
      if (!root || typeof root !== 'string') return false;
      const rel = path.relative(path.resolve(root), resolved);
      return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
    });
    if (!isInsideAnyRoot) {
      throw new Error(`${label} ("${rawTrimmed}") is outside allowed workspace roots`);
    }
  }

  return resolved;
}

const PATH_PARAM_KEYS = new Set([
  'filePath',
  'path',
  'assetPath',
  'outputPath',
  'outputFilePath',
  'draftPath',
  'targetDir'
]);

/**
 * 扫描工具调用参数中的路径字段，执行 Gate 1 静态安全校验
 */
export function validateToolPathParams(params = {}, { allowedRoots = [] } = {}) {
  if (!params || typeof params !== 'object') {
    return { valid: true };
  }

  const checkObj = (obj, prefix = '') => {
    for (const [key, val] of Object.entries(obj)) {
      const fieldLabel = prefix ? `${prefix}.${key}` : key;
      if (PATH_PARAM_KEYS.has(key) && typeof val === 'string' && val.trim()) {
        try {
          assertSafeLocalFilePath(val, { allowedRoots, label: fieldLabel });
        } catch (err) {
          return { valid: false, key: fieldLabel, reason: err.message };
        }
      } else if (val && typeof val === 'object' && !Array.isArray(val) && !prefix) {
        // 向下检查一层嵌套（例如 contextRefs: { assetPath: '...' }）
        const nested = checkObj(val, key);
        if (!nested.valid) return nested;
      }
    }
    return { valid: true };
  };

  return checkObj(params);
}
