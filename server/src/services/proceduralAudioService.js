import fs from 'node:fs';
import path from 'node:path';

/**
 * 极简零依赖 16-bit PCM WAV 音频写入器
 */
export function writeWavFile(filePath, samples, sampleRate = 44100, numChannels = 2) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Chunk
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write 16-bit signed PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intVal = s < 0 ? s * 32768 : s * 32767;
    buffer.writeInt16LE(Math.round(intVal), offset);
    offset += 2;
  }

  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * 程序化生成场景转场 Whoosh 音效 (CC0 / 免版权商业)
 */
export function generateWhooshWav(filePath, durationSec = 0.45, sampleRate = 44100) {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const stereoSamples = new Float32Array(totalSamples * 2);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / totalSamples; // 0 to 1
    // 升降包络 (钟形曲线)
    const env = Math.sin(t * Math.PI) ** 2;
    // 扫频 200Hz -> 800Hz -> 300Hz
    const freq = 200 + Math.sin(t * Math.PI) * 600;
    const phase = 2 * Math.PI * freq * (i / sampleRate);
    const sine = Math.sin(phase) * 0.4;
    // 柔和白噪声
    const noise = (Math.random() * 2 - 1) * 0.35;
    const sample = (sine + noise) * env * 0.8;

    // 左右立体声轻微相位差
    stereoSamples[i * 2] = sample * (1 - t * 0.3);
    stereoSamples[i * 2 + 1] = sample * (0.7 + t * 0.3);
  }

  return writeWavFile(filePath, stereoSamples, sampleRate, 2);
}

/**
 * 程序化生成成功提示音 Chime / Ding (CC0 / 免版权商业)
 */
export function generateChimeWav(filePath, durationSec = 0.8, sampleRate = 44100) {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const stereoSamples = new Float32Array(totalSamples * 2);

  // 基础音高: E5 (659Hz) 和 B5 (987Hz)
  const baseFreq1 = 659.25;
  const baseFreq2 = 987.77;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 4.5); // 指数衰减
    const s1 = Math.sin(2 * Math.PI * baseFreq1 * t) * 0.4;
    const s2 = Math.sin(2 * Math.PI * baseFreq2 * t) * 0.3;
    const harmonic = Math.sin(2 * Math.PI * baseFreq1 * 2 * t) * 0.15;
    const sample = (s1 + s2 + harmonic) * env * 0.7;

    stereoSamples[i * 2] = sample;
    stereoSamples[i * 2 + 1] = sample;
  }

  return writeWavFile(filePath, stereoSamples, sampleRate, 2);
}

/**
 * 程序化生成科技极客氛围 Lo-Fi 背景音乐 (CC0 / 免版权商业)
 */
export function generateTechAmbientBgm(filePath, durationSec = 20, sampleRate = 44100) {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const stereoSamples = new Float32Array(totalSamples * 2);

  // 和弦主频: Dm9 (D3=146.8, F3=174.6, A3=220.0, C4=261.6, E4=329.6)
  const chords = [
    [146.83, 220.00, 329.63], // Dm
    [130.81, 196.00, 261.63], // C
    [116.54, 174.61, 261.63], // Bb
    [130.81, 196.00, 293.66]  // C
  ];

  const chordDur = 4.0; // 每个和弦 4 秒

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.floor(t / chordDur) % chords.length;
    const currentChord = chords[chordIdx];

    // 和弦合成 + 慢速 LFO 调制 (0.2Hz)
    const lfo = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.25 * t);
    let chordSignal = 0;
    for (const f of currentChord) {
      chordSignal += Math.sin(2 * Math.PI * f * t) * 0.12;
    }

    // 科技感底鼓微脉冲 (每 1 秒一次，柔和低频咚)
    const beatTime = t % 1.0;
    const kick = beatTime < 0.1 ? Math.sin(2 * Math.PI * (60 - beatTime * 300) * beatTime) * Math.exp(-beatTime * 30) * 0.25 : 0;

    // 整体淡入淡出 (前 1s 淡入，最后 1.5s 淡出)
    let masterEnv = 1;
    if (t < 1.0) masterEnv = t;
    else if (t > durationSec - 1.5) masterEnv = Math.max(0, (durationSec - t) / 1.5);

    const val = (chordSignal * lfo + kick) * masterEnv * 0.6;

    stereoSamples[i * 2] = val;
    stereoSamples[i * 2 + 1] = val;
  }

  return writeWavFile(filePath, stereoSamples, sampleRate, 2);
}
