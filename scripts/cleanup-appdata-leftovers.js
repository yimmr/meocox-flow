import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function runCleanup() {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local');
  const appDataDir = path.join(localAppData, 'MeocoxFlow');

  console.log('🚀 开始执行 %LOCALAPPDATA%\\MeocoxFlow 遗留测试文件与垃圾清理...');
  console.log(`📁 目标目录: ${appDataDir}`);

  if (!fsSync.existsSync(appDataDir)) {
    console.log('未找到目录，退出。');
    return;
  }

  const stats = {
    archivedRealDrafts: [],
    cleanedTestDrafts: 0,
    cleanedTestSvgImages: 0,
    cleanedTestSkills: 0,
    cleanedTestWavs: 0,
    cleanedTestFingerprints: 0,
    errors: []
  };

  // 1. 处理 output/ 目录
  const outputDir = path.join(appDataDir, 'output');
  if (fsSync.existsSync(outputDir)) {
    const outputEntries = await fs.readdir(outputDir);
    const targetProjectLegacyOutputs = path.join(appDataDir, 'Projects', 'proj_muvftr7f_xnjr', 'outputs', 'legacy_drafts');

    for (const item of outputEntries) {
      const fullPath = path.join(outputDir, item);
      // 1.1 真实草稿：归档到《遗忘之海》项目 outputs/legacy_drafts
      if (item.startsWith('遗忘之海')) {
        try {
          const destPath = path.join(targetProjectLegacyOutputs, item);
          await copyDir(fullPath, destPath);
          await fs.rm(fullPath, { recursive: true, force: true });
          stats.archivedRealDrafts.push(item);
          console.log(`  📦 已归档真实草稿: ${item} -> ${destPath}`);
        } catch (err) {
          stats.errors.push({ item, error: err.message });
        }
        continue;
      }

      // 1.2 测试草稿目录
      if (item.startsWith('测试') || item.includes('草稿') || item.includes('test')) {
        try {
          await fs.rm(fullPath, { recursive: true, force: true });
          stats.cleanedTestDrafts++;
        } catch (err) {
          stats.errors.push({ item, error: err.message });
        }
        continue;
      }

      // 1.3 images 目录下的测试 svg
      if (item === 'images') {
        try {
          const imgEntries = await fs.readdir(fullPath);
          for (const img of imgEntries) {
            await fs.unlink(path.join(fullPath, img));
            stats.cleanedTestSvgImages++;
          }
          await fs.rm(fullPath, { recursive: true, force: true });
        } catch (err) {
          stats.errors.push({ item, error: err.message });
        }
        continue;
      }
    }
  }

  // 2. 处理 skills/genre/ 下的历史测试技能
  const genreDir = path.join(appDataDir, 'skills', 'genre');
  if (fsSync.existsSync(genreDir)) {
    const genreEntries = await fs.readdir(genreDir);
    for (const s of genreEntries) {
      if (s.startsWith('test-')) {
        try {
          await fs.rm(path.join(genreDir, s), { recursive: true, force: true });
          stats.cleanedTestSkills++;
        } catch (err) {
          stats.errors.push({ item: s, error: err.message });
        }
      }
    }
    // 检查 genre 是否已空
    const remainingGenre = await fs.readdir(genreDir).catch(() => []);
    if (remainingGenre.length === 0) {
      await fs.rm(genreDir, { recursive: true, force: true });
    }
  }

  // 3. 处理 cache/ 下的临时 wav 文件及测试指纹
  const cacheDir = path.join(appDataDir, 'cache');
  if (fsSync.existsSync(cacheDir)) {
    const cacheEntries = await fs.readdir(cacheDir);
    for (const c of cacheEntries) {
      if (c.endsWith('.wav') && c.startsWith('cosyvoice_')) {
        try {
          await fs.unlink(path.join(cacheDir, c));
          stats.cleanedTestWavs++;
        } catch (err) {
          stats.errors.push({ item: c, error: err.message });
        }
      }
    }

    // 检查 cache/assets/ 下的临时测试指纹
    const cacheAssetsDir = path.join(cacheDir, 'assets');
    if (fsSync.existsSync(cacheAssetsDir)) {
      const assetEntries = await fs.readdir(cacheAssetsDir);
      for (const a of assetEntries) {
        if (a.startsWith('mfp_test_')) {
          try {
            await fs.rm(path.join(cacheAssetsDir, a), { recursive: true, force: true });
            stats.cleanedTestFingerprints++;
          } catch (err) {
            stats.errors.push({ item: a, error: err.message });
          }
        }
      }
    }
  }

  console.log('\n================ AppData 深度清理报告 ================');
  console.log(`📦 已安全归档真实项目草稿: ${stats.archivedRealDrafts.length} 个`);
  stats.archivedRealDrafts.forEach(d => console.log(`   - ${d}`));
  console.log(`🧹 已清理测试流水线草稿目录: ${stats.cleanedTestDrafts} 个`);
  console.log(`🧹 已清理测试 SVG 临时图片: ${stats.cleanedTestSvgImages} 个`);
  console.log(`🧹 已清理单测残留技能目录: ${stats.cleanedTestSkills} 个`);
  console.log(`🧹 已清理临时波形 wav 碎片: ${stats.cleanedTestWavs} 个`);
  console.log(`🧹 已清理单测临时感知指纹: ${stats.cleanedTestFingerprints} 个`);
  if (stats.errors.length > 0) {
    console.log(`⚠️ 异常数: ${stats.errors.length}`, stats.errors);
  } else {
    console.log('🎉 全部测试残留清理完毕，无任何异常！');
  }
}

runCleanup().catch(err => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
