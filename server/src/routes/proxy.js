import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { storage } from '../storage/index.js';
import { probeVideo, generateThumbnail } from '../services/media.js';

const router = express.Router();

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

const API_CUSTOM_USER_AGENT = 'MeocoxFlowAI/1.0 (contact@meocoxflow.ai) Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0';

/**
 * 格式化规范化 URL
 */
function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * 中英关键词映射表（提升 Wallhaven 与维基媒体的国际素材检索效果）
 */
const KEYWORD_MAP = {
  '游戏': 'gaming video game action',
  '游戏实机': 'gameplay action video game',
  '电竞': 'esports gaming competition',
  '电竞高能': 'esports tournament highlight',
  '游戏特效': 'game vfx magic energy sparks',
  '高光时刻': 'action highlight battle cinematic',
  '虚幻引擎': 'unreal engine 5 cinematic render',
  '科幻机甲': 'mecha sci-fi robot futuristic',
  '二次元': 'anime fantasy gaming style',
  '动作格斗': 'combat fight action cinematic',
  '海浪': 'ocean waves',
  '海洋': 'ocean',
  '海': 'sea',
  '暴风雨': 'storm waves',
  '粒子': 'particles explosion',
  '光效': 'light flare glow',
  '赛博朋克': 'cyberpunk city',
  '城市': 'city skyline night',
  '夜景': 'night city lights',
  '深海': 'underwater ocean jellyfish',
  '天空': 'sky clouds sunset',
  '夕阳': 'sunset horizon',
  '日落': 'sunset clouds',
  '云海': 'clouds mountain timelapse',
  '火': 'fire flame explosion',
  '火焰': 'fire sparks',
  '烟雾': 'smoke dust',
  '科技': 'technology futuristic cyber',
  '汽车': 'sports car neon',
  '风景': 'nature landscape cinematic',
  '大自然': 'nature forest waterfall',
  '星空': 'galaxy milky way stars',
  '宇宙': 'space galaxy nebula',
  '遗忘之海': 'ocean sea water storm'
};

/**
 * 生成智能防御盾（403 / Cloudflare）引导页面
 */
function renderWafAssistantHtml(targetUrl, errorMsg, isCloudflare) {
  const safeUrl = targetUrl.replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>目标网站开启了机器人防御盾 (403)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #0b0f19;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .container {
      max-width: 640px;
      width: 100%;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 8px;
    }
    .desc {
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .target-url {
      background: #0f172a;
      border: 1px solid #1e293b;
      padding: 8px 12px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 12px;
      color: #38bdf8;
      word-break: break-all;
      margin-bottom: 24px;
    }
    .solutions-title {
      font-size: 13px;
      font-weight: 600;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }
    .solution-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }
    .solution-item {
      background: #1a2234;
      border: 1px solid #2d3748;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      transition: all 0.2s;
    }
    .solution-item:hover {
      border-color: #3b82f6;
      background: #1e293b;
    }
    .solution-info {
      flex: 1;
    }
    .solution-name {
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 3px;
    }
    .solution-detail {
      font-size: 12px;
      color: #64748b;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 0;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: white;
    }
    .btn-primary:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: #334155;
      color: #e2e8f0;
    }
    .btn-secondary:hover {
      background: #475569;
    }
    .quick-sites {
      border-top: 1px solid #1f2937;
      padding-top: 18px;
    }
    .quick-title {
      font-size: 12px;
      color: #94a3b8;
      margin-bottom: 10px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      background: #1e293b;
      border: 1px solid #334155;
      color: #94a3b8;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .chip:hover {
      color: #38bdf8;
      border-color: #38bdf8;
      background: #0f172a;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">
      🛡️ 目标站点开启了反自动化防御盾 (403 Forbidden)
    </div>
    <h1>${isCloudflare ? 'Cloudflare WAF / 人机验证拦截' : '网页反向代理受限'}</h1>
    <p class="desc">
      目标站点（如 Pixabay、Pexels 等）部署了严格的 Cloudflare Bot Management 机器人验证盾，禁止服务端透明代理抓取或 iframe 嵌套访问。请选用以下方案继续作业：
    </p>
    <div class="target-url">${safeUrl}</div>

    <div class="solutions-title">推荐替代方案</div>
    <div class="solution-list">
      <!-- 方案 1: 在系统原生浏览器打开并快捷存盘 -->
      <div class="solution-item">
        <div class="solution-info">
          <div class="solution-name">1. 在系统原生浏览器中打开 (推荐)</div>
          <div class="solution-detail">在 Chrome/Edge 中正常浏览通过验证，右键复制图片/视频地址，切回剪辑器一键存入素材库</div>
        </div>
        <button class="btn btn-primary" onclick="openExternal()">
          在外部浏览器打开 ↗
        </button>
      </div>

      <!-- 方案 2: 切换到内置免版权素材库 -->
      <div class="solution-item">
        <div class="solution-info">
          <div class="solution-name">2. 切换至内置【免版权素材库】</div>
          <div class="solution-detail">直连 Wallhaven 4K、Wikimedia Commons、Mixkit，免翻免盾海量检索并一键存盘</div>
        </div>
        <button class="btn btn-secondary" onclick="switchToStock()">
          前往免版权库 →
        </button>
      </div>
    </div>

    <!-- 方案 3: 推荐免阻断的优质素材站点 -->
    <div class="quick-sites">
      <div class="quick-title">⚡ 一键切换至 100% 允许透明代理浏览的素材站点：</div>
      <div class="chips">
        <span class="chip" onclick="navigateTo('https://mixkit.co')">🎬 Mixkit 免商用视频</span>
        <span class="chip" onclick="navigateTo('https://commons.wikimedia.org')">🌍 维基开放多媒体</span>
        <span class="chip" onclick="navigateTo('https://wallhaven.cc')">🖼️ Wallhaven 4K画廊</span>
        <span class="chip" onclick="navigateTo('https://cn.bing.com/images/trending')">🔍 必应每日趋势壁纸</span>
        <span class="chip" onclick="navigateTo('https://www.videvo.net')">📹 Videvo 素材视频</span>
      </div>
    </div>
  </div>

  <script>
    function openExternal() {
      fetch('/api/proxy/open-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: "${safeUrl}" })
      }).catch(console.error);

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'MEOCOXFLOW_OPEN_EXTERNAL',
          url: "${safeUrl}"
        }, '*');
      }
    }

    function switchToStock() {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'MEOCOXFLOW_SWITCH_MODE',
          mode: 'modeC'
        }, '*');
      }
    }

    function navigateTo(url) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'MEOCOXFLOW_NAVIGATE',
          url: url
        }, '*');
      } else {
        window.location.href = '/api/proxy/page?url=' + encodeURIComponent(url);
      }
    }
  </script>
