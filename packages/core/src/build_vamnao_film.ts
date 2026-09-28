import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const FFMPEG_PATH = path.resolve(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE_PATH = path.resolve(process.cwd(), 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');

const ARTIFACT_DIR = 'C:\\Users\\khiem.nguyen\\.gemini\\antigravity-ide\\brain\\90a62fd2-21fb-4508-a71b-0582c96f27da';
const OUT_DIR = path.join(ARTIFACT_DIR, 'scratch', 'vamnao_film_render');
const AUDIO_DIR = path.join(ARTIFACT_DIR, 'scratch', 'vamnao_audio');
const SUBTITLES_DIR = path.join(ARTIFACT_DIR, 'scratch', 'subtitles_vamnao');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const ACTS = [
  {
    act: 1,
    title: 'HỒI 1: KHÚC SÔNG TỬ THẦN',
    text: 'Khúc sông Vàm Nao nổi tiếng nước sâu và xoáy ngầm hung dữ. Đêm ấy, ông Năm Chèo một mình buông mẻ lưới cuối giữa làn sương lạnh buốt.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act1_boat_1790591289793.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act1.png'),
    rawMp3: path.resolve(process.cwd(), 'test_vn_1', 'audio.mp3'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0006,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=720x1280:fps=24",
  },
  {
    act: 2,
    title: 'HỒI 2: ĐIỀM BÁO DƯỚI ĐÁY NƯỚC',
    text: 'Quá nửa đêm, chiếc thuyền trôi vào bến hoang. Bỗng từ đáy sông, phao lưới bị kéo giật dữ dội, ghì chặt mạn thuyền chao đảo.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act2_net_drag_1790591311638.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act2.png'),
    rawMp3: path.resolve(process.cwd(), 'test_vn_2', 'audio.mp3'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0007,1.16)':x='iw*0.3':y='ih*0.35+(in/240)*ih*0.1':d=240:s=720x1280:fps=24",
  },
  {
    act: 3,
    title: 'HỒI 3: MẺ LƯỚI KINH HOÀNG',
    text: 'Tưởng trúng mẻ cá to, ông Năm dốc sức kéo lên. Nhưng nhô khỏi mặt nước là búi tóc đen dài quấn chặt những ngón tay trắng bệch.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act3_hair_hand_1790591328159.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act3.png'),
    rawMp3: path.resolve(process.cwd(), 'test_vn_3', 'audio.mp3'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0008,1.18)':x='iw*0.4':y='ih*0.3':d=240:s=720x1280:fps=24",
  },
  {
    act: 4,
    title: 'HỒI 4: KHOẢNH KHẮC KINH HOÀNG',
    text: 'Bên mạn thuyền một cái đầu rũ rượi ngoi lên và đôi mắt đen sâu thẳm nhìn trừng trừng vào ông Năm.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act4_face_whisper_1790591358793.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act4.png'),
    rawMp3: path.resolve(process.cwd(), 'test_vn_4', 'audio.mp3'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0007,1.16)':x='iw*0.3':y='ih*0.35':d=240:s=720x1280:fps=24",
  },
  {
    act: 5,
    title: 'HỒI 5: GIẰNG CO SINH TỬ',
    text: 'Bàn tay trơn nhớt bất ngờ chộp lấy cổ chân ông Năm lôi xuống nước. Trong gang tấc, ông vớ chiếc liềm nhọn chặt đứt đoạn cước thoát thân.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act5_ankle_grab_1790591379291.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act5.png'),
    rawMp3: path.resolve(process.cwd(), 'test_vn_5', 'audio.mp3'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0010,1.22)':x='iw*0.35':y='ih*0.25+(in/240)*ih*0.1':d=240:s=720x1280:fps=24",
  },
  {
    act: 6,
    title: 'HỒI 6: VẾT TÍCH KHÔNG PHAI',
    text: 'Thuyền dạt vào bờ lúc rạng đông. Ông Năm giữ được tính mạng, nhưng quanh cổ chân in hằn năm vết bầm đen tím ngắt như than cháy.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act6_bruise_dawn_1790591395837.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act6.png'),
    rawMp3: path.resolve(process.cwd(), 'test_vn_6', 'audio.mp3'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0008,1.18)':x='iw*0.4':y='ih*0.5':d=240:s=720x1280:fps=24",
  },
  {
    act: 7,
    title: 'HỒI 7: LỜI NGUYỀN VÀM NAO',
    text: 'Kể từ đêm kinh hoàng ấy, không ai còn thấy ông Năm ra sông lúc chạng vạng. Bởi dưới đáy sâu lạnh lẽo, linh hồn kia vẫn đang đợi kẻ thế mạng.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act7_river_vortex_1790591415076.jpg'),
    subImage: path.join(SUBTITLES_DIR, 'sub_act7.png'),
    rawMp3: path.resolve(process.cwd(), 'test_vn_7', 'audio.mp3'),
    panEffect: "scale=1080:1920,zoompan=z='if(lte(zoom,1.0),1.16,max(1.0,zoom-0.0006))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=720x1280:fps=24",
  },
];

