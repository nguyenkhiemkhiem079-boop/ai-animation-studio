import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const FFMPEG_PATH = path.resolve(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE_PATH = path.resolve(process.cwd(), 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');

const ARTIFACT_DIR = 'C:\\Users\\khiem.nguyen\\.gemini\\antigravity-ide\\brain\\90a62fd2-21fb-4508-a71b-0582c96f27da';
const OUT_DIR = path.join(ARTIFACT_DIR, 'scratch', 'cinematic_vamnao_render');
const AUDIO_DIR = path.join(ARTIFACT_DIR, 'scratch', 'cinematic_audio');
const SUBTITLES_DIR = path.join(ARTIFACT_DIR, 'scratch', 'subtitles_vamnao');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// Source raw audios from previous confirmed generation
const RAW_AUDIO_DIR = path.join(ARTIFACT_DIR, 'scratch', 'vamnao_audio');

const ACTS = [
  {
    act: 1,
    title: 'HỒI 1: KHÚC SÔNG TỬ THẦN',
    text: 'Khúc sông Vàm Nao nổi tiếng nước sâu và xoáy ngầm hung dữ. Đêm ấy, ông Năm Chèo một mình buông mẻ lưới cuối giữa làn sương lạnh buốt.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act1_boat_1790591289793.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act1.png'),
    rawWav: path.join(RAW_AUDIO_DIR, 'act_1_mastered.wav'),
    // Glide diagonally from misty reeds towards lantern
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0007,1.16)':x='(in/240)*iw*0.06':y='(in/240)*ih*0.05':d=240:s=720x1280:fps=24",
    transition: 'fadeblack',
    transitionDur: 1.0,
  },
  {
    act: 2,
    title: 'HỒI 2: ĐIỀM BÁO DƯỚI ĐÁY NƯỚC',
    text: 'Quá nửa đêm, chiếc thuyền trôi vào bến hoang. Bỗng từ đáy sông, phao lưới bị kéo giật dữ dội, ghì chặt mạn thuyền chao đảo.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act2_net_drag_1790591311638.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act2.png'),
    rawWav: path.join(RAW_AUDIO_DIR, 'act_2_mastered.wav'),
    // Dramatic tilt down into the boiling black whirlpool
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0009,1.20)':x='iw*0.25':y='ih*0.1+(in/240)*ih*0.25':d=240:s=720x1280:fps=24",
    transition: 'dissolve',
    transitionDur: 0.8,
  },
  {
    act: 3,
    title: 'HỒI 3: MẺ LƯỚI KINH HOÀNG',
    text: 'Tưởng trúng mẻ cá to, ông Năm dốc sức kéo lên. Nhưng nhô khỏi mặt nước là búi tóc đen dài quấn chặt những ngón tay trắng bệch.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act3_hair_hand_1790591328159.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act3.png'),
    rawWav: path.join(RAW_AUDIO_DIR, 'act_3_mastered.wav'),
    // Macro push towards wet corpse fingers clutching net
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0011,1.24)':x='iw*0.35':y='ih*0.25+(in/240)*ih*0.05':d=240:s=720x1280:fps=24",
    transition: 'fadeblack',
    transitionDur: 0.8,
  },
  {
    act: 4,
    title: 'HỒI 4: KHOẢNH KHẮC KINH HOÀNG',
    text: 'Bên mạn thuyền một cái đầu rũ rượi ngoi lên và đôi mắt đen sâu thẳm nhìn trừng trừng vào ông Năm.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act4_face_whisper_1790591358793.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act4.png'),
    rawWav: path.join(RAW_AUDIO_DIR, 'act_4_mastered.wav'),
    // Slow reveal upwards from water line into the hollow dark eyes of Ma Da
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0008,1.18)':x='iw*0.3':y='ih*0.4-(in/240)*ih*0.12':d=240:s=720x1280:fps=24",
    transition: 'hblur',
    transitionDur: 0.6,
  },
  {
    act: 5,
    title: 'HỒI 5: GIẰNG CO SINH TỬ',
    text: 'Bàn tay trơn nhớt bất ngờ chộp lấy cổ chân ông Năm lôi xuống nước. Trong gang tấc, ông vớ chiếc liềm nhọn chặt đứt đoạn cước thoát thân.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act5_ankle_grab_1790591379291.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act5.png'),
    rawWav: path.join(RAW_AUDIO_DIR, 'act_5_mastered.wav'),
    // Violent camera wobble / rocking boat struggle
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0012,1.25)':x='iw*0.35+sin(in*0.2)*15':y='ih*0.25+cos(in*0.2)*12':d=240:s=720x1280:fps=24",
    transition: 'fadeblack',
    transitionDur: 1.2,
  },
  {
    act: 6,
    title: 'HỒI 6: VẾT TÍCH KHÔNG PHAI',
    text: 'Thuyền dạt vào bờ lúc rạng đông. Ông Năm giữ được tính mạng, nhưng quanh cổ chân in hằn năm vết bầm đen tím ngắt như than cháy.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act6_bruise_dawn_1790591395837.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act6.png'),
    rawWav: path.join(RAW_AUDIO_DIR, 'act_6_mastered.wav'),
    // Somber pan from dawn horizon down to the charred ankle bruise
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0008,1.18)':x='iw*0.35':y='ih*0.35+(in/240)*ih*0.18':d=240:s=720x1280:fps=24",
    transition: 'dissolve',
    transitionDur: 1.0,
  },
  {
    act: 7,
    title: 'HỒI 7: LỜI NGUYỀN VÀM NAO',
    text: 'Kể từ đêm kinh hoàng ấy, không ai còn thấy ông Năm ra sông lúc chạng vạng. Bởi dưới đáy sâu lạnh lẽo, linh hồn kia vẫn đang đợi kẻ thế mạng.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act7_river_vortex_1790591415076.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act7.png'),
    rawWav: path.join(RAW_AUDIO_DIR, 'act_7_mastered.wav'),
    // Expansive crane pull-out into the endless swirling river vortex
    panEffect: "scale=1080:1920,zoompan=z='if(lte(zoom,1.0),1.18,max(1.0,zoom-0.0007))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=720x1280:fps=24",
    transition: 'none',
    transitionDur: 0,
  },
];

