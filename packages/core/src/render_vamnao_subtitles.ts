import * as fs from 'node:fs';
import * as path from 'node:path';
import puppeteer from 'puppeteer-core';

const ARTIFACT_DIR = 'C:\\Users\\khiem.nguyen\\.gemini\\antigravity-ide\\brain\\90a62fd2-21fb-4508-a71b-0582c96f27da';
const SUB_DIR = path.join(ARTIFACT_DIR, 'scratch', 'subtitles_vamnao');
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

export const VAM_NAO_ACTS = [
  {
    act: 1,
    title: 'HỒI 1: KHÚC SÔNG TỬ THẦN',
    text: 'Khúc sông Vàm Nao nổi tiếng nước sâu và xoáy ngầm hung dữ. Đêm ấy, ông Năm Chèo một mình buông mẻ lưới cuối giữa làn sương lạnh buốt.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act1_boat_1790591289793.jpg'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0006,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=720x1280:fps=24",
  },
  {
    act: 2,
    title: 'HỒI 2: ĐIỀM BÁO DƯỚI ĐÁY NƯỚC',
    text: 'Quá nửa đêm, chiếc thuyền trôi vào bến hoang. Bỗng từ đáy sông, phao lưới bị kéo giật dữ dội, ghì chặt mạn thuyền chao đảo.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act2_net_drag_1790591311638.jpg'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0008,1.18)':x='iw*0.3':y='ih*0.35+(in/240)*ih*0.1':d=240:s=720x1280:fps=24",
  },
  {
    act: 3,
    title: 'HỒI 3: MẺ LƯỚI KINH HOÀNG',
    text: 'Tưởng trúng mẻ cá to, ông Năm dốc sức kéo lên. Nhưng nhô khỏi mặt nước là búi tóc đen dài quấn chặt những ngón tay trắng bệch.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act3_hair_hand_1790591328159.jpg'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0009,1.20)':x='iw*0.4':y='ih*0.3':d=240:s=720x1280:fps=24",
  },
  {
    act: 4,
    title: 'HỒI 4: KHOẢNH KHẮC KINH HOÀNG',
    text: 'Bên mạn thuyền một cái đầu rũ rượi ngoi lên và đôi mắt đen sâu thẳm nhìn trừng trừng vào ông Năm.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act4_face_whisper_1790591358793.jpg'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0007,1.16)':x='iw*0.3':y='ih*0.35':d=240:s=720x1280:fps=24",
  },
  {
    act: 5,
    title: 'HỒI 5: GIẰNG CO SINH TỬ',
    text: 'Bàn tay trơn nhớt bất ngờ chộp lấy cổ chân ông Năm lôi xuống nước. Trong gang tấc, ông vớ chiếc liềm nhọn chặt đứt đoạn cước thoát thân.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act5_ankle_grab_1790591379291.jpg'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0010,1.22)':x='iw*0.35':y='ih*0.25+(in/240)*ih*0.1':d=240:s=720x1280:fps=24",
  },
  {
    act: 6,
    title: 'HỒI 6: VẾT TÍCH KHÔNG PHAI',
    text: 'Thuyền dạt vào bờ lúc rạng đông. Ông Năm thoát chết trong gang tấc, nhưng quanh cổ chân in hằn năm vết bầm đen tím ngắt như than cháy.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act6_bruise_dawn_1790591395837.jpg'),
    panEffect: "scale=1080:1920,zoompan=z='min(zoom+0.0008,1.18)':x='iw*0.4':y='ih*0.5':d=240:s=720x1280:fps=24",
  },
  {
    act: 7,
    title: 'HỒI 7: LỜI NGUYỀN VÀM NAO',
    text: 'Kể từ đêm kinh hoàng ấy, không ai còn thấy ông Năm ra sông lúc chạng vạng. Bởi dưới đáy sâu lạnh lẽo, linh hồn kia vẫn đang đợi kẻ thế mạng.',
    image: path.join(ARTIFACT_DIR, 'vamnao_act7_river_vortex_1790591415076.jpg'),
    panEffect: "scale=1080:1920,zoompan=z='if(lte(zoom,1.0),1.16,max(1.0,zoom-0.0006))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=720x1280:fps=24",
  },
];

async function main() {
  console.log('Rendering 7 Subtitle Cards for Vàm Nao Story...');
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });

  for (const item of VAM_NAO_ACTS) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Be+Vietnam+Pro:wght@400;600;700&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 720px;
            height: 1280px;
            background: transparent;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
            padding-bottom: 85px;
            font-family: 'Be Vietnam Pro', sans-serif;
          }
          .card {
            width: 660px;
            background: rgba(10, 14, 22, 0.90);
            border: 1.5px solid rgba(212, 160, 23, 0.70);
            border-radius: 14px;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.95), inset 0 0 18px rgba(212, 160, 23, 0.18);
            padding: 18px 24px;
            text-align: center;
            backdrop-filter: blur(10px);
          }
          .title {
            font-family: 'Cinzel', serif;
            font-size: 18px;
            letter-spacing: 2.5px;
            color: #d4a017;
            text-transform: uppercase;
            margin-bottom: 8px;
            text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85);
          }
          .separator {
            width: 80px;
            height: 1.5px;
            background: linear-gradient(90deg, transparent, #d4a017, transparent);
            margin: 0 auto 10px auto;
          }
          .dialogue {
            font-size: 20px;
            line-height: 1.48;
            color: #f3f4f6;
            font-weight: 600;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.95);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="title">${item.title}</div>
          <div class="separator"></div>
          <div class="dialogue">"${item.text}"</div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'load', timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    const outPath = path.join(SUB_DIR, `sub_act${item.act}.png`);
    await page.screenshot({ path: outPath, omitBackground: true });
    console.log(`Saved Subtitle Card ${item.act}: ${outPath}`);
  }

  await browser.close();
  console.log('All 7 Subtitle Cards generated successfully!');
}

if (process.argv[1].includes('render_vamnao_subtitles')) {
  main().catch(console.error);
}
