const LEVEL_ORDER = ["Inicial","Intermedio","Avanzado","Coro participante"];
const FALLBACK_DATA = "data.json";
const HISTORY_DATA = "history.json";
const REFRESH_MS = 15000;

const rankings = document.querySelector("#rankings");
const tabs = document.querySelector("#tabs");
const statusEl = document.querySelector("#status");
const updatedEl = document.querySelector("#updated");
const dot = document.querySelector("#dot");
const warning = document.querySelector("#warning");
const themeToggle = document.querySelector("#themeToggle");
const themeIcon = document.querySelector("#themeIcon");
const themeLabel = document.querySelector("#themeLabel");
const themeMeta = document.querySelector('meta[name="theme-color"]');
const categoryTotalLabel = document.querySelector("#categoryTotalLabel");
const categoryVoteCount = document.querySelector("#categoryVoteCount");
const categoryChange = document.querySelector("#categoryChange");
const windowChips = document.querySelector("#windowChips");
const windowSelect = document.querySelector("#windowSelect");

let selected = "Intermedio";
let lastSignature = "";
let currentGroups = [];
let historySnapshots = [];
let latestData = null;
const DEFAULT_EXTRA_WINDOWS = [6,12,24];
const OPTIONAL_WINDOWS = [0.5,...Array.from({length:23},(_,i)=>i+2)];
let extraWindows = loadExtraWindows();

function applyTheme(theme, persist=false){
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  themeIcon.textContent = next === "dark" ? "☀️" : "🌙";
  themeLabel.textContent = next === "dark" ? "Modo día" : "Modo noche";
  themeMeta?.setAttribute("content", next === "dark" ? "#0b1220" : "#f8fafc");
  themeToggle?.setAttribute("aria-pressed", String(next === "dark"));
  themeToggle?.setAttribute("title", next === "dark" ? "Cambiar a modo día" : "Cambiar a modo noche");
  if(persist){
    try{ localStorage.setItem("ranking-theme", next); }catch{}
  }
}
function initTheme(){
  let saved=null;
  try{ saved=localStorage.getItem("ranking-theme"); }catch{}
  const systemDark=window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  applyTheme(saved||(systemDark?"dark":"light"));
  themeToggle?.addEventListener("click",()=>{
    const current=document.documentElement.dataset.theme==="dark"?"dark":"light";
    applyTheme(current==="dark"?"light":"dark",true);
  });
}

function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function n(v){return new Intl.NumberFormat("es-CL").format(Number(v)||0)}
function medal(i){return i===0?"🥇":i===1?"🥈":i===2?"🥉":""}
function levelSort(a,b){
  const ia=LEVEL_ORDER.indexOf(a),ib=LEVEL_ORDER.indexOf(b);
  if(ia===-1&&ib===-1)return a.localeCompare(b,"es");
  if(ia===-1)return 1;
  if(ib===-1)return -1;
  return ia-ib;
}
function windowLabel(hours){return hours===0.5?"30m":`${hours}h`}
function sanitizeExtraWindows(values){
  const allowed=new Set(OPTIONAL_WINDOWS);
  return [...new Set((Array.isArray(values)?values:[]).map(Number).filter(v=>allowed.has(v)))].sort((x,y)=>x-y);
}
function loadExtraWindows(){
  try{
    const raw=localStorage.getItem("ranking-change-windows");
    if(!raw)return [...DEFAULT_EXTRA_WINDOWS];
    return sanitizeExtraWindows(JSON.parse(raw));
  }catch{
    return [...DEFAULT_EXTRA_WINDOWS];
  }
}
function saveExtraWindows(){
  try{localStorage.setItem("ranking-change-windows",JSON.stringify(extraWindows))}catch{}
}
function requestedHours(){
  return [...new Set([1,...extraWindows])].sort((x,y)=>x-y);
}
function renderWindowPicker(){
  if(!windowChips||!windowSelect)return;
  windowChips.innerHTML=[
    '<span class="window-chip locked">Últ.</span>',
    '<span class="window-chip locked">1h</span>',
    ...extraWindows.map(hours=>`<button class="window-chip" type="button" data-remove-window="${hours}" title="Quitar ${windowLabel(hours)}">${windowLabel(hours)} <span aria-hidden="true">×</span></button>`)
  ].join("");
  const available=OPTIONAL_WINDOWS.filter(hours=>!extraWindows.includes(hours));
  windowSelect.innerHTML='<option value="">Agregar intervalo…</option>'+
    available.map(hours=>`<option value="${hours}">${windowLabel(hours)}</option>`).join("");
  windowSelect.disabled=!available.length;
}
function refreshForWindowChange(){
  lastSignature="";
  renderWindowPicker();
  if(latestData)render(latestData);
}
function initWindowPicker(){
  renderWindowPicker();
  windowSelect?.addEventListener("change",()=>{
    if(!windowSelect.value)return;
    extraWindows=sanitizeExtraWindows([...extraWindows,Number(windowSelect.value)]);
    saveExtraWindows();
    windowSelect.value="";
    refreshForWindowChange();
  });
  windowChips?.addEventListener("click",event=>{
    const button=event.target.closest("[data-remove-window]");
    if(!button)return;
    const hours=Number(button.dataset.removeWindow);
    extraWindows=extraWindows.filter(v=>v!==hours);
    saveExtraWindows();
    refreshForWindowChange();
  });
}

