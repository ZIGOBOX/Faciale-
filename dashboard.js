const DASHBOARD_VERSION='V1.10.4';
const DASHBOARD_BUILD='2026-08-14 15:58';
console.info('Dashboard',DASHBOARD_VERSION,'Build',DASHBOARD_BUILD);
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

const V128_PENDING_KEY='pst_offline_pending_v128';
const V128_MIRROR_KEY='pst_offline_mirror_v128';
const LEGACY_STORAGE_KEY='pilotage-service-technique-v25';

function readLocalJson(key){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null}catch(_){return null}}
function legacyDb(){return readLocalJson(LEGACY_STORAGE_KEY)}
function v128PendingDb(){const x=readLocalJson(V128_PENDING_KEY);return x?.data||null}
function v128MirrorDb(){const x=readLocalJson(V128_MIRROR_KEY);return x?.data||null}
function livePilotageDb(){
  try{
    const frame=document.getElementById('pilotageSource');
    const state=frame?.contentWindow?.PSTMainState?.get?.();
    return state&&typeof state==='object'?state:null;
  }catch(_){return null}
}

function mergeRows(cloudRows=[],localRows=[]){
  const map=new Map();
  for(const x of (cloudRows||[]))if(x&&x.id!=null)map.set(String(x.id),x);
  for(const x of (localRows||[]))if(x&&x.id!=null)map.set(String(x.id),x);
  return [...map.values()];
}
function mergePilotageData(local,cloud){
  if(!local)return cloud;
  if(!cloud)return local;
  const out={...cloud,...local};
  const arrayKeys=[
    'agents','weeklyPlans','rotations','rotationExceptions','agentDays',
    'personalEvents','roomPreps','issues','periodic','cleaning','maintenance','requests',
    'works','meetings','notes','vacations','documents','contacts',
    'reportNonconformities','attachments','archives','importArchives'
  ];
  for(const k of arrayKeys)out[k]=mergeRows(cloud[k]||[],local[k]||[]);
  return out;
}
function bestPilotageDb(){
  // 1) état vivant V128 dans l'iframe : source la plus immédiate
  const live=livePilotageDb();
  if(live)return live;
  // 2) modifications hors ligne en attente
  const pending=v128PendingDb();
  if(pending)return mergePilotageData(pending,cloudDb);
  // 3) miroir V128 écrit par Pilotage
  const mirror=v128MirrorDb();
  if(mirror)return mergePilotageData(mirror,cloudDb);
  // 4) ancienne base locale pour compatibilité
  const legacy=legacyDb();
  if(legacy)return mergePilotageData(legacy,cloudDb);
  // 5) cloud
  return cloudDb;
}
function localDb(){return v128PendingDb()||v128MirrorDb()||legacyDb()}
function db(){return bestPilotageDb()}

function roomPrepAgendaItems(data=db()){
  // V128 : les préparations salle/café sont dans db.roomPreps.
  if(Array.isArray(data?.roomPreps))return data.roomPreps;
  // Compatibilité anciennes versions seulement.
  try{return JSON.parse(localStorage.getItem('pst_room_preps_v106')||'[]')||[]}catch(_){return[]}
}

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

function wasteAgendaItemForDateDashboard(date){
  try{
    const frame=document.getElementById('pilotageSource');
    const api=frame?.contentWindow?.PSTWeatherWaste;
    if(!api?.collectionInfo||!api?.binForDate||!api?.localISO)return null;

    // Le dashboard affiche le rappel LA VEILLE du passage réel.
    const reminderDay=parseDate(date);
    const collectionDay=new Date(reminderDay);
    collectionDay.setDate(collectionDay.getDate()+1);
    const collectionISO=localISO(collectionDay);

    // Le module officiel s'appuie sur le vendredi de référence.
    const wd=collectionDay.getDay();
    let friday=null;
    if(wd===5)friday=new Date(collectionDay);
    else if(wd===6){
      friday=new Date(collectionDay);
      friday.setDate(friday.getDate()-1);
    }else return null;

    const ci=api.collectionInfo(friday);
    const actual=api.localISO(ci.actual);
    if(actual!==collectionISO)return null;

    const bin=api.binForDate(friday);
    return {
      id:`waste-reminder-${date}`,
      time:'',
      icon:bin.icon||'🗑️',
      title:`${bin.icon||'🗑️'} Sortir ${bin.label||'le bac'}`,
      sub:`Passage demain • Rue Noëlas • Rue Jean Puy${ci.shifted?' • collecte décalée':''}`,
      tag:'Poubelles',
      kind:'warn',
      source:'waste'
    };
  }catch(e){
    console.warn('Planning poubelles indisponible',e);
    return null;
  }
}

