import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * 桌面应用化改造：一次性数据目录迁移
 *
 * 旧：<appRoot>\data\        （代码仓库内，随安装包分发，不可写）
 * 新：%LOCALAPPDATA%\MeocoxFlow\          （用户配置 + 本机数据）
 *     %USERPROFILE%\Videos\Meocox Flow\  （项目工作区）
 *
 * 设计约束（按优先级）：
 *   1. 数据不丢失 —— 永不 delete，旧目录只改名保留为 data.legacy-backup-<ts>
 *   2. 幂等 —— 靠 marker 文件，重复启动直接跳过
 *   3. 不阻塞启动 —— 任何单项失败只记录并继续，绝不让服务起不来
 *   4. 跨卷安全 —— 仓库(D:) 与 LOCALAPPDATA(C:) 必然跨卷，必须处理 EXDEV
 */

/** 迁移清单：legacy 相对路径 → 目标解析函数 */
function buildMigrationPlan() {
  const p = config.paths;
  return [
    { key: 'providers.json', from: () => path.join(config.legacy.dataDir, 'providers.json'), to: () => p.providersFile },
    { key: 'settings.json', from: () => path.join(config.legacy.dataDir, 'settings.json'), to: () => p.settingsFile },
    { key: 'curated_mixkit.json', from: () => path.join(config.legacy.dataDir, 'curated_mixkit.json'), to: () => p.curatedMixkitFile },
    { key: 'models', from: () => path.join(config.legacy.dataDir, 'models'), to: () => p.modelsDir },
    { key: 'storage', from: () => path.join(config.legacy.dataDir, 'storage'), to: () => p.storageDir },
    { key: 'cache', from: () => path.join(config.legacy.dataDir, 'cache'), to: () => p.cacheDir },
    { key: 'output', from: () => path.join(config.legacy.dataDir, 'output'), to: () => p.outputDir },
    { key: 'output_legacy_sibling', from: () => path.join(config.legacy.dataDir, '..', 'output'), to: () => p.outputDir, repoRootOutput: true },
  ];
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function dirSizeMb(dir) {
  let total = 0;
  const walk = async (d) => {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        try {
          total += (await fs.stat(full)).size;
        } catch {}
      }
    }
  };
  await walk(dir);
  return Math.round((total / 1024 / 1024) * 10) / 10;
}

/**
 * 移动单个条目。优先 rename（同卷瞬时），跨卷降级 copy。
 * 目标已存在时不覆盖（视为已迁移，保留目标）。
 */
async function moveEntry(src, dest, { label = '', quiet = false } = {}) {
  if (!(await pathExists(src))) {
    return { status: 'absent' };
  }
  if (await pathExists(dest)) {
    return { status: 'skipped_exists' };
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });

  try {
    await fs.rename(src, dest);
    if (!quiet) console.log(`   ↷ ${label || path.basename(src)} → 已移动（重命名）`);
    return { status: 'moved' };
  } catch (err) {
    // EXDEV = 跨设备链接，Windows 下 D: → C: 必然命中
    if (err.code !== 'EXDEV' && err.code !== 'EPERM' && err.code !== 'EBUSY') {
      return { status: 'error', error: `${err.code || ''} ${err.message}`.trim() };
    }
  }

  // 跨卷：复制后删除源
  try {
    if (!quiet) console.log(`   ↷ ${label || path.basename(src)} → 跨卷复制中（${await dirSizeMb(src)} MB，请稍候）...`);
    await fs.cp(src, dest, { recursive: true, force: false, errorOnExist: false });

    // 校验：文件数一致才算成功
    const [srcCount, destCount] = await Promise.all([countFiles(src), countFiles(dest)]);
    if (destCount < srcCount) {
      return { status: 'error', error: `复制不完整 (源 ${srcCount} / 目标 ${destCount})，已保留源目录` };
    }

    await fs.rm(src, { recursive: true, force: true });
    if (!quiet) console.log(`   ↷ ${label || path.basename(src)} → 已复制并清理源目录`);
    return { status: 'copied' };
  } catch (err) {
    const msg = String(err.message || err);
    const isSpace = /ENOSPC|空间不足|not enough space/i.test(msg);
    return {
      status: 'error',
      error: isSpace ? `磁盘空间不足，源目录已保留未动：${msg}` : msg,
      needsManualAction: isSpace
    };
  }
}

async function countFiles(dir) {
  let n = 0;
  const walk = async (d) => {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(d, e.name));
      else n++;
    }
  };
  await walk(dir);
  return n;
}

/**
 * 迁移项目工作区：<legacy>/projects/<id> → <projectsRoot>/<id>
 * 同时重写每个 project.json 内持久化的 projectDir 字段。
 */
