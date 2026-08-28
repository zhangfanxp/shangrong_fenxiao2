"use client";

import { Mp3Encoder } from "@breezystack/lamejs";

const MP3_BIT_RATE = 96;
const MP3_SAMPLE_BLOCK = 1152;

function int16Sample(value: number) {
  const normalized = Math.max(-1, Math.min(1, value));
  return normalized < 0 ? Math.round(normalized * 32768) : Math.round(normalized * 32767);
}

export async function encodeRecordingAsMp3(input: {
  source: Blob;
  learningDate: string;
  onProgress?: (percent: number) => void;
}) {
  const audioContext = new AudioContext();
  try {
    const audio = await audioContext.decodeAudioData(await input.source.arrayBuffer());
    if (!audio.length || !audio.numberOfChannels) throw new Error("未录制到有效声音");
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
    const encoder = new Mp3Encoder(1, audio.sampleRate, MP3_BIT_RATE);
    const chunks: BlobPart[] = [];
    let blockIndex = 0;
    const blockTotal = Math.ceil(audio.length / MP3_SAMPLE_BLOCK);
    for (let offset = 0; offset < audio.length; offset += MP3_SAMPLE_BLOCK) {
      const length = Math.min(MP3_SAMPLE_BLOCK, audio.length - offset);
      const samples = new Int16Array(length);
      for (let index = 0; index < length; index += 1) {
        let mixed = 0;
        for (const channel of channels) mixed += channel[offset + index] || 0;
        samples[index] = int16Sample(mixed / channels.length);
      }
      const encoded = encoder.encodeBuffer(samples);
      if (encoded.length) chunks.push(new Uint8Array(encoded).buffer);
      blockIndex += 1;
      input.onProgress?.(Math.min(95, Math.round(blockIndex / blockTotal * 95)));
      if (blockIndex % 80 === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    }
    const flushed = encoder.flush();
    if (flushed.length) chunks.push(new Uint8Array(flushed).buffer);
    const file = new File(chunks, `daily-learning-${input.learningDate}.mp3`, { type: "audio/mpeg", lastModified: Date.now() });
    if (!file.size) throw new Error("MP3录音文件生成失败");
    input.onProgress?.(100);
    return file;
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}
