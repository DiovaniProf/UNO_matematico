'use strict';
// Conexão Matemática — jogo independente, sem dependências de backend.
const $ = id => document.getElementById(id);
const palette = ['#24a6ff','#ff5c78','#27cda0','#ae80ff','#f6c451','#ff9856'];
const state = {phase:'setup',max:10,limit:10,colors:{1:palette[0],2:palette[1]},hands:{1:[],2:[]},counts:{1:10,2:10},hits:{1:0,2:0},times:{1:0,2:0},prev:null,recent:null,recentOwner:0,turn:1,starter:0,attempted:new Set(),round:0,clock:null,clockStarted:0,remaining:10,answerClock:null,answerStarted:0,answerOwner:0,answerOrigin:'',locked:false,stuck:false,deck:[],discarded:[],idCounter:0,history:[]};
const positions = [{x:25,y:23,r:-9},{x:74,y:24,r:7},{x:49,y:49,r:-3},{x:27,y:76,r:8},{x:74,y:75,r:-7}];
const fmt = n => Number(n).toLocaleString('pt-BR',{maximumFractionDigits:1});
const rand = n => Math.floor(Math.random()*n);
function shuffle(a){for(let i=a.length-1;i>0;i--){let j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function norm(s){return String(s).trim().replace(/\s+/g,'').replace(/[xX*]/g,'×').replace(/\//g,'÷').replace(/[−–]/g,'-');}
function evaluate(s){const v=norm(s);if(/^\d+$/.test(v))return Number(v);const m=v.match(/^(\d+)([×÷+\-])(\d+)$/);if(!m)return null;const a=Number(m[1]),b=Number(m[3]);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b))return null;switch(m[2]){case '×':return Number.isSafeInteger(a*b)?a*b:null;case '÷':return b?a/b:null;case '+':return a+b;case '-':return a-b;}return null;}
function matches(a,b){return a&&b&&a.items.some(x=>b.items.some(y=>evaluate(x)===evaluate(y)&&evaluate(x)!==null));}
function pairs(a,b){const out=[];if(!a||!b)return out;for(let i=0;i<5;i++)for(let j=0;j<5;j++){const v=evaluate(a.items[i]);if(v!==null&&v===evaluate(b.items[j]))out.push([i,j]);}return out;}
// Gerador balanceado: os índices 3, 7 e 10 são equivalentes para ambos.
const UNLINKED_SLOTS = new Set([2,6,9]);
function operationFor(v,preferred=null){
  const choices=[];
  // Todas as expressões devem ter resultados inteiros exatos e seguros.
  const cap=Number.MAX_SAFE_INTEGER;
  const add=Math.min(10,Math.max(1,state.max));
  if(v+add<=cap) choices.push(`${v+add}−${add}`);
  if(v>=1) choices.push(`${v-1}+1`);
  if(v>=2) choices.push(`${v-1}+1`);
  for(let a=1;a<=Math.min(state.max,10);a++){
    if(v%a!==0)continue;
    const b=v/a;
    if(b>=1&&b<=10){choices.push(`${a}×${b}`);choices.push(`${b}×${a}`);}
  }
  if(v<=Math.floor(cap/2))choices.push(`${v*2}÷2`);
  if(v<=Math.floor(cap/3))choices.push(`${v*3}÷3`);
  const valid=[...new Set(choices)].filter(s=>evaluate(s)===v);
  const op=preferred?valid.filter(s=>s.includes(preferred)):valid;
  return (op.length?op:valid)[rand((op.length?op:valid).length)] || `${v}+0`;
}
function expression(v){return operationFor(v);}
function valuesPool(){
  const vals=new Set();
  const max=state.max;
  // Até 300 tabuadas: todos os produtos; acima disso: amostragem uniforme.
  if(max<=300){for(let a=1;a<=max;a++)for(let b=1;b<=10;b++)vals.add(a*b);}
  else {for(let a=1;a<=Math.min(max,40);a++)for(let b=1;b<=10;b++)vals.add(a*b);
    for(let i=0;i<2500;i++)vals.add((1+rand(max))*(1+rand(10)));}
  return [...vals].filter(Number.isSafeInteger);
}
function makeBalancedCard(group,slot,owner,anchor){
  const vals=[];
  if(anchor!==null)vals.push(anchor);
  while(vals.length<5)vals.push(group[rand(group.length)]);
  shuffle(vals);
  // Exatamente dois valores inteiros isolados e três operações em cada carta.
  // A âncora também pode aparecer em formato numérico ou como operação.
  const numericSlots=shuffle([0,1,2,3,4]).slice(0,2);
  const used=new Set();
  const items=vals.map((v,i)=>{
    if(numericSlots.includes(i))return String(v);
    let candidate=operationFor(v);
    for(let k=0;k<12&&used.has(candidate);k++)candidate=operationFor(v);
    used.add(candidate);return candidate;
  });
  return {id:++state.idCounter,items,values:vals,slot,owner,linked:!UNLINKED_SLOTS.has(slot),shown:false};
}
function balancedHands(counts,reference){
  const pool=state.pool;
  // Três faixas de resultados disjuntas: conexão comum, exclusivas J1 e J2.
  // Nenhuma carta exclusiva pode coincidir numericamente com carta adversária.
  const shuffled=shuffle([...pool]);
  const common=shuffled.filter((_,i)=>i%3===0);
  const only1=shuffled.filter((_,i)=>i%3===1);
  const only2=shuffled.filter((_,i)=>i%3===2);
  // Para tabuada 1 há dez resultados, suficientes para três grupos.
  const anchor=common[rand(common.length)];
  const hands={1:[],2:[]};
  const maxCount=Math.max(counts[1],counts[2]);
  for(let slot=0;slot<maxCount;slot++){
    for(const owner of [1,2]){
      if(slot>=counts[owner])continue;
      const disconnected=counts[owner]===10?UNLINKED_SLOTS.has(slot%10):new Set([2,6,9].filter(i=>i<counts[owner])).has(slot);
      const group=disconnected?(owner===1?only1:only2):common;
      hands[owner].push(makeBalancedCard(group,slot,owner,disconnected?null:anchor));
    }
  }
  return {hands,anchor};
}
function createCard(anchor=null){
  const vals=[];if(anchor!==null)vals.push(anchor);
  while(vals.length<5)vals.push(state.pool[rand(state.pool.length)]);
  const numericSlots=new Set(shuffle([0,1,2,3,4]).slice(0,2));return {id:++state.idCounter,items:vals.map((v,i)=>numericSlots.has(i)?String(v):operationFor(v)),values:vals};
}
function newDeck(){
  state.pool=valuesPool();state.idCounter=0;
  const generated=balancedHands({1:10,2:10});
  state.hands=generated.hands;
  // A abertura sempre possui ao menos uma equivalência garantida.
  state.initialFirst=createCard(generated.anchor);
  state.initialSecond=createCard(generated.anchor);
  state.prev=state.initialFirst;state.recent=state.initialSecond;
  state.recentOwner=0;state.counts={1:10,2:10};
  state.exposures={1:0,2:0};state.deck=[];state.discarded=[];
}
function renderCard(id,card,color){const el=$(id);el.innerHTML='';el.style.borderColor=color;if(!card){el.innerHTML='<div class="math-entry" style="left:50%;top:50%">—</div>';return;}card.items.forEach((s,i)=>{const div=document.createElement('div');div.className='math-entry';div.dataset.index=i;div.textContent=s;div.style.left=positions[i].x+'%';div.style.top=positions[i].y+'%';div.style.setProperty('--rot',positions[i].r+'deg');el.appendChild(div);});}
function renderHands(){for(let p=1;p<=2;p++){const el=$('hand'+p);el.innerHTML='';state.hands[p].forEach(c=>{const d=document.createElement('div');d.className='mini-card';d.style.borderColor=state.colors[p];d.textContent=c.items[0];d.title=c.items.join(' • ');el.appendChild(d);});}}
function render(){const phase=state.phase;$('setup').classList.toggle('hidden',phase!=='setup');$('game').classList.toggle('hidden',!['opening','playing'].includes(phase));$('result').classList.toggle('hidden',phase!=='result');if(!['opening','playing'].includes(phase))return;for(let p=1;p<=2;p++){$('count'+p).textContent=state.hands[p].length;$('hits'+p).textContent=state.hits[p]+' acertos';$('time'+p).textContent=fmt(state.times[p])+' s';$('dot'+p).style.background=state.colors[p];}renderCard('prevCard',state.prev,'#f6c451');renderCard('recentCard',state.recent,state.recentOwner?state.colors[state.recentOwner]:'#f6c451');renderHands();$('phaseTag').textContent=phase==='opening'?'DISPUTA INICIAL':'RODADA '+state.round;$('boardTitle').textContent=phase==='opening'?'Quem começa o duelo?':'Descubra a equivalência';$('boardStatus').textContent=phase==='opening'?'CARTAS DO SISTEMA':state.recentOwner?'CARTA DO JOGADOR '+state.recentOwner:'CARTA DO SISTEMA';$('turnLabel').textContent=state.locked?'REGISTRANDO RESPOSTA':state.stuck?'SEM RESPOSTAS':phase==='opening'?'QUEM IDENTIFICA?':'VEZ DO JOGADOR '+state.turn;$('claimActions').classList.toggle('hidden',phase!=='opening'||state.locked);$('turnActions').classList.toggle('hidden',phase!=='playing'||state.locked||state.stuck);$('answerPanel').classList.toggle('hidden',!state.locked);$('stuckActions').classList.toggle('hidden',!state.stuck);}
function message(s){$('message').textContent=s;}
function tool(s){$('toolMessage').textContent=s;}
function stopClock(){if(state.clock){clearInterval(state.clock);state.clock=null;}}
function stopAnswerClock(){if(state.answerClock){clearTimeout(state.answerClock);state.answerClock=null;}}
function startClock(){stopClock();state.clockStarted=performance.now();state.remaining=state.limit;updateClock();state.clock=setInterval(()=>{state.remaining=Math.max(0,state.limit-(performance.now()-state.clockStarted)/1000);updateClock();if(state.remaining<=0){stopClock();if(state.phase==='playing'&&!state.locked&&!state.stuck)pass('Tempo esgotado.');}},70);}
function updateClock(){const rem=Math.ceil(state.remaining);$('clockNum').textContent=rem;$('clockRing').style.setProperty('--progress',Math.max(0,100*state.remaining/state.limit)+'%');$('clockRing').style.filter=state.remaining<=3?'drop-shadow(0 0 9px #ff5c78)':'none';}
function recordTime(){const elapsed=Math.min(state.limit,(performance.now()-state.clockStarted)/1000);state.times[state.turn]+=elapsed;return elapsed;}
function openingClaim(p){if(state.phase!=='opening'||state.locked)return;state.answerOwner=p;state.answerOrigin='opening';state.locked=true;state.remaining=state.limit;updateClock();showAnswer(p);message('Jogador '+p+': registre uma equivalência entre as duas cartas iniciais.');render();}
function showAnswer(p){$('answerPrev').value='';$('answerRecent').value='';$('answerPlayer').textContent='JOGADOR '+p;$('answerPanel').classList.remove('hidden');$('answerPrev').focus();// A digitação não tem limite de tempo. O relógio já foi parado ao clicar RESPONDER.
  stopAnswerClock();state.answerStarted=performance.now();}
function beginAnswer(){if(state.phase!=='playing'||state.locked||state.stuck)return;stopClock();recordTime();state.answerOwner=state.turn;state.answerOrigin='playing';state.locked=true;showAnswer(state.turn);render();}
function validate(){const a=norm($('answerPrev').value),b=norm($('answerRecent').value);return state.prev.items.some(x=>norm(x)===a)&&state.recent.items.some(x=>norm(x)===b)&&evaluate(a)!==null&&evaluate(a)===evaluate(b);}
function submitAnswer(){if(!state.locked)return;const ok=validate();finishAnswer(ok,false);}
function removeCard(p,card){const index=state.hands[p].findIndex(c=>c.id===card.id);if(index>=0){state.discarded.push(state.hands[p].splice(index,1)[0]);return true;}return false;}
function discardFor(p){if(!state.hands[p].length)return;if(state.recentOwner===p){removeCard(p,state.recent);}else{const c=state.hands[p][rand(state.hands[p].length)];removeCard(p,c);}}
function finishAnswer(ok,timeout){stopAnswerClock();const p=state.answerOwner,origin=state.answerOrigin;state.locked=false;if(origin==='opening'){if(ok){state.starter=p;state.turn=p;state.phase='playing';state.prev=state.initialSecond;state.recent=null;state.recentOwner=0;state.round=0;message('Jogador '+p+' começa! A segunda carta inicial permanece como referência.');nextRound(p);}else{message(timeout?'Tempo de digitação esgotado.':'Relação incorreta. Outro jogador pode tentar começar.');state.phase='opening';render();}return;}
 state.history.push({player:p,correct:ok,timeout,round:state.round});if(ok){state.hits[p]++;discardFor(p);message('✔ Jogador '+p+' acertou! Uma carta dele foi eliminada.');if(state.hands[p].length===0){finishGame();return;}state.attempted.clear();state.stuck=false;state.turn=p===1?2:1;nextRound(state.turn);}else{message(timeout?'Tempo de digitação esgotado.':'Resposta incorreta. A vez passa ao outro jogador.');pass('Resposta não validada.',true);} }
function selectCard(owner){
  const hand=state.hands[owner];if(!hand.length)return null;
  const unshown=hand.filter(c=>!c.shown);
  // Respeita a ordem 3ª/7ª/10ª, sem sorteio que favoreça um participante.
  const card=(unshown.length?unshown:hand).slice().sort((a,b)=>a.slot-b.slot)[0];
  card.shown=true;
  state.exposures[owner]++;
  return card;
}
function nextRound(owner){stopClock();stopAnswerClock();state.stuck=false;state.locked=false;state.attempted.clear();state.round++;state.recentOwner=owner;state.recent=selectCard(owner);if(!state.recent){finishGame();return;}state.turn=owner;render();message('Jogador '+owner+': observe as cartas. Pressione RESPONDER antes de o tempo acabar.');startClock();}
function pass(reason,fromAnswer=false){if(state.phase!=='playing'||state.stuck||state.locked)return;if(!fromAnswer){stopClock();recordTime();}const p=state.turn;state.attempted.add(p);if(state.attempted.size===2){state.stuck=true;stopClock();render();message('Os dois jogadores passaram. Escolham VERIFICAÇÃO ou APRESENTAR PRÓXIMA CARTA.');return;}state.turn=p===1?2:1;render();message(reason+' Agora é a vez do Jogador '+state.turn+'.');startClock();}
function reveal(){if(!state.stuck&&state.phase!=='playing'){tool('A verificação das cartas da mesa está disponível durante a partida.');return;}const found=pairs(state.prev,state.recent);if(!found.length){message('Não existe equivalência entre as duas cartas visíveis.');tool('Nenhuma relação entre as cartas visíveis. É possível apresentar a próxima carta.');return;}const [i,j]=found[0];const a=$('prevCard').querySelector(`[data-index="${i}"]`),b=$('recentCard').querySelector(`[data-index="${j}"]`);a?.classList.add('reveal');b?.classList.add('reveal');message('Relação: '+state.prev.items[i]+' = '+state.recent.items[j]+' = '+fmt(evaluate(state.prev.items[i]))+'. Sem descarte nesta verificação.');setTimeout(()=>{a?.classList.remove('reveal');b?.classList.remove('reveal');},3500);}
function nextAfterStuck(){if(!state.stuck)return;const old=state.recent;const owner=state.recentOwner;if(old&&owner){old.shown=true;}state.stuck=false;state.attempted.clear();state.turn=owner||state.turn;nextRound(state.turn);}
function checkRelations(){if(state.phase!=='playing')return;const visible=pairs(state.prev,state.recent).length;const c1=state.hands[1].filter(c=>matches(state.prev,c)).length;const c2=state.hands[2].filter(c=>matches(state.prev,c)).length;tool(`Relações disponíveis: cartas da mesa: ${visible?'sim':'não'}; mão do Jogador 1: ${c1} carta(s); mão do Jogador 2: ${c2} carta(s).`);}
function shuffleHands(){if(state.phase!=='playing')return;for(const p of [1,2]){const hand=state.hands[p];const eligible=hand.filter(c=>c.linked&&!c.shown);const ids=shuffle(eligible.map(c=>c.slot));eligible.forEach((c,i)=>c.slot=ids[i]);}renderHands();tool('Embaralhamento interno equilibrado: somente cartas conectáveis não apresentadas mudam de posição. Cartas 3, 7 e 10 preservadas.');}
function renew(){
  if(state.phase!=='playing')return;
  stopClock();stopAnswerClock();state.locked=false;
  const counts={1:state.hands[1].length,2:state.hands[2].length};
  const refreshed=balancedHands(counts,state.prev);
  state.hands=refreshed.hands;
  // A carta anterior continua válida como âncora da nova sequência.
  state.prev=createCard(refreshed.anchor);
  state.exposures={1:0,2:0};
  tool('Cartas renovadas em pares: conexões entre jogadores garantidas, 3ª/7ª/10ª sem conexão, mesmas quantidades preservadas.');
  nextRound(state.turn);
}
function finishGame(){stopClock();stopAnswerClock();state.phase='result';const a=state.hands[1].length,b=state.hands[2].length;let winner=0,reason='';if(a!==b){winner=a<b?1:2;reason='Venceu por ter menos cartas restantes.';}else if(Math.abs(state.times[1]-state.times[2])>0.00001){winner=state.times[1]<state.times[2]?1:2;reason='Empate em cartas. Venceu pelo menor tempo acumulado até RESPONDER.';}else reason='Empate técnico: mesmo número de cartas e mesmo tempo.';$('winnerTitle').textContent=winner?'JOGADOR '+winner+' VENCEU!':'EMPATE!';$('winnerReason').textContent=reason;for(let p=1;p<=2;p++){$('resultCards'+p).textContent=state.hands[p].length;$('resultDiscard'+p).textContent=10-state.hands[p].length;$('resultTime'+p).textContent=fmt(state.times[p])+' s';$('resultHits'+p).textContent=state.hits[p];}render();}
function start(){const max=Number($('maxTable').value),limit=Number($('timeLimit').value);if(!Number.isSafeInteger(max)||max<1||max>100000){alert('Informe uma tabuada positiva de até 100.000 nesta versão para manter a geração rápida.');return;}if(!Number.isInteger(limit)||limit<3||limit>300){alert('Escolha entre 3 e 300 segundos.');return;}state.max=max;state.limit=limit;state.times={1:0,2:0};state.hits={1:0,2:0};state.history=[];state.phase='opening';state.locked=false;state.stuck=false;state.round=0;state.attempted.clear();newDeck();state.remaining=limit;updateClock();render();message('Duas cartas iniciais. Quem encontrar uma equivalência deve pressionar seu botão e responder.');tool('Os cartões já foram gerados. Cada carta tem 2 números e 3 operações. Sete cartas por jogador compartilham equivalências entre as mãos. As posições 3, 7 e 10 não possuem conexões com a mão adversária.');}
function init(){for(let p=1;p<=2;p++){const box=$('swatches'+p);palette.forEach(c=>{const b=document.createElement('button');b.className='swatch'+(state.colors[p]===c?' selected':'');b.style.background=c;b.title='Selecionar cor '+c;b.setAttribute('aria-label','Selecionar cor '+c);b.addEventListener('click',()=>{state.colors[p]=c;box.querySelectorAll('.swatch').forEach(x=>x.classList.toggle('selected',x===b));});box.appendChild(b);});}$('startBtn').onclick=start;document.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>openingClaim(Number(b.dataset.claim)));$('answerBtn').onclick=beginAnswer;$('passBtn').onclick=()=>pass('Jogador passou a vez.');$('submitAnswer').onclick=submitAnswer;$('answerRecent').addEventListener('keydown',e=>{if(e.key==='Enter')submitAnswer();});$('verifyBtn').onclick=reveal;$('nextBtn').onclick=nextAfterStuck;$('checkBtn').onclick=checkRelations;$('shuffleBtn').onclick=shuffleHands;$('renewBtn').onclick=renew;$('endBtn').onclick=()=>{$('confirmDialog').showModal();};$('cancelEnd').onclick=()=>$('confirmDialog').close();$('confirmEnd').onclick=()=>{$('confirmDialog').close();finishGame();};$('againBtn').onclick=()=>{state.phase='setup';render();};$('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();}
init();