function liveEventsForDate(date){
  try{
    const frame=document.getElementById('pilotageSource');
    const fn=frame?.contentWindow?.eventsForDate;
    if(typeof fn!=='function')return null;
    const rows=fn(date);
    return Array.isArray(rows)?rows:null;
  }catch(_){return null}
}

function planningForDay(data,date=todayISO()){
  const liveRows=liveEventsForDate(date);
  const rows=[];

  if(liveRows){
    // Copie directe du planning V128. On retire seulement l'élément poubelles,
    // car le dashboard l'affiche volontairement la veille selon ton choix.
    for(const x of liveRows.filter(x=>x.source!=='waste')){
      const source=x.source||'personal';
      const meta=x.meta||[x.location,x.status].filter(Boolean).join(' • ');
      let icon='📅',tag='Agenda',kind='warn';
      if(source==='meeting'){icon='📅';tag='Rendez-vous'}
      else if(source==='note'){icon='✎';tag='Note';kind=isUrgentPriority(x.priority)?'bad':'warn'}
      else if(source==='maintenance'){icon='🔧';tag='Maintenance';kind=isUrgentPriority(x.priority)?'bad':'warn'}
      else if(source==='request'){icon='↗';tag='Direction';kind=isUrgentPriority(x.priority)?'bad':'warn'}
      else if(source==='work'){icon='🏗';tag='Chantier';kind=isUrgentPriority(x.priority)?'bad':'warn'}
      else if(source==='issue'){icon='⚠';tag='Sécurité';kind=isUrgentPriority(x.priority)?'bad':'warn'}
      else if(source==='periodic'){icon='🛡';tag='Contrôle'}
      else if(source==='roomprep'){icon='☕';tag='Salle & café'}
      else if(source==='vacation'){icon='🏖';tag='Vacances'}
      rows.push({id:x.id||'',time:x.start||x.time||'',icon,title:x.title||'Événement',sub:meta,tag,kind,source});
    }
  }else{
    // Secours si l'iframe V128 n'est pas encore prête : même structure de données.
    for(const x of (data.personalEvents||[]).filter(x=>String(x.date)===String(date)))rows.push({id:x.id||'',time:x.start||'',icon:'📅',title:x.title||'Événement',sub:[x.location,x.status].filter(Boolean).join(' • '),tag:'Agenda',kind:isUrgentPriority(x.priority)?'bad':'warn',source:'personal'});
    for(const x of (data.meetings||[]).filter(x=>normalizeDateValue(x.date)===date&&!isClosedStatus(x.status)&&norm(x.status)!=='annule'))rows.push({id:x.id||'',time:x.time||'',icon:'📅',title:x.title||'Rendez-vous',sub:[x.location,x.status].filter(Boolean).join(' • '),tag:'Rendez-vous',kind:'warn',source:'meeting'});
    for(const x of (data.notes||[]).filter(x=>normalizeDateValue(x.dueDate)===date&&!isClosedStatus(x.status)))rows.push({id:x.id||'',time:'',icon:'✎',title:x.title||'Note à traiter',sub:[x.category,x.priority,x.status].filter(Boolean).join(' • '),tag:'Note',kind:isUrgentPriority(x.priority)?'bad':'warn',source:'note'});
    for(const x of (data.maintenance||[]).filter(x=>normalizeDateValue(recordDueDate(x))===date&&!isClosedStatus(x.status)))rows.push({id:x.id||'',time:'',icon:'🔧',title:`Maintenance · ${x.title||'Intervention'}`,sub:[x.building,x.room,x.priority,x.status].filter(Boolean).join(' • '),tag:'Maintenance',kind:isUrgentPriority(x.priority)?'bad':'warn',source:'maintenance'});
    for(const x of (data.requests||[]).filter(x=>normalizeDateValue(recordDueDate(x))===date&&!isClosedStatus(x.status)))rows.push({id:x.id||'',time:'',icon:'↗',title:`Direction · ${x.title||x.description||'Demande'}`,sub:[x.priority,x.status].filter(Boolean).join(' • '),tag:'Direction',kind:isUrgentPriority(x.priority)?'bad':'warn',source:'request'});
    for(const x of (data.works||[]).filter(x=>normalizeDateValue(recordDueDate(x))===date&&!isClosedStatus(x.status)))rows.push({id:x.id||'',time:'',icon:'🏗',title:`Chantier/GPA · ${x.title||'Action'}`,sub:[x.priority,x.status].filter(Boolean).join(' • '),tag:'Chantier',kind:isUrgentPriority(x.priority)?'bad':'warn',source:'work'});
    for(const x of (data.issues||[]).filter(x=>normalizeDateValue(recordDueDate(x))===date&&!isClosedStatus(x.status)))rows.push({id:x.id||'',time:'',icon:'⚠',title:`${norm(x.priority)==='urgente'?'⚠️ ':''}${x.title||x.description||'Sécurité / qualité'}`,sub:[x.priority,x.status].filter(Boolean).join(' • '),tag:'Sécurité',kind:isUrgentPriority(x.priority)?'bad':'warn',source:'issue'});
    for(const x of (data.periodic||[]).filter(x=>normalizeDateValue(periodicDue(x))===date))rows.push({id:x.id||'',time:'',icon:'🛡',title:`Contrôle périodique · ${x.name||x.title||x.family||'Contrôle'}`,sub:[x.family,x.status].filter(Boolean).join(' • '),tag:'Contrôle',kind:'warn',source:'periodic'});
    for(const x of roomPrepAgendaItems(data).filter(x=>normalizeDateValue(x.date)===date&&norm(x.status)!=='termine'))rows.push({id:x.id||'',time:x.time||'',icon:'☕',title:`☕ ${x.room||'Préparation salle'}${x.coffee?.enabled?' · Café':''}`,sub:[x.status,x.coffee?.enabled?'Café activé':''].filter(Boolean).join(' • '),tag:'Salle & café',kind:'warn',source:'roomprep'});
    for(const x of (data.vacations||[]).filter(x=>normalizeDateValue(x.start)===date&&norm(x.status)!=='cloturee'))rows.push({id:x.id||'',time:'',icon:'🏖',title:`Vacances / fermeture · ${x.name||'Période'}`,sub:x.status||'',tag:'Vacances',kind:'warn',source:'vacation'});
  }

  // Choix personnalisé conservé : rappel poubelles la veille du passage.
  const waste=wasteAgendaItemForDateDashboard(date);
  if(waste)rows.push(waste);
  return rows.sort((a,b)=>`${a.time||'99:99'}${a.title||''}`.localeCompare(`${b.time||'99:99'}${b.title||''}`));
}

