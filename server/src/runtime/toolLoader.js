import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';

/**
 * 确保自定义工具目录存在，若首次创建则自动放置 README 规范指引
 */
export async function ensureCustomToolsDir() {
  const toolsDir = config.paths.userToolsDir || path.join(config.paths.dataDir, 'tools');
  if (!fsSync.existsSync(toolsDir)) {
    await fs.mkdir(toolsDir, { recursive: true });
  }

  // 保证有规范说明 README.md
  const readmePath = path.join(toolsDir, 'README.md');
  if (!fsSync.existsSync(readmePath)) {
    const readmeContent = `# Meocox Flow 自定义工具目录 (Custom Tools)

在此目录下放置自定义工具定义文件，Meocox Flow 将在启动或点击设置刷新时自动感知并提供给智能体调用。

## 工具规范 (Tool Specification)

每个自定义工具可以是一个独立的 \`.json\` 文件（例如 \`my_tool.json\`），也可以是一个包含 \`tool.json\` 的专属文件夹。

### 标准 JSON 规范示例
\`\`\`json
{
  "name": "custom_asset_cleaner",
  "description": "自定义素材清洗工具：用于去除素材噪点或特定局部水印",
  "parameters": {
    "type": "object",
    "properties": {
      "assetId": {
        "type": "string",
        "description": "待处理的素材ID或本地绝对路径"
      },
      "mode": {
        "type": "string",
        "description": "清洗模式，可选 fast 或 quality"
      }
    },
    "required": ["assetId"]
  }
}
\`\`\`

- **name**: 工具唯一标识（仅限小写英文、数字与下划线）
- **description**: 功能说明（供大模型理解何时调用）
- **parameters**: 符合 JSON Schema 标准的入参对象描述
`;
    try {
      await fs.writeFile(readmePath, readmeContent, 'utf-8');
    } catch (_) {}
  }

  return toolsDir;
}

/**
 * 从磁盘扫描并加载所有用户自定义工具到 MCPHub
 * @param {import('./mcpHub.js').MCPHub} hub
 */
export async function loadCustomToolsFromDisk(hub) {
  try {
    const toolsDir = await ensureCustomToolsDir();
    const entries = await fs.readdir(toolsDir, { withFileTypes: true });

    for (const entry of entries) {
      // 1. 扫描单文件 *.json (排除系统与规范文档)
      if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.json') &&
        !entry.name.toLowerCase().endsWith('.sample.json') &&
        entry.name.toLowerCase() !== 'package.json'
      ) {
        const fullPath = path.join(toolsDir, entry.name);
        try {
          const raw = await fs.readFile(fullPath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed.name) {
            hub.registerLocalTool({
              name: parsed.name,
              description: parsed.description || '',
              parameters: parsed.parameters || { type: 'object', properties: {} },
              handler: async (args, context) => {
                return { success: true, message: `自定义工具「${parsed.name}」已执行`, args };
              },
              custom: true,
              filePath: fullPath
            });
          }
        } catch (err) {
          console.warn(`[toolLoader] 解析自定义工具「${entry.name}」失败:`, err.message);
        }
      }
      // 2. 扫描子目录 tool_name/tool.json
      // 2. 扫描子目录 tool_name/tool.json (+ 可选 index.js 执行脚本)
      else if (entry.isDirectory()) {
        const subDir = path.join(toolsDir, entry.name);
        const jsonPath = path.join(subDir, 'tool.json');
        if (fsSync.existsSync(jsonPath)) {
          try {
            const raw = await fs.readFile(jsonPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.name) {
              const indexPath = path.join(subDir, 'index.js');
              let handler = async (args, context) => {
                return { success: true, message: `自定义工具「${parsed.name}」已执行`, args };
              };

              // 若目录下存在 index.js，则动态加载真实执行逻辑
              if (fsSync.existsSync(indexPath)) {
                try {
                  const fileUrl = `${pathToFileURL(indexPath).href}?t=${Date.now()}`;
                  const mod = await import(fileUrl);
                  const fn = mod.default || mod.run || mod.execute;
                  if (typeof fn === 'function') {
                    handler = async (args, context) => {
                      return await fn(args, context);
                    };
                  }
                } catch (loadErr) {
                  console.warn(`[toolLoader] 加载工具逻辑「${indexPath}」失败:`, loadErr.message);
                }
              }

              hub.registerLocalTool({
                name: parsed.name,
                description: parsed.description || '',
                parameters: parsed.parameters || parsed.inputSchema || { type: 'object', properties: {} },
                handler,
                custom: true,
                filePath: jsonPath
              });
            }
          } catch (err) {
            console.warn(`[toolLoader] 解析自定义工具目录「${entry.name}」失败:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[toolLoader] 加载自定义工具异常:', err.message);
  }
}
