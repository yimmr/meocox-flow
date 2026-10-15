/**
 * Lineage:产物谱系图 + 影响面分析。
 *
 * 工业级返工的地基:当某个上游产物发生变化,
 * 沿 lineage 反向找出所有依赖它的任务 / 产物,给出「最小重算集」,
 * 避免整条流水线从头再来。
 */

/**
 * 从一批产物索引构建 lineage 反向图。
 * @param {Array} artifactIndexes 项目全部产物索引(含 versions[].lineage)
 * @returns {{artifactIndexes:Array, byId:Map, dependentsOf:(ref)=>string[]}}
 */
export function buildLineageGraph(artifactIndexes = []) {
  const byId = new Map(artifactIndexes.map((a) => [a.id, a]));

  /** 反向边:providerArtifactId -> Set<dependentArtifactId> */
  const dependents = new Map();
  for (const art of artifactIndexes) {
    for (const meta of art.versions || []) {
      for (const ref of meta.lineage || []) {
        if (!ref?.artifactId) continue;
        if (!dependents.has(ref.artifactId)) dependents.set(ref.artifactId, new Set());
        dependents.get(ref.artifactId).add(art.id);
      }
    }
  }

  const dependentsOf = (ref) => Array.from(dependents.get(ref.artifactId) || []);

  return { artifactIndexes, byId, dependentsOf, _dependents: dependents };
}

/**
 * 计算影响面:给定一个变更产物 ref,返回所有直接/间接下游产物 id。
 * 使用 BFS,天然处理环(visited 去重)。
 * @param {ReturnType<typeof buildLineageGraph>} graph
 * @param {{artifactId:string, version?:number}} ref
 * @returns {string[]} 受影响的下游产物 id(不含自身)
 */
export function computeImpact(graph, ref) {
  const affected = new Set();
  const queue = [...graph.dependentsOf(ref)];
  while (queue.length) {
    const id = queue.shift();
    if (affected.has(id)) continue;
    affected.add(id);
    for (const next of graph.dependentsOf({ artifactId: id })) {
      if (!affected.has(next)) queue.push(next);
    }
  }
  return Array.from(affected);
}

/**
 * 从产物 id 集合映射回需要重跑的任务 id 集合。
 * @param {Array} artifactIndexes
 * @param {string[]} affectedArtifactIds
 * @returns {string[]}
 */
export function artifactsToTasks(artifactIndexes, affectedArtifactIds) {
  const tasks = new Set();
  for (const art of artifactIndexes) {
    if (!affectedArtifactIds.includes(art.id)) continue;
    const latest = art.versions?.find((v) => v.version === art.currentVersion) || art.versions?.at(-1);
    if (latest?.producedBy?.taskId) tasks.add(latest.producedBy.taskId);
  }
  return Array.from(tasks);
}

/**
 * 组合入口:计算某个变更产物的「影响报告」。
 * @param {Array} artifactIndexes
 * @param {{artifactId:string, version?:number}} ref
 * @returns {{affectedArtifacts:string[], affectedTasks:string[], recomputeSet:string[]}}
 */
export function analyzeImpact(artifactIndexes, ref) {
  const graph = buildLineageGraph(artifactIndexes);
  const affectedArtifacts = computeImpact(graph, ref);
  const affectedTasks = artifactsToTasks(artifactIndexes, affectedArtifacts);
  return {
    affectedArtifacts,
    affectedTasks,
    // 最小重算集:受影响产物对应的任务
    recomputeSet: affectedTasks
  };
}