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

let cloudDb=null;
let cloudUpdatedAt='';
let supabaseClient=null;
let syncBusy=false;

function localDb(){
  try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}
}
function db(){return cloudDb||localDb()}
function item(title,sub='',tag='',kind=''){return `<div class="row"><div class="avatar">${initials(title)}</div><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>${tag?`<span class="tag ${kind}">${esc(tag)}</span>`:''}</div>`}
function setList(id,rows,msg='Aucune donnée'){ const el=$(id); if(!el)return; el.innerHTML=rows.length?rows.join(''):`<div class="empty">${msg}</div>`}


async function ensureCloudClient(){
  if(supabaseClient)return supabaseClient;
  const cfg=window.SUPABASE_CONFIG||{};
  if(!window.supabase)throw new Error('Module Supabase non chargé');
  if(!cfg.url||!cfg.publishableKey)throw new Error('Configuration Supabase non chargée');
  supabaseClient=window.supabase.createClient(cfg.url,cfg.publishableKey);
  return supabaseClient;
}

async function fetchCloudDb(){
  const client=await ensureCloudClient();
  const {data:authData,error:authError}=await client.auth.getSession();
  if(authError)throw authError;
  const session=authData?.session;
  if(!session?.user?.id)throw new Error('Session Pilotage absente — ouvrez Pilotage et connectez-vous');
  const {data,error}=await client
    .from('app_state')
    .select('data,updated_at')
    .eq('user_id',session.user.id)
    .maybeSingle();
  if(error)throw error;
  if(!data?.data)throw new Error('Aucune donnée Pilotage trouvée sur le serveur');
  cloudDb=data.data;
  cloudUpdatedAt=data.updated_at||'';
  return cloudDb;
}

function setConnectionState(text,ok=false){
  const el=$('state');
  if(!el)return;
  el.textContent=text;
  el.className=ok?'state ok':'state';
}

