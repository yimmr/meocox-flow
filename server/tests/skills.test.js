import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAllSkills, getSkillByName, getGenreSkills } from '../src/agents/skillLoader.js';

describe('Flat Modular Skills & Composable Agent Capabilities', () => {
  it('should discover composable skills or return empty array gracefully', async () => {
    const skills = await loadAllSkills();
    assert.ok(Array.isArray(skills));
  });

  it('should safely query skill by name with graceful fallback', async () => {
    const nonExistent = await getSkillByName('non-existent-skill');
    assert.equal(nonExistent, null);
  });

  it('should return array of composable skills via getGenreSkills', async () => {
    const genres = await getGenreSkills();
    assert.ok(Array.isArray(genres));
  });
});
