const CHANNEL_NAME = 'zigobox-pilotage-service-technique';
const STORAGE_KEY = 'zigobox_pilotage_event';
const LOG_KEY = 'zigobox_pilotage_log';

const channel = ('BroadcastChannel' in window) ? new BroadcastChannel(CHANNEL_NAME) : null;

const $ = (id) => document.getElementById(id);
const sender = $('sender');
const message = $('message');
const lastCommand = $('lastCommand');
const lastMessage = $('lastMessage');
const lastSender = $('lastSender');
const lastTime = $('lastTime');
const logEl = $('log');

function nowText(ts) {
  return new Date(ts).toLocaleString('fr-FR');
}

function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); }
  catch { return []; }
}

function saveLog(items) {
  localStorage.setItem(LOG_KEY, JSON.stringify(items.slice(0, 100)));
}

function addLog(event, local=true) {
  const items = loadLog();
  const exists = items.some(x => x.id === event.id);
  if (!exists) {
    items.unshift(event);
    saveLog(items);
  }
  renderLog();
  showEvent(event);
}

function renderLog() {
  const items = loadLog();
  logEl.innerHTML = items.length ? items.map(e => `
    <div class="entry">
      <strong>${escapeHtml(e.command)} — ${escapeHtml(e.message || 'Sans message')}</strong>
      <small>${escapeHtml(e.sender)} • ${nowText(e.timestamp)}</small>
    </div>`).join('') : '<p>Aucun échange pour le moment.</p>';
}

function escapeHtml(v='') {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showEvent(e) {
  lastCommand.textContent = e.command || '—';
  lastMessage.textContent = e.message || '—';
  lastSender.textContent = e.sender || '—';
  lastTime.textContent = e.timestamp ? nowText(e.timestamp) : '—';
}

function send(command) {
  const event = {
    id: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random()),
    type: 'PILOTAGE_COMMAND',
    command,
    message: message.value.trim(),
    sender: sender.value.trim() || 'ZiGoBox',
    timestamp: Date.now()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
  if (channel) channel.postMessage(event);
  addLog(event);
  message.value = '';
}

document.querySelectorAll('[data-command]').forEach(btn => {
  btn.addEventListener('click', () => send(btn.dataset.command));
});

window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEY && e.newValue) {
    try { addLog(JSON.parse(e.newValue), false); } catch {}
  }
});

if (channel) {
  channel.onmessage = ev => {
    if (ev.data && ev.data.type === 'PILOTAGE_COMMAND') addLog(ev.data, false);
  };
}

$('clearLog').onclick = () => {
  localStorage.removeItem(LOG_KEY);
  renderLog();
};

renderLog();
try {
  const e = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (e) showEvent(e);
} catch {}
