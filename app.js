const LEVEL_ORDER = ["Inicial","Intermedio","Avanzado","Coro participante"];
const LIVE_API = "https://app.juntossuenamejor.cl/api/voting/choirs?round_code=first";
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

let selected = "General";
let lastSignature = "";

const KNOWN_LEVELS = new Map([
  ["UDP STAR","Inicial"],["Ñuñosingers","Inicial"],["Pulso Vocal","Inicial"],["Aguas de Maule","Inicial"],
  ["AM de El Bosque","Intermedio"],["Inti jalsu","Intermedio"],["Coro libre de cantar","Intermedio"],
  ["Celestia Choir","Intermedio"],["Æternum ensamble coral","Intermedio"],["Juntas para cantar","Intermedio"],
  ["Octava Nota","Intermedio"],["Estelares","Intermedio"],["A viva voz","Avanzado"],["Aura Vocal","Avanzado"],
  ["Cuarteto Albores","Avanzado"],["Coro de profesores de Valparaíso","Avanzado"],
  ["Coro Aitué de La Araucanía","Avanzado"],["Coro Juntos Suena Mejor - D3","Coro participante"],
  ["Coro Juntos Suena Mejor - D143","Coro participante"]
]);

function applyTheme(theme, persist=false){
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  themeIcon.textContent = next === "dark" ? "☀️" : "🌙";
  themeLabel.textContent = next === "dark" ? "Modo día" : "Modo noche";
  themeMeta?.setAttribute("content", next === "dark" ? "#0b1220" : "#f8fafc");
  themeToggle?.setAttribute("aria-pressed", String(next === "dark"));
  if(persist){
    try{ localStorage.setItem("ranking-theme", next); }catch{}
  }
}
function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem("ranking-theme"); }catch{}
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  applyTheme(saved || (systemDark ? "dark" : "light"));
  themeToggle?.addEventListener("click",()=>{
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark", true);
  });
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function n(v){ return new Intl.NumberFormat("es-CL").format(Number(v)||0); }
function medal(i){ return i===0?"🥇":i===1?"🥈":i===2?"🥉":""; }
function levelSort(a,b){
  const ia=LEVEL_ORDER.indexOf(a), ib=LEVEL_ORDER.indexOf(b);
  if(ia===-1 && ib===-1) return a.localeCompare(b,"es");
  if(ia===-1) return 1;
  if(ib===-1) return -1;
  return ia-ib;
}
function getPath(obj,path){
  return path.split(".").reduce((v,key)=>v?.[key],obj);
}
function firstValue(obj,paths){
  for(const path of paths){
    const v=getPath(obj,path);
    if(v!==undefined && v!==null && v!=="") return v;
  }
  return null;
}
function findArray(payload){
  if(Array.isArray(payload)) return payload;
  for(const key of ["choirs","data","results","items"]){
    if(Array.isArray(payload?.[key])) return payload[key];
  }
  if(payload?.data && typeof payload.data==="object") return findArray(payload.data);
  return [];
}
function normalizeLevel(value,name){
  let v=value;
  if(v && typeof v==="object") v=v.name ?? v.label ?? v.title ?? v.code;
  const s=String(v ?? "").trim();
  const low=s.toLocaleLowerCase("es");
  if(low.includes("inicial")) return "Inicial";
  if(low.includes("intermedio")) return "Intermedio";
  if(low.includes("avanzado")) return "Avanzado";
  if(low.includes("participante")) return "Coro participante";
  return s || KNOWN_LEVELS.get(name) || "Sin nivel";
}
function normalizeApi(payload){
  const rows=findArray(payload);
  const groups=rows.map(item=>{
    const name=String(firstValue(item,["name","choir_name","choirName","title","nombre"]) ?? "").trim();
    const votes=Number(firstValue(item,["votes","vote_count","votes_count","total_votes","voteCount","count","stats.votes"]) ?? NaN);
    const levelRaw=firstValue(item,["level","category","category_name","level_name","category.name","level.name","nivel"]);
    return {name,votes,level:normalizeLevel(levelRaw,name)};
  }).filter(g=>g.name && Number.isFinite(g.votes));

  if(groups.length<10) throw new Error("La API no entregó suficientes coros.");
  return {
    source:LIVE_API,
    updatedAt:new Date().toISOString(),
    stale:false,
    live:true,
    groups
  };
}

