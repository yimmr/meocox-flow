import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.flv', '.webm', '.ts', '.m4v']);

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Probe video file metadata with ffprobe
 */
export async function probeVideo(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });

    const info = JSON.parse(stdout);
    const videoStream = (info.streams || []).find(s => s.codec_type === 'video');
    const audioStream = (info.streams || []).find(s => s.codec_type === 'audio');

    let fps = 30;
    if (videoStream?.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2 && Number(parts[1]) > 0) {
        fps = Math.round(Number(parts[0]) / Number(parts[1]));
      } else {
        fps = Math.round(Number(parts[0])) || 30;
      }
    }

    const durationSec = Number(info.format?.duration || videoStream?.duration || 0);
    const width = videoStream?.width || 1920;
    const height = videoStream?.height || 1080;

    return {
      durationSec,
      duration: formatDuration(durationSec),
      fps,
      resolution: `${width}x${height}`,
      width,
      height,
      hasAudio: Boolean(audioStream),
      sizeBytes: Number(info.format?.size || 0),
      formatName: info.format?.format_name || 'mp4'
    };
  } catch (err) {
    console.warn(`[probeVideo] ffprobe failed for ${filePath}: ${err.message}`);
    return {
      durationSec: 0,
      duration: '00:00',
      fps: 30,
      resolution: '1920x1080',
      width: 1920,
      height: 1080,
      hasAudio: false,
      sizeBytes: 0,
      formatName: 'mp4'
    };
  }
}

/**
 * Generate thumbnail image for video
 */
export async function generateThumbnail(videoPath, outputPath, timeOffsetSec = 1.0) {
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(timeOffsetSec),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      outputPath
    ], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });
    return true;
  } catch (err) {
    console.warn(`[generateThumbnail] failed: ${err.message}`);
    return false;
  }
}

/**
 * Scan a directory for video files
 */
export async function scanDirectoryForVideos(dirPath, maxDepth = 2) {
  const results = [];

  async function walk(currentDir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dirPath, 1);
  return results;
}

/**
 * Slice video segment using ffmpeg
 */
export async function sliceVideoSegment({ sourcePath, outputPath, startSec, durationSec }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  // Try fast copy first, fallback to encode if keyframe misalignment
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(startSec),
      '-i', sourcePath,
      '-t', String(durationSec),
      '-c', 'copy',
      outputPath
    ]);
  } catch (copyErr) {
    // Fallback: re-encode
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(startSec),
      '-i', sourcePath,
      '-t', String(durationSec),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-c:a', 'aac',
      outputPath
    ]);
  }
  return outputPath;
}