function wasteReminderForDashboardDate(date){
  try{
    const frame=document.getElementById('pilotageSource');
    const api=frame?.contentWindow?.PSTWeatherWaste;
    if(!api?.collectionInfo||!api?.binForDate||!api?.localISO)return null;

    const reminder=parseDate(date);
    const collection=new Date(reminder);
    collection.setDate(collection.getDate()+1);
    const collectionISO=localISO(collection);

    const wd=collection.getDay();
    let friday=null;
    if(wd===5)friday=new Date(collection);
    else if(wd===6){friday=new Date(collection);friday.setDate(friday.getDate()-1)}
    else return null;

    const ci=api.collectionInfo(friday);
    if(api.localISO(ci.actual)!==collectionISO)return null;
    const bin=api.binForDate(friday);

    return {
      id:`waste-reminder-${date}`,
      time:'',
      timeLabel:'',
      icon:bin.icon||'🗑️',
      title:`${bin.icon||'🗑️'} Sortir ${bin.label||'le bac'}`,
      sub:`Passage demain • Rue Noëlas • Rue Jean Puy${ci.shifted?' • collecte décalée':''}`,
      tag:'Poubelles',
      kind:'warn',
      source:'waste'
    };
  }catch(_){return null}
}

function dashboardPlanningForDate(data,date){
  let rows=[];
  try{
    const frame=document.getElementById('pilotageSource');
    const win=frame?.contentWindow;
    if(typeof win?.eventsForDate==='function'){
      rows=(win.eventsForDate(date)||[]).map(x=>{
        const start=x.start||x.time||'';
        const end=x.end||'';
        return {
          id:x.id||'',
          time:start,
          end,
          timeLabel:start?(end&&end!==start?`${start}–${end}`:start):'',
          icon:x.source==='roomprep'?'☕':x.source==='meeting'?'📅':x.source==='maintenance'?'🔧':x.source==='periodic'?'🛡':x.source==='issue'?'⚠':x.source==='note'?'✎':'•',
          title:x.title||'Événement',
          sub:x.meta||[x.location,x.status].filter(Boolean).join(' • '),
          tag:x.source||'Planning',
          kind:(x.priority&&isUrgentPriority(x.priority))?'bad':'warn',
          source:x.source||'planning'
        };
      });
    }else{
      rows=(planningForDay(data,date)||[]).map(x=>{
        const start=x.time||x.start||'';
        const end=x.end||'';
        return {...x,time:start,end,timeLabel:start?(end&&end!==start?`${start}–${end}`:start):''};
      });
    }
  }catch(_){
    rows=(planningForDay(data,date)||[]).map(x=>{
      const start=x.time||x.start||'';
      const end=x.end||'';
      return {...x,time:start,end,timeLabel:start?(end&&end!==start?`${start}–${end}`:start):''};
    });
  }

  // Le dashboard affiche la poubelle la veille, pas le jour du passage.
  rows=rows.filter(x=>x.source!=='waste');
  const waste=wasteReminderForDashboardDate(date);
  if(waste)rows.push(waste);

  return rows.sort((a,b)=>`${a.time||'99:99'}${a.title||''}`.localeCompare(`${b.time||'99:99'}${b.title||''}`));
}

