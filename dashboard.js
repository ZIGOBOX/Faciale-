const $=id=>document.getElementById(id);
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
const todayISO=()=>new Date().toISOString().slice(0,10);

function parseAll(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i),raw=localStorage.getItem(key);
    try{out.push({key,value:JSON.parse(raw)})}catch{}
  }
  return out;
}
function flatten(entries){
  const nodes=[];
  function walk(v,path,key){
    if(Array.isArray(v)){
      if(v.length) nodes.push({key,path,type:'array',value:v});
      v.forEach((x,i)=>{if(x&&typeof x==='object') walk(x,path+'['+i+']',key)})
    } else if(v&&typeof v==='object'){
      nodes.push({key,path,type:'object',value:v});
      Object.entries(v).forEach(([k,x])=>{if(x&&typeof x==='object') walk(x,path+'.'+k,key)})
    }
  }
  entries.forEach(e=>walk(e.value,e.key,e.key));
  return nodes;
}
function scoreNode(node,terms){
  const text=norm(node.path+' '+node.key+' '+JSON.stringify(node.value).slice(0,3000));
  return terms.reduce((s,t)=>s+(text.includes(norm(t))?1:0),0);
}
function bestArray(nodes,terms){
  return nodes.filter(n=>n.type==='array').map(n=>({n,s:scoreNode(n,terms)})).sort((a,b)=>b.s-a.s||b.n.value.length-a.n.value.length)[0]?.n;
}
function field(o,names){
  if(!o||typeof o!=='object') return '';
  const keys=Object.keys(o);
  for(const name of names){
    const k=keys.find(x=>norm(x)===norm(name)||norm(x).includes(norm(name)));
    if(k) return o[k];
  }
  return '';
}
function asDate(v){
  if(!v)return null; const d=new Date(v); return isNaN(d)?null:d;
}
function isActiveStatus(v){
  const s=norm(v); return !/(termine|clos|archive|resolu|annule|inactive)/.test(s);
}
function isUrgent(o){
  const s=norm(field(o,['priorite','urgence','niveau','statut'])+' '+JSON.stringify(o));
  return /(urgent|haute|critique|retard)/.test(s);
}
function initials(n){return String(n||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()}
function item(title,sub=''){return `<div class="item"><b>${esc(title||'Sans titre')}</b><small>${esc(sub)}</small></div>`}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function setList(id,arr){$(id).innerHTML=arr.length?arr.slice(0,7).join(''):'<div class="empty">Aucun élément détecté</div>'}

function detect(){
 const entries=parseAll(),nodes=flatten(entries);

 const agentsNode=bestArray(nodes,['agent','agents','personnel','recrutement','nom','prenom','actif']);
 const interventionsNode=bestArray(nodes,['intervention','maintenance','probleme','affecte','echeance','priorite','statut']);
 const absencesNode=bestArray(nodes,['absence','conge','rtt','motif','remplacement','du','au']);
 const rdvNode=bestArray(nodes,['rendez','agenda','objet','lieu','horaire','participants']);
 const controlsNode=bestArray(nodes,['controle','periodique','prochaine','echeance','organisme','equipement']);
 const notesNode=bestArray(nodes,['note','bloc','echeance','priorite','statut']);
 const securityNode=bestArray(nodes,['securite','qualite','problematique','action','priorite','echeance']);

 const agents=(agentsNode?.value||[]).filter(x=>x&&typeof x==='object');
 const interventions=(interventionsNode?.value||[]).filter(x=>x&&typeof x==='object');
 const absences=(absencesNode?.value||[]).filter(x=>x&&typeof x==='object');
 const rdvs=(rdvNode?.value||[]).filter(x=>x&&typeof x==='object');
 const controls=(controlsNode?.value||[]).filter(x=>x&&typeof x==='object');
 const notes=(notesNode?.value||[]).filter(x=>x&&typeof x==='object');
 const security=(securityNode?.value||[]).filter(x=>x&&typeof x==='object');

 const today=todayISO();
 const absentIds=new Set();
 absences.forEach(a=>{
   const from=field(a,['du','dateDebut','debut','start','date']);
   const to=field(a,['au','dateFin','fin','end'])||from;
   if(from&&to&&String(from).slice(0,10)<=today&&String(to).slice(0,10)>=today){
     absentIds.add(String(field(a,['agentId','idAgent','agent','nom'])));
   }
 });

 const activeAgents=agents.filter(a=>field(a,['actif','active','statut'])!==false && !/inactif/.test(norm(field(a,['statut']))));
 const presentAgents=activeAgents.filter(a=>{
   const id=String(field(a,['id','agentId','nom','name']));
   return !absentIds.has(id);
 });

 $('agentsCount').textContent=activeAgents.length;
 $('presentText').textContent=`${presentAgents.length} présents aujourd'hui`;
 $('presenceRate').textContent=activeAgents.length?Math.round(presentAgents.length/activeAgents.length*100)+'%':'—';

 const open=interventions.filter(i=>isActiveStatus(field(i,['statut','status'])));
 const todo=open.filter(i=>/(faire|nouveau|attente|planifie)/.test(norm(field(i,['statut','status']))));
 const urgent=[...security,...interventions].filter(isUrgent).filter(x=>isActiveStatus(field(x,['statut','status'])));
 const late=[...security,...interventions,...controls].filter(o=>{
   const d=asDate(field(o,['echeance','dateEcheance','prochaine','nextDate']));
   return d&&d<new Date()&&isActiveStatus(field(o,['statut','status']));
 });

 $('urgentCount').textContent=urgent.length;
 $('lateText').textContent=`${late.length} en retard`;
 $('openCount').textContent=open.length;
 $('todoText').textContent=`${todo.length} à faire`;
 $('controlCount').textContent=controls.length;
 const soon=controls.filter(o=>{const d=asDate(field(o,['prochaine','echeance','dateEcheance']));return d&&d-new Date()<1000*60*60*24*30&&d>=new Date()});
 $('controlSoon').textContent=`${soon.length} bientôt`;
 const activeNotes=notes.filter(n=>isActiveStatus(field(n,['statut','status'])));
 $('notesCount').textContent=activeNotes.length;
 $('notesSoon').textContent='échéance proche';

 $('agentsList').innerHTML=activeAgents.length?activeAgents.slice(0,12).map(a=>{
   const name=field(a,['nomComplet','nom','name','prenom'])||'Agent';
   const zone=field(a,['mission','poste','zone','fonction'])||'';
   const id=String(field(a,['id','agentId','nom','name']));
   const absent=absentIds.has(id);
   const assigned=open.some(i=>norm(field(i,['affecte','agent','responsable'])).includes(norm(name)));
   const status=absent?'Absent':assigned?'En intervention':'Présent';
   const cl=absent?'absent':assigned?'intervention':'present';
   return `<div class="agent"><div class="avatar">${initials(name)}</div><div><b>${esc(name)}</b><small>${esc(zone)}</small></div><span class="badge ${cl}">${status}</span></div>`
 }).join(''):'<div class="empty">Aucun agent détecté dans la base locale.</div>';

 setList('urgentList',urgent.map(o=>item(field(o,['probleme','objet','titre','libelle'])||'Action urgente',field(o,['lieu','agent','responsable','echeance']))));
 setList('interventionList',open.map(o=>item(field(o,['probleme','objet','titre','domaine'])||'Intervention',`${field(o,['lieu'])||''} ${field(o,['affecte','agent','responsable'])||''}`)));
 setList('absenceList',absences.filter(a=>{const f=field(a,['du','dateDebut','debut','date']);const t=field(a,['au','dateFin','fin'])||f;return f&&t&&String(t).slice(0,10)>=today}).map(a=>item(field(a,['agent','nom','agentNom'])||'Agent',`${field(a,['motif','type'])||'Absence'} • ${field(a,['du','debut','date'])||''}`)));
 setList('rdvList',rdvs.filter(r=>String(field(r,['date','debut'])).slice(0,10)>=today).map(r=>item(field(r,['objet','titre','type'])||'Rendez-vous',`${field(r,['date'])||''} ${field(r,['heure','horaire'])||''} ${field(r,['lieu'])||''}`)));
 setList('controlList',controls.map(c=>item(field(c,['nom','controle','equipement','type'])||'Contrôle',`Échéance : ${field(c,['prochaine','echeance','dateEcheance'])||'—'}`)));

 $('todaySummary').innerHTML=[
   ['Présents',presentAgents.length],['Absents',Math.max(0,activeAgents.length-presentAgents.length)],
   ['Interventions',open.length],['Urgences',urgent.length],
   ['Retards',late.length],['Contrôles proches',soon.length]
 ].map(([l,v])=>`<div><strong>${v}</strong><span>${l}</span></div>`).join('');

 const detected=[
   ['Agents',agentsNode],['Interventions',interventionsNode],['Absences',absencesNode],
   ['Rendez-vous',rdvNode],['Contrôles',controlsNode],['Notes',notesNode],['Sécurité',securityNode]
 ];
 $('sources').innerHTML=detected.map(([name,n])=>`<code>${name} : ${n?esc(n.path)+' ('+n.value.length+')':'non détecté'}</code>`).join('');

 const found=detected.filter(x=>x[1]).length;
 $('sync').textContent=found>=4?'Données Pilotage détectées ✓':found?'Connexion partielle':'Aucune donnée détectée';
 $('sync').className='sync '+(found>=4?'ok':'warn');
}

function clock(){
 const d=new Date();
 $('clock').textContent=d.toLocaleDateString('fr-FR')+' • '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
setInterval(clock,1000);clock();
detect();
window.addEventListener('storage',detect);
setInterval(detect,5000);
