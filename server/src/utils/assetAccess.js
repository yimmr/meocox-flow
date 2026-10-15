import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { storage } from '../storage/index.js';

const ROOTS_CACHE_MS = 1500;
let cachedRoots = [];
let rootsExpireAt = 0;
let rootsPromise = null;

function realPathOrResolved(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function getAuthorizedRoots() {
  if (Date.now() < rootsExpireAt) return cachedRoots;
  if (rootsPromise) return rootsPromise;

  rootsPromise = (async () => {
    const roots = [config.paths.assetsDir, config.paths.outputDir, config.paths.projectsRoot];
    const globalLibraries = await storage.getGlobalLibraries().catch(() => []);
    roots.push(...globalLibraries.map((library) => library.path).filter(Boolean));

    const projects = await storage.listProjects().catch(() => []);
    for (const project of projects) {
      const projectId = project.id;
      if (project.projectDir) roots.push(project.projectDir);
      const assetDirs = await storage.getProjectAssetDirs(projectId).catch(() => []);
      roots.push(...assetDirs);
      roots.push(...(project.libraries || []).map((library) => library.path).filter(Boolean));
    }

    cachedRoots = [...new Set(roots.filter(Boolean).map(realPathOrResolved))];
    rootsExpireAt = Date.now() + ROOTS_CACHE_MS;
    return cachedRoots;
  })().finally(() => { rootsPromise = null; });

  return rootsPromise;
}

/** Only serve files below app-managed output or directories explicitly mounted by the user. */
export async function isAuthorizedAssetPath(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) return false;
  const target = realPathOrResolved(inputPath);
  const roots = await getAuthorizedRoots();
  return roots.some((root) => isWithin(root, target));
}
