import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { perceptionStorage } from './storage.js';

// Common Chinese & English stop tokens
const STOP_WORDS = new Set([
  '的', '了', '和', '是', '就', '都', '而', '及', '与', '着', '或', '一', '在', '上', '下',
  '个', '为', '之', '也', '但', '于', '即', '被', '从', '以', '到', '有', '无', '等',
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is'
]);

/**
 * Robust Multimodal Tokenizer for Chinese, English & numbers
 */
export function tokenizeText(text) {
  if (!text || typeof text !== 'string') return [];
  const normalized = text
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
    .trim();

  const tokens = [];
  const words = normalized.split(/\s+/).filter(Boolean);

  for (const word of words) {
    // English words and alphanumeric tokens
    if (/^[a-z0-9_-]+$/.test(word)) {
      if (word.length >= 2 && !STOP_WORDS.has(word)) {
        tokens.push(word);
      }
      continue;
    }

    // Chinese characters and n-grams
    const chars = Array.from(word);
    for (let i = 0; i < chars.length; i++) {
      const c1 = chars[i];
      if (!STOP_WORDS.has(c1) && !/^\s+$/.test(c1)) {
        tokens.push(c1);
      }
      // Bigrams (2-gram)
      if (i + 1 < chars.length) {
        const bi = c1 + chars[i + 1];
        tokens.push(bi);
      }
      // Trigrams (3-gram)
      if (i + 2 < chars.length) {
        const tri = c1 + chars[i + 1] + chars[i + 2];
        tokens.push(tri);
      }
    }
  }

  return tokens;
}

/**
 * Zero-Setup Embedded Semantic Search Engine
 */
export class SemanticSearchEngine {
  constructor({ storage = perceptionStorage } = {}) {
    this.storage = storage;
    this.indexPath = path.join(this.storage.storageRoot, 'search_index.json');
    this.documents = new Map(); // mediaId -> { mediaId, mediaType, termWeights, norm, meta, perception, textSummary }
    this.df = new Map(); // term -> document frequency
    this.totalDocs = 0;
    this.isInitialized = false;
    this.saveTimer = null;
  }

  /**
   * Initialize or load index from CAS storage
   */
  async init() {
    if (this.isInitialized) return;
    try {
      if (fsSync.existsSync(this.indexPath)) {
        const raw = await fs.readFile(this.indexPath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.documents && Array.isArray(data.documents)) {
          for (const doc of data.documents) {
            this.documents.set(doc.mediaId, doc);
          }
          this.rebuildDf();
          this.isInitialized = true;
          return;
        }
      }
    } catch {}

    // Fallback: build from disk
    await this.rebuildIndex();
    this.isInitialized = true;
  }