async function syncCloudAndRender(){
  if(syncBusy)return;
  syncBusy=true;
  try{
    setConnectionState('Synchronisation…',false);
    const data=await fetchCloudDb();
    renderLists(data);
    renderVisuals(data);

    // L'iframe garde un rôle secondaire : si elle a fini de charger,
    // on récupère les KPI déjà calculés par l'application officielle.
    copyKpisFromPilotage();

    const serverTime=cloudUpdatedAt
      ? new Date(cloudUpdatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
      : new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    setConnectionState('Connecté au Pilotage ✓',true);
    if($('lastSync'))$('lastSync').textContent=`Serveur lu à ${serverTime}`;
    if($('lastUpdate'))$('lastUpdate').textContent=`Mise à jour : ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`;
  }catch(error){
    console.error('Synchronisation dashboard :',error);
    const local=localDb();
    if(local){
      cloudDb=null;
      renderLists(local);
      renderVisuals(local);
      copyKpisFromPilotage();
      setConnectionState('Mode local • serveur indisponible',false);
      if($('lastSync'))$('lastSync').textContent=`Données locales • ${error?.message||error}`;
    }else{
      setConnectionState('Données indisponibles',false);
      if($('lastSync'))$('lastSync').textContent=error?.message||String(error);
    }
  }finally{
    syncBusy=false;
  }
}

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


function drawSpark(id,values,color){
 const c=$(id);if(!c)return;const r=c.getBoundingClientRect(),w=Math.max(120,r.width||180),h=Math.max(38,r.height||48),dpr=window.devicePixelRatio||1;
 c.width=w*dpr;c.height=h*dpr;const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
 const max=Math.max(1,...values),min=Math.min(0,...values),range=Math.max(1,max-min);
 x.strokeStyle='#e8edf2';x.beginPath();x.moveTo(0,h-8);x.lineTo(w,h-8);x.stroke();
 x.beginPath();values.forEach((v,i)=>{const px=5+(w-10)*(i/(values.length-1||1)),py=5+(h-16)*(1-(v-min)/range);i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle=color;x.lineWidth=2;x.stroke();
 values.forEach((v,i)=>{const px=5+(w-10)*(i/(values.length-1||1)),py=5+(h-16)*(1-(v-min)/range);x.beginPath();x.arc(px,py,2.3,0,Math.PI*2);x.fillStyle=color;x.fill()});
}
function recentCounts(arr,dateFields){
 const days=[],vals=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);days.push(d);vals.push(0)}
 for(const x of arr||[]){let raw='';for(const f of dateFields){if(x?.[f]){raw=x[f];break}}const d=new Date(raw);if(Number.isNaN(d.getTime()))continue;const idx=days.findIndex(z=>iso(z)===iso(d));if(idx>=0)vals[idx]++}
 return {days,vals};
}
function renderPresence(data){
 const t=today(),agents=(data.agents||[]).filter(a=>norm(a.status)==='actif'),dayRows=data.agentDays||[],todayDays=dayRows.filter(x=>String(x.date)===t);
 const present=agents.filter(a=>{const rec=todayDays.find(x=>String(x.agentId)===String(a.id));if(rec){const typ=rec.dayType||'Présence';return typ==='Présence'||typ==='Formation'}const wd=new Date(t+'T12:00:00').getDay();return (a.workdays||[1,2,3,4,5]).map(Number).includes(wd)}).length;
 const pct=agents.length?Math.round(present/agents.length*100):0;
 $('presencePct').textContent=pct+'%';$('presenceRing').style.background=`conic-gradient(#22a55b 0 ${pct}%,#edf2f6 ${pct}% 100%)`;
}
function renderPlanning(data){
 const t=today();
 const rows=[];
 for(const x of (data.meetings||[]))if(String(x.date||'')===t&&!closed(x.status))rows.push({time:x.time||'',title:x.title||'Rendez-vous',sub:x.location||'',status:x.status||'Planifié'});
 for(const x of (data.maintenance||[])){const d=String(x.date||x.startDate||x.requestDate||x.createdAt||'').slice(0,10);if(d===t&&!closed(x.status))rows.push({time:x.time||'',title:x.title||x.no||'Intervention',sub:[x.building,x.room].filter(Boolean).join(' • '),status:x.status||'En cours'})}
 rows.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
 $('planningCount').textContent=rows.length;
 $('todayPlanning').innerHTML=rows.length?rows.slice(0,6).map(r=>`<div class="row"><div class="avatar">◷</div><div><b>${esc((r.time?r.time+' ':'')+r.title)}</b><small>${esc(r.sub)}</small></div><span class="tag ${norm(r.status).includes('cours')?'warn':'good'}">${esc(r.status)}</span></div>`).join(''):'<div class="empty">Aucune intervention planifiée aujourd’hui</div>';
 return rows.length;
}
function renderUrgencyDonut(data){
 const all=[];for(const k of ['issues','maintenance','requests','works','notes','personalEvents'])for(const x of (data[k]||[]))if(!closed(x.status))all.push(x);
 const very=all.filter(x=>urgent(x.priority)).length;
 const high=all.filter(x=>norm(x.priority)==='haute').length;
 const watch=Math.max(0,all.filter(x=>!urgent(x.priority)&&norm(x.priority)!=='haute').length);
 const total=very+high+watch;$('urgencyTotal').textContent=total;
 const p1=total?very/total*100:0,p2=total?high/total*100:0;
 $('urgencyDonut').style.background=total?`conic-gradient(#e53935 0 ${p1}%,#f59e0b ${p1}% ${p1+p2}%,#f6c453 ${p1+p2}% 100%)`:'#edf2f6';
 $('urgencyLegend').innerHTML=[
   ['Très urgentes',very,'#e53935'],['Urgentes',high,'#f59e0b'],['À surveiller',watch,'#f6c453']
 ].map(([l,v,c])=>`<div class="urgency-row"><i style="background:${c}"></i><span>${l}</span><b>${v}</b></div>`).join('');
}
function renderDomainBars(data){
 const open=(data.maintenance||[]).filter(x=>!closed(x.status)),m=new Map();
 for(const x of open){const k=x.family||x.category||x.domain||x.type||'Autre';m.set(k,(m.get(k)||0)+1)}
 const rows=[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5),max=Math.max(1,...rows.map(x=>x[1]));
 $('domainBars').innerHTML=rows.length?rows.map(([k,v])=>`<div class="domain-row"><b>${esc(k)}</b><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/max*100)}%"></div></div><strong>${Math.round(v/max*100)}%</strong></div>`).join(''):'<div class="empty">Aucune intervention ouverte</div>';
}
function renderMainChart(data){
 const c=$('mainChart');if(!c)return;const r=c.getBoundingClientRect(),w=Math.max(500,r.width||900),h=Math.max(260,r.height||315),dpr=window.devicePixelRatio||1;c.width=w*dpr;c.height=h*dpr;
 const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const urg=recentCounts([...(data.issues||[]),...(data.requests||[])],['createdAt','date','startDate']);
 const mai=recentCounts(data.maintenance||[],['createdAt','date','startDate','requestDate']);
 const per=recentCounts(data.periodic||[],['nextDate','lastDate']);
 const t=today(),agents=(data.agents||[]).filter(a=>norm(a.status)==='actif'),days=urg.days;
 const pres=days.map(d=>{const ds=iso(d),dayRows=(data.agentDays||[]).filter(x=>String(x.date)===ds);if(!agents.length)return 0;let p=0;for(const a of agents){const rec=dayRows.find(x=>String(x.agentId)===String(a.id));if(rec){const typ=rec.dayType||'Présence';if(typ==='Présence'||typ==='Formation')p++}else{const wd=d.getDay();if((a.workdays||[1,2,3,4,5]).map(Number).includes(wd))p++}}return Math.round(p/agents.length*100)});
 const series=[{v:urg.vals,c:'#e53935'},{v:mai.vals,c:'#2f80ed'},{v:per.vals,c:'#f59e0b'},{v:pres,c:'#22a55b'}];
 const max=Math.max(100,...series.flatMap(s=>s.v)),pad={l:34,r:12,t:12,b:28},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
 ctx.strokeStyle='#e8edf2';ctx.lineWidth=1;for(let i=0;i<=5;i++){const y=pad.t+ch*i/5;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillStyle='#7b8897';ctx.font='10px sans-serif';ctx.fillText(String(Math.round(max*(1-i/5))),2,y+3)}
 series.forEach(s=>{ctx.beginPath();s.v.forEach((v,i)=>{const x=pad.l+cw*i/6,y=pad.t+ch-(v/max)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=s.c;ctx.lineWidth=2.2;ctx.stroke();s.v.forEach((v,i)=>{const x=pad.l+cw*i/6,y=pad.t+ch-(v/max)*ch;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle=s.c;ctx.fill()})});
 days.forEach((d,i)=>{ctx.fillStyle='#69788a';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(d.toLocaleDateString('fr-FR',{weekday:'short'}).replace('.',''),pad.l+cw*i/6,h-7)});
}
function renderSparks(data){
 const u=recentCounts([...(data.issues||[]),...(data.requests||[])],['createdAt','date','startDate']).vals;
 const m=recentCounts(data.maintenance||[],['createdAt','date','startDate','requestDate']).vals;
 const p=recentCounts(data.periodic||[],['nextDate','lastDate']).vals;
 const plan=recentCounts([...(data.meetings||[]),...(data.maintenance||[])],['date','startDate','requestDate','createdAt']).vals;
 drawSpark('sparkUrgent',u,'#e53935');drawSpark('sparkMaint',m,'#2f80ed');drawSpark('sparkPeriodic',p,'#e53935');drawSpark('sparkPlanning',plan,'#f59e0b');
 drawSpark('sparkClean',[95,96,94,95,96,95,96],'#22a55b');
}
function renderVisuals(data){
 renderPresence(data);renderPlanning(data);renderUrgencyDonut(data);renderDomainBars(data);renderMainChart(data);renderSparks(data);
 const d=new Date();$('todayTitle').textContent=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});$('lastUpdate').textContent='Mise à jour : '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}

function refresh(){
  return syncCloudAndRender();
}


$('pilotageSource').addEventListener('load',()=>{
  // L'iframe n'est plus la source principale, mais permet de recopier
  // les KPI exacts calculés par l'application si elle est déjà authentifiée.
  setTimeout(copyKpisFromPilotage,1500);
  setTimeout(copyKpisFromPilotage,4000);
});

window.addEventListener('storage',e=>{
  if(e.key===KEY && !syncBusy){
    const local=localDb();
    if(!cloudDb && local){renderLists(local);renderVisuals(local)}
  }
});

$('refresh').onclick=syncCloudAndRender;
if($('refreshTop'))$('refreshTop').onclick=syncCloudAndRender;

setInterval(()=>{
  if($('clock'))$('clock').textContent=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
},1000);

// Source de vérité : Supabase toutes les 5 secondes.
setInterval(syncCloudAndRender,5000);

window.addEventListener('online',syncCloudAndRender);
window.addEventListener('focus',syncCloudAndRender);
window.addEventListener('resize',()=>{
  const data=db();
  if(data){renderMainChart(data);renderSparks(data)}
});

// Premier chargement immédiat.
syncCloudAndRender();