function masterAudioTracks() {
  console.log('=== STEP 1: Mastering 7 Neural Vietnamese Voice Tracks with Analog Warmth ===');
  const voiceClips: { act: number; path: string; duration: number }[] = [];

  for (const item of ACTS) {
    const masteredWav = path.join(AUDIO_DIR, `act_${item.act}_mastered.wav`);

    const filter = [
      'highpass=f=80',
      'equalizer=f=135:width_type=o:width=1.2:g=3.5',
      'equalizer=f=2400:width_type=o:width=1.5:g=1.8',
      'lowpass=f=7500',
      'aecho=0.8:0.7:32:0.22',
      'acompressor=threshold=-16dB:ratio=4:attack=5:release=50',
      'volume=1.35',
    ].join(',');

    const ffmpegCmd = `"${FFMPEG_PATH}" -y -i "${item.rawMp3}" -af "${filter}" "${masteredWav}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });

    const probeCmd = `"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${masteredWav}"`;
    const durStr = execSync(probeCmd, { encoding: 'utf8' }).trim();
    const duration = parseFloat(durStr);

    console.log(`Act ${item.act} mastered (${duration.toFixed(2)}s)`);
    voiceClips.push({ act: item.act, path: masteredWav, duration });
  }

  return voiceClips;
}

function generateBackgroundAtmosphere(totalSeconds: number) {
  console.log(`=== STEP 2: Synthesizing Procedural Dark River Ambience (${totalSeconds}s) ===`);
  const bgPath = path.join(OUT_DIR, 'dark_ambience.wav');

  const filterDesc = [
    `anoisesrc=d=${totalSeconds}:c=pink:r=44100:a=0.07,lowpass=f=380[wind]`,
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
  console.log('=== STEP 3: Rendering 7 Visual Acts with Motion & Subtitle Overlays (10s per act) ===');
  const actVideoPaths: string[] = [];

  for (let i = 0; i < ACTS.length; i++) {
    const act = ACTS[i];
    const voice = voiceClips[i];
    const actOut = path.join(OUT_DIR, `act_${act.act}_final.mp4`);

    console.log(`Rendering Act ${act.act} (10.0s, 720x1280 24fps)...`);
    const complexFilter = [
      `[0:v]${act.panEffect}[vbg]`,
      `[1:v]format=rgba,fade=t=in:st=0.35:d=0.5:alpha=1[sub]`,
      `[vbg][sub]overlay=(W-w)/2:H-h-85[vout]`,
      `[2:a]adelay=650|650,apad=whole_dur=10.0[aout]`,
    ].join(';');

    const cmd = `"${FFMPEG_PATH}" -y -loop 1 -t 10.0 -i "${act.image}" -loop 1 -t 10.0 -i "${act.subImage}" -i "${voice.path}" -filter_complex "${complexFilter}" -map "[vout]" -map "[aout]" -c:v libx264 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -t 10.0 "${actOut}"`;
    execSync(cmd, { stdio: 'inherit' });
    actVideoPaths.push(actOut);
  }

  return actVideoPaths;
}

function assembleMaster(actVideoPaths: string[], bgAmbiencePath: string) {
  console.log('=== STEP 4: Assembling 70-Second Master Film with Ambient Bed ===');
  const concatTxt = path.join(OUT_DIR, 'concat_list.txt');
  fs.writeFileSync(concatTxt, actVideoPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));

  const rawStitched = path.join(OUT_DIR, 'raw_stitched.mp4');
  execSync(`"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${concatTxt}" -c copy "${rawStitched}"`, { stdio: 'inherit' });

  // Final mix: combine narration dialogue with dark ambient bed
  const masterMp4 = path.join(ARTIFACT_DIR, 'mada_vamnao_story_master.mp4');
  const finalCmd = `"${FFMPEG_PATH}" -y -i "${rawStitched}" -i "${bgAmbiencePath}" -filter_complex "[0:a]volume=1.05[vocal];[1:a]volume=0.35[bg];[vocal][bg]amix=inputs=2:duration=first:dropout_transition=3[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 256k -shortest "${masterMp4}"`;
  execSync(finalCmd, { stdio: 'inherit' });

  console.log(`\n MASTER VIDEO EXPORTED SUCCESSFULLY: ${masterMp4}`);

  const projectCollectionDir = path.resolve(process.cwd(), 'MaDa_Horror_Collection');
  const downloadsCollectionDir = 'C:\\Users\\khiem.nguyen\\Downloads\\MaDa_Horror_Collection';

  if (!fs.existsSync(projectCollectionDir)) fs.mkdirSync(projectCollectionDir, { recursive: true });
  if (!fs.existsSync(downloadsCollectionDir)) fs.mkdirSync(downloadsCollectionDir, { recursive: true });

  fs.copyFileSync(masterMp4, path.join(projectCollectionDir, '00_MaDa_VamNao_Full_Story_70s.mp4'));
  fs.copyFileSync(masterMp4, path.join(downloadsCollectionDir, '00_MaDa_VamNao_Full_Story_70s.mp4'));
  console.log(`Copied to:\n - ${projectCollectionDir}\\00_MaDa_VamNao_Full_Story_70s.mp4\n - ${downloadsCollectionDir}\\00_MaDa_VamNao_Full_Story_70s.mp4`);

  return masterMp4;
}

async function main() {
  try {
    const voiceClips = masterAudioTracks();
    const bgAmbience = generateBackgroundAtmosphere(70);
    const actVideos = buildActs(voiceClips);
    const master = assembleMaster(actVideos, bgAmbience);
    console.log('VÀM NAO 70S FILM COMPLETED 100% END-TO-END!');
  } catch (err) {
    console.error('Execution failed:', err);
    process.exit(1);
  }
}

main();
