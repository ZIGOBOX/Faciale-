const $=id=>document.getElementById(id);
const video=$('video'),overlay=$('overlay'),statusEl=$('status'),badge=$('faceBadge');
const cameraBtn=$('cameraBtn'),saveBtn=$('saveBtn'),deleteBtn=$('deleteBtn');
const detectedEl=$('detected'),savedEl=$('saved'),recognizedEl=$('recognized'),similarityEl=$('similarity'),help=$('help');
const threshold=$('threshold'),thresholdLabel=$('thresholdLabel'),cooldown=$('cooldown'),autoSpin=$('autoSpin');
const wheel=$('wheel'),ctxW=wheel.getContext('2d'),spinBtn=$('spinBtn'),winner=$('winner');
const dialog=$('dialog'),prizesInput=$('prizesInput'),editBtn=$('editBtn'),saveEdit=$('saveEdit'),cancelEdit=$('cancelEdit');

let human=null,running=false,busy=false,currentEmbedding=null,savedEmbedding=null,lastSpin=0,spinning=false,angle=0;
let prizes=JSON.parse(localStorage.getItem('zigobox_prizes_v2')||'null')||['🎁 Cadeau','📸 Photo offerte','⭐ Surprise','🎉 Bravo !','😄 Rejoue','💝 Bonus','🥳 Jackpot','✨ Goodie'];

function setStatus(t,c='warn'){statusEl.textContent=t;statusEl.className='pill '+c}
function loadSaved(){try{savedEmbedding=JSON.parse(localStorage.getItem('zigobox_face_v2')||'null')}catch{savedEmbedding=null}savedEl.textContent=savedEmbedding?'Oui ✓':'Non'}
loadSaved();

async function initHuman(){
  try{
    human=new Human.Human({
      backend:'webgl',
      modelBasePath:'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
      cacheSensitivity:0,
      face:{
        enabled:true,
        detector:{enabled:true,rotation:true,maxDetected:1,return:true,minConfidence:0.35},
        mesh:{enabled:true},
        iris:{enabled:false},
        description:{enabled:true},
        emotion:{enabled:false},
        antispoof:{enabled:false},
        liveness:{enabled:false}
      },
      body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false}
    });
    await human.load();
    await human.warmup();
    setStatus('IA prête','ok');
  }catch(e){console.error(e);setStatus('Erreur IA','bad');help.textContent='Impossible de charger les modèles IA. Recharge la page avec Internet.'}
}

async function startCamera(){
  if(!human) await initHuman();
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
    video.srcObject=stream;
    await new Promise(resolve=>{if(video.readyState>=2)return resolve();video.onloadedmetadata=resolve});
    await video.play();
    running=true;
    cameraBtn.disabled=true;
    cameraBtn.textContent='Caméra active ✓';
    setStatus('Caméra active','ok');
    help.textContent='Regarde la caméra. Le bouton devient actif dès que le visage est exploitable.';
    detectLoop();
  }catch(e){console.error(e);setStatus('Caméra indisponible','bad');alert("La caméra n'a pas pu démarrer. Vérifie l'autorisation caméra de Chrome.")}
}

function drawBox(face,match){
  overlay.width=video.videoWidth||640;overlay.height=video.videoHeight||480;
  const c=overlay.getContext('2d');c.clearRect(0,0,overlay.width,overlay.height);
  if(!face?.box)return;
  const [x,y,w,h]=face.box;c.strokeStyle=match?'#22c55e':'#f59e0b';c.lineWidth=5;c.strokeRect(x,y,w,h);
}

async function detectLoop(){
  if(!running)return;
  if(!busy&&video.readyState>=2){
    busy=true;
    try{
      const res=await human.detect(video),face=res.face?.[0];
      if(face){
        detectedEl.textContent='Oui ✓';badge.textContent='Visage détecté ✓';badge.className='face-badge ok';
        currentEmbedding=Array.isArray(face.embedding)&&face.embedding.length?Array.from(face.embedding):null;
        saveBtn.disabled=!currentEmbedding;
        if(currentEmbedding){
          help.textContent='Visage exploitable ✓ Tu peux maintenant l’enregistrer.';
          if(savedEmbedding){
            const sim=human.match.similarity(savedEmbedding,currentEmbedding);
            similarityEl.textContent=(sim*100).toFixed(0)+' %';
            const match=sim>=Number(threshold.value);
            recognizedEl.textContent=match?'Oui ✓':'Non';
            drawBox(face,match);
            if(match&&autoSpin.checked&&!spinning&&Date.now()-lastSpin>Number(cooldown.value)){lastSpin=Date.now();spinWheel()}
          }else{similarityEl.textContent='—';recognizedEl.textContent='Non';drawBox(face,false)}
        }else{
          saveBtn.disabled=true;help.textContent='Visage détecté, calcul de la signature faciale… reste bien face à la caméra.';drawBox(face,false)
        }
      }else{
        currentEmbedding=null;saveBtn.disabled=true;detectedEl.textContent='Non';recognizedEl.textContent='Non';similarityEl.textContent='—';
        badge.textContent='Aucun visage';badge.className='face-badge';overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height)
      }
    }catch(e){console.warn(e)}
    busy=false;
  }
  setTimeout(detectLoop,180);
}