function remasterHorrorVoice() {
  console.log('=== STEP 1: Remastering Voice with Deep Baritone Horror Pitch & Dark Atmosphere ===');
  const remasteredClips: { act: number; path: string; duration: number }[] = [];

  for (const item of ACTS) {
    const outWav = path.join(AUDIO_DIR, `act_${item.act}_deep.wav`);

    // Voice Remaster Filter:
    // 1. Lower pitch by ~1.8 semitones (asetrate=24000*0.90,aresample=24000) for a sinister, deep, authoritative horror timbre
    // 2. Highpass 75Hz (clean pops)
    // 3. Deep chest resonance boost at 115Hz (+5.5dB)
    // 4. Intimate ghost whisper presence at 2.2kHz (+2.5dB)
    // 5. High-end analog rolloff at 6.8kHz
    // 6. Dual-delay ghost echo (35ms and 75ms)
    // 7. Aggressive horror broadcast compression
    const filter = [
      'asetrate=24000*0.90',
      'aresample=24000',
      'highpass=f=75',
      'equalizer=f=115:width_type=o:width=1.2:g=5.5',
      'equalizer=f=2200:width_type=o:width=1.0:g=2.5',
      'lowpass=f=6800',
      'aecho=0.8:0.7:35|70:0.25|0.12',
      'acompressor=threshold=-16dB:ratio=4:attack=5:release=50',
      'volume=1.4',
    ].join(',');

    const cmd = `"${FFMPEG_PATH}" -y -i "${item.rawWav}" -af "${filter}" "${outWav}"`;
    execSync(cmd, { stdio: 'inherit' });

    const probeCmd = `"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outWav}"`;
    const durStr = execSync(probeCmd, { encoding: 'utf8' }).trim();
    const duration = parseFloat(durStr);

    console.log(`Act ${item.act} remastered: deep horror voice duration = ${duration.toFixed(2)}s`);
    remasteredClips.push({ act: item.act, path: outWav, duration });
  }

  return remasteredClips;
}

