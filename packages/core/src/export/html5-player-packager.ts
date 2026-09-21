import { TimelineSequence } from '../domain/timeline.js';

export interface Html5PackageOptions {
  sequence: TimelineSequence;
  title?: string;
  autoplay?: boolean;
}

export class Html5PlayerPackager {
  /**
   * Compiles the entire timeline sequence into a self-contained, standalone HTML5 interactive player.
   */
  public static package(options: Html5PackageOptions): string {
    const { sequence, title = sequence.name, autoplay = false } = options;

    const sequenceJson = JSON.stringify(sequence);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — AI Animation Studio Master Player</title>
  <style>
    :root {
      --bg-dark: #0b0d13;
      --surface-card: #151922;
      --surface-hover: #1f2430;
      --accent-primary: #6366f1;
      --accent-glow: rgba(99, 102, 241, 0.4);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border-subtle: #272f3d;
      --success: #10b981;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .studio-player-container {
      width: 100%;
      max-width: 1100px;
      background: var(--surface-card);
      border-radius: 12px;
      border: 1px solid var(--border-subtle);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      overflow: hidden;
    }

    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(11, 13, 19, 0.6);
    }
    .header-title { font-size: 1.1rem; font-weight: 600; }
    .header-badge {
      font-size: 0.75rem;
      padding: 0.2rem 0.6rem;
      background: rgba(99, 102, 241, 0.15);
      color: var(--accent-primary);
      border-radius: 9999px;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .viewport-canvas {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .screen-content {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: opacity 0.3s ease;
    }

    .clip-title-display {
      font-size: 1.8rem;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
      letter-spacing: 0.05em;
    }
    .clip-details-display {
      font-size: 0.95rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
    }

    .subtitle-overlay {
      position: absolute;
      bottom: 12%;
      left: 10%;
      right: 10%;
      text-align: center;
      pointer-events: none;
      z-index: 10;
    }
    .subtitle-box {
      display: inline-block;
      padding: 0.4rem 1.2rem;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-size: 1.15rem;
      font-weight: 500;
      border-radius: 6px;
      line-height: 1.4;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
      transition: opacity 0.2s ease;
    }
    .subtitle-speaker {
      color: #38bdf8;
      font-weight: 700;
      margin-right: 0.4rem;
    }

    .controls-panel {
      padding: 1.2rem 1.5rem;
      background: var(--surface-card);
    }

    .timeline-scrubber {
      position: relative;
      width: 100%;
      height: 8px;
      background: var(--surface-hover);
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 1.2rem;
    }
    .timeline-progress {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      background: var(--accent-primary);
      border-radius: 4px;
      width: 0%;
      transition: width 0.05s linear;
    }
    .timeline-handle {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 0 10px var(--accent-glow);
    }

    .controls-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-group { display: flex; align-items: center; gap: 0.75rem; }
    .btn-action {
      background: var(--surface-hover);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-action:hover { background: #2b3242; }
    .btn-play {
      background: var(--accent-primary);
      color: #fff;
      border: none;
      padding: 0.55rem 1.4rem;
      box-shadow: 0 4px 14px var(--accent-glow);
    }
    .btn-play:hover { background: #4f46e5; }

    .timecode-display {
      font-family: ui-monospace, monospace;
      font-size: 0.95rem;
      color: var(--text-muted);
    }
    .timecode-current { color: var(--text-main); font-weight: 600; }

    .track-toggles {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.8rem;
    }
    .track-toggle-label {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      color: var(--text-muted);
    }
    .track-toggle-label input:checked + span {
      color: var(--text-main);
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="studio-player-container">
    <div class="header-bar">
      <div class="header-title">${title}</div>
      <div class="header-badge">${sequence.resolution.width}x${sequence.resolution.height} @ ${sequence.fps}fps</div>
    </div>

    <div class="viewport-canvas" id="viewport">
      <div class="screen-content" id="screenContent">
        <div class="clip-title-display" id="clipTitleDisplay">Ready to Play</div>
        <div class="clip-details-display" id="clipDetailsDisplay">Duration: ${sequence.totalDuration.toFixed(2)}s</div>
      </div>
      <div class="subtitle-overlay" id="subtitleOverlay" style="display: none;">
        <div class="subtitle-box" id="subtitleBox"></div>
      </div>
    </div>

    <div class="controls-panel">
      <div class="timeline-scrubber" id="scrubber">
        <div class="timeline-progress" id="progress"></div>
        <div class="timeline-handle" id="scrubberHandle" style="left: 0%;"></div>
      </div>

      <div class="controls-row">
        <div class="btn-group">
          <button class="btn-action btn-play" id="btnPlay">▶ Play</button>
          <button class="btn-action" id="btnReset">↺ Reset</button>
          <div class="timecode-display">
            <span class="timecode-current" id="timeCurrent">00:00:00:00</span> / <span id="timeTotal">00:00:00:00</span>
          </div>
        </div>

        <div class="track-toggles">
          <label class="track-toggle-label">
            <input type="checkbox" id="toggleDialogue" checked>
            <span>Dialogue (A1)</span>
          </label>
          <label class="track-toggle-label">
            <input type="checkbox" id="toggleMusic" checked>
            <span>Music (A2)</span>
          </label>
          <label class="track-toggle-label">
            <input type="checkbox" id="toggleSfx" checked>
            <span>SFX (A3)</span>
          </label>
          <label class="track-toggle-label">
            <input type="checkbox" id="toggleSubs" checked>
            <span>Subtitles</span>
          </label>
        </div>
      </div>
    </div>
  </div>

  <script>
    const sequence = ${sequenceJson};
    let isPlaying = ${autoplay};
    let currentTime = 0;
    let lastFrameTimestamp = null;

    const fps = sequence.fps || 24;
    const totalDuration = sequence.totalDuration || 1;

    const btnPlay = document.getElementById('btnPlay');
    const btnReset = document.getElementById('btnReset');
    const progress = document.getElementById('progress');
    const scrubberHandle = document.getElementById('scrubberHandle');
    const scrubber = document.getElementById('scrubber');
    const timeCurrent = document.getElementById('timeCurrent');
    const timeTotal = document.getElementById('timeTotal');
    const clipTitleDisplay = document.getElementById('clipTitleDisplay');
    const clipDetailsDisplay = document.getElementById('clipDetailsDisplay');
    const subtitleOverlay = document.getElementById('subtitleOverlay');
    const subtitleBox = document.getElementById('subtitleBox');
    const toggleSubs = document.getElementById('toggleSubs');

    function formatTimecode(seconds) {
      const totalFrames = Math.floor(seconds * fps);
      const f = totalFrames % fps;
      const s = Math.floor(seconds) % 60;
      const m = Math.floor(seconds / 60) % 60;
      const h = Math.floor(seconds / 3600);
      const pad = (n) => String(n).padStart(2, '0');
      return pad(h) + ':' + pad(m) + ':' + pad(s) + ':' + pad(f);
    }

    timeTotal.textContent = formatTimecode(totalDuration);

    function updateView() {
      const pct = Math.min(100, (currentTime / totalDuration) * 100);
      progress.style.width = pct + '%';
      scrubberHandle.style.left = pct + '%';
      timeCurrent.textContent = formatTimecode(currentTime);

      // Find active video clip
      const videoTrack = sequence.tracks.find(t => t.trackType === 'video');
      if (videoTrack) {
        const activeClip = videoTrack.clips.find(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration);
        if (activeClip) {
          clipTitleDisplay.textContent = activeClip.name;
          clipDetailsDisplay.textContent = 'Track: V1 | In: ' + activeClip.startTime.toFixed(2) + 's | Len: ' + activeClip.duration.toFixed(2) + 's';
        } else if (currentTime >= totalDuration) {
          clipTitleDisplay.textContent = 'End of Production';
          clipDetailsDisplay.textContent = 'Total: ' + totalDuration.toFixed(2) + 's';
        }
      }

      // Find active subtitle
      if (toggleSubs.checked && sequence.subtitles && sequence.subtitles.length > 0) {
        const activeSub = sequence.subtitles.find(s => currentTime >= s.startTime && currentTime < s.endTime);
        if (activeSub) {
          const speakerHtml = activeSub.speaker ? '<span class="subtitle-speaker">' + activeSub.speaker.toUpperCase() + ':</span>' : '';
          subtitleBox.innerHTML = speakerHtml + activeSub.text;
          subtitleOverlay.style.display = 'block';
        } else {
          subtitleOverlay.style.display = 'none';
        }
      } else {
        subtitleOverlay.style.display = 'none';
      }
    }

    function step(timestamp) {
      if (!lastFrameTimestamp) lastFrameTimestamp = timestamp;
      const delta = (timestamp - lastFrameTimestamp) / 1000;
      lastFrameTimestamp = timestamp;

      if (isPlaying) {
        currentTime += delta;
        if (currentTime >= totalDuration) {
          currentTime = totalDuration;
          isPlaying = false;
          btnPlay.textContent = '▶ Play';
        }
        updateView();
      }

      if (isPlaying) {
        requestAnimationFrame(step);
      }
    }

    btnPlay.addEventListener('click', () => {
      isPlaying = !isPlaying;
      btnPlay.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
      if (isPlaying) {
        if (currentTime >= totalDuration) currentTime = 0;
        lastFrameTimestamp = null;
        requestAnimationFrame(step);
      }
    });

    btnReset.addEventListener('click', () => {
      currentTime = 0;
      isPlaying = false;
      btnPlay.textContent = '▶ Play';
      updateView();
    });

    scrubber.addEventListener('click', (e) => {
      const rect = scrubber.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      currentTime = pct * totalDuration;
      updateView();
    });

    updateView();
    if (isPlaying) requestAnimationFrame(step);
  </script>
</body>
</html>
`.trim();
  }
}