  /**
   * Extract weighted text fields from media perception
   */
  extractDocumentFields(mediaId, meta, perception) {
    const fields = [];
    const highlights = [];

    // 1. Filename (Weight 2.5)
    if (meta?.filename) {
      fields.push({ text: meta.filename, weight: 2.5, name: 'filename' });
    }

    // 2. Video perception
    if (perception?.video) {
      const v = perception.video;
      if (v.summary) fields.push({ text: v.summary, weight: 2.5, name: 'summary' });
      if (v.visualActions) fields.push({ text: v.visualActions, weight: 2.8, name: 'visualActions' });
      if (v.gameOrScene) fields.push({ text: v.gameOrScene, weight: 2.2, name: 'gameOrScene' });
      if (v.charactersAndCreatures) fields.push({ text: v.charactersAndCreatures, weight: 2.0, name: 'characters' });
      if (v.atmosphereAndLighting) fields.push({ text: v.atmosphereAndLighting, weight: 1.8, name: 'atmosphere' });
      if (v.cinematicValue) fields.push({ text: v.cinematicValue, weight: 2.2, name: 'cinematicValue' });
      if (Array.isArray(v.tags)) {
        fields.push({ text: v.tags.join(' '), weight: 3.0, name: 'tags' });
      }
      if (Array.isArray(v.scenes)) {
        const sceneTexts = v.scenes.map(s => `${s.sceneName || ''} ${s.description || ''}`).join(' ');
        fields.push({ text: sceneTexts, weight: 1.8, name: 'scenes' });
      }
      if (v.visualActions) highlights.push(v.visualActions);
      if (v.cinematicValue) highlights.push(v.cinematicValue);
    }

    // 3. Audio perception
    if (perception?.audio) {
      const a = perception.audio;
      if (a.summary) fields.push({ text: a.summary, weight: 2.5, name: 'summary' });
      if (a.roleLabel) fields.push({ text: a.roleLabel, weight: 2.5, name: 'audioRole' });
      if (Array.isArray(a.moods)) fields.push({ text: a.moods.join(' '), weight: 2.5, name: 'moods' });
      if (Array.isArray(a.tags)) fields.push({ text: a.tags.join(' '), weight: 3.0, name: 'tags' });
      if (a.bpm) fields.push({ text: `${a.bpm} BPM`, weight: 2.0, name: 'bpm' });
      if (a.roleLabel) highlights.push(`${a.roleLabel} (${a.bpm || 120} BPM)`);
    }

    // 4. Image perception
    if (perception?.image) {
      const im = perception.image;
      if (im.caption) fields.push({ text: im.caption, weight: 2.5, name: 'caption' });
      if (im.themeOrScene) fields.push({ text: im.themeOrScene, weight: 2.2, name: 'themeOrScene' });
      if (im.visualElements) fields.push({ text: im.visualElements, weight: 2.0, name: 'visualElements' });
      if (Array.isArray(im.ocrText) && im.ocrText.length > 0) {
        fields.push({ text: im.ocrText.join(' '), weight: 2.8, name: 'ocrText' });
        highlights.push(`OCR: ${im.ocrText.slice(0, 3).join(', ')}`);
      }
      if (Array.isArray(im.tags)) {
        fields.push({ text: im.tags.join(' '), weight: 3.0, name: 'tags' });
      }
      if (im.caption) highlights.push(im.caption);
    }

    // 5. Editorial advice
    if (perception?.editorialAdvice) {
      const ed = perception.editorialAdvice;
      const adviceText = [ed.hookPotential, ed.suggestedRole, ed.cutStrategy].filter(Boolean).join(' ');
      if (adviceText) {
        fields.push({ text: adviceText, weight: 2.0, name: 'editorialAdvice' });
      }
    }

    return { fields, highlights };
  }

  /**
   * Index or update a single asset
   */
  async indexAsset(mediaId, meta = null, perception = null) {
    if (!meta) meta = await this.storage.readMeta(mediaId);
    if (!perception) perception = await this.storage.readPerception(mediaId);
    if (!meta && !perception) return;

    const { fields, highlights } = this.extractDocumentFields(mediaId, meta, perception);

    // Compute raw term frequencies with field weights
    const termMap = {};
    for (const field of fields) {
      const tokens = tokenizeText(field.text);
      for (const t of tokens) {
        termMap[t] = (termMap[t] || 0) + field.weight;
      }
    }

    // Store document entry
    const docEntry = {
      mediaId,
      mediaType: meta?.mediaType || perception?.mediaType || 'video',
      filename: meta?.filename || '',
      originalPath: meta?.originalPath || meta?.fileInfo?.originalPath || '',
      termWeights: termMap,
      highlights: highlights.slice(0, 3),
      tags: perception?.video?.tags || perception?.audio?.tags || perception?.image?.tags || [],
      summary: perception?.video?.summary || perception?.audio?.summary || perception?.image?.caption || meta?.filename || ''
    };

    this.documents.set(mediaId, docEntry);
    this.rebuildDf();
    this.scheduleSave();
  }