async function migrateProjects(results) {
  const legacyProjects = config.legacy.projectsDir;
  if (!(await pathExists(legacyProjects))) {
    results.push({ key: 'projects', status: 'absent' });
    return;
  }

  let entries = [];
  try {
    entries = await fs.readdir(legacyProjects, { withFileTypes: true });
  } catch (err) {
    results.push({ key: 'projects', status: 'error', error: err.message });
    return;
  }

  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  if (dirs.length === 0) {
    results.push({ key: 'projects', status: 'absent' });
    return;
  }

  await fs.mkdir(config.paths.projectsRoot, { recursive: true });

  let moved = 0;
  let skipped = 0;
  const errors = [];

  for (const d of dirs) {
    const src = path.join(legacyProjects, d.name);
    const dest = path.join(config.paths.projectsRoot, d.name);
    const r = await moveEntry(src, dest, { label: `project ${d.name}` });
    if (r.status === 'moved' || r.status === 'copied') {
      moved++;
      // 重写 project.json 里持久化的 projectDir
      try {
        const pjPath = path.join(dest, 'project.json');
        if (fsSync.existsSync(pjPath)) {
          const pj = JSON.parse(await fs.readFile(pjPath, 'utf-8'));
          pj.projectDir = dest;
          await fs.writeFile(pjPath, JSON.stringify(pj, null, 2), 'utf-8');
        }
      } catch (err) {
        errors.push(`${d.name}: 重写 projectDir 失败 - ${err.message}`);
      }
    } else if (r.status === 'skipped_exists') {
      skipped++;
    } else if (r.status === 'error') {
      errors.push(`${d.name}: ${r.error}`);
    }
  }

  results.push({
    key: 'projects',
    status: errors.length ? 'partial' : 'ok',
    moved,
    skipped,
    errors
  });
}

/**
 * 入口。由 storage.init() 在最前面调用。
 */
export async function migrateLegacyDataDir() {
  const markerPath = path.join(config.paths.dataDir, config.legacy.marker);

  if (fsSync.existsSync(markerPath)) {
    return { skipped: true, reason: 'already_migrated' };
  }

  const legacyDataDir = config.legacy.dataDir;
  const legacyExists = fsSync.existsSync(legacyDataDir);

  // 开发态：未显式指定 MEOCOX_DATA_DIR 时，dataDir 仍指向仓库内 data/
  // 此时无需迁移，避免把目录搬到自己脚下。
  const dataDirIsInsideRepo =
    path.resolve(config.paths.dataDir).toLowerCase() === path.resolve(legacyDataDir).toLowerCase();

  if (!legacyExists || dataDirIsInsideRepo) {
    return { skipped: true, reason: dataDirIsInsideRepo ? 'dev_mode_same_dir' : 'no_legacy_dir' };
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📦 检测到旧版数据目录，正在迁移到标准应用数据目录...        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`   源: ${legacyDataDir}`);
  console.log(`   目标数据: ${config.paths.dataDir}`);
  console.log(`   目标项目: ${config.paths.projectsRoot}`);

  await fs.mkdir(config.paths.dataDir, { recursive: true });

  const results = [];

  for (const item of buildMigrationPlan()) {
    const r = await moveEntry(item.from(), item.to(), { label: item.key });
    results.push({ key: item.key, ...r });
  }

  await migrateProjects(results);

  // 写幂等标记
  let marker = { migratedAt: new Date().toISOString(), from: legacyDataDir, to: config.paths.dataDir, projectsRoot: config.paths.projectsRoot, results };
  try {
    await fs.writeFile(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
  } catch (err) {
    console.warn('⚠️  迁移标记写入失败，下次启动会重跑迁移:', err.message);
  }

  // 旧目录改名保留（绝不删除）
  let backupPath = null;
  try {
    const remaining = (await fs.readdir(legacyDataDir)).filter((n) => n !== '.gitkeep' && n !== '.gitignore');
    if (remaining.length === 0) {
      await fs.rm(legacyDataDir, { recursive: true, force: true });
      console.log('   ✓ 旧目录已空，安全移除');
    } else {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = legacyDataDir + '.legacy-backup-' + ts;
      await fs.rename(legacyDataDir, backupPath);
      console.log(`   ✓ 旧目录已改名保留: ${backupPath}`);
    }
  } catch (err) {
    console.warn('⚠️  旧目录改名失败（不影响迁移结果，可手动清理）:', err.message);
  }

  // 汇总
  const failed = results.filter((r) => r.status === 'error' || r.status === 'partial');
  const summary = {
    skipped: false,
    ok: failed.length === 0,
    dataDir: config.paths.dataDir,
    projectsRoot: config.paths.projectsRoot,
    backupPath,
    results
  };

  console.log('\n────────── 迁移结果 ──────────');
  for (const r of results) {
    const mark =
      r.status === 'error' ? '✗' :
      r.status === 'partial' ? '!' :
      r.status === 'absent' ? '·' :
      r.status === 'skipped_exists' ? '=' : '✓';
    const extra = r.error ? ` — ${r.error}` : r.moved !== undefined ? ` (迁移 ${r.moved} / 跳过 ${r.skipped})` : '';
    console.log(`   ${mark} ${r.key}: ${r.status}${extra}`);
  }
  if (backupPath) {
    console.log(`\n   旧数据备份: ${backupPath}`);
    console.log('   确认新位置数据无误后，可手动删除该目录。');
  }
  console.log('');

  return summary;
}
