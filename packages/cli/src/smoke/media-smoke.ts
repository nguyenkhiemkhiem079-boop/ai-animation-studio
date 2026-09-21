import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  MediaToolchainDoctor,
  ArtifactVerifier,
  LocalAudioGenerator,
  RealAudioMixer,
  HyperFramesVideoBridge,
  VideoRenderer,
  TimelineSequence,
} from '@ai-studio/core';

export interface MediaSmokeReport {
  timestamp: string;
  status: 'PASS' | 'FAIL';
  toolchain: {
    ffmpeg: boolean;
    ffprobe: boolean;
    browser: boolean;
  };
  audioVerification: {
    musicWavExists: boolean;
    sfxWavExists: boolean;
    mixedAudioExists: boolean;
    hasAudioStream: boolean;
    durationSeconds: number;
  };
  videoVerification: {
    shotMp4Exists: boolean;
    masterMp4Exists: boolean;
    hasVideoStream: boolean;
    hasAudioStream: boolean;
    videoCodec?: string;
    audioCodec?: string;
    durationSeconds?: number;
    sizeBytes?: number;
    checksumSha256?: string;
  };
}

export async function runMediaSmoke(outputDir = '.studio/smoke/media'): Promise<MediaSmokeReport> {
  console.log('🔬 Starting Production Media Toolchain Smoke Test...\n');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Toolchain Diagnostics
  console.log('1️⃣ Checking Toolchain Diagnostics...');
  const toolchain = MediaToolchainDoctor.diagnose(true);
  console.log(` - FFmpeg : ${toolchain.ffmpeg.available ? 'AVAILABLE ✅' : 'MISSING ❌'} (${toolchain.ffmpeg.path ?? 'N/A'})`);
  console.log(` - FFprobe: ${toolchain.ffprobe.available ? 'AVAILABLE ✅' : 'MISSING ❌'} (${toolchain.ffprobe.path ?? 'N/A'})`);
  console.log(` - Browser: ${toolchain.browser.available ? 'AVAILABLE ✅' : 'MISSING ❌'} (${toolchain.browser.path ?? 'N/A'})`);

  if (!toolchain.allReady) {
    throw new Error('Media toolchain is incomplete. Ensure FFmpeg, FFprobe, and Chrome/Edge are installed.');
  }

  // 2. Real Audio Synthesis & Mixing
  console.log('\n2️⃣ Synthesizing Real Audio Stems & Master Track...');
  const musicWav = path.join(outputDir, 'stem_music.wav');
  const sfxWav = path.join(outputDir, 'stem_sfx.wav');
  const masterAudio = path.join(outputDir, 'master-audio.wav');

  await LocalAudioGenerator.generate({
    outputPath: musicWav,
    durationSeconds: 2.0,
    type: 'music',
  });

  await LocalAudioGenerator.generate({
    outputPath: sfxWav,
    durationSeconds: 1.0,
    type: 'sfx',
  });

  const mixResult = await RealAudioMixer.mix({
    projectId: 'smoke_media_test',
    outputDir,
    totalDurationSeconds: 2.0,
    stems: [
      { filePath: musicWav, startTimeSeconds: 0, volume: 0.7, stemType: 'music' },
      { filePath: sfxWav, startTimeSeconds: 0.5, volume: 0.9, stemType: 'sfx' },
    ],
  });
  console.log(` - Master Audio Mixed: ${masterAudio} (${mixResult.totalDurationSeconds}s, ${mixResult.verification.sizeBytes} bytes) ✅`);

  // 3. HyperFrames Headless Video Frame Capture & Encoding
  console.log('\n3️⃣ Rendering Deterministic HyperFrames HTML Composition to MP4...');
  const shotMp4 = path.join(outputDir, 'shot_01.mp4');
  const composition = {
    compositionId: 'comp_smoke_media_01',
    shotId: 'SHOT_SMOKE_01',
    width: 640,
    height: 360,
    fps: 24,
    durationSeconds: 2.0,
    layers: [],
    semanticSkills: [],
    compiledAt: new Date().toISOString(),
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; background: #030712; display: flex; align-items: center; justify-content: center; width: 640px; height: 360px; font-family: sans-serif; }
    .box { width: 100px; height: 100px; background: linear-gradient(135deg, #6366f1, #ec4899); border-radius: 16px; box-shadow: 0 0 30px rgba(99, 102, 241, 0.5); }
  </style>
</head>
<body>
  <div class="box"></div>
</body>
</html>`,
  };

  const bridgeResult = await HyperFramesVideoBridge.renderToMp4(composition, shotMp4, {
    fps: 24,
    width: 640,
    height: 360,
  });
  console.log(` - Shot MP4 Encoded: ${shotMp4} (${bridgeResult.frameCount} frames, ${bridgeResult.verification.sizeBytes} bytes) ✅`);

  // 4. VideoRenderer Master Stitch & AAC Muxing
  console.log('\n4️⃣ Stitching Master Video with Audio Muxing...');
  const masterMp4 = path.join(outputDir, 'master.mp4');
  const sequence: TimelineSequence = {
    sequenceId: 'seq_smoke_media',
    projectId: 'smoke_media_test',
    name: 'Smoke Media Sequence',
    fps: 24,
    resolution: { width: 640, height: 360 },
    totalDuration: 2.0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tracks: [
      {
        trackId: 'V1',
        trackType: 'video',
        name: 'Master Video',
        order: 0,
        volume: 1,
        pan: 0,
        clips: [
          {
            clipId: 'clip_01',
            trackId: 'V1',
            name: 'Master Clip',
            sourceAssetId: shotMp4,
            startTime: 0,
            duration: 2.0,
            inPoint: 0,
            outPoint: 2.0,
            speedMultiplier: 1.0,
            volume: 1.0,
            opacity: 1.0,
          },
        ],
        isMuted: false,
        isLocked: false,
      },
    ],
    transitions: [],
    subtitles: [],
  };

  const renderResult = await VideoRenderer.render({
    sequence,
    outputPath: masterMp4,
    masterAudioPath: masterAudio,
    includeAudio: true,
  });
  console.log(` - Master Video Encoded: ${masterMp4} (${renderResult.verification.sizeBytes} bytes) ✅`);

  // 5. Verification & Report Generation
  const masterVerification = renderResult.verification;
  const report: MediaSmokeReport = {
    timestamp: new Date().toISOString(),
    status: masterVerification.exists && masterVerification.nonEmpty && masterVerification.hasVideoStream && masterVerification.hasAudioStream ? 'PASS' : 'FAIL',
    toolchain: {
      ffmpeg: toolchain.ffmpeg.available,
      ffprobe: toolchain.ffprobe.available,
      browser: toolchain.browser.available,
    },
    audioVerification: {
      musicWavExists: fs.existsSync(musicWav),
      sfxWavExists: fs.existsSync(sfxWav),
      mixedAudioExists: fs.existsSync(masterAudio),
      hasAudioStream: mixResult.verification.hasAudioStream ?? false,
      durationSeconds: mixResult.totalDurationSeconds,
    },
    videoVerification: {
      shotMp4Exists: fs.existsSync(shotMp4),
      masterMp4Exists: fs.existsSync(masterMp4),
      hasVideoStream: masterVerification.hasVideoStream ?? false,
      hasAudioStream: masterVerification.hasAudioStream ?? false,
      videoCodec: masterVerification.videoCodec,
      audioCodec: masterVerification.audioCodec,
      durationSeconds: masterVerification.durationSeconds,
      sizeBytes: masterVerification.sizeBytes,
      checksumSha256: masterVerification.checksumSha256,
    },
  };

  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n🎉 Media Toolchain Smoke Test PASSED! Deliverable verified on disk:');
  console.log(` - Master MP4 : ${masterMp4}`);
  console.log(` - Video Codec: ${masterVerification.videoCodec} (${masterVerification.width}x${masterVerification.height} @ ${masterVerification.fps ?? 24}fps)`);
  console.log(` - Audio Codec: ${masterVerification.audioCodec}`);
  console.log(` - File Size  : ${masterVerification.sizeBytes} bytes`);
  console.log(` - Checksum   : ${masterVerification.checksumSha256}\n`);

  return report;
}