</body>
</html>`;
}

/**
 * 1. GET /api/proxy/page
 * 网页透明反向代理（剥除 X-Frame-Options 与 CSP，注入素材嗅探器脚本）
 */
router.get('/page', async (req, res) => {
  const targetUrl = normalizeUrl(req.query.url);
  if (!targetUrl) {
    return res.status(400).send('缺少目标 URL 参数');
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        ...BROWSER_HEADERS,
        'Referer': targetUrl
      },
      timeout: 15000,
      responseType: 'text',
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // 注入 base 标签使相对路径脚本和样式能正确加载
    $('head').prepend(`<base href="${targetUrl}">`);

    // 规范化 a 标签 target 为 _self，防止新窗口弹窗
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        $(el).attr('target', '_self');
      }
    });

    // 注入素材嗅探与全链路链接捕获脚本
    const injectedScript = `
      <script>
        (function() {
          // 全局捕获阶段拦截所有链接点击（在框架路由或默认跳转前生效，防止跳出代理）
          document.addEventListener('click', function(e) {
            let el = e.target;
            while (el && el !== document) {
              if (el.tagName === 'A') {
                const href = el.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const targetUrl = new URL(href, document.baseURI || window.location.href).href;
                    if (window.parent && window.parent !== window) {
                      window.parent.postMessage({
                        type: 'MEOCOXFLOW_NAVIGATE',
                        url: targetUrl
                      }, '*');
                    } else {
                      window.location.href = '/api/proxy/page?url=' + encodeURIComponent(targetUrl);
                    }
                  } catch(err) {
                    console.error('[MeocoxFlow Proxy] Click navigate error:', err);
                  }
                  return false;
                }
              }
              el = el.parentElement;
            }
          }, true);

          // 劫持 window.open
          window.open = function(url) {
            if (url) {
              try {
                const targetUrl = new URL(url, document.baseURI || window.location.href).href;
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({
                    type: 'MEOCOXFLOW_NAVIGATE',
                    url: targetUrl
                  }, '*');
                } else {
                  window.location.href = '/api/proxy/page?url=' + encodeURIComponent(targetUrl);
                }
              } catch(e) {}
            }
            return null;
          };

          function sniffMedia() {
            const found = [];
            const seen = new Set();

            // 1. 扫描所有视频
            document.querySelectorAll('video').forEach((v, idx) => {
              const src = v.currentSrc || v.src || (v.querySelector('source') && v.querySelector('source').src);
              if (src && !seen.has(src)) {
                seen.add(src);
                found.push({
                  type: 'video',
                  url: src,
                  name: '视频切片 #' + (found.length + 1),
                  poster: v.poster || ''
                });
              }
            });

            // 2. 扫描所有图片 (过滤过小图标)
            document.querySelectorAll('img').forEach((img) => {
              const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
              if (src && !src.startsWith('data:') && !seen.has(src)) {
                if (img.naturalWidth > 100 || img.naturalHeight > 100 || !img.complete) {
                  seen.add(src);
                  found.push({
                    type: 'image',
                    url: src,
                    name: img.alt || ('图片素材 #' + (found.length + 1)),
                    width: img.naturalWidth || 0,
                    height: img.naturalHeight || 0
                  });
                }
              }
            });

            // 发送给父级工作区
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'MEOCOXFLOW_SNIFFED_MEDIA',
                pageUrl: window.location.href,
                pageTitle: document.title,
                items: found
              }, '*');
            }
          }

          window.addEventListener('DOMContentLoaded', sniffMedia);
          window.addEventListener('load', sniffMedia);
          setTimeout(sniffMedia, 1500);
          setTimeout(sniffMedia, 4000);
          window.addEventListener('scroll', function() {
            clearTimeout(window.__sniffTimer);
            window.__sniffTimer = setTimeout(sniffMedia, 800);
          });
        })();
      </script>
    `;

    $('body').append(injectedScript);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // 确保没有阻止 iframe 嵌入的 header
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');

    res.send($.html());

  } catch (err) {
    const isCloudflare = err.response?.headers?.['server'] === 'cloudflare' || 
                         err.response?.headers?.['cf-mitigated'] === 'challenge' ||
                         err.response?.status === 403 ||
                         err.message?.includes('403');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.status(200).send(renderWafAssistantHtml(targetUrl, err.message, isCloudflare));
  }
});

/**
 * 2. POST /api/proxy/open-external
 * 在 Windows 系统默认浏览器中打开指定目标网址 (Chrome/Edge)
 */
router.post('/open-external', (req, res) => {
  const targetUrl = normalizeUrl(req.body.url);
  if (!targetUrl) {
    return res.status(400).json({ error: '缺少有效的 url 参数' });
  }

  try {
    const sanitized = targetUrl.replace(/'/g, "''");
    execFile('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${sanitized}'`], { windowsHide: true }, () => {});
    res.json({ success: true, message: '已调用系统默认浏览器打开', url: targetUrl });
  } catch (err) {
    res.status(500).json({ error: `打开外部浏览器失败: ${err.message}` });
  }
});

