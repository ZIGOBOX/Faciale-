'use strict';

const STORAGE_KEY='pilotage-service-technique-v25';
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const localISO=d=>{d=new Date(d);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const todayISO=()=>localISO(new Date());
const parseDate=v=>new Date(`${v}T12:00:00`);
const addDays=(v,n)=>{const d=parseDate(v);d.setDate(d.getDate()+n);return localISO(d)};
const startOfWeek=v=>{const d=parseDate(v);d.setDate(d.getDate()-((d.getDay()+6)%7));return localISO(d)};
const inRange=(d,a,b)=>(!a||d>=a)&&(!b||d<=b);
const normalizeDateValue=value=>{
  const s=String(value||'').trim();if(!s)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(m)return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  const d=new Date(s);return Number.isNaN(d.getTime())?'':localISO(d);
};
const isClosedStatus=value=>['termine','terminee','cloture','cloturee','annule','annulee','archive','archivee','realise','realisee','non applicable'].includes(norm(value));
const isUrgentPriority=value=>['urgent','urgente'].includes(norm(value));
const addMonthsClamped=(dateISO,months)=>{
  const d=parseDate(dateISO),day=d.getDate(),target=new Date(d.getFullYear(),d.getMonth()+Number(months||0),1,12,0,0,0);
  const last=new Date(target.getFullYear(),target.getMonth()+1,0,12,0,0,0).getDate();
  target.setDate(Math.min(day,last));return localISO(target);
};
function recordDueDate(record){
  const direct=record?.dueDate||record?.deadline||record?.echeance||record?.endDate||record?.targetDate||record?.dateLimite||record?.date_limit||record?.delai||record?.delay||'';
  const normalized=normalizeDateValue(direct);if(normalized)return normalized;
  const text=[record?.description,record?.action,record?.notes,record?.comment,record?.comments,record?.suivi,direct].filter(Boolean).join(' ');
  let m=String(text).match(/(?:avant\s+le|pour\s+le|échéance\s*[:\-]?|echeance\s*[:\-]?|au plus tard\s+le)?\s*(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/i);
  if(!m)return '';
  let year=m[3]?Number(m[3]):Number(todayISO().slice(0,4));if(year<100)year+=2000;
  return normalizeDateValue(`${year}-${pad(m[2])}-${pad(m[1])}`);
}

let cloudDb=null,cloudUpdatedAt='',supabaseClient=null,syncBusy=false;

function localDb(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
function db(){return localDb()||cloudDb}

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
  const {data,error}=await client.from('app_state').select('data,updated_at').eq('user_id',session.user.id).maybeSingle();
  if(error)throw error;
  if(!data?.data)throw new Error('Aucune donnée Pilotage trouvée');
  cloudDb=data.data;cloudUpdatedAt=data.updated_at||'';return cloudDb;
}
function setState(text,ok=false){const e=$('state');if(e){e.textContent=text;e.className=ok?'state ok':'state'}}

/* ---------- EXACTEMENT LES MÊMES RÈGLES MÉTIER QUE PILOTAGE ---------- */

function agentById(data,id){return (data.agents||[]).find(a=>String(a.id)===String(id))}
function agentName(a){return a?`${a.firstName||''} ${a.lastName||''}`.trim():'Agent'}
function agentWorkdays(data,agentId){const a=agentById(data,agentId);return Array.isArray(a?.workdays)&&a.workdays.length?a.workdays.map(Number):[1,2,3,4,5]}
function activeRotation(data,agentId,date){return (data.rotations||[]).filter(r=>String(r.agentId)===String(agentId)&&r.effectiveFrom<=date&&(!r.effectiveTo||r.effectiveTo>=date)).sort((a,b)=>(b.effectiveFrom||'').localeCompare(a.effectiveFrom||''))[0]||null}
function rotationException(data,agentId,date){return (data.rotationExceptions||[]).filter(x=>String(x.agentId)===String(agentId)&&inRange(date,x.dateFrom,x.dateTo)).sort((a,b)=>(b.dateFrom||'').localeCompare(a.dateFrom||''))[0]||null}
function anyWeeklyPlanFor(data,agentId,date=''){return (data.weeklyPlans||[]).filter(p=>String(p.agentId)===String(agentId)&&(!date||((!p.effectiveFrom||p.effectiveFrom<=date)&&(!p.effectiveTo||p.effectiveTo>=date)))).sort((a,b)=>(b.effectiveFrom||'').localeCompare(a.effectiveFrom||''))[0]||null}
function weeklyPlanFor(data,agentId,shift,date=''){
  const plans=(data.weeklyPlans||[]).filter(p=>String(p.agentId)===String(agentId)).filter(p=>!date||((!p.effectiveFrom||p.effectiveFrom<=date)&&(!p.effectiveTo||p.effectiveTo>=date))).sort((a,b)=>(b.effectiveFrom||'').localeCompare(a.effectiveFrom||''));
  return plans.find(p=>p.shift===shift)||plans.find(p=>p.shift==='Standard')||null;
}
function weeklyProfile(data,agentId,shift,weekday,date=''){return weeklyPlanFor(data,agentId,shift,date)?.dayProfiles?.[weekday]||null}
function exactWeeklyProfile(data,agentId,shift,weekday,date=''){
  const p=(data.weeklyPlans||[]).filter(x=>String(x.agentId)===String(agentId)&&x.shift===shift&&(!date||((!x.effectiveFrom||x.effectiveFrom<=date)&&(!x.effectiveTo||x.effectiveTo>=date)))).sort((a,b)=>(b.effectiveFrom||'').localeCompare(a.effectiveFrom||''))[0];
  return p?.dayProfiles?.[weekday]||null;
}
function scheduledFor(data,agentId,date){
  const wd=parseDate(date).getDay();
  if(!agentWorkdays(data,agentId).includes(wd))return {shift:'Repos',start:'',end:'',pause:0,missions:''};
  const r=activeRotation(data,agentId,date);
  if(!r){
    const p=weeklyProfile(data,agentId,'Standard',wd,date)||weeklyProfile(data,agentId,'Matin',wd,date)||anyWeeklyPlanFor(data,agentId,date)?.dayProfiles?.[wd];
    return p&&p.start?{shift:'Planning de référence',start:p.start,end:p.end,pause:Number(p.pause||0),missions:p.missions||'',segments:p.segments||[]}:{shift:'Non planifié',start:'',end:'',pause:0,missions:''};
  }
  if(!(r.weekdays||[1,2,3,4,5]).map(Number).includes(wd))return {shift:'Repos',start:'',end:'',pause:0,missions:''};
  const ex=rotationException(data,agentId,date);
  if(ex){if(ex.shift==='Repos')return {shift:'Repos',start:'',end:'',pause:0,missions:ex.note||''};return {shift:ex.shift||'Horaire modifié',start:ex.start||'',end:ex.end||'',pause:Number(ex.pause||0),missions:ex.note||''}}
  const anchor=startOfWeek(r.effectiveFrom),diff=Math.floor((parseDate(startOfWeek(date))-parseDate(anchor))/604800000),mw=Math.max(1,Number(r.morningWeeks)||1),ew=Math.max(1,Number(r.eveningWeeks)||1),cycle=mw+ew;
  let pos=((diff%cycle)+cycle)%cycle;if(r.startShift==='Soir')pos=(pos+mw)%cycle;const shift=pos<mw?'Matin':'Soir';
  const p=exactWeeklyProfile(data,agentId,shift,wd,date);
  if(!p?.start||!p?.end)return {shift,start:'',end:'',pause:0,missions:'Horaire à définir dans Pilotage des horaires',segments:[],source:'rotation-missing'};
  return {shift,start:p.start,end:p.end,pause:Number(p.pause||0),missions:p.missions||'',segments:p.segments||[],source:'rotation'};
}
function dayRecord(data,agentId,date){return (data.agentDays||[]).find(r=>String(r.agentId)===String(agentId)&&String(r.date)===String(date))||null}
function dayInfo(data,agentId,date){
  const sched=scheduledFor(data,agentId,date),rec=dayRecord(data,agentId,date);
  if(!rec)return {...sched,dayType:sched.shift==='Repos'?'Repos':'Présence',plannedStart:sched.start,plannedEnd:sched.end,actualStart:'',actualEnd:'',overtime:0,note:'',status:'Prévu'};
  return {...sched,...rec,plannedStart:rec.plannedStart??sched.start,plannedEnd:rec.plannedEnd??sched.end};
}
const isAbsenceType=t=>t&&t!=='Présence'&&t!=='Formation';

function periodicIsInactive(x){const s=norm(x?.status);return ['cloture','cloturee','non applicable','archive','archivee'].includes(s)}
function periodicDue(x){if(x.nextDate)return normalizeDateValue(x.nextDate);if(x.lastDate&&Number(x.intervalMonths)>0)return addMonthsClamped(x.lastDate,x.intervalMonths);return ''}
function periodicComputed(x,date=todayISO()){
  const due=periodicDue(x);if(periodicIsInactive(x))return x.status||'Clôturé';if(!due)return x.status||'À planifier';
  const diff=(parseDate(due)-parseDate(date))/86400000;if(diff<0)return 'En retard';if(diff<=60)return 'Bientôt';return 'À jour';
}

function collectUrgentDashboardActions(data){
  const sources=[['issues','Sécurité / qualité','⚠'],['maintenance','Maintenance','🔧'],['requests','Demande direction','↗'],['works','Chantier / GPA','🏗'],['notes','Note','✎'],['personalEvents','Agenda personnel','📅']];
  const rows=[];
  for(const [key,label,icon] of sources)for(const x of (data[key]||[]))if(!isClosedStatus(x.status)&&isUrgentPriority(x.priority))rows.push({label,icon,id:x.id,title:x.title||x.subject||x.no||label,due:recordDueDate(x),priority:x.priority});
  const linkedNc=new Set((data.maintenance||[]).filter(x=>!isClosedStatus(x.status)&&x.sourceNonconformityId).map(x=>String(x.sourceNonconformityId)));
  for(const x of (data.reportNonconformities||[])){
    const closed=['levee','leve','conforme','cloturee','cloture','archivee','archive'].includes(norm(x.status));
    if(closed||!isUrgentPriority(x.priority)||linkedNc.has(String(x.id)))continue;
    rows.push({label:'Non-conformité rapport',icon:'🛡️',id:x.id,title:x.text||x.title||x.no||'Non-conformité urgente',due:recordDueDate(x),priority:x.priority});
  }
  return rows;
}
function collectLateDashboardActions(data,date=todayISO()){
  const rows=[];
  for(const key of ['issues','maintenance','requests','works','notes'])for(const x of (data[key]||[])){const due=recordDueDate(x);if(!isClosedStatus(x.status)&&due&&due<date)rows.push({module:key,record:x,due})}
  return rows;
}
function dashboardMetrics(data,date=todayISO()){
  const soon7=addDays(date,7);
  const activeAgents=(data.agents||[]).filter(a=>norm(a.status)==='actif');
  const present=activeAgents.filter(a=>{const info=dayInfo(data,a.id,date);return !isAbsenceType(info.dayType)&&norm(info.dayType)!=='repos'}).length;
  const urgentActions=collectUrgentDashboardActions(data);
  const lateActions=collectLateDashboardActions(data,date);
  const openMaint=(data.maintenance||[]).filter(x=>!isClosedStatus(x.status));
  const todoMaint=openMaint.filter(x=>['a qualifier','a faire','planifie','planifiee'].includes(norm(x.status)));
  const recentClean=(data.cleaning||[]).filter(x=>normalizeDateValue(x.date)>=addDays(date,-30)&&normalizeDateValue(x.date)<=date);
  const comp=recentClean.length?Math.round(recentClean.filter(x=>norm(x.overallStatus)==='conforme').length/recentClean.length*100):null;
  const weak=recentClean.reduce((sum,x)=>sum+(x.tasks||[]).filter(t=>['a reprendre','non conforme'].includes(norm(t.status))).length,0);
  const pLate=(data.periodic||[]).filter(x=>norm(periodicComputed(x,date))==='en retard');
  const pSoon=(data.periodic||[]).filter(x=>norm(periodicComputed(x,date))==='bientot');
  const notes=(data.notes||[]).filter(x=>!isClosedStatus(x.status));
  const notesDue=notes.filter(x=>{const due=recordDueDate(x);return due&&due<=soon7}).length;
  return {activeAgents,present,urgentActions,lateActions,openMaint,todoMaint,comp,weak,pLate,pSoon,notes,notesDue};
}


function timeToMinutes(v){
  const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);
  return m?Number(m[1])*60+Number(m[2]):null;
}
function currentMinutes(){const d=new Date();return d.getHours()*60+d.getMinutes()}
function liveAgentState(data,agent,date=todayISO(),nowMin=currentMinutes()){
  const info=dayInfo(data,agent.id,date);
  const dayType=String(info.dayType||'Présence');
  if(isAbsenceType(dayType)){
    if(norm(dayType)==='formation')return {kind:'training',label:'Formation'};
    return {kind:'absence',label:dayType};
  }
  if(norm(dayType)==='repos')return {kind:'finished',label:'Repos'};
  const start=timeToMinutes(info.plannedStart),end=timeToMinutes(info.plannedEnd);
  if(start===null||end===null)return {kind:'waiting',label:'Absent — horaire non défini'};
  if(nowMin<start)return {kind:'waiting',label:`Absent — prend à ${info.plannedStart}`};
  if(nowMin>=end)return {kind:'finished',label:'Absent — service terminé'};
  return {kind:'present',label:'Présent'};
}
function renderAgentNow(data){
  const active=(data.agents||[]).filter(a=>norm(a.status)==='actif');
  const states=active.map(a=>({a,s:liveAgentState(data,a)}));
  const present=states.filter(x=>x.s.kind==='present').length;
  const absent=states.length-present;
  if($('agentNowSummary'))$('agentNowSummary').textContent=`${present} présent${present>1?'s':''} • ${absent} absent${absent>1?'s':''}`;
  if($('agentNowList'))$('agentNowList').innerHTML=states.length?states.map(({a,s})=>`
    <div class="agent-now-card ${s.kind}">
      <span class="status-light"></span>
      <div><b>${esc(agentName(a))}</b><small>${esc(s.label)}</small></div>
    </div>`).join(''):'<div class="empty">Aucun agent actif</div>';
}

/* ---------- AFFICHAGE ---------- */

function row(icon,title,sub='',tag='',kind=''){
  return `<div class="row"><div class="avatar">${esc(icon)}</div><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>${tag?`<span class="tag ${kind}">${esc(tag)}</span>`:''}</div>`;
}
function drawSpark(id,values,color){
  const c=$(id);if(!c)return;const r=c.getBoundingClientRect(),w=Math.max(120,r.width||180),h=Math.max(38,r.height||48),dpr=window.devicePixelRatio||1;
  c.width=w*dpr;c.height=h*dpr;const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
  const max=Math.max(1,...values),min=Math.min(0,...values),range=Math.max(1,max-min);
  x.strokeStyle='#e8edf2';x.beginPath();x.moveTo(0,h-8);x.lineTo(w,h-8);x.stroke();
  x.beginPath();values.forEach((v,i)=>{const px=5+(w-10)*(i/(values.length-1||1)),py=5+(h-16)*(1-(v-min)/range);i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle=color;x.lineWidth=2;x.stroke();
}
function renderKpis(data){
  const m=dashboardMetrics(data);
  $('periodic').textContent=m.pLate.length;$('periodicSoon').textContent=`${m.pSoon.length} bientôt`;
  $('urgent').textContent=m.urgentActions.length;$('late').textContent=`${m.lateActions.length} en retard`;
  $('maint').textContent=m.openMaint.length;$('maintTodo').textContent=`${m.todoMaint.length} à faire`;
  $('clean').textContent=m.comp==null?'—':`${m.comp} %`;$('cleanWeak').textContent=`${m.weak} point${m.weak>1?'s':''} faible${m.weak>1?'s':''}`;
  const liveStates=m.activeAgents.map(a=>liveAgentState(data,a));
  const livePresent=liveStates.filter(s=>s.kind==='present').length;
  const pct=m.activeAgents.length?Math.round(livePresent/m.activeAgents.length*100):0;
  $('presencePct').textContent=pct+'%';$('present').textContent=`${livePresent} présents maintenant`;
  $('presenceRing').style.background=`conic-gradient(#22a55b 0 ${pct}%,#edf2f6 ${pct}% 100%)`;
}
function planningForDay(data,date=todayISO()){
  const rows=[];
  for(const x of [...(data.meetings||[]).filter(x=>normalizeDateValue(x.date)===date),...(data.personalEvents||[]).filter(x=>normalizeDateValue(x.date)===date)]){
    if(isClosedStatus(x.status)||norm(x.status)==='annule')continue;
    rows.push({time:x.time||x.start||'',icon:'📅',title:x.title||'Rendez-vous',sub:[x.location,x.type,x.status].filter(Boolean).join(' • '),tag:x.type||'Agenda',kind:isUrgentPriority(x.priority)?'bad':'warn',order:1});
  }
  for(const x of (data.maintenance||[]).filter(x=>normalizeDateValue(x.date)===date||recordDueDate(x)===date)){
    if(isClosedStatus(x.status))continue;
    rows.push({time:x.time||'',icon:'🔧',title:x.title||x.no||'Intervention',sub:[x.building,x.room,x.priority,x.status].filter(Boolean).join(' • '),tag:'Intervention',kind:isUrgentPriority(x.priority)?'bad':'warn',order:2});
  }
  return rows.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.order-b.order);
}
function renderPlanning(data){
  const p=planningForDay(data);
  $('planningCount').textContent=p.length;
  $('todayPlanning').innerHTML=p.length?p.map(x=>row(x.icon,(x.time?x.time+' — ':'')+x.title,x.sub,x.tag,x.kind)).join(''):'<div class="empty">Aucun élément au planning aujourd’hui</div>';
}
function renderUrgencies(data){
  const urgent=collectUrgentDashboardActions(data).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  $('urgentList').innerHTML=urgent.length?urgent.slice(0,5).map(x=>row(x.icon,x.title,`${x.label}${x.due?' • échéance '+x.due:''}`,'Urgente','bad')).join(''):'<div class="empty">Aucune urgence dans le logiciel</div>';
  const counts=new Map();
  urgent.forEach(x=>counts.set(x.label,(counts.get(x.label)||0)+1));
  const entries=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  $('urgencyTotal').textContent=urgent.length;
  const colors=['#e53935','#f59e0b','#f6c453','#2f80ed','#22a55b'];
  let acc=0,stops=[];entries.forEach(([_,v],i)=>{const a=urgent.length?acc/urgent.length*100:0;acc+=v;const b=urgent.length?acc/urgent.length*100:0;stops.push(`${colors[i]} ${a}% ${b}%`)});
  $('urgencyDonut').style.background=urgent.length?`conic-gradient(${stops.join(',')})`:'#edf2f6';
  $('urgencyLegend').innerHTML=entries.length?entries.map(([k,v],i)=>`<div class="urgency-row"><i style="background:${colors[i]}"></i><span>${esc(k)}</span><b>${v}</b></div>`).join(''):'<div class="empty">Aucune urgence</div>';
}
function renderPeriodic(data){
  const late=(data.periodic||[]).filter(x=>norm(periodicComputed(x))==='en retard').sort((a,b)=>(periodicDue(a)||'9999').localeCompare(periodicDue(b)||'9999'));
  $('periodicList').innerHTML=late.length?late.slice(0,8).map(x=>row('🛡',x.name||x.no||'Contrôle',`${x.family||''} • échéance ${periodicDue(x)||'—'}`,'En retard','bad')).join(''):'<div class="empty">Aucun contrôle périodique en retard</div>';
}
function renderDomains(data){
  const open=(data.maintenance||[]).filter(x=>!isClosedStatus(x.status)),map=new Map();
  for(const x of open){const k=x.family||'Autre';map.set(k,(map.get(k)||0)+1)}
  const rows=[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5),max=Math.max(1,...rows.map(x=>x[1]));
  $('domainBars').innerHTML=rows.length?rows.map(([k,v])=>`<div class="domain-row"><b>${esc(k)}</b><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/max*100)}%"></div></div><strong>${v}</strong></div>`).join(''):'<div class="empty">Aucune intervention ouverte</div>';
}
function renderCharts(data){
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);days.push(localISO(d))}
  const urg=days.map(d=>collectUrgentDashboardActions(data).filter(x=>!x.due||x.due>=d).length);
  const maint=days.map(d=>(data.maintenance||[]).filter(x=>normalizeDateValue(x.date)<=d&&!isClosedStatus(x.status)).length);
  const periodic=days.map(d=>(data.periodic||[]).filter(x=>norm(periodicComputed(x,d))==='en retard').length);
  const presence=days.map(d=>{const m=dashboardMetrics(data,d);return m.activeAgents.length?Math.round(m.present/m.activeAgents.length*100):0});
  const planning=days.map(d=>planningForDay(data,d).length);
  const clean=days.map(d=>dashboardMetrics(data,d).comp||0);
  drawSpark('sparkUrgent',urg,'#e53935');drawSpark('sparkMaint',maint,'#2f80ed');drawSpark('sparkPeriodic',periodic,'#e53935');drawSpark('sparkPlanning',planning,'#f59e0b');drawSpark('sparkClean',clean,'#22a55b');

  const c=$('mainChart');if(!c)return;const r=c.getBoundingClientRect(),w=Math.max(500,r.width||900),h=Math.max(260,r.height||315),dpr=window.devicePixelRatio||1;c.width=w*dpr;c.height=h*dpr;
  const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const series=[{v:urg,c:'#e53935'},{v:maint,c:'#2f80ed'},{v:periodic,c:'#f59e0b'},{v:presence,c:'#22a55b'}],max=Math.max(100,...series.flatMap(s=>s.v)),pad={l:34,r:12,t:12,b:28},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
  ctx.strokeStyle='#e8edf2';ctx.lineWidth=1;for(let i=0;i<=5;i++){const y=pad.t+ch*i/5;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}
  series.forEach(s=>{ctx.beginPath();s.v.forEach((v,i)=>{const x=pad.l+cw*i/6,y=pad.t+ch-(v/max)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=s.c;ctx.lineWidth=2.2;ctx.stroke()});
  days.forEach((d,i)=>{ctx.fillStyle='#69788a';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(parseDate(d).toLocaleDateString('fr-FR',{weekday:'short'}).replace('.',''),pad.l+cw*i/6,h-7)});
}
function renderAll(data){
  renderKpis(data);renderAgentNow(data);renderPlanning(data);renderUrgencies(data);renderPeriodic(data);renderDomains(data);renderCharts(data);
  const d=new Date();$('todayTitle').textContent=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  $('lastUpdate').textContent='Mise à jour : '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}

async function sync(){
  if(syncBusy)return;syncBusy=true;
  try{
    setState('Synchronisation…');
    await fetchCloudDb();
    // Priorité à la base locale : Pilotage l'écrit immédiatement à chaque sauvegarde.
    // L'iframe Pilotage recharge également la copie cloud dans cette même base locale.
    const data=localDb()||cloudDb;
    if(!data)throw new Error('Aucune donnée Pilotage disponible');
    renderAll(data);
    const ts=cloudUpdatedAt?new Date(cloudUpdatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):new Date().toLocaleTimeString('fr-FR');
    $('lastSync').textContent=`Base locale immédiate • cloud vérifié à ${ts}`;
    setState('Connecté au Pilotage ✓',true);
  }catch(e){
    console.error(e);const data=localDb();
    if(data){cloudDb=null;renderAll(data);$('lastSync').textContent=`Mode local • ${e.message||e}`;setState('Mode local • serveur indisponible')}
    else{$('lastSync').textContent=e.message||String(e);setState('Données indisponibles')}
  }finally{syncBusy=false}
}


window.addEventListener('storage',e=>{
  if(e.key===STORAGE_KEY){
    const data=localDb();
    if(data){
      renderAll(data);
      setState('Connecté au Pilotage ✓',true);
      if($('lastSync'))$('lastSync').textContent=`Mise à jour locale immédiate à ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    }
  }
});

$('refresh').onclick=sync;
$('refreshTop').onclick=sync;
window.addEventListener('focus',sync);
window.addEventListener('online',sync);
window.addEventListener('resize',()=>{const data=db();if(data)renderCharts(data)});
setInterval(sync,5000);
sync();

setInterval(()=>{const data=db();if(data){renderKpis(data);renderAgentNow(data)}},60000);

const pilotageFrame=document.getElementById('pilotageSource');
if(pilotageFrame){
  pilotageFrame.addEventListener('load',()=>{
    setTimeout(()=>{const data=localDb();if(data)renderAll(data)},1200);
    setTimeout(()=>{const data=localDb();if(data)renderAll(data)},3500);
  });
}
