import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Dynamic path resolution
const FFMPEG_PATH = path.resolve(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE_PATH = path.resolve(process.cwd(), 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');

const ARTIFACT_DIR = 'C:\\Users\\khiem.nguyen\\.gemini\\antigravity-ide\\brain\\90a62fd2-21fb-4508-a71b-0582c96f27da';
const OUT_DIR = path.join(ARTIFACT_DIR, 'scratch', 'neural_story_render');
const AUDIO_DIR = path.join(ARTIFACT_DIR, 'scratch', 'neural_audio');
const SUBTITLES_DIR = path.join(ARTIFACT_DIR, 'scratch', 'subtitles');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const ACTS = [
  {
    act: 1,
    title: 'HỒI 1: HOÀNG HÔN BẾN VẮNG',
    text: 'Người già vùng sông nước dặn rằng khi hoàng hôn buông xuống, tuyệt đối đừng ra bến sông một mình.',
    image: path.join(ARTIFACT_DIR, 'mada_act1_river_1790584495525.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act1.png'),
    // Slow cinematic push-in from wide mist to lantern
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0008,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=168:s=720x1280:fps=24",
  },
  {
    act: 2,
    title: 'HỒI 2: DƯỚI ĐÁY BÙN SÂU',
    text: 'Dưới đáy bùn sâu lạnh lẽo, có những linh hồn chưa thể siêu thoát. Chúng rình rập, kiên nhẫn chờ đợi kẻ thế mạng.',
    image: path.join(ARTIFACT_DIR, 'mada_act2_underwater_1790584517829.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act2.png'),
    // Murky vertical drift down into the underwater depths
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0007,1.14)':x='iw/2-(iw/zoom/2)':y='(in/168)*ih*0.12':d=168:s=720x1280:fps=24",
  },
  {
    act: 3,
    title: 'HỒI 3: BÀN TAY BẮT HỒN',
    text: 'Một bàn tay trắng bợt, trơn nhớt bất thình lình vươn lên, kéo bạn chìm sâu vào cõi tăm tối.',
    image: path.join(ARTIFACT_DIR, 'mada_act3_hand_1790584538232.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act3.png'),
    // Dramatic push toward the clawed hand gripping the gunwale
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0012,1.22)':x='iw*0.4':y='ih*0.25':d=168:s=720x1280:fps=24",
  },
  {
    act: 4,
    title: 'HỒI 4: LỜI NGUYỀN DÒNG SÔNG',
    text: 'Nếu nửa đêm trên sông vắng có tiếng ai gọi tên mình, xin bạn đừng bao giờ quay đầu nhìn lại.',
    image: path.join(ARTIFACT_DIR, 'mada_act4_ripples_1790584554874.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act4.png'),
    // Slow pull-out revealing the empty abandoned boat into dark water ripples
    panEffect: "scale=1080:1920,zoompan=z='if(lte(zoom,1.0),1.16,max(1.0,zoom-0.0009))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=168:s=720x1280:fps=24",
  },
];