  /**
   * Remove asset from index
   */
  removeAsset(mediaId) {
    if (this.documents.has(mediaId)) {
      this.documents.delete(mediaId);
      this.rebuildDf();
      this.scheduleSave();
    }
  }

  /**
   * Rebuild Document Frequency (DF) map
   */
  rebuildDf() {
    this.df.clear();
    this.totalDocs = this.documents.size;

    for (const doc of this.documents.values()) {
      const seen = new Set(Object.keys(doc.termWeights || {}));
      for (const t of seen) {
        this.df.set(t, (this.df.get(t) || 0) + 1);
      }
    }

    // Pre-calculate L2 Norm for all documents with BM25/TF-IDF
    for (const doc of this.documents.values()) {
      let sumSq = 0;
      for (const [term, tf] of Object.entries(doc.termWeights || {})) {
        const idf = Math.log(1 + (this.totalDocs - (this.df.get(term) || 0) + 0.5) / ((this.df.get(term) || 0) + 0.5));
        const weight = tf * (idf > 0 ? idf : 0.1);
        sumSq += weight * weight;
      }
      doc.norm = Math.sqrt(sumSq) || 1.0;
    }
  }

  /**
   * Rebuild entire index from CAS storage root
   */
  async rebuildIndex() {
    this.documents.clear();
    const stats = await this.storage.getStorageStats();
    let entries = [];
    try {
      entries = await fs.readdir(this.storage.storageRoot, { withFileTypes: true });
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const mediaId = entry.name;
        const meta = await this.storage.readMeta(mediaId);
        const perception = await this.storage.readPerception(mediaId);
        if (meta || perception) {
          const { fields, highlights } = this.extractDocumentFields(mediaId, meta, perception);
          const termMap = {};
          for (const field of fields) {
            const tokens = tokenizeText(field.text);
            for (const t of tokens) {
              termMap[t] = (termMap[t] || 0) + field.weight;
            }
          }
          this.documents.set(mediaId, {
            mediaId,
            mediaType: meta?.mediaType || perception?.mediaType || 'video',
            filename: meta?.filename || '',
            originalPath: meta?.originalPath || meta?.fileInfo?.originalPath || '',
            termWeights: termMap,
            highlights: highlights.slice(0, 3),
            tags: perception?.video?.tags || perception?.audio?.tags || perception?.image?.tags || [],
            summary: perception?.video?.summary || perception?.audio?.summary || perception?.image?.caption || meta?.filename || ''
          });
        }
      }
    }

