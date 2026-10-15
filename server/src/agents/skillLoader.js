import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// 统一走 config.paths.appRoot（打包态由 MEOCOX_APP_ROOT 注入）
const SKILLS_ROOT = path.resolve(config.paths.appRoot, 'skills');

/**
 * Simple YAML Frontmatter parser for SKILL.md
 */
function parseFrontmatter(markdownText) {
  const match = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, content: markdownText.trim() };
  }

  const rawYaml = match[1];
  const content = match[2].trim();
  const metadata = {};

  const lines = rawYaml.split(/\r?\n/);
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
    }

    metadata[key] = val;
  }

  return { metadata, content };
}

/**
 * Scan all SKILL.md files in the flat skills directory
 */
export async function loadAllSkills() {
  if (!fsSync.existsSync(SKILLS_ROOT)) {
    return [];
  }

  const skills = [];
  const entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullDir = path.join(SKILLS_ROOT, entry.name);
      const skillMd = path.join(fullDir, 'SKILL.md');
      
      try {
        await fs.access(skillMd);
        const raw = await fs.readFile(skillMd, 'utf-8');
        const { metadata, content } = parseFrontmatter(raw);
        const skillKey = metadata.name || entry.name;

        // Check handler.ts / handler.js
        let hasHandler = false;
        let handlerPath = null;
        try {
          const hPath = path.join(fullDir, 'handler.ts');
          await fs.access(hPath);
          hasHandler = true;
          handlerPath = hPath;
        } catch {
          try {
            const hPathJs = path.join(fullDir, 'handler.js');
            await fs.access(hPathJs);
            hasHandler = true;
            handlerPath = hPathJs;
          } catch {}
        }

        skills.push({
          id: skillKey,
          name: metadata.title || metadata.name || skillKey,
          category: 'capability',
          description: metadata.description || '',
          tools: metadata.tools || [],
          parameters: metadata.parameters || {},
          metadata,
          content,
          filePath: skillMd,
          relativePath: path.relative(SKILLS_ROOT, skillMd),
          hasHandler,
          handlerPath
        });
      } catch (err) {}
    }
  }

  return skills;
}

/**
 * Get a specific skill by id or name
 */
export async function getSkillByName(skillName) {
  const all = await loadAllSkills();
  const query = (skillName || '').toLowerCase().trim();
  return all.find(s => {
    const sId = s.id.toLowerCase();
    const sName = s.name.toLowerCase();
    return sId === query || 
           sName === query || 
           sId === query.replace('genre-', '') ||
           `genre-${sId}` === query;
  }) || null;
}

/**
 * Deprecated compatibility helper: All skills are now composable capabilities
 */
export async function getAgentSkills() {
  return [];
}

/**
 * Composable editing skills (high-energy, game-guide, beat-sync, lore-story, etc.)
 */
export async function getGenreSkills() {
  return await loadAllSkills();
}
