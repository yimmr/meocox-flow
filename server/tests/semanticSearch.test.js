import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PerceptionStorage } from '../src/services/perception/storage.js';
import { SemanticSearchEngine, tokenizeText } from '../src/services/perception/semanticSearch.js';

describe('Zero-Setup Embedded Semantic Search Engine', () => {
  let testStorageRoot;
  let storage;
  let searchEngine;

  beforeEach(async () => {
    // 用系统临时目录，避免测试数据写进代码仓库
    testStorageRoot = path.join(os.tmpdir(), `meocoxflow_temp_test_search_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    await fs.mkdir(testStorageRoot, { recursive: true });
    storage = new PerceptionStorage(testStorageRoot);
    searchEngine = new SemanticSearchEngine({ storage });
  });

  afterEach(async () => {
    try {
      await fs.rm(testStorageRoot, { recursive: true, force: true });
    } catch {}
  });

  test('should accurately tokenize Chinese, English, and mixed alphanumeric text', () => {
    const tokens = tokenizeText('黄金前3秒 暴风雨海战 Kraken vs 孙悟空 128bpm');
    assert.ok(tokens.includes('黄'));
    assert.ok(tokens.includes('黄金'));
    assert.ok(tokens.includes('kraken'));
    assert.ok(tokens.includes('128bpm'));
    assert.ok(tokens.includes('孙悟空'));
    assert.ok(tokens.includes('暴风雨'));
  });

  test('should index multimodal assets and rank them by semantic cosine similarity', async () => {
    // 1. High energy combat video
    const id1 = 'mfp_video_battle';
    await storage.saveMeta(id1, {
      mediaId: id1,
      mediaType: 'video',
      filename: 'wukong_boss_fight.mp4',
      originalPath: 'D:\\videos\\wukong_boss_fight.mp4'
    });
    await storage.savePerception(id1, {
      mediaId: id1,
      mediaType: 'video',
      status: 'completed',
      video: {
        summary: '黑神话悟空 黄风大圣 BOSS 战',
        visualActions: '孙悟空连续使用劈棍破防，金光暴风狂卷，高能打击感拉满',
        gameOrScene: '黄风岭 黄风大圣战',
        cinematicValue: '五星级黄金开场钩子',
        tags: ['高能打击', 'BOSS战', '黄金前3秒', '动作高能']
      }
    });

    // 2. Calm ocean scenery video
    const id2 = 'mfp_video_ocean';
    await storage.saveMeta(id2, {
      mediaId: id2,
      mediaType: 'video',
      filename: 'sea_sunset_view.mp4',
      originalPath: 'D:\\videos\\sea_sunset_view.mp4'
    });
    await storage.savePerception(id2, {
      mediaId: id2,
      mediaType: 'video',
      status: 'completed',
      video: {
        summary: '夕阳下的平静大海与沙滩海浪',
        visualActions: '微风轻拂海面，海浪缓缓拍打金色沙滩，唯美治愈',
        gameOrScene: '热带海岛风光',
        cinematicValue: '舒缓空镜转场',
        tags: ['平静海浪', '舒缓治愈', '夕阳美景']
      }
    });

    // 3. Audio battle BGM
    const id3 = 'mfp_audio_epic';
    await storage.saveMeta(id3, {
      mediaId: id3,
      mediaType: 'audio',
      filename: 'epic_orchestra_135bpm.mp3',
      originalPath: 'D:\\audio\\epic_orchestra_135bpm.mp3'
    });
    await storage.savePerception(id3, {
      mediaId: id3,
      mediaType: 'audio',
      status: 'completed',
      audio: {
        role: 'bgm',
        roleLabel: 'BGM 背景音乐',
        bpm: 135,
        moods: ['史诗震撼', '高能战斗'],
        summary: '管弦乐交响激昂重音，充满压迫感与战意',
        tags: ['史诗震撼', '135 BPM', '战斗配乐']
      }
    });

    // Index all assets
    await searchEngine.indexAsset(id1);
    await searchEngine.indexAsset(id2);
    await searchEngine.indexAsset(id3);

    // Search 1: "高能打斗 BOSS 劈棍" -> should rank id1 first with high score
    const res1 = await searchEngine.search('高能打斗 BOSS 劈棍');
    assert.ok(res1.length >= 1);
    assert.equal(res1[0].mediaId, id1);
    assert.ok(res1[0].scorePercent >= 60);

    // Search 2: "史诗 震撼 BGM" -> should rank id3 first
    const res2 = await searchEngine.search('史诗 震撼 BGM');
    assert.ok(res2.length >= 1);
    assert.equal(res2[0].mediaId, id3);

    // Search 3: "治愈平静夕阳" -> should rank id2 first
    const res3 = await searchEngine.search('治愈平静夕阳');
    assert.ok(res3.length >= 1);
    assert.equal(res3[0].mediaId, id2);
  });

  test('should support mediaType filtering and candidate restriction', async () => {
    const idVid = 'mfp_v1';
    const idAud = 'mfp_a1';

    await storage.saveMeta(idVid, {
      mediaId: idVid,
      mediaType: 'video',
      filename: 'clip.mp4',
      originalPath: 'D:\\folder\\clip.mp4'
    });
    await storage.savePerception(idVid, {
      mediaId: idVid,
      mediaType: 'video',
      video: { summary: '激烈打斗', tags: ['激烈打斗'] }
    });

    await storage.saveMeta(idAud, {
      mediaId: idAud,
      mediaType: 'audio',
      filename: 'bgm.mp3',
      originalPath: 'D:\\folder\\bgm.mp3'
    });
    await storage.savePerception(idAud, {
      mediaId: idAud,
      mediaType: 'audio',
      audio: { summary: '激烈打斗配乐', tags: ['激烈打斗'] }
    });

    await searchEngine.indexAsset(idVid);
    await searchEngine.indexAsset(idAud);

    // Filter by video only
    const resVid = await searchEngine.search('激烈打斗', { mediaType: 'video' });
    assert.equal(resVid.length, 1);
    assert.equal(resVid[0].mediaId, idVid);

    // Filter by candidate path
    const resCand = await searchEngine.search('激烈打斗', { candidatePaths: ['D:\\folder\\bgm.mp3'] });
    assert.equal(resCand.length, 1);
    assert.equal(resCand[0].mediaId, idAud);

    // Filter by candidate mediaId
    const resMediaId = await searchEngine.search('激烈打斗', { candidateMediaIds: [idVid] });
    assert.equal(resMediaId.length, 1);
    assert.equal(resMediaId[0].mediaId, idVid);
  });
});