/**
 * 3. POST /api/proxy/sniff
 * 极速深度解析提取指定网页中的所有高质量图片与视频媒体
 */
router.post('/sniff', async (req, res) => {
  const targetUrl = normalizeUrl(req.body.url);
  if (!targetUrl) {
    return res.status(400).json({ error: '缺少有效的 url 参数' });
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: BROWSER_HEADERS,
      timeout: 15000,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const title = $('title').text().trim() || targetUrl;
    const items = [];
    const seen = new Set();

    // 1. 提取视频标签
    $('video').each((i, el) => {
      let src = $(el).attr('src');
      if (!src) {
        src = $(el).find('source').attr('src');
      }
      if (src) {
        try {
          const abs = new URL(src, targetUrl).href;
          if (!seen.has(abs)) {
            seen.add(abs);
            items.push({
              id: `vid_${items.length + 1}`,
              type: 'video',
              url: abs,
              name: `视频 #${items.length + 1}`,
              poster: $(el).attr('poster') ? new URL($(el).attr('poster'), targetUrl).href : ''
            });
          }
        } catch (e) {}
      }
    });

    // 2. 提取超链接中的直接视频资源
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && /\.(mp4|webm|m4v|mov)(\?.*)?$/i.test(href)) {
        try {
          const abs = new URL(href, targetUrl).href;
          if (!seen.has(abs)) {
            seen.add(abs);
            items.push({
              id: `vid_${items.length + 1}`,
              type: 'video',
              url: abs,
              name: path.basename(new URL(abs).pathname) || `视频链接 #${items.length + 1}`
            });
          }
        } catch (e) {}
      }
    });

    // 3. 提取 OpenGraph 大图
    const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
    if (ogImage) {
      try {
        const abs = new URL(ogImage, targetUrl).href;
        if (!seen.has(abs)) {
          seen.add(abs);
          items.push({
            id: `img_og`,
            type: 'image',
            url: abs,
            name: '页面主分享大图 (OG:Image)'
          });
        }
      } catch (e) {}
    }

    // 4. 提取图片标签
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
      if (src && !src.startsWith('data:')) {
        try {
          const abs = new URL(src, targetUrl).href;
          if (!seen.has(abs)) {
            const w = parseInt($(el).attr('width') || '0', 10);
            const h = parseInt($(el).attr('height') || '0', 10);
            if ((w > 120 && h > 120) || (!w && !h)) {
              seen.add(abs);
              items.push({
                id: `img_${items.length + 1}`,
                type: 'image',
                url: abs,
                name: $(el).attr('alt') || `图片 #${items.length + 1}`
              });
            }
          }
        } catch (e) {}
      }
    });

    res.json({
      success: true,
      title,
      targetUrl,
      totalCount: items.length,
      items
    });

  } catch (err) {
    const isCloudflare = err.response?.status === 403 || err.message?.includes('403');
    res.status(500).json({ 
      error: isCloudflare 
        ? '目标网站开启了 Cloudflare 防护盾 (403)，建议使用【外部浏览器打开】并复制链接存盘，或使用【免版权库】' 
        : `嗅探抓取失败: ${err.message}`,
      isCloudflare
    });
  }
});

