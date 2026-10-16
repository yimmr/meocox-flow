import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * 将本地文件物理路径安全映射为 Tauri asset:// 零拷贝流式协议 URL
 * @param localPath 宿主物理文件路径
 */
export function getAssetUrl(localPath: string): string {
  if (!localPath) return '';
  return convertFileSrc(localPath, 'asset');
}
