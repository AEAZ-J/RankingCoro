const LEVEL_ORDER = ["Inicial","Intermedio","Avanzado","Coro participante"];
const FALLBACK_DATA = "data.json";
const REFRESH_MS = 15000;

const rankings = document.querySelector("#rankings");
const tabs = document.querySelector("#tabs");
const mobileSelect = document.querySelector("#mobileLevelSelect");
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
  if(mobileSelect&&mobileSelect.value!==selected)mobileSelect.value=selected;
  document.querySelectorAll(".level").forEach(sec=>sec.classList.toggle("hidden-level",sec.dataset.level!==selected));
  updateCategoryTotal();
}
function setFilters(levels){
  const labels=["General",...levels];
  tabs.innerHTML=labels.map(label=>`<button type="button" data-level="${esc(label)}" class="${selected===label?"active":""}">${esc(label)}</button>`).join("");
  tabs.querySelectorAll("button").forEach(btn=>btn.addEventListener("click",()=>chooseLevel(btn.dataset.level)));
  mobileSelect.innerHTML=labels.map(label=>`<option value="${esc(label)}">${esc(label)}</option>`).join("");
  mobileSelect.value=labels.includes(selected)?selected:"Intermedio";
  mobileSelect.onchange=()=>chooseLevel(mobileSelect.value);
}
function desktopRows(rows,leader,showLevel){
  return rows.map((g,i)=>`<tr>
    <td class="pos"><span class="medal">${medal(i)}</span>${i+1}</td>
    <td class="name">${esc(g.name)}${showLevel?`<span class="level-tag">${esc(g.level)}</span>`:""}</td>
    <td class="votes">${n(g.votes)}</td>
    <td class="diff">${i===0?"—":"−"+n(leader-(Number(g.votes)||0))}</td>
  </tr>`).join("");
}
function mobileCards(rows,leader,showLevel){
  return rows.map((g,i)=>`<article class="mobile-card">
    <div class="mobile-rank"><span class="medal">${medal(i)}</span><span>${i+1}</span></div>
    <div class="mobile-main">
      <div class="mobile-name">${esc(g.name)}</div>
      <div class="mobile-meta">
        ${showLevel?`<span class="level-tag">${esc(g.level)}</span>`:""}
        <span class="mobile-votes">${n(g.votes)} votos</span>
        <span class="mobile-diff">${i===0?"Líder":"−"+n(leader-(Number(g.votes)||0))+" del líder"}</span>
      </div>
    </div>
  </article>`).join("");
}
function rankingSection(title,dataLevel,rows,showLevel=false){
  const leader=rows[0]?.votes||0;
  return `<section class="level ${selected!==dataLevel?"hidden-level":""}" data-level="${esc(dataLevel)}">
    <div class="level-head">
      <h2>${esc(title)}</h2>
      <span>${rows.length} ${rows.length===1?"coro":"coros"}</span>
    </div>
    <div class="desktop-table">
      <table>
        <thead><tr><th>#</th><th>Coro</th><th style="text-align:right">Votos</th><th style="text-align:right">Dif. líder</th></tr></thead>
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
    ? new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"medium",timeZone:"America/Santiago"}).format(dt)
    : "Hora no disponible";
  dot.className="dot "+(data.stale?"stale":"live");
  statusEl.textContent=data.stale?"Último dato disponible":"Datos actualizados";
  warning.classList.toggle("hidden",!data.stale);
  warning.textContent=data.stale?"No se pudo actualizar la fuente; se muestran los últimos datos disponibles.":"";
}
async function load(){
  try{
    const res=await fetch(`${FALLBACK_DATA}?t=${Date.now()}`,{cache:"no-store"});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    render(await res.json());
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