/**
 * 外部 MCP 集成测试开关
 * ─────────────────────────────────────────────────────────────
 * google-flow-mcp 会在连接/诊断过程中拉起真实 Chrome 窗口并走登录流程，
 * 既频繁打断桌面使用，也会让默认测试套件变慢且不稳定。
 *
 * 因此默认跳过，仅在显式开启时运行：
 *   npm test                → 跳过（快速、无副作用）
 *   npm run test:mcp        → 运行（含真实浏览器窗口）
 *   MEOCOX_RUN_MCP_TESTS=1 node --test ...
 */

const ENABLED =
  process.env.MEOCOX_RUN_MCP_TESTS === '1' ||
  process.env.MEOCOX_RUN_MCP_TESTS === 'true';

export const MCP_TESTS_ENABLED = ENABLED;

/** 传给 describe/it 的 skip 选项 */
export const mcpTestSkip = ENABLED
  ? false
  : '需要真实 google-flow MCP（会拉起浏览器窗口），默认跳过。用 npm run test:mcp 开启';

/**
 * 简易断言宏：跳过时不执行测试体，避免任何 MCP 连接副作用。
 * @param {string} name 用例名
 * @param {Function} fn  测试体
 */
export function mcpIt(name, fn) {
  return { name, fn, skip: mcpTestSkip };
}
