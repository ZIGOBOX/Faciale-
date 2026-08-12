const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const registerFaceBtn = document.getElementById('registerFace');
const clearFaceBtn = document.getElementById('clearFace');
const startCameraBtn = document.getElementById('startCamera');
const savedFaceEl = document.getElementById('savedFace');
const recognizedEl = document.getElementById('recognized');
const similarityEl = document.getElementById('similarity');
const spinBtn = document.getElementById('spinBtn');
const autoSpin = document.getElementById('autoSpin');
const cooldownSelect = document.getElementById('cooldown');
const threshold = document.getElementById('threshold');
const thresholdValue = document.getElementById('thresholdValue');
const winnerEl = document.getElementById('winner');
const prizeDialog = document.getElementById('prizeDialog');
const prizeText = document.getElementById('prizeText');
const editPrizes = document.getElementById('editPrizes');
const savePrizes = document.getElementById('savePrizes');

let human;
let currentEmbedding = null;
let savedEmbedding = null;
let cameraRunning = false;
let lastTrigger = 0;
let spinning = false;

let prizes = JSON.parse(localStorage.getItem('zigobox_prizes') || 'null') || [
  '🎁 Cadeau',
  '📸 Photo offerte',
  '⭐ Surprise',
  '🎉 Bravo !',
  '😄 Rejoue',
  '💝 Lot bonus',
  '🥳 Jackpot',
  '✨ Goodie'
];

function setStatus(text, type='') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + type;
}

function loadSavedFace() {
  try {
    const raw = localStorage.getItem('zigobox_face_embedding');
    savedEmbedding = raw ? JSON.parse(raw) : null;
    savedFaceEl.textContent = savedEmbedding ? 'Oui' : 'Non';
  } catch {
    savedEmbedding = null;
    savedFaceEl.textContent = 'Non';
  }
}

async function initHuman() {
  setStatus('Chargement de l’IA…', 'warn');
  const config = {
    backend: 'webgl',
    cacheSensitivity: 0,
    face: {
      enabled: true,
      detector: { rotation: true, maxDetected: 1 },
      mesh: { enabled: true },
      iris: { enabled: false },
      description: { enabled: true },
      emotion: { enabled: false }
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false }
  };

  human = new Human.Human(config);
  await human.load();
  await human.warmup();
  setStatus('IA prête', 'ok');
}

