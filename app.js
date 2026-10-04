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

let selected = "Intermedio";
let lastSignature = "";
let currentGroups = [];
let historySnapshots = [];

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
function groupChanges(name,currentVotes){
  if(historySnapshots.length<2)return {h1:null,h6:null,h12:null,h24:null};
  const latest=historySnapshots.at(-1);
  const latestMs=Date.parse(latest.at);
  if(!Number.isFinite(latestMs))return {h1:null,h6:null,h12:null,h24:null};
  const value=s=>s&&Number.isFinite(Number(s.votes?.[name]))?Number(s.votes[name]):null;
  const diffAtHours=hours=>{
    const snap=snapshotBefore(latestMs-hours*60*60*1000);
    const before=value(snap);
    return before===null?null:currentVotes-before;
  };
  return {
    h1:diffAtHours(1),
    h6:diffAtHours(6),
    h12:diffAtHours(12),
    h24:diffAtHours(24)
  };
}
function selectedGroups(){
  return selected==="General" ? currentGroups : currentGroups.filter(g=>g.level===selected);
}
function updateCategoryTotal(){
  const groups=selectedGroups();
  const total=groups.reduce((sum,g)=>sum+(Number(g.votes)||0),0);
  categoryTotalLabel.textContent=selected==="General" ? "Todos los coros" : selected;
  categoryVoteCount.textContent=`${n(total)} votos`;
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
function desktopRows(rows,leader,showLevel){
  return rows.map((g,i)=>{
    const ch=groupChanges(g.name,Number(g.votes)||0);
    return `<tr>
      <td class="pos"><span class="medal">${medal(i)}</span>${i+1}</td>
      <td class="name">${esc(g.name)}${showLevel?`<span class="level-tag">${esc(g.level)}</span>`:""}</td>
      <td class="votes">${n(g.votes)}</td>
      <td class="change"><span>1h ${deltaText(ch.h1)}</span><span>6h ${deltaText(ch.h6)}</span><span>12h ${deltaText(ch.h12)}</span><span>24h ${deltaText(ch.h24)}</span></td>
      <td class="diff">${i===0?"—":"−"+n(leader-(Number(g.votes)||0))}</td>
    </tr>`;
  }).join("");
}
function mobileCards(rows,leader,showLevel){
  return rows.map((g,i)=>{
    const ch=groupChanges(g.name,Number(g.votes)||0);
    return `<article class="mobile-card">
      <div class="mobile-rank"><span class="medal">${medal(i)}</span><span>${i+1}</span></div>
      <div class="mobile-main">
        <div class="mobile-name">${esc(g.name)}</div>
        <div class="mobile-meta">
          ${showLevel?`<span class="level-tag">${esc(g.level)}</span>`:""}
          <span class="mobile-votes">${n(g.votes)} votos</span>
          <span class="mobile-diff">${i===0?"Líder":"−"+n(leader-(Number(g.votes)||0))+" del líder"}</span>
        </div>
        <div class="mobile-change"><span>1h ${deltaText(ch.h1)}</span><span>6h ${deltaText(ch.h6)}</span><span>12h ${deltaText(ch.h12)}</span><span>24h ${deltaText(ch.h24)}</span></div>
      </div>
    </article>`;
  }).join("");
}
function rankingSection(title,dataLevel,rows,showLevel=false){
  const leader=rows[0]?.votes||0;
  const total=rows.reduce((sum,g)=>sum+(Number(g.votes)||0),0);
  const isHidden=selected!==dataLevel;
  return `<section class="level ${isHidden?"hidden-level":""}" data-level="${esc(dataLevel)}" ${isHidden?"hidden":""}>
    <div class="level-head">
      <h2>${esc(title)}</h2>
      <span>${rows.length} ${rows.length===1?"coro":"coros"} · ${n(total)} votos</span>
    </div>
    <div class="desktop-table">
      <table>
        <thead><tr><th>#</th><th>Coro</th><th style="text-align:right">Votos</th><th>Cambio</th><th style="text-align:right">Dif. líder</th></tr></thead>
        <tbody>${desktopRows(rows,leader,showLevel)}</tbody>
      </table>
    </div>
    <div class="mobile-list">${mobileCards(rows,leader,showLevel)}</div>
  </section>`;
}
function render(data){
  const groups=Array.isArray(data.groups)?data.groups:[];
  currentGroups=groups;
  const levels=[...new Set(groups.map(g=>g.level).filter(Boolean))].sort(levelSort);
  const signature=JSON.stringify(groups.map(g=>[g.name,g.level,g.votes]));
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
  updatedEl.textContent=dt&&!Number.isNaN(dt.valueOf())
    ? "Actualizado: "+new Intl.DateTimeFormat("es-CL",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"America/Santiago"}).format(dt)
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
load();
setInterval(load,REFRESH_MS);