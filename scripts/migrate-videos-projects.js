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

async function runMigration() {
  const userProfile = process.env.USERPROFILE || os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');

  const srcDir = path.join(userProfile, 'Videos', 'Meocox Flow');
  const targetProjectsRoot = path.join(localAppData, 'MeocoxFlow', 'Projects');
  const settingsFile = path.join(localAppData, 'MeocoxFlow', 'settings.json');

  console.log('🚀 开始执行旧项目与测试残留迁移清理...');
  console.log(`📁 源旧目录: ${srcDir}`);
  console.log(`📁 目标标准目录: ${targetProjectsRoot}`);

  if (!fsSync.existsSync(srcDir)) {
    console.log('ℹ️ 源目录不存在，无需迁移。');
    return;
  }

  await fs.mkdir(targetProjectsRoot, { recursive: true });

  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  const stats = {
    cleanedTests: [],
    cleanedEmpty: [],
    migratedProjects: [],
    errors: []
  };

  for (const entry of entries) {
    const name = entry.name;
    const fullPath = path.join(srcDir, name);

    // 1. 清理临时测试文件夹 (test_*)
    if (name.startsWith('test_')) {
      try {
        await fs.rm(fullPath, { recursive: true, force: true });
        stats.cleanedTests.push(name);
        console.log(`  🗑️ 已清理自动化测试残留: ${name}`);
      } catch (err) {
        stats.errors.push({ name, action: 'clean_test', error: err.message });
      }
      continue;
    }

    // 2. 清理遗留的空目录
    if (['mcp-diagnostic', 'super-brain'].includes(name)) {
      try {
        const subFiles = await fs.readdir(fullPath).catch(() => []);
        if (subFiles.length === 0) {
          await fs.rm(fullPath, { recursive: true, force: true });
          stats.cleanedEmpty.push(name);
          console.log(`  🗑️ 已清理无用空目录: ${name}`);
          continue;
        }
      } catch (err) {
        stats.errors.push({ name, action: 'clean_empty', error: err.message });
      }
    }

    // 3. 有效项目/工程数据搬迁与沙箱规范化升级
    try {
      const targetProjDir = path.join(targetProjectsRoot, name);
      console.log(`  📦 正在迁移项目资产: ${name} -> ${targetProjDir}`);

      // 递归复制到目标沙箱
      await copyDir(fullPath, targetProjDir);

      // 若包含 project.json，更新 projectDir 并升级 state/ 目录
      const projJsonFile = path.join(targetProjDir, 'project.json');
      if (fsSync.existsSync(projJsonFile)) {
        const rawJson = await fs.readFile(projJsonFile, 'utf8');
        const projData = JSON.parse(rawJson);
        projData.projectDir = path.resolve(targetProjDir);
        projData.updatedAt = Date.now();
        await fs.writeFile(projJsonFile, JSON.stringify(projData, null, 2), 'utf8');

        // 升级 state/ 沙箱结构
        const stateDir = path.join(targetProjDir, 'state');
        await fs.mkdir(stateDir, { recursive: true });

        const syncStateFiles = ['storyboard.json', 'pipeline.json', 'assets.json'];
        for (const sf of syncStateFiles) {
          const srcSf = path.join(targetProjDir, sf);
          const destSf = path.join(stateDir, sf);
          if (fsSync.existsSync(srcSf) && !fsSync.existsSync(destSf)) {
            await fs.copyFile(srcSf, destSf);
          }
        }
      }

      // 验证目标已存在后，删除旧目录下的对应项目
      await fs.rm(fullPath, { recursive: true, force: true });
      stats.migratedProjects.push({ name, target: targetProjDir });
      console.log(`  ✅ 成功迁移并升级项目: ${name}`);
    } catch (err) {
      stats.errors.push({ name, action: 'migrate', error: err.message });
      console.error(`  ❌ 迁移失败: ${name}`, err);
    }
  }

  // 4. 更新 settings.json
  if (fsSync.existsSync(settingsFile)) {
    try {
      const rawSettings = await fs.readFile(settingsFile, 'utf8');
      const settings = JSON.parse(rawSettings);
      settings.defaultProjectsRoot = path.resolve(targetProjectsRoot);
      await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
      console.log(`\n⚙️ 已更新 settings.json 中的 defaultProjectsRoot 为: ${settings.defaultProjectsRoot}`);
    } catch (err) {
      stats.errors.push({ name: 'settings.json', action: 'update_settings', error: err.message });
    }
  }

  // 5. 检查旧源目录是否已清空
  try {
    const remaining = await fs.readdir(srcDir);
    if (remaining.length === 0) {
      const markerPath = path.join(srcDir, '.MIGRATED_TO_LOCALAPPDATA.txt');
      await fs.writeFile(
        markerPath,
        `此目录的所有工程项目已于 ${new Date().toISOString()} 安全迁移至:\n${targetProjectsRoot}\n此目录可安全移除。\n`,
        'utf8'
      );
      console.log(`📝 已在旧目录生成迁移完成标记文件。`);
    } else {
      console.log(`⚠️ 旧目录中仍有未处理文件:`, remaining);
    }
  } catch (err) {}

  console.log('\n================ 迁移与清理完成报告 ================');
  console.log(`✨ 成功迁移项目数: ${stats.migratedProjects.length}`);
  stats.migratedProjects.forEach((p) => console.log(`   - ${p.name} -> ${p.target}`));
  console.log(`🧹 已清理自动化测试残留目录数: ${stats.cleanedTests.length}`);
  console.log(`🧹 已清理空目录数: ${stats.cleanedEmpty.length}`);
  if (stats.errors.length > 0) {
    console.log(`⚠️ 异常数: ${stats.errors.length}`, stats.errors);
  } else {
    console.log('🎉 整个过程 0 错误，所有资产完整保留！');
  }
}

runMigration().catch((err) => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
