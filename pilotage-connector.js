/*
  ZiGoBox - Connecteur pour "Pilotage Service Technique"
  À ajouter dans le dépôt https://zigobox.github.io/service-Technique-2/

  1) Dépose ce fichier à la racine du dépôt sous le nom pilotage-connector.js
  2) Dans index.html, juste avant </body>, ajoute :
     <script src="pilotage-connector.js"></script>

  Le connecteur écoute les messages provenant d'autres pages
  zigobox.github.io ouvertes dans le même navigateur.
*/

(() => {
  const CHANNEL_NAME = 'zigobox-pilotage-service-technique';
  const STORAGE_KEY = 'zigobox_pilotage_event';
  const INBOX_KEY = 'zigobox_pilotage_inbox';
  const channel = ('BroadcastChannel' in window) ? new BroadcastChannel(CHANNEL_NAME) : null;

  function saveToInbox(event) {
    let inbox = [];
    try { inbox = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]'); } catch {}
    if (inbox.some(e => e.id === event.id)) return;
    inbox.unshift(event);
    localStorage.setItem(INBOX_KEY, JSON.stringify(inbox.slice(0, 100)));

    // Événement utilisable par ton application Pilotage.
    // Exemple :
    // window.addEventListener('zigobox-pilotage-command', e => console.log(e.detail));
    window.dispatchEvent(new CustomEvent('zigobox-pilotage-command', { detail: event }));

    showNotification(event);
  }

  function showNotification(event) {
    let box = document.getElementById('zigobox-pilotage-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'zigobox-pilotage-toast';
      Object.assign(box.style, {
        position:'fixed', right:'14px', bottom:'14px', zIndex:'999999',
        maxWidth:'360px', padding:'14px 16px', borderRadius:'14px',
        background:'#0f172a', color:'#fff', fontFamily:'system-ui,sans-serif',
        boxShadow:'0 14px 40px rgba(0,0,0,.35)', display:'none'
      });
      document.body.appendChild(box);
    }
    box.innerHTML = `<strong>${escapeHtml(event.command)}</strong><br>${escapeHtml(event.message || 'Sans message')}<br><small>${escapeHtml(event.sender || 'ZiGoBox')}</small>`;
    box.style.display = 'block';
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.style.display='none', 7000);
  }

  function escapeHtml(v='') {
    return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const event = JSON.parse(e.newValue);
        if (event && event.type === 'PILOTAGE_COMMAND') saveToInbox(event);
      } catch {}
    }
  });

  if (channel) {
    channel.onmessage = e => {
      const event = e.data;
      if (event && event.type === 'PILOTAGE_COMMAND') saveToInbox(event);
    };
  }

  // Récupère aussi le dernier message au chargement
  try {
    const last = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (last && last.type === 'PILOTAGE_COMMAND') saveToInbox(last);
  } catch {}

  console.log('ZiGoBox Pilotage Connector actif');
})();
