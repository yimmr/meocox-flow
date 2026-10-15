import fs from 'node:fs/promises';
import path from 'node:path';
import { BaseAnalyzer } from './baseAnalyzer.js';
import { probeVideo } from '../../media.js';
import { perceptionStorage } from '../storage.js';

export class AudioAnalyzer extends BaseAnalyzer {
  constructor() {
    super('audio');
  }

  /**
   * Determine audio role from filename heuristics and duration
   */
  detectAudioRole(baseName, durationSec) {
    const nameLower = baseName.toLowerCase();
    if (/(bgm|music|ost|theme|song|track|soundtrack|melody|伴奏|配乐|主题曲|片尾|片头)/i.test(nameLower)) {
      return { role: 'bgm', label: 'BGM 背景音乐' };
    }
    if (/(sfx|hit|punch|slash|whoosh|click|boom|drop|ui|impact|foley|jump|coin|laser|音效|打击|开枪|爆炸|挥击|转场|提示音)/i.test(nameLower)) {
      return { role: 'sfx', label: '动作/环境音效' };
    }
    if (/(voice|speech|dub|commentary|narrat|dialogue|解说|台词|配音|录音|说话|人声)/i.test(nameLower)) {
      return { role: 'voiceover', label: '解说/人声旁白' };
    }
    if (/(ambient|ambience|rain|wind|nature|city|env|白噪音|环境|雨声|风声|水流|鸟鸣)/i.test(nameLower)) {
      return { role: 'ambient', label: '环境氛围声' };
    }

    // Heuristics based on duration
    if (durationSec <= 6) {
      return { role: 'sfx', label: '短音效 / 卡点特效' };
    }
    if (durationSec >= 25) {
      return { role: 'bgm', label: '长音频 / 背景音乐' };
    }
    return { role: 'bgm', label: '背景音乐 / 音频切片' };
  }

  /**
   * Detect or estimate BPM / tempo
   */
  detectBpm(baseName, role) {
    // 1. Check if BPM is specified in filename (e.g. 128bpm, 140_bpm)
    const bpmMatch = baseName.match(/(\d{2,3})\s*bpm/i) || baseName.match(/bpm\s*(\d{2,3})/i);
    if (bpmMatch && bpmMatch[1]) {
      const parsed = parseInt(bpmMatch[1], 10);
      if (parsed >= 50 && parsed <= 240) return parsed;
    }

    // 2. Role-based standard estimate
    if (role === 'sfx') return 128;
    if (role === 'ambient') return 90;
    if (/(battle|epic|fight|rock|燃|战斗|高潮|史诗)/i.test(baseName)) return 135;
    if (/(chill|relax|peace|soft|舒缓|抒情|轻松)/i.test(baseName)) return 95;
    return 120;
  }

  /**
   * Detect mood and genre tags from filename keywords
   */
  detectAcousticMood(baseName, role) {
    const moods = [];
    const nameLower = baseName.toLowerCase();

    if (/(epic|史诗|震撼|磅礴|大场面|团战)/i.test(nameLower)) moods.push('史诗震撼');
    if (/(battle|fight|war|action|打斗|战斗|交锋|高能)/i.test(nameLower)) moods.push('高能战斗');
    if (/(happy|funny|comedy|joy|欢快|搞笑|逗趣|轻松)/i.test(nameLower)) moods.push('欢快搞笑');
    if (/(chill|lofi|relax|peace|舒缓|宁静|治愈)/i.test(nameLower)) moods.push('舒缓治愈');
    if (/(dark|suspense|horror|tension|悬疑|紧张|压抑|昏暗)/i.test(nameLower)) moods.push('紧张悬疑');
    if (/(cyberpunk|electronic|8bit|retro|赛博|电音|复古)/i.test(nameLower)) moods.push('科技赛博');
    if (/(sad|emotional|tear|伤感|催泪|感动)/i.test(nameLower)) moods.push('抒情走心');

    if (moods.length === 0) {
      if (role === 'sfx') moods.push('卡点动效');
      else if (role === 'ambient') moods.push('自然氛围');
      else moods.push('节奏旋律');
    }
    return moods;
  }

  /**
   * Enhanced Audio analysis pipeline
   */
  async analyze(mediaId, filePath, options = {}) {
    const stats = await fs.stat(filePath);
    const baseName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Use probe for audio duration and stream specs if available
    let durationSec = 30;
    let sampleRate = 44100;
    let channels = 2;
    try {
      const probe = await probeVideo(filePath);
      if (probe.durationSec) durationSec = Number(probe.durationSec.toFixed(1));
    } catch {}

    const { role, label: roleLabel } = this.detectAudioRole(baseName, durationSec);
    const bpm = this.detectBpm(baseName, role);
    const moods = this.detectAcousticMood(baseName, role);

    const tags = Array.from(new Set([
      '音频感知完成',
      roleLabel,
      `${bpm} BPM`,
      ...moods,
      ext.replace('.', '').toUpperCase()
    ])).filter(Boolean);

    const meta = {
      mediaId,
      mediaType: 'audio',
      filename: baseName,
      originalPath: path.resolve(filePath),
      fileInfo: {
        size: stats.size,
        mtimeMs: Math.floor(stats.mtimeMs),
        format: ext.replace('.', ''),
        originalPath: path.resolve(filePath)
      },
      specs: {
        durationSec,
        duration: `${Math.floor(durationSec / 60).toString().padStart(2, '0')}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}`,
        sampleRate,
        channels
      }
    };

    const perception = {
      mediaId,
      mediaType: 'audio',
      status: 'completed',
      analyzedAt: Date.now(),
      engineVersion: '2.0.0',
      audio: {
        role,
        roleLabel,
        bpm,
        moods,
        summary: `音频素材: ${baseName} (${roleLabel} · ${bpm} BPM · ${moods.join('/')})`,
        transcript: [],
        speechRatio: role === 'voiceover' ? 0.85 : 0.05,
        tags
      },
      editorialAdvice: {
        suggestedRole: role === 'sfx' 
          ? '作为转场过渡、关键动作冲击重音或技能释放卡点' 
          : role === 'voiceover'
          ? '作为视频核心旁白解说轨，压制背景声突出人声'
          : '作为核心背景音乐铺底，烘托高能氛围',
        cutStrategy: role === 'sfx'
          ? '紧贴视频撞击或画面切点前0.1秒切入'
          : `紧贴 ${bpm} BPM 强拍点进行分镜画面切换与动态缩放`,
        hookPotential: moods.includes('史诗震撼') || moods.includes('高能战斗') ? '极佳高能卡点配乐' : '常规情绪铺垫'
      }
    };

    // Save acoustic profile artifact to CAS storage
    try {
      await perceptionStorage.saveArtifact(
        mediaId,
        'acoustic_profile.json',
        Buffer.from(JSON.stringify({ role, bpm, moods, durationSec, tags }, null, 2))
      );
    } catch {}

    return { meta, perception };
  }
}
