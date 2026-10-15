/**
 * 极简 JSON-Schema 子集校验器。
 *
 * 项目无 TS 构建链,契约用「schema 对象 + 运行时校验」表达。
 * 支持:type / enum / required / properties / items / minLength / any。
 */

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function walk(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') return;

  // null 视为「空值」:可选字段常用 null 表示无,不应触发类型校验失败。
  if (value === null) return;

  if (schema.type && schema.type !== 'any') {
    const actual = typeOf(value);
    const ok = schema.type === 'integer' ? Number.isInteger(value) : actual === schema.type;
    if (!ok) {
      errors.push(`${path}: 期望 ${schema.type},实际 ${actual}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: 值 ${JSON.stringify(value)} 不在枚举 [${schema.enum.join(', ')}] 内`);
  }

  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
    errors.push(`${path}: 字符串长度不足 ${schema.minLength}`);
  }

  const isObject = typeOf(value) === 'object';
  if (isObject && (schema.properties || schema.required)) {
    for (const req of schema.required || []) {
      if (value[req] === undefined) {
        errors.push(`${path}: 缺少必填字段 "${req}"`);
      }
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) {
        walk(sub, value[key], `${path}.${key}`, errors);
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => walk(schema.items, item, `${path}[${i}]`, errors));
  }
}

/**
 * 校验 value 是否符合 schema。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(schema, value, path = '$') {
  const errors = [];
  walk(schema, value, path, errors);
  return { valid: errors.length === 0, errors };
}

/**
 * 校验失败即抛错,用于工厂函数入口把关。
 * @throws {Error}
 */
export function assertValid(schema, value, label = '契约') {
  const { valid, errors } = validate(schema, value);
  if (!valid) {
    throw new Error(`[${label}] 校验失败: ${errors.join('; ')}`);
  }
  return value;
}