saveBtn.onclick=()=>{if(!currentEmbedding){alert("Attends que « Visage exploitable ✓ » apparaisse.");return}savedEmbedding=Array.from(currentEmbedding);localStorage.setItem('zigobox_face_v2',JSON.stringify(savedEmbedding));savedEl.textContent='Oui ✓';setStatus('Visage enregistré ✓','ok');help.textContent='C’est enregistré. Éloigne-toi puis reviens devant la caméra pour tester.'};
deleteBtn.onclick=()=>{localStorage.removeItem('zigobox_face_v2');savedEmbedding=null;savedEl.textContent='Non';recognizedEl.textContent='Non';similarityEl.textContent='—';setStatus('Visage effacé','warn')};
cameraBtn.onclick=startCamera;
threshold.oninput=()=>{thresholdLabel.textContent=Number(threshold.value).toFixed(2);localStorage.setItem('zigobox_threshold_v2',threshold.value)};
const st=localStorage.getItem('zigobox_threshold_v2');if(st){threshold.value=st;thresholdLabel.textContent=Number(st).toFixed(2)}

function drawWheel(){
  const c=300,r=282,s=Math.PI*2/prizes.length;ctxW.clearRect(0,0,600,600);
  prizes.forEach((p,i)=>{const a=angle+i*s;ctxW.beginPath();ctxW.moveTo(c,c);ctxW.arc(c,c,r,a,a+s);ctxW.closePath();ctxW.fillStyle=`hsl(${(i*360/prizes.length+18)%360} 80% 54%)`;ctxW.fill();ctxW.strokeStyle='#fff';ctxW.lineWidth=3;ctxW.stroke();ctxW.save();ctxW.translate(c,c);ctxW.rotate(a+s/2);ctxW.fillStyle='#fff';ctxW.textAlign='right';ctxW.font='bold 22px sans-serif';ctxW.fillText(p,r-25,7);ctxW.restore()});
  ctxW.beginPath();ctxW.arc(c,c,62,0,Math.PI*2);ctxW.fillStyle='#111827';ctxW.fill();ctxW.strokeStyle='#fff';ctxW.lineWidth=7;ctxW.stroke();ctxW.fillStyle='#fff';ctxW.textAlign='center';ctxW.textBaseline='middle';ctxW.font='bold 25px sans-serif';ctxW.fillText('ZiGoBox',c,c)
}
function winningPrize(){const s=Math.PI*2/prizes.length,p=-Math.PI/2;let rel=(p-angle)%(Math.PI*2);if(rel<0)rel+=Math.PI*2;return prizes[Math.floor(rel/s)%prizes.length]}
function spinWheel(){
  if(spinning)return;spinning=true;spinBtn.disabled=true;winner.textContent='La roue tourne…';
  const start=angle,target=start+(5+Math.random()*3)*Math.PI*2+Math.random()*Math.PI*2,t0=performance.now(),dur=4200;
  function frame(now){const t=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-t,3);angle=start+(target-start)*e;drawWheel();if(t<1)requestAnimationFrame(frame);else{spinning=false;spinBtn.disabled=false;winner.textContent='🎉 '+winningPrize();if(navigator.vibrate)navigator.vibrate([100,60,160])}}
  requestAnimationFrame(frame)
}
spinBtn.onclick=spinWheel;
editBtn.onclick=()=>{prizesInput.value=prizes.join('\n');dialog.showModal()};
cancelEdit.onclick=()=>dialog.close();
saveEdit.onclick=()=>{const p=prizesInput.value.split('\n').map(x=>x.trim()).filter(Boolean);if(p.length<2){alert('Il faut au moins 2 lots.');return}prizes=p.slice(0,24);localStorage.setItem('zigobox_prizes_v2',JSON.stringify(prizes));angle=0;drawWheel();dialog.close()};
drawWheel();
initHuman();
