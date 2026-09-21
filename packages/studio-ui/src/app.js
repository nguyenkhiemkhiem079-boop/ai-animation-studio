/**
 * AI ANIMATION STUDIO — PRODUCTION WEB APPLICATION & DUAL-MODE PLAYER
 * Interactive controller for timeline playback, HyperFrames parallax,
 * turnaround inspection, savings calculation, and deliverable exports.
 */

// Application State
const state = {
  isPlaying: false,
  currentTime: 1.12, // in seconds
  totalDuration: 7.50, // 180 frames @ 24fps
  fps: 24,
  playbackSpeed: 1.0,
  activeMode: 'hyperframes', // 'hyperframes' | 'video'
  showCaptions: true,
  activeAngle: 'front',
  shots: [
    {
      id: 'SHOT_01',
      title: 'Command Deck (Establishing)',
      duration: 3.5,
      isDeterministic: true,
      route: 'deterministic_hyperframes',
      cost: 0.0,
      camera: '35mm • Wide • Push-In',
    },
    {
      id: 'SHOT_02',
      title: 'Elena Tactical Reaction',
      duration: 4.0,
      isDeterministic: false,
      route: 'generative_full_video',
      cost: 0.50,
      camera: '50mm • Medium • Orbit',
    }
  ],
  subtitles: [
    { start: 0.5, end: 3.2, speaker: 'KAITO', text: 'Sensors confirm the breach. Prepare defensive countermeasures.' },
    { start: 3.8, end: 7.0, speaker: 'ELENA', text: 'Shields holding at seventy percent.' }
  ],
  volumes: {
    a1: 1.0,
    a2: 0.7,
    a3: 0.85
  }
};

let animationFrameId = null;
let lastTimestamp = 0;

// DOM Elements
const tabButtons = document.querySelectorAll('.nav-tab');
const panels = document.querySelectorAll('.studio-panel');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnStepPrev = document.getElementById('btn-step-prev');
const btnStepNext = document.getElementById('btn-step-next');
const btnStop = document.getElementById('btn-stop');
const timeCurrentEl = document.getElementById('time-current');
const frameCounterEl = document.getElementById('frame-counter');
const playheadEl = document.getElementById('timeline-playhead');
const timeRulerEl = document.getElementById('time-ruler');
const activeSubTextEl = document.getElementById('active-subtitle-text');
const viewportSubtitlesEl = document.getElementById('viewport-subtitles');
const hfLayerBg = document.getElementById('hf-layer-bg');
const hfLayerMid = document.getElementById('hf-layer-mid');
const charActor = document.getElementById('char-actor');
const modeHyperframesBtn = document.getElementById('mode-hyperframes');
const modeMasterVideoBtn = document.getElementById('mode-master-video');
const speedSelect = document.getElementById('speed-select');
const btnToggleCaptions = document.getElementById('btn-toggle-captions');
const angleButtons = document.querySelectorAll('.angle-btn');
const angleBadgeEl = document.getElementById('angle-badge');
const charModelView = document.getElementById('char-model-view');

// 1. Navigation Tab Switching
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));

    btn.classList.add('active');
    const targetPanelId = btn.getAttribute('data-target');
    const targetPanel = document.getElementById(targetPanelId);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
  });
});

// 2. Dual-Mode Toggle
function setViewportMode(mode) {
  state.activeMode = mode;
  if (mode === 'hyperframes') {
    modeHyperframesBtn.classList.add('active');
    modeMasterVideoBtn.classList.remove('active');
    hfLayerBg.style.filter = 'none';
    hfLayerMid.style.filter = 'none';
  } else {
    modeMasterVideoBtn.classList.add('active');
    modeHyperframesBtn.classList.remove('active');
    // Simulated video composite grade
    hfLayerBg.style.filter = 'contrast(1.15) brightness(0.95)';
    hfLayerMid.style.filter = 'contrast(1.1) saturate(1.2)';
  }
}

modeHyperframesBtn?.addEventListener('click', () => setViewportMode('hyperframes'));
modeMasterVideoBtn?.addEventListener('click', () => setViewportMode('video'));