let planningViewMode='today';

function mondayOfWeek(date=todayISO()){
  const d=parseDate(date);
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return localISO(d);
}

function renderPlanningToday(data){
  const rows=dashboardPlanningForDate(data,todayISO());
  $('planningPanelTitle').textContent="PLANNING D'AUJOURD'HUI";
  $('planningCount').textContent=rows.length;
  $('todayPlanning').innerHTML=rows.length
    ? rows.map(x=>row(x.icon,(x.timeLabel?x.timeLabel+' — ':'')+x.title,x.sub,x.tag,x.kind)).join('')
    : '<div class="empty">Aucun élément au planning aujourd’hui</div>';
}

function renderPlanningWeek(data){
  const monday=mondayOfWeek(todayISO());
  let total=0;
  const blocks=[];
  for(let i=0;i<7;i++){
    const date=addDays(monday,i);
    const items=dashboardPlanningForDate(data,date);
    total+=items.length;
    const label=parseDate(date).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'short'});
    blocks.push(`<section class="week-day-group ${date===todayISO()?'today':''}">
      <div class="week-day-title">${esc(label)}${date===todayISO()?' • aujourd’hui':''}</div>
      ${items.length
        ? items.map(x=>row(x.icon,(x.timeLabel?x.timeLabel+' — ':'')+x.title,x.sub,x.tag,x.kind)).join('')
        : '<div class="week-day-empty">Aucun élément</div>'}
    </section>`);
  }
  $('planningPanelTitle').textContent='PLANNING DE LA SEMAINE';
  $('planningCount').textContent=total;
  $('todayPlanning').innerHTML=blocks.join('');
}