function renderIndividualActVideos(voiceClips: { act: number; path: string; duration: number }[]) {
  console.log('=== STEP 2: Rendering 7 Visual Acts with Dynamic Multi-Axis Camera Motion ===');
  const renderedActPaths: string[] = [];

  for (let i = 0; i < ACTS.length; i++) {
    const act = ACTS[i];
    const voice = voiceClips[i];
    const actOut = path.join(OUT_DIR, `act_${act.act}_raw.mp4`);

    console.log(`Rendering Act ${act.act} (10.0s, 720x1280 24fps)...`);
    // Subtitle card smoothly fades in at 0.4s and fades out at 9.4s for seamless transition!
    const complexFilter = [
      `[0:v]${act.panEffect}[vbg]`,
      `[1:v]format=rgba,fade=t=in:st=0.4:d=0.5:alpha=1,fade=t=out:st=9.3:d=0.5:alpha=1[sub]`,
      `[vbg][sub]overlay=(W-w)/2:H-h-85[vout]`,
      `[2:a]adelay=600|600,apad=whole_dur=10.0[aout]`,
    ].join(';');

    const cmd = `"${FFMPEG_PATH}" -y -loop 1 -t 10.0 -i "${act.image}" -loop 1 -t 10.0 -i "${act.subImage}" -i "${voice.path}" -filter_complex "${complexFilter}" -map "[vout]" -map "[aout]" -c:v libx264 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -t 10.0 "${actOut}"`;
    execSync(cmd, { stdio: 'inherit' });
    renderedActPaths.push(actOut);
  }

  return renderedActPaths;
}

function chainXFadeTransitions(actVideos: string[]) {
  console.log('=== STEP 3: Chaining Cinematic xfade Transitions Across All 7 Acts ===');
  const transitionedVideo = path.join(OUT_DIR, 'transitioned_video.mp4');

  // We chain the 7 video tracks using xfade, and 7 audio tracks using acrossfade!
  // Clip duration = 10.0s
  // Offsets:
  // v01: offset 10 - 1.0 = 9.0s (fadeblack) -> dur = 19.0s
  // v02: offset 19.0 - 0.8 = 18.2s (dissolve) -> dur = 28.2s
  // v03: offset 28.2 - 0.8 = 27.4s (fadeblack) -> dur = 37.4s
  // v04: offset 37.4 - 0.6 = 36.8s (hblur) -> dur = 46.8s
  // v05: offset 46.8 - 1.2 = 45.6s (fadeblack) -> dur = 55.6s
  // v06: offset 55.6 - 1.0 = 54.6s (dissolve) -> dur = 64.6s

  const inputs = actVideos.map((p) => `-i "${p}"`).join(' ');

  const filterGraph = [
    // Video xfade chain
    `[0:v][1:v]xfade=transition=fadeblack:duration=1.0:offset=9.0[v01]`,
    `[v01][2:v]xfade=transition=dissolve:duration=0.8:offset=18.2[v02]`,
    `[v02][3:v]xfade=transition=fadeblack:duration=0.8:offset=27.4[v03]`,
    `[v03][4:v]xfade=transition=hblur:duration=0.6:offset=36.8[v04]`,
    `[v04][5:v]xfade=transition=fadeblack:duration=1.2:offset=45.6[v05]`,
    `[v05][6:v]xfade=transition=dissolve:duration=1.0:offset=54.6[vfinal]`,

    // Audio acrossfade chain
    `[0:a][1:a]acrossfade=d=1.0:c1=tri:c2=tri[a01]`,
    `[a01][2:a]acrossfade=d=0.8:c1=tri:c2=tri[a02]`,
    `[a02][3:a]acrossfade=d=0.8:c1=tri:c2=tri[a03]`,
    `[a03][4:a]acrossfade=d=0.6:c1=tri:c2=tri[a04]`,
    `[a04][5:a]acrossfade=d=1.2:c1=tri:c2=tri[a05]`,
    `[a05][6:a]acrossfade=d=1.0:c1=tri:c2=tri[afinal]`,
  ].join(';');

  const cmd = `"${FFMPEG_PATH}" -y ${inputs} -filter_complex "${filterGraph}" -map "[vfinal]" -map "[afinal]" -c:v libx264 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k "${transitionedVideo}"`;
  execSync(cmd, { stdio: 'inherit' });

  return transitionedVideo;
}

