const AGENT_KEY='zigobox_dashboard_agents';
const defaults=[
{name:'Lucas Martin',zone:'Atelier',status:'Présent'},
{name:'Sophie Bernard',zone:'Bâtiment A',status:'Présent'},
{name:'Thomas Petit',zone:'Bâtiment B',status:'En intervention'},
{name:'David Leroy',zone:'Extérieur',status:'En intervention'},
{name:'Nicolas Durand',zone:'Bâtiment B',status:'Absent'}
];

function loadAgents(){try{return JSON.parse(localStorage.getItem(AGENT_KEY))||defaults}catch{return defaults}}
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
   const list=loadAgents(),i=Number(e.target.dataset.i);list[i].status=e.target.value;saveAgents(list);renderAgents();
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
 const a=loadAgents();a.push({name,zone:zone||'Non renseigné',status:'Présent'});saveAgents(a);
 document.getElementById('newName').value='';document.getElementById('newZone').value='';
 modal.classList.add('hidden');renderAgents();
};

// Récupère le dernier événement de l'autre application s'il existe
try{
 const e=JSON.parse(localStorage.getItem('zigobox_pilotage_event')||'null');
 if(e && e.command==='ALERTE'){
   const alerts=document.getElementById('alerts');
   const row=document.createElement('div');
   row.innerHTML=`<span>⚠️</span><p><b>${e.message||'Nouvelle alerte technique'}</b><small>${e.sender||'Pilotage'}</small></p><em>URGENT</em>`;
   alerts.prepend(row);
 }
}catch(e){}
