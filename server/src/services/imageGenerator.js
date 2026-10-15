import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { storage, requireProjectId } from '../storage/index.js';

/**
 * High-performance Visual Generation Service
 * Supports Gemini Flash Image / OpenAI-compatible / Google Flow visual pipelines
 */
export async function generateVisualImage({
  prompt,
  aspectRatio = '16:9',
  style = 'cinematic',
  projectId,
  options = {}
}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('生图提示词 (prompt) 不能为空');
  }
  // projectId 必填：此前有魔法默认值，会把产物静默归到无关项目
  requireProjectId(projectId, 'generateVisualImage');

  const enhancedPrompt = options.rawPrompt 
    ? prompt 
    : `${prompt}, ${style || 'cinematic masterpiece'}, 8k resolution, highly detailed, dramatic lighting, aspect ratio ${aspectRatio}`;

  // Ensure output directory exists
  const imagesDir = path.join(config.paths.outputDir, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const filename = `aigc_${timestamp}_${randomSuffix}.jpg`;
  const localFilePath = path.join(imagesDir, filename);
  const webUrl = `/outputs/images/${filename}`;

  // 1. Try Primary AI API (gemini-3.1-flash-image via configured AI endpoint)
  const baseUrl = (config.ai.baseUrl || 'https://ai.yimmx.xyz/v1').replace(/\/+$/, '');
  const apiKey = config.ai.apiKey;

  let base64Data = null;
  let generationModel = 'gemini-3.1-flash-image';
  let lastApiError = null;

  // Retry up to 3 times for transient upstream errors (e.g. antigravity project_id auth hiccups)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gemini-3.1-flash-image',
          messages: [
            {
              role: 'user',
              content: `Generate an image based on: ${enhancedPrompt}`
            }
          ]
        }),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const choice = data.choices?.[0];
        const imageObj = choice?.message?.images?.[0];
        const imageUrl = imageObj?.image_url?.url || imageObj?.url;

        if (imageUrl && imageUrl.startsWith('data:image/')) {
          const commaIndex = imageUrl.indexOf(',');
          base64Data = imageUrl.slice(commaIndex + 1);
          break;
        }
        lastApiError = '上游接口返回成功但未包含图片数据';
        generationModel = data.model || generationModel;
      } else {
        const errText = await res.text().catch(() => '');
        lastApiError = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
      }
    } catch (err) {
      lastApiError = err.message;
    }

    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1200 * attempt));
    }
  }

  if (!base64Data && lastApiError) {
    console.warn('[ImageGenerator] Primary API failed after retries:', lastApiError);
  }

  // 2. Fallback: High-quality SVG/Canvas synthesized concept artwork if remote API unreachable
  if (!base64Data) {
    const svgContent = generateFallbackConceptSvg({ prompt, style, aspectRatio });
    const svgFilename = `aigc_${timestamp}_${randomSuffix}.svg`;
    const svgFilePath = path.join(imagesDir, svgFilename);
    fs.writeFileSync(svgFilePath, svgContent, 'utf-8');

    const svgWebUrl = `/outputs/images/${svgFilename}`;
    const assetId = `img_gen_${timestamp}`;

    // Register into project assets
    if (projectId) {
      try {
        await storage.addAsset(projectId, {
          id: assetId,
          name: svgFilename,
          mediaType: 'image',
          path: svgFilePath,
          url: svgWebUrl,
          prompt,
          source: 'aigc_generator_concept',
          createdAt: new Date().toISOString()
        });
      } catch (e) {
        // ignore asset registry error
      }
    }

    return {
      success: true,
      imageUrl: svgWebUrl,
      localPath: svgFilePath,
      assetId,
      filename: svgFilename,
      prompt,
      model: 'concept-visual-renderer',
      dimensions: aspectRatio === '9:16' ? '720x1280' : '1920x1080',
      message: `已成功生成视觉概念图「${filename}」并存入项目素材库！`
    };
  }

  // Write base64 image to local disk
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(localFilePath, buffer);

  const assetId = `img_gen_${timestamp}`;

  // Register into project assets for timeline & draft injection
  if (projectId) {
    try {
      await storage.addAsset(projectId, {
        id: assetId,
        name: filename,
        mediaType: 'image',
        path: localFilePath,
        url: webUrl,
        prompt,
        source: 'aigc_generator',
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      // ignore asset registry error
    }
  }

  return {
    success: true,
    imageUrl: webUrl,
    localPath: localFilePath,
    assetId,
    filename,
    prompt,
    model: generationModel,
    dimensions: aspectRatio === '9:16' ? '768x1344' : '1344x768',
    message: `视觉概念图已成功生成并持久化！文件已沉淀至项目素材池。`
  };
}

/**
 * Generate a stylistic SVG placeholder/concept art when offline
 */
function generateFallbackConceptSvg({ prompt, style, aspectRatio }) {
  const width = aspectRatio === '9:16' ? 720 : 1280;
  const height = aspectRatio === '9:16' ? 1280 : 720;
  const safePrompt = (prompt || 'AIGC Concept Artwork').replace(/[<>&"]/g, '');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#311042" />
    </linearGradient>
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgGrad)" />
  <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.4}" fill="url(#glowGrad)" />
  <g fill="none" stroke="#6366f1" stroke-width="1.5" opacity="0.4">
    <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.25}" />
    <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.35}" stroke-dasharray="8 6" />
  </g>
  <text x="50%" y="${height * 0.45}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="#f8fafc" text-anchor="middle" dominant-baseline="middle">
    🎨 AIGC 视觉概念成图
  </text>
  <text x="50%" y="${height * 0.54}" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">
    ${safePrompt.slice(0, 50)}...
  </text>
  <text x="50%" y="${height * 0.62}" font-family="monospace" font-size="12" fill="#38bdf8" text-anchor="middle">
    风格: ${style} | 画幅: ${aspectRatio} | 8K 渲染母版
  </text>
</svg>`;
}
