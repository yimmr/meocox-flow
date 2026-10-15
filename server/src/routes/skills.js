import express from 'express';
import { loadAllSkills, getSkillByName, getAgentSkills, getGenreSkills } from '../agents/skillLoader.js';

const router = express.Router();

/**
 * GET /api/skills
 * List all loaded AI Agent skills and genre cutting skills
 */
router.get('/', async (req, res) => {
  try {
    const agents = await getAgentSkills();
    const genres = await getGenreSkills();
    res.json({
      success: true,
      agents,
      genres
    });
  } catch (err) {
    res.status(500).json({ error: `加载技能体系失败: ${err.message}` });
  }
});

/**
 * GET /api/skills/:name
 * Retrieve specific SKILL.md definition
 */
router.get('/:name', async (req, res) => {
  try {
    const skill = await getSkillByName(req.params.name);
    if (!skill) {
      return res.status(404).json({ error: `未找到技能「${req.params.name}」` });
    }
    res.json({
      success: true,
      skill
    });
  } catch (err) {
    res.status(500).json({ error: `读取技能失败: ${err.message}` });
  }
});

export default router;