// 3. Timecode & Frame Formatting
function formatTimecode(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

function updatePlaybackUI() {
  if (timeCurrentEl) {
    timeCurrentEl.textContent = formatTimecode(state.currentTime);
  }
  const currentFrame = Math.floor(state.currentTime * state.fps);
  const totalFrames = Math.floor(state.totalDuration * state.fps);
  if (frameCounterEl) {
    frameCounterEl.textContent = `FRAME ${currentFrame} / ${totalFrames}`;
  }

  // Update Playhead position on timeline (100px per second)
  const pxPosition = state.currentTime * 100;
  if (playheadEl) {
    playheadEl.style.left = `${pxPosition}px`;
  }

  // Update 2.5D Parallax Stage
  const progress = state.currentTime / state.totalDuration;
  if (hfLayerBg) {
    hfLayerBg.style.transform = `translateZ(-200px) scale(1.2) translateY(${progress * 15}px)`;
  }
  if (hfLayerMid) {
    hfLayerMid.style.transform = `translateZ(-100px) scale(1.1) translateX(${-progress * 25}px)`;
  }
  if (charActor) {
    // Push-in camera simulation
    const scale = 1.0 + progress * 0.15;
    charActor.style.transform = `scale(${scale}) translateY(${progress * -10}px)`;
  }

  // Subtitle Synchronization
  if (state.showCaptions && activeSubTextEl) {
    const currentSub = state.subtitles.find(
      (s) => state.currentTime >= s.start && state.currentTime <= s.end
    );
    if (currentSub) {
      activeSubTextEl.textContent = `${currentSub.speaker}: ${currentSub.text}`;
      if (viewportSubtitlesEl) viewportSubtitlesEl.style.opacity = '1';
    } else {
      if (viewportSubtitlesEl) viewportSubtitlesEl.style.opacity = '0';
    }
  }
}

// 4. Playback Engine
function play() {
  if (state.currentTime >= state.totalDuration) {
    state.currentTime = 0;
  }
  state.isPlaying = true;
  if (btnPlayPause) btnPlayPause.textContent = '⏸';
  lastTimestamp = performance.now();
  animationFrameId = requestAnimationFrame(playbackLoop);
}

function pause() {
  state.isPlaying = false;
  if (btnPlayPause) btnPlayPause.textContent = '▶';
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function togglePlay() {
  if (state.isPlaying) {
    pause();
  } else {
    play();
  }
}

function playbackLoop(timestamp) {
  if (!state.isPlaying) return;

  const delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  state.currentTime += delta * state.playbackSpeed;

  if (state.currentTime >= state.totalDuration) {
    state.currentTime = state.totalDuration;
    pause();
  }

  updatePlaybackUI();

  if (state.isPlaying) {
    animationFrameId = requestAnimationFrame(playbackLoop);
  }
}

btnPlayPause?.addEventListener('click', togglePlay);

btnStepPrev?.addEventListener('click', () => {
  pause();
  state.currentTime = Math.max(0, state.currentTime - 1 / state.fps);
  updatePlaybackUI();
});

btnStepNext?.addEventListener('click', () => {
  pause();
  state.currentTime = Math.min(state.totalDuration, state.currentTime + 1 / state.fps);
  updatePlaybackUI();
});

btnStop?.addEventListener('click', () => {
  pause();
  state.currentTime = 0;
  updatePlaybackUI();
});

speedSelect?.addEventListener('change', (e) => {
  state.playbackSpeed = parseFloat(e.target.value) || 1.0;
});

btnToggleCaptions?.addEventListener('click', () => {
  state.showCaptions = !state.showCaptions;
  btnToggleCaptions.classList.toggle('active', state.showCaptions);
  if (viewportSubtitlesEl) {
    viewportSubtitlesEl.style.display = state.showCaptions ? 'block' : 'none';
  }
});

// 5. Timeline Scrubbing
timeRulerEl?.addEventListener('click', (e) => {
  const rect = timeRulerEl.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const newTime = Math.max(0, Math.min(state.totalDuration, clickX / 100));
  state.currentTime = newTime;
  updatePlaybackUI();
});

// 6. Character Turnaround 6-View Inspector
angleButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    angleButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const angle = btn.getAttribute('data-angle');
    state.activeAngle = angle;
    if (angleBadgeEl) {
      angleBadgeEl.textContent = `${angle.replace(/_/g, ' ').toUpperCase()} VIEW`;
    }
    if (charModelView) {
      // Rotate wireframe orientation
      switch (angle) {
        case 'front':
          charModelView.style.transform = 'rotateY(0deg)';
          break;
        case 'three_quarter_left':
          charModelView.style.transform = 'rotateY(-45deg)';
          break;
        case 'profile_left':
          charModelView.style.transform = 'rotateY(-90deg)';
          break;
        case 'three_quarter_right':
          charModelView.style.transform = 'rotateY(45deg)';
          break;
        case 'profile_right':
          charModelView.style.transform = 'rotateY(90deg)';
          break;
        case 'back':
          charModelView.style.transform = 'rotateY(180deg)';
          break;
      }
    }
  });
});