/**
 * 4. POST /api/proxy/save-asset
 * 将嗅探到的网络多模态素材下载并持久化保存至当前项目本地素材库 (project.assetDir)
 */
router.post('/save-asset', async (req, res) => {
  const { projectId, targetDir: customTargetDir, mediaUrl, downloadUrl, filename: customName, mediaType } = req.body;

  if (!mediaUrl && !downloadUrl) {
    return res.status(400).json({ error: '缺少 mediaUrl 或 downloadUrl 参数' });
  }

  try {
    const pId = projectId || 'proj_1790427845711';
    const project = (await storage.getProject(pId)) || {};

    // 确定目标存储目录：优先传入的选定目录，次选项目专属资料库目录，若未设则存入项目专属 assets 目录
    let targetDir = customTargetDir;
    if (targetDir) {
      if (!fsSync.existsSync(targetDir)) {
        await fs.mkdir(targetDir, { recursive: true });
      }
    } else {
      targetDir = project.assetDir;
      if (!targetDir || !fsSync.existsSync(targetDir)) {
        const projectDir = await storage.getProjectWorkDir(pId);
        targetDir = path.join(projectDir, 'assets');
        if (!fsSync.existsSync(targetDir)) {
          await fs.mkdir(targetDir, { recursive: true });
        }
      }
    }

    // 候选下载 URL 列表（优先 1080P downloadUrl，失败自动回退到 360P/720P mediaUrl）
    const downloadCandidates = [downloadUrl, mediaUrl].filter(Boolean);
    let chosenUrl = downloadCandidates[0];
    let response = null;
    let lastError = null;

    for (const candUrl of downloadCandidates) {
      try {
        const resp = await axios({
          method: 'GET',
          url: candUrl,
          headers: {
            'User-Agent': BROWSER_HEADERS['User-Agent'],
            'Accept': '*/*'
          },
          responseType: 'stream',
          timeout: 45000
        });
        if (resp.status >= 200 && resp.status < 300) {
          response = resp;
          chosenUrl = candUrl;
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[save-asset] 候选源下载失败，尝试备用源: ${candUrl} -> ${err.message}`);
      }
    }

    if (!response) {
      throw new Error(`所有候选源下载均失败: ${lastError ? lastError.message : 'HTTP 状态异常'}`);
    }

    // 严格判断媒体类型与扩展名（防范视频被误存为图片）
    const contentType = (response.headers['content-type'] || '').toLowerCase();
    const urlPathname = new URL(chosenUrl).pathname.toLowerCase();
    let isVideo = mediaType === 'video' || 
                  contentType.includes('video') || 
                  /\.(mp4|webm|mov|m4v|ogv)$/i.test(urlPathname);
    
    let ext = path.extname(urlPathname);
    if (isVideo) {
      if (!['.mp4', '.webm', '.mov', '.m4v'].includes(ext)) {
        ext = '.mp4';
      }
    } else {
      if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) {
        ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
      }
    }

    const finalType = isVideo ? 'video' : 'image';

    // 生成安全文件名
    const cleanBase = (customName || (isVideo ? 'web_video' : 'web_image'))
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 35);
    const finalFilename = `${cleanBase}_${Date.now()}${ext}`;
    const targetFilePath = path.join(targetDir, finalFilename);

    const fileWriteStream = fsSync.createWriteStream(targetFilePath);
    await pipeline(response.data, fileWriteStream);

    // 如果是视频，探针并生成缩略图
    let videoMeta = {};
    if (finalType === 'video') {
      try {
        videoMeta = await probeVideo(targetFilePath);
        await generateThumbnail(targetFilePath);
      } catch (e) {
        console.warn(`[save-asset] 探测视频元数据异常:`, e.message);
      }
    }

    // 注册到项目素材池
    const existingAssets = await storage.getAssets(pId);
    const newAsset = {
      id: `asset_${Date.now()}`,
      name: finalFilename,
      localPath: targetFilePath,
      type: finalType,
      duration: videoMeta.duration || '00:15',
      durationSec: videoMeta.durationSec || 15.0,
      resolution: videoMeta.resolution || (finalType === 'video' ? '1920x1080' : '高清图片'),
      tags: ['网络抓取', finalType === 'video' ? '4K视频' : '网络图片'],
      status: 'ready',
      sourceUrl: chosenUrl,
      downloadedAt: Date.now()
    };

    existingAssets.push(newAsset);
    await storage.saveAssets(pId, existingAssets);

    res.json({
      success: true,
      message: `已成功保存「${finalFilename}」至素材目录`,
      filename: finalFilename,
      savedPath: targetFilePath,
      targetDir,
      asset: newAsset
    });

  } catch (err) {
    console.error('[save-asset] 下载媒体失败:', err);
    res.status(500).json({ error: `保存素材失败: ${err.message}` });
  }
});

/**
 * 丰富的精选本地高频视频与视觉素材库（35+ 真实可用 4K/1080P CC0 镜头，无失效链接）
 */
const EXPANDED_CURATED_DATABASE = [
  {
    "id": "mixkit_47140",
    "title": "Child sitting in a gaming chair while playing video games (游戏实机/电竞竞技)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "游戏实机", "电竞", "电竞高能", "游戏特效", "实机", "操作", "高光时刻", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/47140/47140-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/47140/47140-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/47140/47140-thumb-360-0.jpg",
    "duration": "00:14",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_43527",
    "title": "Hands of a gamer playing on a computer (电竞操作/极限手速)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "游戏实机", "电竞", "电竞高能", "操作", "高光时刻", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/43527/43527-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/43527/43527-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/43527/43527-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_5444",
    "title": "Girl gaming online at home in over the shoulder view (游戏实机/第三人称视界)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "游戏实机", "二次元", "电竞", "实机", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/5444/5444-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/5444/5444-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/5444/5444-thumb-360-0.jpg",
    "duration": "00:13",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_43524",
    "title": "Group of friends having fun playing together online (联机开黑/多人组队)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "游戏实机", "电竞高能", "组队", "开黑", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/43524/43524-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/43524/43524-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/43524/43524-thumb-360-0.jpg",
    "duration": "00:12",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_51612",
    "title": "Young gamer in front of the computer celebrates victory (高光时刻/绝杀庆祝)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "高光时刻", "电竞高能", "绝杀", "胜利", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/51612/51612-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/51612/51612-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/51612/51612-thumb-360-0.jpg",
    "duration": "00:16",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_51608",
    "title": "Gamer pressing backlit mechanical keyboard (电竞高能/外设光效)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "电竞高能", "游戏特效", "光效", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/51608/51608-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/51608/51608-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/51608/51608-thumb-360-0.jpg",
    "duration": "00:14",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_34318",
    "title": "Neon lights in tunnel walls futuristic cyber game style (虚幻引擎/赛博朋克游戏空间)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "虚幻引擎", "赛博朋克", "游戏特效", "科幻机甲", "动作格斗", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/34318/34318-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/34318/34318-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/34318/34318-thumb-360-0.jpg",
    "duration": "00:20",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_52075",
    "title": "Virtual reality VR hands interacting with virtual game world (VR游戏/虚拟现实交互)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "游戏实机", "虚幻引擎", "游戏特效", "二次元", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/52075/52075-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/52075/52075-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/52075/52075-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_19630",
    "title": "Light in the background of a virtual 3D database (科幻机甲/虚幻引擎3D渲染)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "科幻机甲", "虚幻引擎", "游戏特效", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/19630/19630-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/19630/19630-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/19630/19630-thumb-360-0.jpg",
    "duration": "00:18",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_50499",
    "title": "Futuristic cyberpunk lasers and lights (科幻机甲/激光战阵游戏特效)",
    "type": "video",
    "category": "gaming",
    "tags": ["游戏", "游戏特效", "动作格斗", "科幻机甲", "虚幻引擎", "高光时刻", "4K", "Mixkit 4K", "CC0免版税"],
    "url": "https://assets.mixkit.co/videos/50499/50499-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/50499/50499-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/50499/50499-thumb-360-0.jpg",
    "duration": "00:12",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_48525",
    "title": "Aerial view of long running wave crashing onto shore (海洋与海浪)",
    "type": "video",
    "category": "ocean",
    "tags": [
      "海洋与海浪",
      "海浪",
      "自然",
      "空镜",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/48525/48525-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/48525/48525-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/48525/48525-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_15169",
    "title": "Red sunset over the ocean (海洋与海浪)",
    "type": "video",
    "category": "ocean",
    "tags": [
      "海洋与海浪",
      "海浪",
      "自然",
      "空镜",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/15169/15169-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/15169/15169-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/15169/15169-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_15209",
    "title": "Seagulls against the horizon (海洋与海浪)",
    "type": "video",
    "category": "ocean",
    "tags": [
      "海洋与海浪",
      "海浪",
      "自然",
      "空镜",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/15209/15209-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/15209/15209-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/15209/15209-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_44974",
    "title": "Brightly coloured tropical fish swims up close to camera on a reef (海洋与海浪)",
    "type": "video",
    "category": "ocean",
    "tags": [
      "海洋与海浪",
      "海浪",
      "自然",
      "空镜",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/44974/44974-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/44974/44974-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/44974/44974-thumb-360-3.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_44392",
    "title": "Flying low over the sea of a beach (海洋与海浪)",
    "type": "video",
    "category": "ocean",
    "tags": [
      "海洋与海浪",
      "海浪",
      "自然",
      "空镜",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/44392/44392-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/44392/44392-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/44392/44392-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_2213",
    "title": "Waterfall in forest (自然史诗)",
    "type": "video",
    "category": "nature",
    "tags": [
      "自然史诗",
      "森林",
      "山脉",
      "风景",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/2213/2213-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/2213/2213-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/2213/2213-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_41576",
    "title": "Going down a curved highway through a mountain range (自然史诗)",
    "type": "video",
    "category": "nature",
    "tags": [
      "自然史诗",
      "森林",
      "山脉",
      "风景",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/41576/41576-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/41576/41576-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/41576/41576-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_4075",
    "title": "Countryside meadow (自然史诗)",
    "type": "video",
    "category": "nature",
    "tags": [
      "自然史诗",
      "森林",
      "山脉",
      "风景",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/4075/4075-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/4075/4075-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/4075/4075-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_100415",
    "title": "Lush Green Mountains Under Cloudy Skies (自然史诗)",
    "type": "video",
    "category": "nature",
    "tags": [
      "自然史诗",
      "森林",
      "山脉",
      "风景",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/active_storage/video_items/100415/1724198576/100415-video-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/100415/100415-1080.mp4",
    "poster": "https://assets.mixkit.co/active_storage/video_items/100415/1724198576/100415-video-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_51585",
    "title": "Flying over a relaxing creek full of rock on the countryside (自然史诗)",
    "type": "video",
    "category": "nature",
    "tags": [
      "自然史诗",
      "森林",
      "山脉",
      "风景",
      "4K",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/51585/51585-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/51585/51585-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/51585/51585-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_49845",
    "title": "Aerial view of the glass corporate buildings of a big city at night (都市夜景)",
    "type": "video",
    "category": "city",
    "tags": [
      "都市夜景",
      "城市",
      "夜景",
      "霓虹",
      "延时",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/49845/49845-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/49845/49845-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/49845/49845-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_1606",
    "title": "City train driving under a bridge (都市夜景)",
    "type": "video",
    "category": "city",
    "tags": [
      "都市夜景",
      "城市",
      "夜景",
      "霓虹",
      "延时",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/1606/1606-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/1606/1606-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/1606/1606-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_4231",
    "title": "Pedestrian walk in Tokyo (都市夜景)",
    "type": "video",
    "category": "city",
    "tags": [
      "都市夜景",
      "城市",
      "夜景",
      "霓虹",
      "延时",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/4231/4231-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/4231/4231-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/4231/4231-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_49846",
    "title": "Side by side aerial view of a city at night (都市夜景)",
    "type": "video",
    "category": "city",
    "tags": [
      "都市夜景",
      "城市",
      "夜景",
      "霓虹",
      "延时",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/49846/49846-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/49846/49846-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/49846/49846-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_4332",
    "title": "Times Square during a rainy night (都市夜景)",
    "type": "video",
    "category": "city",
    "tags": [
      "都市夜景",
      "城市",
      "夜景",
      "霓虹",
      "延时",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/4332/4332-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/4332/4332-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/4332/4332-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_11007",
    "title": "Big white birds caressing each other (生灵动物)",
    "type": "video",
    "category": "animals",
    "tags": [
      "生灵动物",
      "动物",
      "生态",
      "特写",
      "自然",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/11007/11007-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/11007/11007-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/11007/11007-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_19179",
    "title": "Seagulls on the boardwalk with the sea in the background (生灵动物)",
    "type": "video",
    "category": "animals",
    "tags": [
      "生灵动物",
      "动物",
      "生态",
      "特写",
      "自然",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/19179/19179-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/19179/19179-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/19179/19179-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_1489",
    "title": "Green vailed chameleon seen from one side (生灵动物)",
    "type": "video",
    "category": "animals",
    "tags": [
      "生灵动物",
      "动物",
      "生态",
      "特写",
      "自然",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/1489/1489-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/1489/1489-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/1489/1489-thumb-360-3.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_22732",
    "title": "White cat lying among the grasses seen up close (生灵动物)",
    "type": "video",
    "category": "animals",
    "tags": [
      "生灵动物",
      "动物",
      "生态",
      "特写",
      "自然",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/22732/22732-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/22732/22732-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/22732/22732-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_4285",
    "title": "Camels walking in the desert (生灵动物)",
    "type": "video",
    "category": "animals",
    "tags": [
      "生灵动物",
      "动物",
      "生态",
      "特写",
      "自然",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/4285/4285-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/4285/4285-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/4285/4285-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_308",
    "title": "Man working on his laptop (科技商业)",
    "type": "video",
    "category": "business",
    "tags": [
      "科技商业",
      "科技",
      "商业",
      "现代",
      "办公",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/308/308-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/308/308-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/308/308-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_4809",
    "title": "Business people at work meeting (科技商业)",
    "type": "video",
    "category": "business",
    "tags": [
      "科技商业",
      "科技",
      "商业",
      "现代",
      "办公",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/4809/4809-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/4809/4809-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/4809/4809-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_47005",
    "title": "A lot of cash over a rotating background (科技商业)",
    "type": "video",
    "category": "business",
    "tags": [
      "科技商业",
      "科技",
      "商业",
      "现代",
      "办公",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/47005/47005-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/47005/47005-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/47005/47005-thumb-360-2.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_42648",
    "title": "Business man exposing graphs (科技商业)",
    "type": "video",
    "category": "business",
    "tags": [
      "科技商业",
      "科技",
      "商业",
      "现代",
      "办公",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/42648/42648-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/42648/42648-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/42648/42648-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  },
  {
    "id": "mixkit_4915",
    "title": "Hands of a person typing on a cell phone (科技商业)",
    "type": "video",
    "category": "business",
    "tags": [
      "科技商业",
      "科技",
      "商业",
      "现代",
      "办公",
      "Mixkit 4K",
      "CC0免版税"
    ],
    "url": "https://assets.mixkit.co/videos/4915/4915-360.mp4",
    "downloadUrl": "https://assets.mixkit.co/videos/4915/4915-1080.mp4",
    "poster": "https://assets.mixkit.co/videos/4915/4915-thumb-360-0.jpg",
    "duration": "00:15",
    "resolution": "1920x1080",
    "source": "Mixkit 4K"
  }
];

/**
 * 5. GET /api/proxy/stock
 * 免版权高品质素材推荐与实时海量聚合搜索（Wallhaven 4K、Wikimedia 开放影音、Mixkit 4K 精选）
 * 支持分页 page、每页大小 pageSize、媒体类型 type 过滤
 */
router.get('/stock', async (req, res) => {
  const rawQuery = (req.query.q || '').trim();
  const lowerQuery = rawQuery.toLowerCase();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const filterType = req.query.type || 'all'; // 'all' | 'video' | 'image'

  let aggregated = [];

  // 1. 本地丰富精选库过滤
  if (page === 1) {
    let localMatches = EXPANDED_CURATED_DATABASE.filter(item => {
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (!rawQuery) return true;
      return item.title.toLowerCase().includes(lowerQuery) ||
             item.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
             item.category.toLowerCase().includes(lowerQuery);
    });
    aggregated = [...localMatches];
  }

  // 2. 联网并发拉取 Wallhaven 4K 视觉画廊 (无论是否带搜索词都拉取，保证海量)
  const searchKeyword = rawQuery ? (KEYWORD_MAP[rawQuery] || rawQuery) : '';

  try {
    const promises = [];

    // Wallhaven API (若只选了视频，则跳过图片请求)
    if (filterType !== 'video') {
      const whUrl = searchKeyword 
        ? `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(searchKeyword)}&page=${page}&sorting=relevance`
        : `https://wallhaven.cc/api/v1/search?sorting=toplist&topRange=1M&page=${page}`;

      promises.push(
        axios.get(whUrl, {
          timeout: 6000,
          headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] }
        }).then(r => ({ source: 'wallhaven', data: r.data })).catch(e => ({ source: 'wallhaven', error: e.message }))
      );
    }

    // Wikimedia Commons API (若选了仅图片，则不强制加 filetype:video；针对游戏类检索跳过维基百科以防混入医学文献)
    const isGameQuery = /gaming|gameplay|video game|esports|game/i.test(searchKeyword);
    if (!isGameQuery) {
      const wmVideoQuery = filterType === 'image' 
        ? encodeURIComponent(searchKeyword || 'nature landscape')
        : `filetype:video%20${encodeURIComponent(searchKeyword || 'nature')}`;

      const wmUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${wmVideoQuery}&gsrlimit=20&gsroffset=${(page - 1) * 20}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|mime|thumburl&iiurlwidth=480&format=json&origin=*`;

      promises.push(
        axios.get(wmUrl, {
          timeout: 6000,
          headers: { 'User-Agent': API_CUSTOM_USER_AGENT }
        }).then(r => ({ source: 'wikimedia', data: r.data })).catch(e => ({ source: 'wikimedia', error: e.message }))
      );
    }

    const settled = await Promise.all(promises);

    for (const resObj of settled) {
      if (resObj.source === 'wallhaven' && resObj.data?.data) {
        const whItems = resObj.data.data.map(item => ({
          id: `wh_${item.id}`,
          title: `Wallhaven 4K #${item.id} (${item.resolution || '3840x2160'})`,
          type: 'image',
          category: 'wallpaper',
          tags: (item.tags || []).map(t => t.name).concat(['Wallhaven', '4K', rawQuery || '精选']),
          url: item.path,
          poster: item.thumbs?.small || item.path,
          resolution: item.resolution || '3840x2160',
          source: 'Wallhaven 4K'
        }));
        aggregated = [...aggregated, ...whItems];
      }

      if (resObj.source === 'wikimedia' && resObj.data?.query?.pages) {
        const pages = Object.values(resObj.data.query.pages);
        pages.forEach((p, idx) => {
          const info = p.imageinfo?.[0];
          if (info?.url) {
            const isVid = info.mime?.startsWith('video/') || /\.(webm|mp4|ogv)$/i.test(info.url);
            if (filterType === 'video' && !isVid) return;
            if (filterType === 'image' && isVid) return;

            aggregated.push({
              id: `wm_${p.pageid || idx}_${page}`,
              title: p.title.replace(/^File:/, ''),
              type: isVid ? 'video' : 'image',
              category: 'wikimedia',
              tags: ['Wikimedia Commons', isVid ? '开源视频' : '开源图片', rawQuery || '精选'],
              url: info.url,
              poster: info.thumburl || (isVid ? '' : info.url),
              duration: isVid ? '00:10' : undefined,
              resolution: `${info.width || 1920}x${info.height || 1080}`,
              source: 'Wikimedia Commons'
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('[proxy/stock] 联网聚合素材异常:', err.message);
  }

  // 最终根据类型二次过滤
  if (filterType !== 'all') {
    aggregated = aggregated.filter(i => i.type === filterType);
  }

  res.json({
    success: true,
    query: rawQuery,
    page,
    type: filterType,
    total: aggregated.length,
    count: aggregated.length,
    items: aggregated
  });
});

export default router;
