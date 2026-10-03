const LEVEL_ORDER = ["Inicial","Intermedio","Avanzado","Coro participante"];
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

let selected = "General";
let lastSignature = "";

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

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
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

function setTabs(levels){
  const labels=["General",...levels];
  tabs.innerHTML=labels.map(label =>
    `<button type="button" data-level="${esc(label)}" class="${selected===label?"active":""}">${esc(label)}</button>`
  ).join("");
  tabs.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click",()=>{
      selected=btn.dataset.level;
      document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b===btn));
      document.querySelectorAll(".level").forEach(sec=>{
        sec.classList.toggle("hidden-level", sec.dataset.level!==selected);
      });
    });
  });
}

function rowsMarkup(rows, leader, showLevel=false){
  return rows.map((g,i)=>`<tr>
    <td class="pos"><span class="medal">${medal(i)}</span>${i+1}</td>
    <td class="name">
      ${esc(g.name)}
      ${showLevel ? `<span class="level-tag">${esc(g.level)}</span>` : ""}
    </td>
    <td class="votes">${n(g.votes)}</td>
    <td class="diff">${i===0?"—":"−"+n(leader-(Number(g.votes)||0))}</td>
  </tr>`).join("");
}

function rankingSection(title, dataLevel, rows, showLevel=false){
  const leader=rows[0]?.votes||0;
  return `<article class="level ${selected!==dataLevel?"hidden-level":""}" data-level="${esc(dataLevel)}">
    <div class="level-head">
      <h2>${esc(title)}</h2>
      <span>${rows.length} ${rows.length===1?"coro":"coros"}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Coro</th><th style="text-align:right">Votos</th><th style="text-align:right">Dif. líder</th></tr></thead>
        <tbody>${rowsMarkup(rows,leader,showLevel)}</tbody>
      </table>
    </div>
  </article>`;
}

function render(data){
  const groups=Array.isArray(data.groups)?data.groups:[];
  const levels=[...new Set(groups.map(g=>g.level).filter(Boolean))].sort(levelSort);
  const signature=JSON.stringify(groups.map(g=>[g.name,g.level,g.votes]));
  if(signature===lastSignature && rankings.children.length) return;
  lastSignature=signature;

  document.querySelector("#groupCount").textContent=n(groups.length);
  document.querySelector("#voteCount").textContent=n(groups.reduce((s,g)=>s+(Number(g.votes)||0),0));
  document.querySelector("#levelCount").textContent=n(levels.length);
  setTabs(levels);

  const generalRows=[...groups].sort((a,b)=>(b.votes||0)-(a.votes||0));
  const sections=[rankingSection("Ranking general","General",generalRows,true)];

  for(const level of levels){
    const rows=groups.filter(g=>g.level===level).sort((a,b)=>(b.votes||0)-(a.votes||0));
    sections.push(rankingSection(level,level,rows,false));
  }

  rankings.innerHTML=sections.join("");

  const dt=data.updatedAt?new Date(data.updatedAt):null;
  updatedEl.textContent=dt && !Number.isNaN(dt.valueOf())
    ? `Actualizado ${new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"medium",timeZone:"America/Santiago"}).format(dt)}`
    : "Hora no disponible";

  dot.className="dot "+(data.stale?"stale":"live");
  statusEl.textContent=data.stale?"Último dato disponible":"Datos actualizados";
  warning.classList.toggle("hidden",!data.stale);
  warning.textContent=data.stale
    ? `No se pudo actualizar la fuente en el último intento. Se muestran los últimos datos válidos.${data.error?" Detalle: "+data.error:""}`
    : "";
}

async function load(){
  try{
    const res=await fetch(`data.json?t=${Date.now()}`,{cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  }catch(err){
    dot.className="dot error";
    statusEl.textContent="Sin conexión a datos";
    warning.classList.remove("hidden");
    warning.textContent="No se pudo cargar data.json. "+err.message;
  }
}

initTheme();
load();
setInterval(load,15000);