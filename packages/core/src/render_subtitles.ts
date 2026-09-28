import * as fs from 'node:fs';
import * as path from 'node:path';
import puppeteer from 'puppeteer-core';

const ARTIFACT_DIR = 'C:\\Users\\khiem.nguyen\\.gemini\\antigravity-ide\\brain\\90a62fd2-21fb-4508-a71b-0582c96f27da';
const SUB_DIR = path.join(ARTIFACT_DIR, 'scratch', 'subtitles');
if (!fs.existsSync(SUB_DIR)) fs.mkdirSync(SUB_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

const SUBTITLES = [
  {
    act: 1,
    title: 'HỒI 1: HOÀNG HÔN BẾN VẮNG',
    text: 'Người già vùng sông nước dặn rằng khi hoàng hôn buông xuống, tuyệt đối đừng ra bến sông một mình.',
  },
  {
    act: 2,
    title: 'HỒI 2: DƯỚI ĐÁY BÙN SÂU',
    text: 'Dưới đáy bùn sâu lạnh lẽo, có những linh hồn chưa thể siêu thoát. Chúng rình rập, kiên nhẫn chờ đợi kẻ thế mạng.',
  },
  {
    act: 3,
    title: 'HỒI 3: BÀN TAY BẮT HỒN',
    text: 'Một bàn tay trắng bợt, trơn nhớt bất thình lình vươn lên, kéo bạn chìm sâu vào cõi tăm tối.',
  },
  {
    act: 4,
    title: 'HỒI 4: LỜI NGUYỀN DÒNG SÔNG',
    text: 'Nếu nửa đêm trên sông vắng có tiếng ai gọi tên mình, xin bạn đừng bao giờ quay đầu nhìn lại.',
  },
];

async function main() {
  console.log('Launching headless browser for subtitle rendering...');
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });

  for (const item of SUBTITLES) {
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
            padding-bottom: 90px;
            font-family: 'Be Vietnam Pro', sans-serif;
          }
          .card {
            width: 650px;
            background: rgba(12, 16, 24, 0.88);
            border: 1.5px solid rgba(212, 160, 23, 0.65);
            border-radius: 14px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.9), inset 0 0 15px rgba(212, 160, 23, 0.15);
            padding: 20px 24px;
            text-align: center;
            backdrop-filter: blur(8px);
          }
          .title {
            font-family: 'Cinzel', serif;
            font-size: 19px;
            letter-spacing: 3px;
            color: #d4a017;
            text-transform: uppercase;
            margin-bottom: 10px;
            text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
          }
          .separator {
            width: 70px;
            height: 1.5px;
            background: linear-gradient(90deg, transparent, #d4a017, transparent);
            margin: 0 auto 12px auto;
          }
          .dialogue {
            font-size: 21px;
            line-height: 1.5;
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
    // Wait for fonts to load
    await new Promise((r) => setTimeout(r, 600));

    const outPath = path.join(SUB_DIR, `sub_act${item.act}.png`);
    await page.screenshot({ path: outPath, omitBackground: true });
    console.log(`Saved subtitle PNG: ${outPath}`);
  }

  await browser.close();
  console.log('Subtitle rendering completed!');
}

main().catch(console.error);
