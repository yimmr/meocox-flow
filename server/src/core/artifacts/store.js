/**
 * ArtifactStore:版本化产物仓库。
 *
 * 取代「算子直接覆写 storyboard.json」的旧模式:
 *   每次产出 = 追加一个不可变版本(带 hash / lineage / 生产者),
 *   索引文件记录 versions[],便于 Diff / 追溯 / 影响面分析。
 *
 * 底层复用 storage 的原子写与项目工作区。
 */
import { storage } from '../../storage/index.js';
import { ARTIFACT_KINDS } from '../contracts/enums.js';
import { ulid, hashPayload } from '../contracts/ids.js';

export class ArtifactStore {
  constructor(store = storage) {
    this.storage = store;
  }

  /**
   * 产出一个产物版本。
   * @param {string} projectId
   * @param {object} input
   * @param {string} [input.artifactId] 已有产物则追加版本,否则新建
   * @param {string} input.kind           ArtifactKind
   * @param {*} input.payload             内容
   * @param {Array} [input.lineage]       ArtifactRef[](来源产物)
   * @param {object} [input.producedBy]   { taskId, agentId, operatorId }
   * @param {string} [input.schemaId]     如 'schema.storyboard@1'
   * @param {string} [input.status]       'draft' | 'approved'
   * @returns {Promise<{artifact, versionMeta, hash, isNew}>}
   */
  async produce(projectId, {
    artifactId,
    kind,
    payload,
    lineage = [],
    producedBy = {},
    schemaId = null,
    status = 'draft'
  }) {
    if (!ARTIFACT_KINDS.includes(kind)) {
      throw new Error(`[ArtifactStore] 未知的产物类型: ${kind}`);
    }

    const hash = hashPayload(payload);
    let index = artifactId
      ? await this.storage.getArtifactIndex(projectId, kind, artifactId)
      : null;
    const isNew = !index;

    if (isNew) {
      artifactId = artifactId || ulid('art');
      index = {
        id: artifactId,
        projectId,
        kind,
        currentVersion: 0,
        status: 'draft',
        versions: []
      };
    }

    // 内容相同则复用当前版本(幂等:重复执行不产生新版本)
    const current = index.versions.find((v) => v.version === index.currentVersion);
    if (current && current.hash === hash) {
      return { artifact: index, versionMeta: current, hash, isNew: false, deduped: true };
    }

    const version = index.currentVersion + 1;
    const payloadRef = `artifacts/${kind}/${artifactId}/v${version}.json`;
    const versionMeta = {
      version,
      hash,
      schemaId: schemaId || `schema.${kind}@1`,
      lineage: [...lineage],
      producedBy: { taskId: null, agentId: null, operatorId: null, ...producedBy },
      createdAt: Date.now(),
      payloadRef
    };

    await this.storage.saveArtifactVersion(projectId, kind, artifactId, version, payload);
    index.currentVersion = version;
    index.status = status;
    index.versions.push(versionMeta);
    await this.storage.saveArtifactIndex(projectId, index);

    return { artifact: index, versionMeta, hash, isNew };
  }

  /** 读取指定产物索引(可带版本,便于取历史 payload) */
  async get(projectId, kind, artifactId, version = null) {
    const index = await this.storage.getArtifactIndex(projectId, kind, artifactId);
    if (!index) return null;
    const v = version || index.currentVersion;
    const payload = await this.storage.getArtifactVersion(projectId, kind, artifactId, v);
    return { index, version: v, payload };
  }

  /** 读取某版本 content 对应的 ArtifactRef */
  refOf(index, version = null) {
    const v = version || index.currentVersion;
    const meta = index.versions.find((m) => m.version === v);
    return { artifactId: index.id, version: v, hash: meta?.hash };
  }

  /** 列出某 kind 下全部产物索引 */
  async listByKind(projectId, kind) {
    return this.storage.listArtifacts(projectId, kind);
  }

  /** 列出项目全部产物索引(遍历所有 kind) */
  async listAll(projectId) {
    const all = [];
    for (const kind of ARTIFACT_KINDS) {
      const items = await this.storage.listArtifacts(projectId, kind).catch(() => []);
      all.push(...items);
    }
    return all;
  }

  /** 标记产物为过期(返工影响面命中时调用) */
  async markStale(projectId, kind, artifactId) {
    const index = await this.storage.getArtifactIndex(projectId, kind, artifactId);
    if (!index) return null;
    index.status = 'stale';
    await this.storage.saveArtifactIndex(projectId, index);
    return index;
  }

  /** 审批通过产物 */
  async approve(projectId, kind, artifactId, version = null) {
    const index = await this.storage.getArtifactIndex(projectId, kind, artifactId);
    if (!index) return null;
    index.status = 'approved';
    await this.storage.saveArtifactIndex(projectId, index);
    return index;
  }
}

export const defaultArtifactStore = new ArtifactStore();