async function generateVoiceover() {
  console.log('=== STEP 1: Generating High-Quality Neural Vietnamese Voiceover (vi-VN-NamMinhNeural) ===');
  const voiceClips: { act: number; path: string; duration: number }[] = [];

  for (const item of ACTS) {
    const actDir = path.join(AUDIO_DIR, `act_${item.act}`);
    if (fs.existsSync(actDir)) {
      fs.rmSync(actDir, { recursive: true, force: true });
    }
    fs.mkdirSync(actDir, { recursive: true });

    console.log(`Synthesizing Act ${item.act}: "${item.text.slice(0, 35)}..."`);
    const tts = new MsEdgeTTS();
    await tts.setMetadata('vi-VN-NamMinhNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    await tts.toFile(actDir, item.text);

    const rawMp3 = path.join(actDir, 'audio.mp3');
    const masteredWav = path.join(AUDIO_DIR, `act_${item.act}_mastered.wav`);

    // Master the voice:
    // 1. Highpass at 80Hz (cut low rumble/pops)
    // 2. Chest resonance boost at 135Hz (+3.5dB)
    // 3. Presence boost at 2.4kHz (+1.5dB)
    // 4. Subtle high cut at 7.5kHz for analog tape/mic warmth
    // 5. Ghost reverb: e.g. subtle haunting wet mix
    // 6. Vocal compressor & gain boost
    const filter = [
      'highpass=f=80',
      'equalizer=f=135:width_type=o:width=1.2:g=3.5',
      'equalizer=f=2400:width_type=o:width=1.5:g=1.8',
      'lowpass=f=7500',
      'aecho=0.8:0.7:32:0.22',
      'acompressor=threshold=-16dB:ratio=4:attack=5:release=50',
      'volume=1.35',
    ].join(',');

    const ffmpegCmd = `"${FFMPEG_PATH}" -y -i "${rawMp3}" -af "${filter}" "${masteredWav}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });

    // Probe duration
    const probeCmd = `"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${masteredWav}"`;
    const durStr = execSync(probeCmd, { encoding: 'utf8' }).trim();
    const duration = parseFloat(durStr);

    console.log(`Act ${item.act} mastered successfully: duration = ${duration.toFixed(2)}s`);
    voiceClips.push({ act: item.act, path: masteredWav, duration });
  }

  return voiceClips;
}

function generateBackgroundAtmosphere(totalSeconds: number) {
  console.log(`=== STEP 2: Synthesizing Procedural Dark River Ambience (${totalSeconds}s) ===`);
  const bgPath = path.join(OUT_DIR, 'dark_ambience.wav');

  // Low frequency wind rumble + dark drone (52Hz drone + 40Hz sub + pink noise river wind)
  const filterDesc = [
    `anoisesrc=d=${totalSeconds}:c=pink:r=44100:a=0.07,lowpass=f=400[wind]`,
    `sine=f=52:d=${totalSeconds}[drone]`,
    `sine=f=38:d=${totalSeconds}[sub]`,
    `[drone]volume=0.18[droneloud]`,
    `[sub]volume=0.22[subloud]`,
    `[wind][droneloud][subloud]amix=inputs=3:duration=first:dropout_transition=2,volume=0.75[amb]`,
  ].join(';');

  const cmd = `"${FFMPEG_PATH}" -y -f lavfi -i anullsrc=r=44100:cl=stereo -filter_complex "${filterDesc}" -map "[amb]" -t ${totalSeconds} "${bgPath}"`;
  execSync(cmd, { stdio: 'inherit' });
  return bgPath;
}

function buildActs(voiceClips: { act: number; path: string; duration: number }[]) {
  console.log('=== STEP 3: Rendering Visual Acts with Motion & Subtitle Overlays (7s per act) ===');
  const actVideoPaths: string[] = [];

  for (let i = 0; i < ACTS.length; i++) {
    const act = ACTS[i];
    const voice = voiceClips[i];
    const actOut = path.join(OUT_DIR, `act_${act.act}_final.mp4`);

    console.log(`Rendering Act ${act.act} (7.0s, 720x1280 24fps)...`);
    // 7 seconds per act = 168 frames at 24fps
    // Video: Ken burns zoompan on 2D image, overlay subtitle card with subtle fade-in
    // Audio: Voice starts at 0.75s offset so viewer absorbs the visual first, padded to 7.0s
    const complexFilter = [
      `[0:v]${act.panEffect}[vbg]`,
      `[1:v]format=rgba,fade=t=in:st=0.4:d=0.5:alpha=1[sub]`,
      `[vbg][sub]overlay=(W-w)/2:H-h-90[vout]`,
      `[2:a]adelay=750|750,apad=whole_dur=7.0[aout]`,
    ].join(';');

    const cmd = `"${FFMPEG_PATH}" -y -loop 1 -t 7.0 -i "${act.image}" -loop 1 -t 7.0 -i "${act.subImage}" -i "${voice.path}" -filter_complex "${complexFilter}" -map "[vout]" -map "[aout]" -c:v libx264 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -t 7.0 "${actOut}"`;
    execSync(cmd, { stdio: 'inherit' });
    actVideoPaths.push(actOut);
  }

  return actVideoPaths;
}

function assembleMaster(actVideoPaths: string[], bgAmbiencePath: string) {
  console.log('=== STEP 4: Assembling 28-Second Master Film with Ambient Sound Bed ===');
  const concatTxt = path.join(OUT_DIR, 'concat_list.txt');
  fs.writeFileSync(concatTxt, actVideoPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));

  const rawStitched = path.join(OUT_DIR, 'raw_stitched.mp4');
  execSync(`"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${concatTxt}" -c copy "${rawStitched}"`, { stdio: 'inherit' });

  // Final mix: combine dialogue track with dark ambient bed
  const masterMp4 = path.join(ARTIFACT_DIR, 'mada_2d_story_master.mp4');
  const finalCmd = `"${FFMPEG_PATH}" -y -i "${rawStitched}" -i "${bgAmbiencePath}" -filter_complex "[0:a]volume=1.05[vocal];[1:a]volume=0.35[bg];[vocal][bg]amix=inputs=2:duration=first:dropout_transition=3[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 256k -shortest "${masterMp4}"`;
  execSync(finalCmd, { stdio: 'inherit' });

  console.log(`\n MASTER VIDEO EXPORTED SUCCESSFULLY: ${masterMp4}`);

  // Copy to project collection and user downloads
  const projectCollectionDir = path.resolve(process.cwd(), 'MaDa_Horror_Collection');
  const downloadsCollectionDir = 'C:\\Users\\khiem.nguyen\\Downloads\\MaDa_Horror_Collection';

  if (!fs.existsSync(projectCollectionDir)) fs.mkdirSync(projectCollectionDir, { recursive: true });
  if (!fs.existsSync(downloadsCollectionDir)) fs.mkdirSync(downloadsCollectionDir, { recursive: true });

  fs.copyFileSync(masterMp4, path.join(projectCollectionDir, '01_MaDa_2D_Story_Master_NamMinh_Voice.mp4'));
  fs.copyFileSync(masterMp4, path.join(downloadsCollectionDir, '01_MaDa_2D_Story_Master_NamMinh_Voice.mp4'));
  console.log(`Copied to:\n - ${projectCollectionDir}\\01_MaDa_2D_Story_Master_NamMinh_Voice.mp4\n - ${downloadsCollectionDir}\\01_MaDa_2D_Story_Master_NamMinh_Voice.mp4`);

  return masterMp4;
}

async function main() {
  try {
    const voiceClips = await generateVoiceover();
    const bgAmbience = generateBackgroundAtmosphere(28);
    const actVideos = buildActs(voiceClips);
    const master = assembleMaster(actVideos, bgAmbience);
    console.log('ALL PHASES COMPLETED WITH 100% ZERO-TOUCH AUTOMATION!');
  } catch (err) {
    console.error('Execution failed:', err);
    process.exit(1);
  }
}

main();
