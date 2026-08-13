const AGENT_KEY='zigobox_dashboard_agents';
const CHANNEL_NAME='zigobox-pilotage-service-technique';
const EVENT_KEY='zigobox_pilotage_event';
const LOG_KEY='zigobox_pilotage_log';
const INBOX_KEY='zigobox_pilotage_inbox';

const defaults=[
{name:'Lucas Martin',zone:'Atelier',status:'Présent'},
{name:'Sophie Bernard',zone:'Bâtiment A',status:'Présent'},
{name:'Thomas Petit',zone:'Bâtiment B',status:'En intervention'},
{name:'David Leroy',zone:'Extérieur',status:'En intervention'},
{name:'Nicolas Durand',zone:'Bâtiment B',status:'Absent'}
];

let channel=null;
if('BroadcastChannel' in window){
  channel=new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage=e=>{
    if(e.data) processPilotageEvent(e.data);
  };
}

window.addEventListener('storage',e=>{
  if(e.key===EVENT_KEY && e.newValue){
    try{ processPilotageEvent(JSON.parse(e.newValue)); }catch{}
  }
  if(e.key===LOG_KEY || e.key===INBOX_KEY){
    refreshFromPilotage();
  }
});

function loadAgents(){
  try{return JSON.parse(localStorage.getItem(AGENT_KEY))||defaults}catch{return defaults}
}
function saveAgents(a){localStorage.setItem(AGENT_KEY,JSON.stringify(a))}
function initials(n){return n.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()}
function cls(s){return s==='Présent'?'present':s==='En intervention'?'intervention':'absent'}

function renderAgents(){
 const a=loadAgents(), box=document.getElementById('agents');
 box.innerHTML=a.map((x,i)=>`<div class="agent-row">
   <div class="avatar">${initials(x.name)}</div>
   <div class="agent-info"><b>${x.name}</b><small>${x.zone}</small></div>
   <select class="status-select" data-i="${i}">
     <option ${x.status==='Présent'?'selected':''}>Présent</option>
     <option ${x.status==='En intervention'?'selected':''}>En intervention</option>
     <option ${x.status==='Absent'?'selected':''}>Absent</option>
   </select>
   <i class="dot ${cls(x.status)}"></i>
 </div>`).join('');
 document.querySelectorAll('.status-select').forEach(s=>s.onchange=e=>{
   const list=loadAgents(),i=Number(e.target.dataset.i);
   list[i].status=e.target.value;
   saveAgents(list);
   renderAgents();
 });
 document.getElementById('presentCount').textContent=a.filter(x=>x.status==='Présent').length;
}

function clock(){
 const d=new Date();
 document.getElementById('today').textContent=d.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
 document.getElementById('clock').textContent=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(clock,1000);clock();renderAgents();

const modal=document.getElementById('agentModal');
document.getElementById('addAgent').onclick=()=>modal.classList.remove('hidden');
document.getElementById('cancelAgent').onclick=()=>modal.classList.add('hidden');
document.getElementById('saveAgent').onclick=()=>{
 const name=document.getElementById('newName').value.trim();
 const zone=document.getElementById('newZone').value.trim();
 if(!name)return alert('Entre le nom de l’agent.');
 const a=loadAgents();
 a.push({name,zone:zone||'Non renseigné',status:'Présent'});
 saveAgents(a);
 document.getElementById('newName').value='';
 document.getElementById('newZone').value='';
 modal.classList.add('hidden');
 renderAgents();
};

function readArray(key){
  try{
    const x=JSON.parse(localStorage.getItem(key)||'[]');
    return Array.isArray(x)?x:[];
  }catch{return []}
}

function getAllPilotageEvents(){
  const byId=new Map();
  [...readArray(LOG_KEY),...readArray(INBOX_KEY)].forEach(e=>{
    if(e && e.id) byId.set(e.id,e);
  });
  try{
    const last=JSON.parse(localStorage.getItem(EVENT_KEY)||'null');
    if(last && last.id) byId.set(last.id,last);
  }catch{}
  return [...byId.values()].sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
}

function escapeHtml(v=''){
  return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function processPilotageEvent(e){
  if(!e || e.type!=='PILOTAGE_COMMAND') return;
  refreshFromPilotage();
  const badge=document.getElementById('connectionBadge');
  if(badge){
    badge.textContent='Connecté • nouveau message';
    badge.className='connection-badge connected';
    setTimeout(()=>badge.textContent='Connecté au Pilotage',2200);
  }
}

function refreshFromPilotage(){
  const events=getAllPilotageEvents();
  const alerts=events.filter(e=>e.command==='ALERTE');
  const interventions=events.filter(e=>e.command==='INTERVENTION');
  const resolved=events.filter(e=>e.command==='OK');
  const infos=events.filter(e=>e.command==='INFO');

  const total=events.length;
  document.getElementById('kTotal').textContent=total || 0;
  document.getElementById('kUrgent').textContent=alerts.length;
  document.getElementById('kDone').textContent=resolved.length;
  document.getElementById('kProgress').textContent=interventions.length;
  document.getElementById('kTodo').textContent=Math.max(0,alerts.length+interventions.length-resolved.length);
  document.getElementById('kLate').textContent=0;

  const alertBox=document.getElementById('alerts');
  if(alertBox){
    const latestAlerts=alerts.slice(0,5);
    alertBox.innerHTML=latestAlerts.length?latestAlerts.map(e=>`
      <div>
        <span>⚠️</span>
        <p><b>${escapeHtml(e.message||'Alerte technique')}</b>
        <small>${escapeHtml(e.sender||'Pilotage')} • ${e.timestamp?new Date(e.timestamp).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</small></p>
        <em>URGENT</em>
      </div>`).join(''):
      '<div><span>✅</span><p><b>Aucune alerte active</b><small>Le Pilotage n’a envoyé aucune alerte</small></p></div>';
  }

  const lastEvent=events[0];
  const live=document.getElementById('liveEvent');
  if(live){
    live.innerHTML=lastEvent
      ? `<b>${escapeHtml(lastEvent.command||'INFO')}</b> — ${escapeHtml(lastEvent.message||'Sans message')} <small>${escapeHtml(lastEvent.sender||'Pilotage')}</small>`
      : 'Aucun événement reçu pour le moment.';
  }

  const badge=document.getElementById('connectionBadge');
  if(badge){
    badge.textContent='Connecté au Pilotage';
    badge.className='connection-badge connected';
  }
}

refreshFromPilotage();
