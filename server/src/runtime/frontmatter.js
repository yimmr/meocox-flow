export function parseYaml(yamlBlock) {
  if (!yamlBlock) return {};
  const meta = {};
  let currentKey = null;

  for (const rawLine of yamlBlock.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check if line is a list item: - item
    if (trimmed.startsWith('- ') && currentKey) {
      const itemVal = trimmed.slice(2).trim().replace(/^['"]|['"]$/g, '');
      if (!Array.isArray(meta[currentKey])) {
        meta[currentKey] = [];
      }
      meta[currentKey].push(itemVal);
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();
    currentKey = key;

    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else if (val === '') {
      // Might be start of multi-line list
      meta[key] = [];
    } else {
      meta[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }

  // Convert empty arrays that had no items to null/string if val was empty or leave as array
  return meta;
}

export function stringifyYaml(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}: [${v.join(', ')}]`;
      }
      return `${k}: ${v}`;
    })
    .join('\n');
}

/**
 * Lightweight frontmatter parser
 * Parses YAML frontmatter between --- blocks and returns { meta, body }
 */
export function parseFrontmatter(text) {
  if (!text) return { meta: {}, body: '' };

  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = text.match(frontmatterRegex);

  if (!match) {
    return { meta: {}, body: text.trim() };
  }

  const yamlBlock = match[1];
  const body = match[2].trim();
  const meta = parseYaml(yamlBlock);

  return { meta, body };
}