    this.rebuildDf();
    await this.persistIndex();
  }

  /**
   * Search index with query and options
   * @param {string} query Search terms (natural language)
   * @param {object} [options]
   * @param {string} [options.mediaType] Filter by 'video'|'audio'|'image'
   * @param {string[]} [options.candidatePaths] Restrict to specific file paths
   * @param {number} [options.minScore=0.03]
   * @param {number} [options.limit=50]
   * @returns {Promise<Array<object>>} Ranked search results
   */
  async search(query, options = {}) {
    await this.init();
    if (!query || !query.trim()) return [];

    const queryTokens = tokenizeText(query);
    if (queryTokens.length === 0) return [];

    // Build query vector
    const queryTermMap = {};
    for (const t of queryTokens) {
      queryTermMap[t] = (queryTermMap[t] || 0) + 1;
    }

    let querySumSq = 0;
    for (const [term, count] of Object.entries(queryTermMap)) {
      const idf = Math.log(1 + (this.totalDocs - (this.df.get(term) || 0) + 0.5) / ((this.df.get(term) || 0) + 0.5));
      const w = count * (idf > 0 ? idf : 0.1);
      querySumSq += w * w;
    }
    const queryNorm = Math.sqrt(querySumSq) || 1.0;

    const results = [];
    const minScore = options.minScore !== undefined ? options.minScore : 0.03;
    const candidateSet = options.candidatePaths && Array.isArray(options.candidatePaths)
      ? new Set(options.candidatePaths.map(p => path.resolve(p).toLowerCase()))
      : null;
    const candidateMediaIdSet = options.candidateMediaIds && Array.isArray(options.candidateMediaIds)
      ? new Set(options.candidateMediaIds.map(id => String(id).trim()))
      : null;

    for (const doc of this.documents.values()) {
      // 1. Filter by mediaType
      if (options.mediaType && options.mediaType !== 'all' && doc.mediaType !== options.mediaType) {
        continue;
      }

      // 2. Filter by candidatePaths or candidateMediaIds if provided
      if (candidateSet || candidateMediaIdSet) {
        const docResolved = doc.originalPath ? path.resolve(doc.originalPath).toLowerCase() : '';
        const pathMatches = candidateSet && docResolved && candidateSet.has(docResolved);
        const mediaIdMatches = candidateMediaIdSet && candidateMediaIdSet.has(doc.mediaId);
        if (!pathMatches && !mediaIdMatches) {
          continue;
        }
      }

      // 3. Compute Cosine Similarity
      let dotProduct = 0;
      const matchedTerms = [];

      for (const [qTerm, qCount] of Object.entries(queryTermMap)) {
        if (doc.termWeights && doc.termWeights[qTerm]) {
          const idf = Math.log(1 + (this.totalDocs - (this.df.get(qTerm) || 0) + 0.5) / ((this.df.get(qTerm) || 0) + 0.5));
          const effectiveIdf = idf > 0 ? idf : 0.1;
          const qWeight = qCount * effectiveIdf;
          const docWeight = doc.termWeights[qTerm] * effectiveIdf;
          dotProduct += qWeight * docWeight;
          matchedTerms.push(qTerm);
        }
      }

      if (dotProduct <= 0) continue;

      let score = dotProduct / (queryNorm * (doc.norm || 1.0));

      // Direct tag bonus: if query terms or exact query match tags, boost score
      const queryTrim = query.trim().toLowerCase();
      const hasTagMatch = doc.tags && doc.tags.some(t => {
        const tl = t.toLowerCase();
        return queryTrim.includes(tl) || tl.includes(queryTrim) || matchedTerms.some(m => m.length >= 2 && tl.includes(m));
      });
      if (hasTagMatch) {
        score = Math.min(1.0, score * 1.35 + 0.15);
      }

      // Filename bonus
      if (doc.filename && doc.filename.toLowerCase().includes(queryTrim)) {
        score = Math.min(1.0, score * 1.25 + 0.1);
      }

      if (score >= minScore) {
        // Calibrate confidence percentage for intuitive user display
        let scorePercent;
        if (score >= 0.4) {
          scorePercent = Math.min(99, Math.round(85 + (score - 0.4) * 25));
        } else if (score >= 0.18) {
          scorePercent = Math.min(84, Math.round(65 + (score - 0.18) * 90));
        } else {
          scorePercent = Math.max(15, Math.round(score * 350));
        }

        results.push({
          mediaId: doc.mediaId,
          mediaType: doc.mediaType,
          filename: doc.filename,
          originalPath: doc.originalPath,
          score: Number(score.toFixed(4)),
          scorePercent,
          matchedTerms: Array.from(new Set(matchedTerms)),
          highlights: doc.highlights || [],
          tags: doc.tags || [],
          summary: doc.summary || ''
        });
      }
    }

    // Sort descending by relevance score
    results.sort((a, b) => b.score - a.score);

    const limit = options.limit || 50;
    return results.slice(0, limit);
  }

  /**
   * Debounced index persistence to disk
   */
  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.persistIndex().catch(() => {});
    }, 1500);
  }

  async persistIndex() {
    try {
      const data = {
        updatedAt: Date.now(),
        count: this.documents.size,
        documents: Array.from(this.documents.values())
      };
      await fs.writeFile(this.indexPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
  }
}

export const semanticSearchEngine = new SemanticSearchEngine();
