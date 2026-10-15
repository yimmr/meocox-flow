import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { BaseAnalyzer } from './baseAnalyzer.js';
import { probeVideo } from '../../media.js';
import { config } from '../../../config.js';
import { perceptionStorage } from '../storage.js';
import { modelGateway } from '../../ai/modelGateway.js';

export class ImageAnalyzer extends BaseAnalyzer {
  constructor() {
    super('image');
  }

  /**
   * Multimodal Vision and OCR Inspection
   */
  async inspectVision(filePath, baseName, customConfig = {}) {
    // 1. Unified Model Gateway: dispatches to either In-App Installed Model (Scheme A) or API Endpoint
    if (fsSync.existsSync(filePath)) {
      try {
        const buf = await fs.readFile(filePath);
        const mimeType = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        const imagePayload = {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${buf.toString('base64')}` }
        };

        const promptText = `你作为影视与短视频工业级 AI 编导系统的 Vision Scout，请对传入的图片素材进行视觉内容与 OCR 文字识别，严格输出 JSON 格式：
{
  "caption": "图片整体画面简短描述（如：神话级角色孙悟空手持如意金箍棒特写立绘）",
  "ocrText": ["识别到的文字列表，如UI数字、道具名称、技能说明、标题"],
  "visualElements": "画面核心主体（角色、装备、怪物、UI组件、风景等）",
  "themeOrScene": "图片主题场景（如：角色立绘/战报结算/装备面板/概念壁纸）",
  "tags": ["3至6个核心特征标签"],
  "editorialAdvice": "在视频剪辑中的建议用途（如：可作为画中画小窗特写对比、攻略面板定格放大）"
}`;

        const res = await modelGateway.chat({
          modelConfig: customConfig,
          messages: [{ role: 'user', content: [{ type: 'text', text: promptText }, imagePayload] }],
          temperature: 0.2,
          max_tokens: 600
        });

        const raw = res?.choices?.[0]?.message?.content || '{}';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.caption) {
            return {
              caption: parsed.caption,
              ocrText: Array.isArray(parsed.ocrText) ? parsed.ocrText : [],
              visualElements: parsed.visualElements || '',
              themeOrScene: parsed.themeOrScene || '',
              tags: Array.isArray(parsed.tags) ? parsed.tags : [],
              editorialAdvice: parsed.editorialAdvice || '可作为视频配图或画中画引用'
            };
          }
        }
      } catch (err) {
        // Fall back to heuristic on error or unconfigured
      }
    }

    // 2. Smart Heuristic Fallback
    return this.heuristicInspect(filePath, baseName);
  }

  /**
   * Heuristic fallback analysis for images
   */
  heuristicInspect(filePath, baseName) {
    const nameLower = baseName.toLowerCase();
    const tags = ['静态图片'];
    let themeOrScene = '游戏与影视素材';
    let role = '插图引用';
    let visualElements = '静态平面视觉';
    const ocrText = [];

    if (/(ui|panel|status|equip|stats|item|prop|属性|面板|装备|背包|数值|图鉴)/i.test(nameLower)) {
      themeOrScene = '装备与数值属性面板';
      role = '攻略定格与属性展示';
      tags.push('属性面板', '攻略数据');
      visualElements = '游戏UI界面、属性条目与数值';
    } else if (/(cover|poster|title|thumb|banner|封面|海报|缩略图|横幅)/i.test(nameLower)) {
      themeOrScene = '短视频封面与宣传海报';
      role = '视频前3秒吸睛封面或片尾';
      tags.push('精美封面', '视觉焦点');
      visualElements = '高饱和度主体排版与主标题';
    } else if (/(character|hero|role|skin|portrait|立绘|特写|角色|英雄|模型)/i.test(nameLower)) {
      themeOrScene = '核心角色与英雄立绘';
      role = '人物登场或画中画特写展示';
      tags.push('角色立绘', '人物特写');
      visualElements = '角色主体高精度立绘造型';
    } else if (/(map|scene|scenery|view|bg|landscape|场景|地图|壁纸|环境)/i.test(nameLower)) {
      themeOrScene = '游戏宏观场景与世界观壁纸';
      role = '世界观介绍与背景底图';
      tags.push('概念场景', '宏大场景');
      visualElements = '开阔全景构图与光影氛围';
    } else {
      tags.push('视觉素材');
    }

    return {
      caption: `图片素材: ${baseName} (${themeOrScene})`,
      ocrText,
      visualElements,
      themeOrScene,
      tags,
      editorialAdvice: `建议${role}，支持平移缩放 (Ken Burns) 动效赋予动态呼吸感`
    };
  }

  /**
   * Image analysis pipeline
   */
  async analyze(mediaId, filePath, options = {}) {
    const stats = await fs.stat(filePath);
    const baseName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Probe real image dimensions
    let width = 1920;
    let height = 1080;
    try {
      const probe = await probeVideo(filePath);
      if (probe.width && probe.height) {
        width = probe.width;
        height = probe.height;
      }
    } catch {}

    // Multimodal Vision / OCR Inspection
    const vision = await this.inspectVision(filePath, baseName, options.customConfig);

    const resolutionLabel = width >= 3840 ? '4K超清' : width >= 1920 ? '1080P全高清' : `${width}x${height}`;
    const allTags = Array.from(new Set([
      '图片感知完成',
      resolutionLabel,
      ...(vision.tags || []),
      ext.replace('.', '').toUpperCase()
    ])).filter(Boolean);

    const meta = {
      mediaId,
      mediaType: 'image',
      filename: baseName,
      originalPath: path.resolve(filePath),
      fileInfo: {
        size: stats.size,
        mtimeMs: Math.floor(stats.mtimeMs),
        format: ext.replace('.', ''),
        originalPath: path.resolve(filePath)
      },
      specs: {
        width,
        height,
        resolution: `${width}x${height}`,
        aspectRatio: `${(width / (height || 1)).toFixed(2)}:1`
      }
    };

    const perception = {
      mediaId,
      mediaType: 'image',
      status: 'completed',
      analyzedAt: Date.now(),
      engineVersion: '2.0.0',
      image: {
        caption: vision.caption,
        themeOrScene: vision.themeOrScene,
        visualElements: vision.visualElements,
        ocrText: vision.ocrText,
        tags: allTags
      },
      editorialAdvice: {
        suggestedRole: vision.editorialAdvice,
        cutStrategy: '可结合 1.1x 慢速缓入或运镜推近特效，赋予静态图片电影质感'
      }
    };

    // Save thumbnail artifact in CAS storage
    try {
      const buf = await fs.readFile(filePath);
      await perceptionStorage.saveArtifact(mediaId, 'thumbnail.jpg', buf);
    } catch {}

    return { meta, perception };
  }
}
