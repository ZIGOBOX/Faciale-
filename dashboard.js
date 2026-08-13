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
 $('agentList').innerHTML=agents.length?agents.map(a=>{const s=agentStatus(a);return `<div class="agent-tile"><div class="avatar">${initials(name(a))}</div><div><b>${esc(name(a))}</b><small>${esc(s.text)}</small></div><span class="agent-status ${s.kind||''}"></span></div>`}).join(''):'<div class="empty">Aucun agent actif</div>';
 const presentCount=agents.filter(a=>agentStatus(a).kind==='good').length;
 const presencePct=agents.length?Math.round(presentCount/agents.length*100):0;
 if($('presenceGauge'))$('presenceGauge').style.width=presencePct+'%';
 if($('presenceGaugeText'))$('presenceGaugeText').textContent=presencePct+'%';

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


function numericText(id){
 const el=$(id); if(!el)return 0;
 const m=String(el.textContent||'').replace(',','.').match(/-?\d+(?:\.\d+)?/);
 return m?Number(m[0]):0;
}
function renderPriorityVisual(data){
 const sources=[['issues','Sécurité'],['maintenance','Maintenance'],['requests','Direction'],['works','Chantier'],['notes','Note'],['personalEvents','Agenda']];
 const counts={Urgente:0,Haute:0,Normale:0,Basse:0};
 for(const [k] of sources){
   for(const x of (data[k]||[])){
     if(closed(x.status))continue;
     const p=String(x.priority||'Normale');
     if(urgent(p))counts.Urgente++;
     else if(norm(p)==='haute')counts.Haute++;
     else if(norm(p)==='basse')counts.Basse++;
     else counts.Normale++;
   }
 }
 const total=Object.values(counts).reduce((a,b)=>a+b,0);
 if($('priorityTotal'))$('priorityTotal').textContent=total;
 const vals=[counts.Urgente,counts.Haute,counts.Normale,counts.Basse];
 const colors=['#d92f3d','#ef8b1e','#1676c8','#189558'];
 let acc=0, stops=[];
 vals.forEach((v,i)=>{const from=total?acc/total*100:0;acc+=v;const to=total?acc/total*100:0;stops.push(`${colors[i]} ${from}% ${to}%`)});
 if($('priorityDonut'))$('priorityDonut').style.background=total?`conic-gradient(${stops.join(',')})`:'#e8edf2';
 const labels=[['Urgente',counts.Urgente,colors[0]],['Haute',counts.Haute,colors[1]],['Normale',counts.Normale,colors[2]],['Basse',counts.Basse,colors[3]]];
 if($('priorityLegend'))$('priorityLegend').innerHTML=labels.map(([l,v,c])=>`<div class="legend-row"><i style="background:${c}"></i><span>${l}</span><b>${v}</b></div>`).join('');
}
function renderDomainBars(data){
 const open=(data.maintenance||[]).filter(x=>!closed(x.status));
 const map=new Map();
 for(const x of open){
   const k=x.family||x.category||x.domain||x.type||'Autre';
   map.set(k,(map.get(k)||0)+1);
 }
 const rows=[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6), max=Math.max(1,...rows.map(x=>x[1]));
 if($('domainBars'))$('domainBars').innerHTML=rows.length?rows.map(([k,v])=>`<div class="domain-row"><b>${esc(k)}</b><div class="bartrack"><div class="barfill" style="width:${Math.round(v/max*100)}%"></div></div><strong>${v}</strong></div>`).join(''):'<div class="empty">Aucune intervention ouverte</div>';
}
function maintenanceDate(x){
 const raw=x.createdAt||x.created||x.date||x.startDate||x.requestDate||x.updatedAt||'';
 const d=new Date(raw); return Number.isNaN(d.getTime())?null:d;
}
function renderActivityChart(data){
 const canvas=$('activityChart'); if(!canvas)return;
 const dpr=Math.max(1,window.devicePixelRatio||1), rect=canvas.getBoundingClientRect();
 const w=Math.max(300,Math.round(rect.width||720)),h=Math.max(150,Math.round(rect.height||190));
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const days=[], vals=[];
 for(let i=6;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);days.push(d);vals.push(0)}
 for(const x of (data.maintenance||[])){
   const d=maintenanceDate(x);if(!d)continue;
   const key=iso(d), idx=days.findIndex(z=>iso(z)===key);if(idx>=0)vals[idx]++;
 }
 const max=Math.max(1,...vals),pad={l:20,r:14,t:14,b:15},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
 ctx.strokeStyle='#dfe6ec';ctx.lineWidth=1;
 for(let i=0;i<4;i++){const y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}
 const pts=vals.map((v,i)=>({x:pad.l+cw*(i/(vals.length-1||1)),y:pad.t+ch-(v/max)*ch}));
 ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineTo(pts.at(-1).x,pad.t+ch);ctx.lineTo(pts[0].x,pad.t+ch);ctx.closePath();
 const grad=ctx.createLinearGradient(0,pad.t,0,pad.t+ch);grad.addColorStop(0,'rgba(22,118,200,.28)');grad.addColorStop(1,'rgba(22,118,200,.02)');ctx.fillStyle=grad;ctx.fill();
 ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#1676c8';ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke();
 pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle=vals[i]?'#1676c8':'#b8c5d0';ctx.fill()});
 if($('activityLabels'))$('activityLabels').innerHTML=days.map(d=>`<span>${d.toLocaleDateString('fr-FR',{weekday:'short'}).replace('.','')}</span>`).join('');
 if($('weekTotal'))$('weekTotal').textContent=vals.reduce((a,b)=>a+b,0);
}
function renderVisuals(data){
 renderPriorityVisual(data);
 renderDomainBars(data);
 renderActivityChart(data);
}

function refresh(){
 const data=db();
 if(!data){$('state').textContent='Base Pilotage non trouvée';$('state').className='';return}
 renderLists(data);
 renderVisuals(data);
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

window.addEventListener('resize',()=>{const data=db();if(data)renderActivityChart(data)});