function snapshotBefore(targetMs){
  let found=null;
  for(const s of historySnapshots){
    const t=Date.parse(s.at);
    if(Number.isFinite(t)&&t<=targetMs)found=s;
    else if(Number.isFinite(t)&&t>targetMs)break;
  }
  return found;
}
function deltaText(v){
  if(v===null||v===undefined||!Number.isFinite(v))return "—";
  return `${v>=0?"+":""}${n(v)}`;
}
function voteChanges(valueAt,currentVotes){
  if(historySnapshots.length<2)return {last:null,byHours:{}};
  const latest=historySnapshots.at(-1);
  const previous=historySnapshots.at(-2);
  const latestMs=Date.parse(latest?.at);
  if(!Number.isFinite(latestMs))return {last:null,byHours:{}};

  const diffFrom=s=>{
    const before=valueAt(s);
    return before===null?null:currentVotes-before;
  };
  const byHours={};
  for(const hours of requestedHours()){
    byHours[hours]=diffFrom(snapshotBefore(latestMs-hours*60*60*1000));
  }
  return {last:diffFrom(previous),byHours};
}
function groupChanges(name,currentVotes){
  const valueAt=s=>s&&Number.isFinite(Number(s.votes?.[name]))?Number(s.votes[name]):null;
  return voteChanges(valueAt,currentVotes);
}
function categoryChanges(groups){
  if(!groups.length)return {last:null,byHours:{}};
  const names=groups.map(g=>g.name);
  const currentTotal=groups.reduce((sum,g)=>sum+(Number(g.votes)||0),0);
  const totalAt=s=>{
    if(!s?.votes)return null;
    let total=0;
    for(const name of names){
      const value=Number(s.votes[name]);
      if(!Number.isFinite(value))return null;
      total+=value;
    }
    return total;
  };
  return voteChanges(totalAt,currentTotal);
}
function changeParts(ch){
  return [
    `Últ. ${deltaText(ch.last)}`,
    ...requestedHours().map(hours=>`${windowLabel(hours)} ${deltaText(ch.byHours?.[hours])}`)
  ];
}
function changeSpans(ch){
  return changeParts(ch).map(part=>`<span>${part}</span>`).join("");
}
function rankMapAt(rows,snapshot){
  if(!snapshot?.votes)return null;
  const baseOrder=new Map(currentGroups.map((g,i)=>[g.name,i]));
  const ranked=rows.map(g=>({
    name:g.name,
    votes:Number(snapshot.votes[g.name]),
    base:baseOrder.get(g.name)??9999
  }));
  if(ranked.some(g=>!Number.isFinite(g.votes)))return null;
  ranked.sort((x,y)=>(y.votes-x.votes)||(x.base-y.base));
  return new Map(ranked.map((g,i)=>[g.name,i+1]));
}
function latestRankMoves(rows){
  const moves=new Map();
  if(rows.length<2||historySnapshots.length<2)return moves;
  let currentRanks=rankMapAt(rows,historySnapshots.at(-1));
  if(!currentRanks)return moves;

  for(let i=historySnapshots.length-1;i>=1&&moves.size<rows.length;i--){
    const previousRanks=rankMapAt(rows,historySnapshots[i-1]);
    if(!previousRanks)continue;
    for(const g of rows){
      if(moves.has(g.name))continue;
      const now=currentRanks.get(g.name);
      const before=previousRanks.get(g.name);
      if(Number.isFinite(now)&&Number.isFinite(before)&&now!==before){
        moves.set(g.name,{delta:before-now,at:historySnapshots[i].at});
      }
    }
    currentRanks=previousRanks;
  }
  return moves;
}
function movementTime(at){
  const dt=new Date(at);
  if(Number.isNaN(dt.valueOf()))return "";
  return new Intl.DateTimeFormat("es-CL",{
    hour:"2-digit",
    minute:"2-digit",
    timeZone:"America/Santiago"
  }).format(dt);
}
function movementBadge(move){
  if(!move||!Number.isFinite(move.delta)||move.delta===0)return "";
  const up=move.delta>0;
  const places=Math.abs(move.delta);
  const time=movementTime(move.at);
  const verb=up?"Subió":"Bajó";
  const placeText=places===1?"puesto":"puestos";
  return `<span class="rank-move ${up?"up":"down"}" title="${verb} ${places} ${placeText}; detectado a las ${esc(time)}">${up?"↑":"↓"}${places} · ${esc(time)}</span>`;
}
function selectedGroups(){
  return selected==="General" ? currentGroups : currentGroups.filter(g=>g.level===selected);
}
function updateCategoryTotal(){
  const groups=selectedGroups();
  const total=groups.reduce((sum,g)=>sum+(Number(g.votes)||0),0);
  const ch=categoryChanges(groups);
  categoryTotalLabel.textContent=selected==="General" ? "Todos los coros" : selected;
  categoryVoteCount.textContent=`${n(total)} votos`;
  categoryChange.textContent=changeParts(ch).join(" · ");
}
function chooseLevel(label){
  selected=label;
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.level===selected));
  document.querySelectorAll(".level").forEach(sec=>{
    const hide=sec.dataset.level!==selected;
    sec.hidden=hide;
    sec.classList.toggle("hidden-level",hide);
  });
  updateCategoryTotal();
}
function setFilters(levels){
  const labels=["General",...levels];
  tabs.innerHTML=labels.map(label=>`<button type="button" data-level="${esc(label)}" class="${selected===label?"active":""}">${esc(label)}</button>`).join("");
  tabs.querySelectorAll("button").forEach(btn=>btn.addEventListener("click",()=>chooseLevel(btn.dataset.level)));
}
function desktopRows(rows,leader,showLevel,moves){
  return rows.map((g,i)=>{
    const ch=groupChanges(g.name,Number(g.votes)||0);
    return `<tr>
      <td class="pos"><div class="pos-main"><span class="medal">${medal(i)}</span>${i+1}</div>${movementBadge(moves.get(g.name))}</td>
      <td class="name">${esc(g.name)}${showLevel?`<span class="level-tag">${esc(g.level)}</span>`:""}</td>
      <td class="votes">${n(g.votes)}</td>
      <td class="change">${changeSpans(ch)}</td>
      <td class="diff">${i===0?"—":"−"+n(leader-(Number(g.votes)||0))}</td>
    </tr>`;
  }).join("");
}
function mobileCards(rows,leader,showLevel,moves){
  return rows.map((g,i)=>{
    const ch=groupChanges(g.name,Number(g.votes)||0);
    return `<article class="mobile-card">
      <div class="mobile-rank"><span class="medal">${medal(i)}</span><span>${i+1}</span>${movementBadge(moves.get(g.name))}</div>
      <div class="mobile-main">
        <div class="mobile-name">${esc(g.name)}</div>
        <div class="mobile-meta">
          ${showLevel?`<span class="level-tag">${esc(g.level)}</span>`:""}
          <span class="mobile-votes">${n(g.votes)} votos</span>
          <span class="mobile-diff">${i===0?"Líder":"−"+n(leader-(Number(g.votes)||0))+" del líder"}</span>
        </div>
        <div class="mobile-change">${changeSpans(ch)}</div>
      </div>
    </article>`;
  }).join("");
}
function rankingSection(title,dataLevel,rows,showLevel=false){
  const leader=rows[0]?.votes||0;
  const total=rows.reduce((sum,g)=>sum+(Number(g.votes)||0),0);
  const moves=latestRankMoves(rows);
  const isHidden=selected!==dataLevel;
  return `<section class="level ${isHidden?"hidden-level":""}" data-level="${esc(dataLevel)}" ${isHidden?"hidden":""}>
    <div class="level-head">
      <h2>${esc(title)}</h2>
      <span>${rows.length} ${rows.length===1?"coro":"coros"} · ${n(total)} votos</span>
    </div>
    <div class="desktop-table">
      <table>
        <thead><tr><th>#</th><th>Coro</th><th style="text-align:right">Votos</th><th>Cambio</th><th style="text-align:right">Dif. líder</th></tr></thead>
        <tbody>${desktopRows(rows,leader,showLevel,moves)}</tbody>
      </table>
    </div>
    <div class="mobile-list">${mobileCards(rows,leader,showLevel,moves)}</div>
  </section>`;
}
function render(data){
  latestData=data;
  const groups=Array.isArray(data.groups)?data.groups:[];
  currentGroups=groups;
  const levels=[...new Set(groups.map(g=>g.level).filter(Boolean))].sort(levelSort);
  const historyMark=historySnapshots.at(-1)?.at||"";
  const signature=JSON.stringify([groups.map(g=>[g.name,g.level,g.votes]),historyMark,historySnapshots.length]);
  if(signature===lastSignature&&rankings.children.length){
    updateStatus(data);
    updateCategoryTotal();
    return;
  }
  lastSignature=signature;

  document.querySelector("#groupCount").textContent=n(groups.length);
  document.querySelector("#voteCount").textContent=n(groups.reduce((s,g)=>s+(Number(g.votes)||0),0));
  document.querySelector("#levelCount").textContent=n(levels.length);

  const labels=["General",...levels];
  if(!labels.includes(selected)){
    selected=levels.includes("Intermedio")?"Intermedio":"General";
  }
  setFilters(levels);

  const generalRows=[...groups].sort((a,b)=>(b.votes||0)-(a.votes||0));
  const sections=[rankingSection("Ranking general","General",generalRows,true)];
  for(const level of levels){
    const rows=groups.filter(g=>g.level===level).sort((a,b)=>(b.votes||0)-(a.votes||0));
    sections.push(rankingSection(level,level,rows,false));
  }
  rankings.innerHTML=sections.join("");
  updateCategoryTotal();
  updateStatus(data);
}
function updateStatus(data){
  const dt=data.updatedAt?new Date(data.updatedAt):null;
  const latest=historySnapshots.at(-1);
  const previous=historySnapshots.at(-2);
  const latestMs=latest?Date.parse(latest.at):NaN;
  const previousMs=previous?Date.parse(previous.at):NaN;
  let intervalText="";
  if(Number.isFinite(latestMs)&&Number.isFinite(previousMs)&&latestMs>=previousMs){
    const totalSeconds=Math.round((latestMs-previousMs)/1000);
    const minutes=Math.floor(totalSeconds/60);
    const seconds=totalSeconds%60;
    intervalText=` · intervalo: ${minutes}m ${String(seconds).padStart(2,"0")}s`;
  }
  updatedEl.textContent=dt&&!Number.isNaN(dt.valueOf())
    ? "Actualizado: "+new Intl.DateTimeFormat("es-CL",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"America/Santiago"}).format(dt)+intervalText
    : "Hora no disponible";
  dot.className="dot "+(data.stale?"stale":"live");
  statusEl.textContent=data.stale?"Último dato disponible":"Datos actualizados";
  warning.classList.toggle("hidden",!data.stale);
  warning.textContent=data.stale?"No se pudo actualizar la fuente; se muestran los últimos datos disponibles.":"";
}
async function load(){
  try{
    const stamp=Date.now();
    const [dataRes,historyRes]=await Promise.all([
      fetch(`${FALLBACK_DATA}?t=${stamp}`,{cache:"no-store"}),
      fetch(`${HISTORY_DATA}?t=${stamp}`,{cache:"no-store"}).catch(()=>null)
    ]);
    if(!dataRes.ok)throw new Error(`HTTP ${dataRes.status}`);
    if(historyRes?.ok){
      const history=await historyRes.json();
      historySnapshots=Array.isArray(history?.snapshots)
        ? history.snapshots.filter(s=>s?.at&&s?.votes).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))
        : [];
    }
    render(await dataRes.json());
  }catch(err){
    dot.className="dot error";
    statusEl.textContent="Sin conexión a datos";
    warning.classList.remove("hidden");
    warning.textContent="No se pudieron cargar los datos.";
  }
}

initTheme();
initWindowPicker();
load();
setInterval(load,REFRESH_MS);