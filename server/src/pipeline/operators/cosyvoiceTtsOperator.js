import path from 'node:path';
import { promises as fs } from 'node:fs';
import { requireProjectId, storage } from '../../storage/index.js';
import { synthesizeCosyVoiceAudio } from '../../services/cosyvoiceService.js';

/**
 * 阿里开源 CosyVoice 2 本地配音与逐字时间戳对齐算子
 */
export const cosyvoiceTtsOperator = {
  id: 'cosyvoice_tts_synthesis',
  aliases: ['step_cosyvoice', 'step_tts_local'],
  name: 'CosyVoice 2 本地人声与字级对齐',
  description: '由 Voice Scout 调度本地 CosyVoice 2 开源大模型合成广播级人声，并输出微秒级逐字时间戳',
  agentId: 'voice-scout',
  agentName: 'Voice Scout (本地配音专员)',
  skillId: 'cosyvoice-voiceover',
  inputs: ['storyboard', 'project'],
  outputs: ['voiceover', 'audio_rhythm'],

  async execute({ projectId, project, options = {}, emitLog }) {
    const pId = requireProjectId(projectId, 'operator:cosyvoiceTtsOperator');
    emitLog(`[智能体调度] 激活 Voice Scout (本地音频与时间戳专员) [SKILL: cosyvoice-voiceover]`, 'info');
    emitLog(`[语音引擎] 加载本地 CosyVoice 2 阿里开源语音旗舰 (0.5B · 零云端依赖)...`, 'info');

    const storyboard = await storage.getStoryboard(pId);
    if (!storyboard || storyboard.length === 0) {
      throw new Error('分镜列表为空，请先规划分镜解说词');
    }

    // 汇总整篇口播解说词
    const fullScript = storyboard
      .map(s => s.scriptText || s.title || '')
      .filter(Boolean)
      .join(' ');

    if (!fullScript) {
      throw new Error('分镜中缺少台词文案，无法执行语音合成');
    }

    emitLog(`[语音合成] 开始对 ${storyboard.length} 幕分镜台词执行情感配音 (总字数: ${fullScript.length} 字)...`, 'info');

    const projectWorkDir = await storage.getProjectWorkDir(pId);
    const outputAudioPath = path.join(projectWorkDir, 'voiceover.wav');

    const result = await synthesizeCosyVoiceAudio({
      text: fullScript,
      voice: options.voice || 'geek_male',
      speed: options.speed || 4.2,
      outputFilePath: outputAudioPath
    });
    await fs.writeFile(path.join(projectWorkDir, 'voiceover.json'), JSON.stringify(result, null, 2), 'utf8');

    emitLog(`[时间对齐] ✅ CTC 强制对齐完成: 标定 ${result.wordsCount} 个文字的毫秒级时序范围`, 'success');
    emitLog(`[音频落盘] 生成广播级旁白音轨: ${outputAudioPath} (时值: ${result.totalDurationSec}s)`, 'info');

    // 登记产物
    try {
      await storage.saveArtifactIndex(pId, {
        id: `voiceover_${pId}`,
        projectId: pId,
        kind: 'voiceover',
        currentVersion: 1,
        status: 'approved',
        versions: [{
          version: 1,
          hash: `hash_voice_${Date.now()}`,
          schemaId: 'schema://meocox/voiceover/v1',
          lineage: [],
          producedBy: { taskId: 'task_cosyvoice', operatorId: 'cosyvoice_tts_synthesis' },
          createdAt: Date.now(),
          payloadRef: 'voiceover.wav'
        }]
      });
    } catch {}

    return {
      outputOverview: {
        engine: 'CosyVoice 2 (Local Open-Source SOTA)',
        audioPath: outputAudioPath,
        durationSec: result.totalDurationSec,
        durationFormatted: `${result.totalDurationSec} 秒 (${result.totalFrames} 帧 @ 30fps)`,
        wordsCount: result.wordsCount,
        alignmentPrecision: '逐字毫秒锁帧 (CTC Forced Alignment)'
      },
      voiceover: {
        audioPath: outputAudioPath,
        durationSec: result.totalDurationSec,
        words: result.words
      },
      details: `Voice Scout 成功在本地合成 ${result.totalDurationSec} 秒高保真旁白，并提取微秒级字音对齐索引`
    };
  }
};
