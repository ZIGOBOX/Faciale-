'use strict';
const KEY='pilotage-service-technique-v25';
const $=id=>document.getElementById(id);
const norm=v=>String(v??'').trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>{d=new Date(d);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const today=()=>iso(new Date());
const closed=v=>['termine','terminee','cloture','cloturee','annule','annulee','archive','archivee','realise','realisee','non applicable'].includes(norm(v));
const urgent=v=>['urgent','urgente'].includes(norm(v));
const name=a=>a?`${a.firstName||''} ${a.lastName||''}`.trim():'Équipe';
const initials=n=>String(n||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
const due=r=>String(r?.dueDate||r?.deadline||r?.echeance||r?.endDate||r?.targetDate||r?.dateLimite||r?.date_limit||'').slice(0,10);

function db(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}
function item(title,sub='',tag='',kind=''){return `<div class="row"><div class="avatar">${initials(title)}</div><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>${tag?`<span class="tag ${kind}">${esc(tag)}</span>`:''}</div>`}
function setList(id,rows,msg='Aucune donnée'){ $(id).innerHTML=rows.length?rows.join(''):`<div class="empty">${msg}</div>`}

function copyKpisFromPilotage(){
 try{
  const doc=$('pilotageSource').contentDocument;
  if(!doc)return false;
  const map=[
   ['agents','kpiAgents'],['present','kpiPresent'],['urgent','kpiUrgentActions'],['late','kpiLate'],
   ['maint','kpiMaintenance'],['maintTodo','kpiMaintenanceTodo'],['clean','kpiCompliance'],['cleanWeak','kpiCleaningWeak'],
   ['periodic','kpiPeriodicLate'],['periodicSoon','kpiPeriodicSoon'],['notes','kpiNotes'],['notesDue','kpiNotesDue']
  ];
  let n=0;
  for(const [ours,theirs] of map){const x=doc.getElementById(theirs);if(x&&x.textContent.trim()){ $(ours).textContent=x.textContent.trim();n++}}
  return n>=8;
 }catch{return false}
}

function renderLists(data){
 const t=today(), agents=(data.agents||[]).filter(a=>norm(a.status)==='actif');
 const dayRows=data.agentDays||[];
 const todayDays=dayRows.filter(x=>String(x.date)===t);
 const agentStatus=a=>{
   const rec=todayDays.find(x=>String(x.agentId)===String(a.id));
   if(rec){
    const typ=rec.dayType||'Présence';
    if(typ!=='Présence'&&typ!=='Formation') return {text:typ,kind:'bad'};
    return {text:typ,kind:'good'};
   }
   const wd=new Date(t+'T12:00:00').getDay(), works=(a.workdays||[1,2,3,4,5]).map(Number).includes(wd);
   return works?{text:'Présence',kind:'good'}:{text:'Repos',kind:''};
 };
 setList('agentList',agents.map(a=>{const s=agentStatus(a);return item(name(a),a.role||a.assignment||'',s.text,s.kind)}),'Aucun agent actif');

 const abs=agents.map(a=>({a,s:agentStatus(a)})).filter(x=>x.s.kind==='bad');
 setList('absenceList',abs.map(x=>item(name(x.a),x.a.role||'',x.s.text,'bad')),'Aucune absence saisie aujourd’hui');

 const open=(data.maintenance||[]).filter(x=>!closed(x.status));
 setList('maintenanceList',open.slice(0,8).map(x=>item(x.title||x.no||'Intervention',[x.building,x.room].filter(Boolean).join(' • '),x.status||'Ouverte','warn')),'Aucune intervention ouverte');

 const sources=[['issues','Sécurité'],['maintenance','Maintenance'],['requests','Direction'],['works','Chantier'],['notes','Note'],['personalEvents','Agenda']];
 const urg=[];
 for(const [k,label] of sources) for(const x of (data[k]||[])) if(!closed(x.status)&&urgent(x.priority)) urg.push({...x,_label:label});
 setList('urgentList',urg.slice(0,8).map(x=>item(x.title||x.subject||x.no||x._label,`${x._label}${due(x)?' • échéance '+due(x):''}`,'Urgente','bad')),'Aucune action urgente');

 const meets=(data.meetings||[]).filter(x=>String(x.date||'')>=t&&!closed(x.status)&&norm(x.status)!=='annule').sort((a,b)=>`${a.date}${a.time||''}`.localeCompare(`${b.date}${b.time||''}`));
 setList('meetingList',meets.slice(0,7).map(x=>item(x.title||'Rendez-vous',`${x.date||''} ${x.time||''} • ${x.location||''}`,x.status||'Planifié','warn')),'Aucun rendez-vous à venir');

 const periodic=(data.periodic||[]).filter(x=>!['cloture','cloturee','non applicable','archive','archivee'].includes(norm(x.status)));
 const pStatus=x=>{
   let d=x.nextDate||'';
   if(!d&&x.lastDate&&Number(x.intervalMonths)>0){const z=new Date(x.lastDate+'T12:00:00');z.setMonth(z.getMonth()+Number(x.intervalMonths));d=iso(z)}
   if(!d)return x.status||'À planifier';
   const diff=(new Date(d+'T12:00:00')-new Date(t+'T12:00:00'))/86400000;
   return diff<0?'En retard':diff<=60?'Bientôt':'À jour';
 };
 setList('periodicList',periodic.slice(0,7).map(x=>{const s=pStatus(x);return item(x.name||'Contrôle',x.nextDate?`Échéance ${x.nextDate}`:(x.provider||''),s,norm(s)==='en retard'?'bad':norm(s)==='bientot'?'warn':'good')}),'Aucun contrôle');
}

function refresh(){
 const data=db();
 if(!data){$('state').textContent='Base Pilotage non trouvée';$('state').className='';return}
 renderLists(data);
 const exact=copyKpisFromPilotage();
 $('state').textContent=exact?'Connecté • données exactes ✓':'Connecté • chargement des compteurs…';
 $('state').className=exact?'ok':'';
 $('lastSync').textContent=`Dernière lecture : ${new Date().toLocaleTimeString('fr-FR')} • Version base ${data.version||'—'}`;
}
$('pilotageSource').addEventListener('load',()=>{setTimeout(refresh,1200);setTimeout(refresh,3500);setTimeout(refresh,7000)});
window.addEventListener('storage',e=>{if(e.key===KEY)refresh()});
window.addEventListener('message',refresh);
$('refresh').onclick=refresh;
setInterval(refresh,5000);
setInterval(()=>{$('clock').textContent=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})},1000);
refresh();