// 7. Interactive Savings Meter & Shot Route Toggle
const shotCards = document.querySelectorAll('.shot-card');
shotCards.forEach((card) => {
  card.addEventListener('click', () => {
    const shotId = card.getAttribute('data-shot-id');
    const shot = state.shots.find((s) => s.id === shotId);
    if (!shot) return;

    // Toggle deterministic vs generative
    shot.isDeterministic = !shot.isDeterministic;
    shot.route = shot.isDeterministic ? 'deterministic_hyperframes' : 'generative_full_video';
    shot.cost = shot.isDeterministic ? 0.0 : 0.50;

    // Update Card UI
    const badge = card.querySelector('.shot-route-badge');
    if (badge) {
      if (shot.isDeterministic) {
        badge.className = 'shot-route-badge deterministic';
        badge.textContent = '⚡ HYPERFRAMES ($0.00)';
        card.className = 'shot-card deterministic-border';
      } else {
        badge.className = 'shot-route-badge generative';
        badge.textContent = '🎬 VEO 2 ($0.50)';
        card.className = 'shot-card generative-border';
      }
    }

    recalculateSavings();
  });
});

function recalculateSavings() {
  const actualShotCost = state.shots.reduce((acc, s) => acc + s.cost, 0);
  const audioCost = 0.25; // dialogue + music + sfx
  const totalActual = actualShotCost + audioCost;

  const pureGenEstimate = state.shots.length * 0.75 + audioCost;
  const totalSaved = Math.max(0, pureGenEstimate - totalActual);
  const savingsPct = ((totalSaved / pureGenEstimate) * 100).toFixed(1);

  // Update Savings Badge in Header
  const savingsBadge = document.getElementById('savings-badge');
  if (savingsBadge) {
    savingsBadge.innerHTML = `<span class="savings-icon">⚡</span><span class="savings-text">DEMO BENCHMARK: <strong>${savingsPct}%</strong> ($${totalSaved.toFixed(2)})</span>`;
  }

  // Update Donut Chart
  const donutChart = document.querySelector('.donut-chart');
  const donutVal = document.querySelector('.donut-val');
  if (donutChart) donutChart.style.setProperty('--percent', savingsPct);
  if (donutVal) {
    donutVal.classList.remove('not-measured');
    donutVal.textContent = `${savingsPct}%`;
  }

  // Update Cost Numbers
  const costActualEl = document.querySelector('.cost-box.actual .cost-amount');
  if (costActualEl) costActualEl.textContent = `$${totalActual.toFixed(2)} USD (DEMO)`;
  const costGenEl = document.querySelector('.cost-box.generative .cost-amount');
  if (costGenEl) costGenEl.textContent = `$${pureGenEstimate.toFixed(2)} USD (EST)`;
}

// 8. Deliverable Downloads
function triggerDownload(filename, content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('btn-dl-html5')?.addEventListener('click', () => {
  const playerBundle = `<!DOCTYPE html><html><head><title>AI Animation Studio Master Player</title></head><body><h1>Master Production Player</h1><p>Offline standalone export.</p></body></html>`;
  triggerDownload('master_player_bundle.html', playerBundle, 'text/html');
});

document.getElementById('btn-dl-otio')?.addEventListener('click', () => {
  const otioData = {
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Master Timeline [Cyberpunk: Neon Horizon]',
    tracks: {
      children: [
        { name: 'Video Track 1', kind: 'Video' },
        { name: 'Dialogue (A1)', kind: 'Audio' },
        { name: 'Score (A2)', kind: 'Audio' }
      ]
    }
  };
  triggerDownload('timeline_interchange.otio', JSON.stringify(otioData, null, 2), 'application/json');
});

document.getElementById('btn-dl-edl')?.addEventListener('click', () => {
  const edlData = `TITLE: MASTER_TIMELINE\nFCM: NON-DROP FRAME\n001  V1  C  00:00:00:00 00:00:03:12 00:00:00:00 00:00:03:12\n* FROM CLIP NAME: SHOT_01\n002  V1  C  00:00:00:00 00:00:04:00 00:00:03:12 00:00:07:12\n* FROM CLIP NAME: SHOT_02\n`;
  triggerDownload('master_edit.edl', edlData, 'text/plain');
});

document.getElementById('btn-dl-manifest')?.addEventListener('click', () => {
  const manifestData = {
    manifestId: 'manifest_cyber_01',
    format: 'mp4_manifest',
    resolution: { width: 1920, height: 1080 },
    fps: 24,
    totalFrames: 180,
    outputFiles: [{ uri: 'cyber_01_master.mp4', codec: 'h264_aac' }]
  };
  triggerDownload('video_render_manifest.json', JSON.stringify(manifestData, null, 2), 'application/json');
});

// Initialize UI
updatePlaybackUI();