function renderPlanningMode(data){
  if(planningViewMode==='week')renderPlanningWeek(data);
  else renderPlanningToday(data);
  $('planningTodayBtn')?.classList.toggle('active',planningViewMode==='today');
  $('planningWeekBtn')?.classList.toggle('active',planningViewMode==='week');
}

function renderPlanning(data){renderPlanningMode(data);}

const TOP_URGENCY_KEY='pst_dashboard_top5_urgencies_v1';

function savedTopUrgencyIds(){
  try{
    const x=JSON.parse(localStorage.getItem(TOP_URGENCY_KEY)||'[]');
    return Array.isArray(x)?x.map(String).slice(0,5):[];
  }catch{return []}
}
function urgencyStableId(x){
  return `${x.label||''}|${x.id||''}|${x.title||''}`;
}
function saveTopUrgencyIds(ids){
  localStorage.setItem(TOP_URGENCY_KEY,JSON.stringify((ids||[]).map(String).slice(0,5)));
}
function chosenUrgencies(all){
  const ids=savedTopUrgencyIds();
  if(!ids.length)return all.slice(0,5);
  const map=new Map(all.map(x=>[urgencyStableId(x),x]));
  const chosen=ids.map(id=>map.get(id)).filter(Boolean);
  // si une urgence choisie a disparu, on complète automatiquement
  if(chosen.length<5){
    for(const x of all){
      if(chosen.length>=5)break;
      if(!chosen.some(y=>urgencyStableId(y)===urgencyStableId(x)))chosen.push(x);
    }
  }
  return chosen.slice(0,5);
}
function openTopUrgencyChooser(data){
  const dialog=$('topUrgencyDialog'),box=$('topUrgencyChoices');
  if(!dialog||!box)return;
  const all=collectUrgentDashboardActions(data).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  const selected=new Set(savedTopUrgencyIds());
  box.innerHTML=all.length?all.map(x=>{
    const id=urgencyStableId(x);
    return `<label class="urgency-choice">
      <input type="checkbox" value="${esc(id)}" ${selected.has(id)?'checked':''}>
      <span><b>${esc(x.title)}</b><small>${esc(x.label)}${x.priority?' • '+esc(x.priority):''}</small></span>
      <span class="due">${x.due?esc(x.due):''}</span>
    </label>`;
  }).join(''):'<div class="empty">Aucune urgence disponible.</div>';

  const updateCount=()=>{
    const checked=[...box.querySelectorAll('input:checked')];
    if(checked.length>5){
      checked.at(-1).checked=false;
    }
    const count=box.querySelectorAll('input:checked').length;
    if($('topUrgencyCount'))$('topUrgencyCount').textContent=`${count} / 5 sélectionnées`;
  };
  box.querySelectorAll('input').forEach(i=>i.addEventListener('change',updateCount));
  updateCount();
  dialog.showModal();
}