function generateAtmosphericSoundscape(totalDuration: number) {
  console.log(`=== STEP 4: Synthesizing Dynamic Horror Ambience & Transition Sound FX (${totalDuration}s) ===`);
  const bgPath = path.join(OUT_DIR, 'horror_ambience.wav');

  // Ambient soundbed with low river wind + deep sub drone
  const filterDesc = [
    `anoisesrc=d=${totalDuration}:c=pink:r=44100:a=0.06,lowpass=f=350[wind]`,
    `sine=f=48:d=${totalDuration}[drone]`,
    `sine=f=36:d=${totalDuration}[sub]`,
    `[drone]volume=0.20[droneloud]`,
    `[sub]volume=0.25[subloud]`,
    `[wind][droneloud][subloud]amix=inputs=3:duration=first:dropout_transition=2,volume=0.85[amb]`,
  ].join(';');

  const cmd = `"${FFMPEG_PATH}" -y -f lavfi -i anullsrc=r=44100:cl=stereo -filter_complex "${filterDesc}" -map "[amb]" -t ${totalDuration} "${bgPath}"`;
  execSync(cmd, { stdio: 'inherit' });
  return bgPath;
}

function assembleMasterFilm(transitionedVideo: string, bgAmbiencePath: string) {
  console.log('=== STEP 5: Final Mix & Export of the 65-Second Master Film ===');

  const masterMp4 = path.join(ARTIFACT_DIR, 'mada_vamnao_story_master.mp4');
  const finalCmd = `"${FFMPEG_PATH}" -y -i "${transitionedVideo}" -i "${bgAmbiencePath}" -filter_complex "[0:a]volume=1.05[vocal];[1:a]volume=0.38[bg];[vocal][bg]amix=inputs=2:duration=first:dropout_transition=3[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 256k -shortest "${masterMp4}"`;
  execSync(finalCmd, { stdio: 'inherit' });

  console.log(`\n MASTER VIDEO EXPORTED WITH CINEMATIC XFADE TRANSITIONS: ${masterMp4}`);

  const projectCollectionDir = path.resolve(process.cwd(), 'MaDa_Horror_Collection');
  const downloadsCollectionDir = 'C:\\Users\\khiem.nguyen\\Downloads\\MaDa_Horror_Collection';

  fs.copyFileSync(masterMp4, path.join(projectCollectionDir, '00_MaDa_VamNao_Full_Story_Cinematic_Transitions.mp4'));
  fs.copyFileSync(masterMp4, path.join(downloadsCollectionDir, '00_MaDa_VamNao_Full_Story_Cinematic_Transitions.mp4'));
  console.log(`Copied to:\n - ${projectCollectionDir}\\00_MaDa_VamNao_Full_Story_Cinematic_Transitions.mp4\n - ${downloadsCollectionDir}\\00_MaDa_VamNao_Full_Story_Cinematic_Transitions.mp4`);

  return masterMp4;
}

async function main() {
  try {
    const remasteredVoices = remasterHorrorVoice();
    const actVideos = renderIndividualActVideos(remasteredVoices);
    const transitionedVideo = chainXFadeTransitions(actVideos);

    // Probe duration of transitioned video
    const probeCmd = `"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${transitionedVideo}"`;
    const totalDuration = Math.ceil(parseFloat(execSync(probeCmd, { encoding: 'utf8' }).trim()));
    console.log(`Total Transitioned Film Duration: ${totalDuration}s`);

    const bgAmbience = generateAtmosphericSoundscape(totalDuration);
    const master = assembleMasterFilm(transitionedVideo, bgAmbience);
    console.log('CINEMATIC VÀM NAO FILM WITH SEAMLESS TRANSITIONS COMPLETED 100% END-TO-END!');
  } catch (err) {
    console.error('Execution failed:', err);
    process.exit(1);
  }
}

main();
