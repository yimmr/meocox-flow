/**
 * 项目 ID 提取中间件。
 *
 * 此前各路由普遍使用 `req.query.projectId || 'proj_wukong_01'` 兜底，
 * 漏传时会静默操作同一个魔法项目，掩盖调用缺陷。现在统一在入口校验，
 * 缺失即返回 400，不再有任何隐式兜底。
 */
import { requireProjectId } from '../storage/index.js';

/**
 * 挂载 req.projectId。若缺失则直接 400 并终止后续处理。
 * @param {'query'|'body'|'either'} source 取值来源
 * @param {string} param 参与请求的路由前缀，仅用于错误信息
 */
export function requireProjectIdMiddleware(source = 'query', param = '') {
  return (req, res, next) => {
    const fromQuery = req.query?.projectId;
    const fromBody = req.body?.projectId;
    const candidate = source === 'query' ? fromQuery : source === 'body' ? fromBody : (fromBody || fromQuery);

    try {
      req.projectId = requireProjectId(candidate, `${req.method} ${param}`.trim());
      next();
    } catch (err) {
      res.status(400).json({ error: err.message, missingParam: 'projectId' });
    }
  };
}

export default requireProjectIdMiddleware;