async function startCamera() {
  if (cameraRunning) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    cameraRunning = true;
    startCameraBtn.textContent = 'Caméra active';
    startCameraBtn.disabled = true;
    setStatus('Caméra active', 'ok');
    detectLoop();
  } catch (err) {
    console.error(err);
    setStatus('Caméra refusée ou indisponible', 'warn');
    alert("Impossible d'accéder à la caméra. Sur GitHub Pages, vérifie que tu es bien en HTTPS et autorise la caméra.");
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

function drawFace(face, isMatch=false) {
  const ctx = overlay.getContext('2d');
  overlay.width = video.videoWidth || 640;
  overlay.height = video.videoHeight || 480;
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  if (!face?.box) return;
  const [x, y, w, h] = face.box;
  ctx.lineWidth = 5;
  ctx.strokeStyle = isMatch ? '#22c55e' : '#f59e0b';
  ctx.strokeRect(x, y, w, h);
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = isMatch ? '#22c55e' : '#f59e0b';
  ctx.fillText(isMatch ? 'RECONNU ✓' : 'Visage détecté', x, Math.max(28, y - 10));
}

async function detectLoop() {
  if (!cameraRunning) return;

  try {
    const result = await human.detect(video);
    const face = result.face && result.face[0];

    if (face) {
      currentEmbedding = face.embedding || null;

      let score = 0;
      let isMatch = false;

      if (savedEmbedding && currentEmbedding) {
        score = cosineSimilarity(savedEmbedding, currentEmbedding);
        isMatch = score >= Number(threshold.value);
        similarityEl.textContent = score.toFixed(3);
        recognizedEl.textContent = isMatch ? 'Oui ✓' : 'Non';
      } else {
        similarityEl.textContent = '—';
        recognizedEl.textContent = 'Non';
      }

      drawFace(face, isMatch);

      if (isMatch && autoSpin.checked && !spinning) {
        const now = Date.now();
        const cooldown = Number(cooldownSelect.value);
        if (now - lastTrigger > cooldown) {
          lastTrigger = now;
          spinWheel();
        }
      }
    } else {
      currentEmbedding = null;
      recognizedEl.textContent = 'Non';
      similarityEl.textContent = '—';
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  } catch (err) {
    console.warn('Détection:', err);
  }

  requestAnimationFrame(detectLoop);
}

registerFaceBtn.addEventListener('click', () => {
  if (!currentEmbedding) {
    alert("Aucun visage exploitable détecté. Regarde la caméra et réessaie.");
    return;
  }
  localStorage.setItem('zigobox_face_embedding', JSON.stringify(currentEmbedding));
  savedEmbedding = [...currentEmbedding];
  savedFaceEl.textContent = 'Oui';
  setStatus('Visage enregistré', 'ok');
});

clearFaceBtn.addEventListener('click', () => {
  localStorage.removeItem('zigobox_face_embedding');
  savedEmbedding = null;
  savedFaceEl.textContent = 'Non';
  recognizedEl.textContent = 'Non';
  similarityEl.textContent = '—';
  setStatus('Visage effacé', 'warn');
});

threshold.addEventListener('input', () => {
  thresholdValue.textContent = Number(threshold.value).toFixed(2);
  localStorage.setItem('zigobox_threshold', threshold.value);
});

const savedThreshold = localStorage.getItem('zigobox_threshold');
if (savedThreshold) {
  threshold.value = savedThreshold;
  thresholdValue.textContent = Number(savedThreshold).toFixed(2);
}

startCameraBtn.addEventListener('click', startCamera);

// ---------------- ROUE ----------------

const wheel = document.getElementById('wheel');
const wctx = wheel.getContext('2d');
let angle = 0;

function drawWheel() {
  const size = wheel.width;
  const center = size / 2;
  const radius = center - 14;
  const slice = Math.PI * 2 / prizes.length;

  wctx.clearRect(0, 0, size, size);

  for (let i = 0; i < prizes.length; i++) {
    const start = angle + i * slice;
    const end = start + slice;

    const hue = (i * 360 / prizes.length + 20) % 360;
    wctx.beginPath();
    wctx.moveTo(center, center);
    wctx.arc(center, center, radius, start, end);
    wctx.closePath();
    wctx.fillStyle = `hsl(${hue} 82% 55%)`;
    wctx.fill();

    wctx.strokeStyle = 'rgba(255,255,255,.75)';
    wctx.lineWidth = 4;
    wctx.stroke();

    wctx.save();
    wctx.translate(center, center);
    wctx.rotate(start + slice / 2);
    wctx.textAlign = 'right';
    wctx.fillStyle = '#fff';
    wctx.font = 'bold 23px sans-serif';
    wctx.shadowColor = 'rgba(0,0,0,.4)';
    wctx.shadowBlur = 4;
    wctx.fillText(prizes[i], radius - 28, 8);
    wctx.restore();
  }

  wctx.beginPath();
  wctx.arc(center, center, 64, 0, Math.PI * 2);
  wctx.fillStyle = '#111827';
  wctx.fill();
  wctx.strokeStyle = '#fff';
  wctx.lineWidth = 8;
  wctx.stroke();

  wctx.fillStyle = '#fff';
  wctx.textAlign = 'center';
  wctx.textBaseline = 'middle';
  wctx.font = 'bold 26px sans-serif';
  wctx.fillText('ZiGoBox', center, center);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function getWinner() {
  const slice = Math.PI * 2 / prizes.length;
  const pointerAngle = -Math.PI / 2;
  let relative = (pointerAngle - angle) % (Math.PI * 2);
  if (relative < 0) relative += Math.PI * 2;
  const index = Math.floor(relative / slice) % prizes.length;
  return prizes[index];
}

function spinWheel() {
  if (spinning || prizes.length < 2) return;
  spinning = true;
  spinBtn.disabled = true;
  winnerEl.textContent = 'La roue tourne…';

  const startAngle = angle;
  const turns = 5 + Math.random() * 3;
  const extra = Math.random() * Math.PI * 2;
  const target = startAngle + turns * Math.PI * 2 + extra;
  const duration = 4300;
  const start = performance.now();

  function animate(now) {
    const t = Math.min(1, (now - start) / duration);
    angle = startAngle + (target - startAngle) * easeOutCubic(t);
    drawWheel();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      spinning = false;
      spinBtn.disabled = false;
      const winner = getWinner();
      winnerEl.textContent = `🎉 ${winner}`;
      if (navigator.vibrate) navigator.vibrate([120, 80, 180]);
    }
  }

  requestAnimationFrame(animate);
}

spinBtn.addEventListener('click', spinWheel);

editPrizes.addEventListener('click', () => {
  prizeText.value = prizes.join('\n');
  prizeDialog.showModal();
});

savePrizes.addEventListener('click', (e) => {
  const next = prizeText.value
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 24);

  if (next.length < 2) {
    e.preventDefault();
    alert('Il faut au moins 2 lots.');
    return;
  }

  prizes = next;
  localStorage.setItem('zigobox_prizes', JSON.stringify(prizes));
  angle = 0;
  drawWheel();
});

loadSavedFace();
drawWheel();
initHuman().catch(err => {
  console.error(err);
  setStatus('Erreur de chargement IA', 'warn');
});