function renderUrgencies(data){
  const urgent=collectUrgentDashboardActions(data).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  const top5=chosenUrgencies(urgent);
  $('urgentList').innerHTML=top5.length?top5.map(x=>row(x.icon,x.title,`${x.label}${x.due?' • échéance '+x.due:''}`,'Urgente','bad')).join(''):'<div class="empty">Aucune urgence dans le logiciel</div>';
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


function renderFromPilotage(){
  try{
    const data=bestPilotageDb();
    if(!data){
      setState('En attente de Pilotage…');
      return;
    }
    renderAll(data);
    setState('Connecté au Pilotage V128 ✓',true);
    const now=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if($('lastSync'))$('lastSync').textContent=`État vivant Pilotage lu à ${now}`;
  }catch(error){
    console.error('Lecture dashboard',error);
    setState('Lecture Pilotage interrompue');
  }
}

function sync(){
  // Le dashboard ne synchronise PLUS lui-même avec Supabase.
  // Pilotage V128 est l'unique moteur de synchronisation.
  renderFromPilotage();
}

$('refresh').onclick=renderFromPilotage;
if($('refreshTop'))$('refreshTop').onclick=renderFromPilotage;

window.addEventListener('focus',renderFromPilotage);
window.addEventListener('online',renderFromPilotage);
window.addEventListener('storage',e=>{
  if([V128_PENDING_KEY,V128_MIRROR_KEY,LEGACY_STORAGE_KEY].includes(e.key))renderFromPilotage();
});

// Lecture légère de l'état vivant : aucune requête Supabase supplémentaire.
setInterval(renderFromPilotage,1000);
setInterval(()=>{const data=db();if(data){renderKpis(data);renderAgentNow(data)}},60000);

const pilotageFrame=document.getElementById('pilotageSource');
if(pilotageFrame){
  pilotageFrame.addEventListener('load',()=>{
    const win=pilotageFrame.contentWindow;
    try{
      win?.addEventListener('pst:data-loaded',renderFromPilotage);
      win?.addEventListener('pst:cloud-error',renderFromPilotage);
    }catch(_){}
    setTimeout(renderFromPilotage,500);
    setTimeout(renderFromPilotage,1500);
    setTimeout(renderFromPilotage,3000);
  });
}

document.addEventListener('click',e=>{
  if(e.target.closest('#planningTodayBtn')){
    planningViewMode='today';
    renderFromPilotage();
    return;
  }
  if(e.target.closest('#planningWeekBtn')){
    planningViewMode='week';
    renderFromPilotage();
    return;
  }
});

renderFromPilotage();

if($('chooseTopUrgencies'))$('chooseTopUrgencies').onclick=()=>{
  const data=db();
  if(data)openTopUrgencyChooser(data);
};
if($('saveTopUrgencies'))$('saveTopUrgencies').onclick=()=>{
  const box=$('topUrgencyChoices');
  const ids=box?[...box.querySelectorAll('input:checked')].map(i=>i.value).slice(0,5):[];
  saveTopUrgencyIds(ids);
  $('topUrgencyDialog')?.close();
  const data=db();
  if(data)renderUrgencies(data);
};
if($('resetTopUrgencies'))$('resetTopUrgencies').onclick=()=>{
  saveTopUrgencyIds([]);
  $('topUrgencyDialog')?.close();
  const data=db();
  if(data)renderUrgencies(data);
};


/* ---------- LIENS PERSONNALISÉS ---------- */
const CUSTOM_LINKS_KEY='pst_dashboard_custom_links_v1';
let pendingLogoData='';

function loadCustomLinks(){
  try{
    const x=JSON.parse(localStorage.getItem(CUSTOM_LINKS_KEY)||'[]');
    return Array.isArray(x)?x:[];
  }catch{return []}
}
function saveCustomLinks(rows){
  localStorage.setItem(CUSTOM_LINKS_KEY,JSON.stringify(rows||[]));
}
function linkInitials(name){
  return String(name||'Lien').split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase()||'L';
}
function normalizeLinkUrl(url){
  const u=String(url||'').trim();
  if(!u)return '';
  return /^https?:\/\//i.test(u)?u:`https://${u}`;
}
function renderCustomLinks(){
  const rows=loadCustomLinks(),box=$('customLinksGrid');
  if(!box)return;
  box.innerHTML=rows.length?rows.map(x=>`
    <a class="custom-link-card" href="${esc(x.url)}" target="_blank" rel="noopener">
      ${x.logo?`<img src="${x.logo}" alt="">`:`<div class="fallback-logo">${esc(linkInitials(x.name))}</div>`}
      <span>${esc(x.name)}</span>
    </a>`).join(''):'<div class="empty">Aucun raccourci personnalisé. Clique sur « Gérer les liens ».</div>';
}
function renderSavedLinks(){
  const rows=loadCustomLinks(),box=$('savedLinksList');
  if(!box)return;
  box.innerHTML=rows.length?rows.map((x,i)=>`
    <div class="saved-link-row">
      ${x.logo?`<img src="${x.logo}" alt="">`:`<div class="fallback-logo">${esc(linkInitials(x.name))}</div>`}
      <div><b>${esc(x.name)}</b><small>${esc(x.url)}</small></div>
      <div class="saved-link-actions">
        <button type="button" class="move-link" data-link-up="${esc(x.id)}" ${i===0?'disabled':''}>↑</button>
        <button type="button" class="move-link" data-link-down="${esc(x.id)}" ${i===rows.length-1?'disabled':''}>↓</button>
        <button type="button" class="edit-link" data-link-edit="${esc(x.id)}">Modifier</button>
        <button type="button" class="delete-link" data-link-delete="${esc(x.id)}">Supprimer</button>
      </div>
    </div>`).join(''):'<div class="empty">Aucun lien enregistré.</div>';
}
function clearLinkForm(){
  if($('editLinkId'))$('editLinkId').value='';
  if($('linkName'))$('linkName').value='';
  if($('linkUrl'))$('linkUrl').value='';
  if($('linkLogo'))$('linkLogo').value='';
  pendingLogoData='';
  if($('linkLogoPreview')){$('linkLogoPreview').src='';$('linkLogoPreview').style.display='none'}
  if($('linkLogoText'))$('linkLogoText').textContent='Aucun logo sélectionné';
  if($('saveLink'))$('saveLink').textContent='Ajouter le lien';
}
function editCustomLink(id){
  const x=loadCustomLinks().find(r=>String(r.id)===String(id));if(!x)return;
  $('editLinkId').value=x.id;$('linkName').value=x.name||'';$('linkUrl').value=x.url||'';
  pendingLogoData=x.logo||'';
  if(x.logo){$('linkLogoPreview').src=x.logo;$('linkLogoPreview').style.display='block';$('linkLogoText').textContent='Logo actuel'}
  else{$('linkLogoPreview').style.display='none';$('linkLogoText').textContent='Aucun logo'}
  $('saveLink').textContent='Enregistrer les modifications';
}
function moveCustomLink(id,delta){
  const rows=loadCustomLinks(),i=rows.findIndex(x=>String(x.id)===String(id));if(i<0)return;
  const j=i+delta;if(j<0||j>=rows.length)return;
  [rows[i],rows[j]]=[rows[j],rows[i]];saveCustomLinks(rows);renderSavedLinks();renderCustomLinks();
}
function openLinksManager(){
  renderSavedLinks();clearLinkForm();$('linksDialog')?.showModal();
}

if($('manageLinks'))$('manageLinks').onclick=openLinksManager;

if($('linkLogo'))$('linkLogo').addEventListener('change',e=>{
  const file=e.target.files?.[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    pendingLogoData=String(reader.result||'');
    $('linkLogoPreview').src=pendingLogoData;$('linkLogoPreview').style.display='block';
    $('linkLogoText').textContent=file.name;
  };
  reader.readAsDataURL(file);
});

if($('saveLink'))$('saveLink').onclick=()=>{
  const name=String($('linkName')?.value||'').trim();
  const url=normalizeLinkUrl($('linkUrl')?.value);
  if(!name)return alert('Entre un nom pour le lien.');
  if(!url)return alert('Entre une adresse internet.');
  const rows=loadCustomLinks(),id=$('editLinkId')?.value;
  if(id){
    const x=rows.find(r=>String(r.id)===String(id));
    if(x)Object.assign(x,{name,url,logo:pendingLogoData||x.logo||''});
  }else{
    rows.push({id:`lnk-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,url,logo:pendingLogoData||''});
  }
  saveCustomLinks(rows);renderSavedLinks();renderCustomLinks();clearLinkForm();
};

if($('cancelLinkEdit'))$('cancelLinkEdit').onclick=clearLinkForm;

document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-link-edit]');if(edit){editCustomLink(edit.dataset.linkEdit);return}
  const del=e.target.closest('[data-link-delete]');if(del){
    if(confirm('Supprimer ce lien ?')){
      saveCustomLinks(loadCustomLinks().filter(x=>String(x.id)!==String(del.dataset.linkDelete)));
      renderSavedLinks();renderCustomLinks();clearLinkForm();
    }
    return
  }
  const up=e.target.closest('[data-link-up]');if(up){moveCustomLink(up.dataset.linkUp,-1);return}
  const down=e.target.closest('[data-link-down]');if(down){moveCustomLink(down.dataset.linkDown,1);return}
});
renderCustomLinks();