function chooseLevel(label){
  selected=label;
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.level===selected));
  if(mobileSelect && mobileSelect.value!==selected) mobileSelect.value=selected;
  document.querySelectorAll(".level").forEach(sec=>sec.classList.toggle("hidden-level",sec.dataset.level!==selected));
}
function setFilters(levels){
  const labels=["General",...levels];
  tabs.innerHTML=labels.map(label=>
    `<button type="button" data-level="${esc(label)}" class="${selected===label?"active":""}">${esc(label)}</button>`
  ).join("");
  tabs.querySelectorAll("button").forEach(btn=>btn.addEventListener("click",()=>chooseLevel(btn.dataset.level)));

  mobileSelect.innerHTML=labels.map(label=>`<option value="${esc(label)}">${esc(label)}</option>`).join("");
  mobileSelect.value=labels.includes(selected)?selected:"General";
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
  const levels=[...new Set(groups.map(g=>g.level).filter(Boolean))].sort(levelSort);
  const signature=JSON.stringify(groups.map(g=>[g.name,g.level,g.votes]));
  if(signature===lastSignature && rankings.children.length){
    updateStatus(data);
    return;
  }
  lastSignature=signature;

  document.querySelector("#groupCount").textContent=n(groups.length);
  document.querySelector("#voteCount").textContent=n(groups.reduce((s,g)=>s+(Number(g.votes)||0),0));
  document.querySelector("#levelCount").textContent=n(levels.length);
  if(!["General",...levels].includes(selected)) selected="General";
  setFilters(levels);

  const generalRows=[...groups].sort((a,b)=>(b.votes||0)-(a.votes||0));
  const sections=[rankingSection("Ranking general","General",generalRows,true)];
  for(const level of levels){
    const rows=groups.filter(g=>g.level===level).sort((a,b)=>(b.votes||0)-(a.votes||0));
    sections.push(rankingSection(level,level,rows,false));
  }
  rankings.innerHTML=sections.join("");
  updateStatus(data);
}
function updateStatus(data){
  const dt=data.updatedAt?new Date(data.updatedAt):null;
  updatedEl.textContent=dt && !Number.isNaN(dt.valueOf())
    ? new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"medium",timeZone:"America/Santiago"}).format(dt)
    : "Hora no disponible";

  if(data.live){
    dot.className="dot live";
    statusEl.textContent="Datos en vivo";
    warning.classList.add("hidden");
  }else{
    dot.className="dot "+(data.stale?"stale":"live");
    statusEl.textContent=data.stale?"Último dato disponible":"Datos de respaldo";
  }
}
async function load(){
  try{
    const res=await fetch(`${LIVE_API}&t=${Date.now()}`,{cache:"no-store",mode:"cors"});
    if(!res.ok) throw new Error(`API HTTP ${res.status}`);
    const data=normalizeApi(await res.json());
    render(data);
    return;
  }catch(apiErr){
    try{
      const res=await fetch(`${FALLBACK_DATA}?t=${Date.now()}`,{cache:"no-store"});
      if(!res.ok) throw new Error(`Respaldo HTTP ${res.status}`);
      const data=await res.json();
      data.live=false;
      render(data);
      warning.classList.remove("hidden");
      warning.textContent="La API directa no está disponible desde este navegador; se muestran los últimos datos publicados.";
    }catch(fallbackErr){
      dot.className="dot error";
      statusEl.textContent="Sin conexión a datos";
      warning.classList.remove("hidden");
      warning.textContent="No se pudieron cargar los datos.";
    }
  }
}

initTheme();
load();
setInterval(load,REFRESH_MS);