const LEVEL_ORDER = ["Inicial","Intermedio","Avanzado","Coro participante"];
const CATEGORY_BAR_COLORS = {
  "Inicial":"#2563eb",
  "Intermedio":"#16a34a",
  "Avanzado":"#9333ea",
  "Coro participante":"#d97706"
};
const FALLBACK_BAR_COLOR = "#64748b";
const FALLBACK_DATA = "data.json";
const HISTORY_DATA = "history.json";
const REFRESH_MS = 60 * 1000;
const DELAY_WARNING_MS = 12 * 60 * 1000;

const rankings = document.querySelector("#rankings");
const choirSearchInput = document.querySelector("#choirSearch");
const choirSearchClear = document.querySelector("#choirSearchClear");
const choirSearchStatus = document.querySelector("#choirSearchStatus");
const choirSearchEmpty = document.querySelector("#choirSearchEmpty");
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
const chartType = document.querySelector("#chartType");
const chartPeriod = document.querySelector("#chartPeriod");
const chartChoirs = document.querySelector("#chartChoirs");
const chartCanvas = document.querySelector("#chartCanvas");
const chartEmpty = document.querySelector("#chartEmpty");
const dailyGainPanel = document.querySelector("#dailyGainPanel");

let selected = "Intermedio";
let lastSignature = "";
let currentGroups = [];
let historySnapshots = [];
let latestData = null;
let lastHistorySourceAt = null;
let loadingPromise = null;
const DEFAULT_EXTRA_WINDOWS = [6,12,24];
const OPTIONAL_WINDOWS = [0.5,...Array.from({length:23},(_,i)=>i+2)];
let extraWindows = loadExtraWindows();
const CHOIR_SELECTION_KEY = "ranking-chart-choirs-v2";
let chartSelectionsByLevel = loadSavedChoirSelections();
let chartSelectedNames = new Set();
let chartSelectionLevel = "";
let gainFromMs = null;
let gainMode = "total";
let gainUntilMs = null;
let gainWindowHours = 6;
let gainWindowCustom = false;
let gainWindowDirection = "backward";

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

function loadSavedChoirSelections(){
  try{
    const parsed=JSON.parse(localStorage.getItem(CHOIR_SELECTION_KEY)||"{}");
    if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([level,names])=>typeof level==="string"&&Array.isArray(names))
      .map(([level,names])=>[level,[...new Set(names.filter(name=>typeof name==="string"))]]));
  }catch{return {};}
}
function saveChoirSelection(){
  chartSelectionsByLevel[selected]=[...chartSelectedNames];
  try{localStorage.setItem(CHOIR_SELECTION_KEY,JSON.stringify(chartSelectionsByLevel));}catch{}
}
function chartGroups(){
  return selected==="General"?[...currentGroups]:currentGroups.filter(g=>g.level===selected);
}
function ensureChartSelection(){
  const groups=chartGroups().sort((x,y)=>(Number(y.votes)||0)-(Number(x.votes)||0));
  const valid=new Set(groups.map(g=>g.name));
  if(chartSelectionLevel!==selected){
    chartSelectionLevel=selected;
    const saved=chartSelectionsByLevel[selected];
    chartSelectedNames=new Set((Array.isArray(saved)?saved:groups.slice(0,4).map(g=>g.name)).filter(name=>valid.has(name)));
  }else{
    chartSelectedNames=new Set([...chartSelectedNames].filter(name=>valid.has(name)));
  }
}
function chartChoirPickerMarkup(){
  ensureChartSelection();
  const groups=chartGroups().sort((x,y)=>(Number(y.votes)||0)-(Number(x.votes)||0));
  const visible=groups.filter(g=>chartSelectedNames.has(g.name));
  const available=groups.filter(g=>!chartSelectedNames.has(g.name));
  return `
    <div class="choir-pick-controls">
      <div class="chart-choir-chips">
        ${visible.length?visible.map(g=>`
          <button type="button" class="window-chip choir-chip" data-remove-choir="${esc(g.name)}"
            title="Quitar ${esc(g.name)}" aria-label="Quitar ${esc(g.name)}">
            ${esc(g.name)} <span aria-hidden="true">×</span>
          </button>`).join(""):`<span class="choir-pick-empty">No hay coros seleccionados</span>`}
      </div>
      <select data-add-choir aria-label="Agregar un coro al gráfico" ${available.length?"":"disabled"}>
        <option value="">Agregar coro…</option>
        ${available.map(g=>`<option value="${esc(g.name)}">${esc(g.name)}</option>`).join("")}
      </select>
    </div>`;
}
function renderChartChoirs(){
  if(!chartChoirs)return;
  chartChoirs.innerHTML=chartChoirPickerMarkup();
}
function changeChoirSelection(name,show){
  ensureChartSelection();
  if(!chartGroups().some(g=>g.name===name))return;
  if(show)chartSelectedNames.add(name);
  else chartSelectedNames.delete(name);
  saveChoirSelection();
  renderChart();
  renderDailyGain();
}
function handleChoirSelectionClick(event){
  const button=event.target.closest("[data-remove-choir]");
  if(button)changeChoirSelection(button.dataset.removeChoir,false);
}
function handleChoirSelectionChange(event){
  const select=event.target.closest("[data-add-choir]");
  if(select?.value)changeChoirSelection(select.value,true);
}
function chartSnapshots(){
  if(!historySnapshots.length)return [];
  const latestMs=Date.parse(historySnapshots.at(-1)?.at);
  if(!Number.isFinite(latestMs))return [];
  const value=chartPeriod?.value||"6";
  if(value==="all")return historySnapshots;
  const hours=Number(value);
  const cutoff=latestMs-hours*60*60*1000;
  const baseline=snapshotBefore(cutoff);
  const visible=historySnapshots.filter(s=>Date.parse(s.at)>cutoff);
  if(baseline&&!visible.includes(baseline))visible.unshift(baseline);
  return visible;
}
function chartPeriodLabel(){
  const value=chartPeriod?.value||"6";
  return value==="all" ? "todo el historial" : `${value}h`;
}
function chartVoteGains(){
  const snaps=chartSnapshots();
  if(snaps.length<2)return [];
  const first=snaps[0];
  const last=snaps.at(-1);
  return chartGroups()
    .filter(g=>chartSelectedNames.has(g.name))
    .map(g=>{
      const start=Number(first.votes?.[g.name]);
      const end=Number(last.votes?.[g.name]);
      return {
        name:g.name,
        gain:Number.isFinite(start)&&Number.isFinite(end)?end-start:null
      };
    })
    .filter(item=>Number.isFinite(item.gain));
}
function chartGainsSummary(gains,palette){
  const totalGain=gains.reduce((sum,item)=>sum+item.gain,0);
  if(!gains.length)return "";
  return `
    <div class="chart-gains">
      <div class="chart-gains-total">
        <span>Votos sumados · ${esc(chartPeriodLabel())}</span>
        <strong>${deltaText(totalGain)} votos</strong>
      </div>
      <div class="chart-gains-list">
        ${gains.map((item,i)=>`
          <span class="chart-gain-item">
            <i style="background:${palette[i%palette.length]}"></i>
            <b>${esc(item.name)}</b>
            <strong>${deltaText(item.gain)}</strong>
          </span>`).join("")}
      </div>
    </div>`;
}
function chartGainBars(gains,palette){
  if(!gains.length)return "";
  const maxGain=Math.max(1,...gains.map(item=>Math.max(0,item.gain)));
  return `
    <div class="chart-bars" role="img" aria-label="Votos sumados en el periodo">
      ${gains.map((item,i)=>{
        const width=Math.max(2,Math.max(0,item.gain)/maxGain*100);
        return `
          <div class="chart-bar-row">
            <div class="chart-bar-label" title="${esc(item.name)}">${esc(item.name)}</div>
            <div class="chart-bar-track">
              <div class="chart-bar-fill" style="width:${width}%;background:${palette[i%palette.length]}"></div>
            </div>
            <strong class="chart-bar-value">${deltaText(item.gain)}</strong>
          </div>`;
      }).join("")}
    </div>`;
}
function chartRankMap(groups,snapshot){
  if(!snapshot?.votes)return null;
  const ranked=groups
    .map((g,i)=>({name:g.name,votes:Number(snapshot.votes[g.name]),base:i}))
    .filter(g=>Number.isFinite(g.votes));
  if(!ranked.length)return null;
  ranked.sort((x,y)=>(y.votes-x.votes)||(x.base-y.base));
  return new Map(ranked.map((g,i)=>[g.name,i+1]));
}
function chartSeries(){
  const groups=chartGroups();
  const selectedGroupsForChart=groups.filter(g=>chartSelectedNames.has(g.name));
  const snaps=chartSnapshots();
  if(snaps.length<2||!selectedGroupsForChart.length)return [];
  const type=chartType?.value||"votes";

  if(type==="new"){
    return selectedGroupsForChart.map(g=>({
      name:g.name,
      points:snaps.slice(1).map((s,i)=>{
        const previous=snaps[i];
        const t=Date.parse(s.at);
        const before=Number(previous.votes?.[g.name]);
        const after=Number(s.votes?.[g.name]);
        return {
          t,
          y:Number.isFinite(before)&&Number.isFinite(after)?after-before:null
        };
      }).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.y))
    })).filter(s=>s.points.length>=1);
  }

  return selectedGroupsForChart.map(g=>({
    name:g.name,
    points:snaps.map(s=>{
      const t=Date.parse(s.at);
      if(type==="rank"){
        const ranks=chartRankMap(groups,s);
        return {t,y:ranks?.get(g.name)??null};
      }
      const votes=Number(s.votes?.[g.name]);
      if(!Number.isFinite(votes))return {t,y:null};
      if(type==="gap"){
        const leader=Math.max(...groups.map(x=>Number(s.votes?.[x.name])).filter(Number.isFinite));
        return {t,y:Number.isFinite(leader)?votes-leader:null};
      }
      return {t,y:votes};
    }).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.y))
  })).filter(s=>s.points.length>=2);
}
function chartTimeLabel(ms){
  return new Intl.DateTimeFormat("es-CL",{hour:"2-digit",minute:"2-digit",timeZone:"America/Santiago"}).format(new Date(ms));
}
function renderChart(){
  if(!chartCanvas||!chartEmpty)return;
  ensureChartSelection();
  renderChartChoirs();
  const type=chartType?.value||"votes";
  const palette=["#2563eb","#16a34a","#d97706","#9333ea","#dc2626","#0891b2"];
  const gains=chartVoteGains();

  if(!chartSelectedNames.size){
    chartCanvas.innerHTML="";
    chartEmpty.hidden=false;
    chartEmpty.textContent="Agrega al menos un coro para mostrar este gráfico.";
    return;
  }

  if(type==="gain"){
    if(!gains.length){
      chartCanvas.innerHTML="";
      chartEmpty.hidden=false;
      chartEmpty.textContent="Aún no hay suficiente historial para calcular votos sumados.";
      return;
    }
    chartEmpty.hidden=true;
    chartCanvas.innerHTML=chartGainsSummary(gains,palette)+chartGainBars(gains,palette);
    return;
  }

  const series=chartSeries();
  if(!series.length){
    chartCanvas.innerHTML="";
    chartEmpty.hidden=false;
    chartEmpty.textContent="Aún no hay suficiente historial para este gráfico.";
    return;
  }
  chartEmpty.hidden=true;

  const width=900,height=330;
  const pad={l:58,r:18,t:24,b:42};
  const allPoints=series.flatMap(s=>s.points);
  const minT=Math.min(...allPoints.map(p=>p.t));
  const maxT=Math.max(...allPoints.map(p=>p.t));
  let minY=Math.min(...allPoints.map(p=>p.y));
  let maxY=Math.max(...allPoints.map(p=>p.y));
  if(type==="rank"){
    minY=1;
    maxY=Math.max(2,...allPoints.map(p=>p.y));
  }else if(type==="new"){
    minY=Math.min(0,minY);
    maxY=Math.max(1,maxY);
    if(minY===maxY)maxY=minY+1;
  }else if(minY===maxY){
    minY-=1;maxY+=1;
  }
  const x=t=>pad.l+(t-minT)/Math.max(1,maxT-minT)*(width-pad.l-pad.r);
  const y=v=>{
    const ratio=(v-minY)/Math.max(1,maxY-minY);
    return type==="rank"
      ? pad.t+ratio*(height-pad.t-pad.b)
      : height-pad.b-ratio*(height-pad.t-pad.b);
  };
  const ticks=4;
  const yTicks=Array.from({length:ticks+1},(_,i)=>{
    const ratio=i/ticks;
    const value=type==="rank"
      ? Math.round(minY+ratio*(maxY-minY))
      : minY+ratio*(maxY-minY);
    const yy=y(value);
    const label=type==="rank" ? `#${value}` : n(Math.round(value));
    return `<line x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}" class="chart-grid"/>
      <text x="${pad.l-8}" y="${yy+4}" text-anchor="end" class="chart-axis-label">${label}</text>`;
  }).join("");
  const xTicks=[0,.25,.5,.75,1].map(r=>{
    const tt=minT+r*(maxT-minT);
    const xx=x(tt);
    return `<text x="${xx}" y="${height-14}" text-anchor="middle" class="chart-axis-label">${chartTimeLabel(tt)}</text>`;
  }).join("");
  const lines=series.map((s,i)=>{
    const points=s.points.map(p=>`${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
    const last=s.points.at(-1);
    return `<polyline points="${points}" fill="none" stroke="${palette[i%palette.length]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(last.t)}" cy="${y(last.y)}" r="4" fill="${palette[i%palette.length]}"/>`;
  }).join("");
  const legend=series.map((s,i)=>`
    <span class="chart-legend-item"><i style="background:${palette[i%palette.length]}"></i>${esc(s.name)}</span>`).join("");
  const gainsHtml=chartGainsSummary(gains,palette);
  chartCanvas.innerHTML=`
    ${gainsHtml}
    <div class="chart-legend">${legend}</div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico histórico">
      ${yTicks}
      ${xTicks}
      ${lines}
    </svg>`;
}
function initCharts(){
  chartType?.addEventListener("change",renderChart);
  chartPeriod?.addEventListener("change",renderChart);
  chartChoirs?.addEventListener("click",handleChoirSelectionClick);
  chartChoirs?.addEventListener("change",handleChoirSelectionChange);
}

function santiagoParts(ms){
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:"America/Santiago",
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit",
    second:"2-digit",
    hourCycle:"h23"
  }).formatToParts(new Date(ms));
  return Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
}
function santiagoLocalToUtcMs(year,month,day,hour,minute=0,second=0){
  let guess=Date.UTC(year,month-1,day,hour,minute,second);
  for(let i=0;i<3;i++){
    const p=santiagoParts(guess);
    const represented=Date.UTC(
      Number(p.year),Number(p.month)-1,Number(p.day),
      Number(p.hour),Number(p.minute),Number(p.second)
    );
    const wanted=Date.UTC(year,month-1,day,hour,minute,second);
    guess+=wanted-represented;
  }
  return guess;
}
function dailyGainDateLabel(ms){
  return new Intl.DateTimeFormat("es-CL",{
    timeZone:"America/Santiago",
    day:"2-digit",
    month:"short",
    year:"numeric",
    hour:"2-digit",
    minute:"2-digit"
  }).format(new Date(ms));
}
function inputDateValue(ms){
  const p=santiagoParts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}
function inputTimeValue(ms){
  const p=santiagoParts(ms);
  return `${p.hour}:${p.minute}`;
}
function historyTimeBounds(){
  const times=historySnapshots.map(s=>Date.parse(s?.at)).filter(Number.isFinite);
  return {
    firstMs:times.length?Math.min(...times):null,
    lastMs:times.length?Math.max(...times):null
  };
}
function gainStartMs(){
  const {firstMs,lastMs}=historyTimeBounds();
  if(!Number.isFinite(firstMs)||!Number.isFinite(lastMs))return null;
  if(!Number.isFinite(gainFromMs))return firstMs;
  return Math.max(firstMs,Math.min(lastMs,gainFromMs));
}
function gainEndMs(){
  const {lastMs}=historyTimeBounds();
  if(!Number.isFinite(lastMs))return null;
  return Number.isFinite(gainUntilMs)?Math.min(gainUntilMs,lastMs):lastMs;
}
function voteObservationsAround(name,targetMs){
  let before=null,after=null;
  for(const snap of historySnapshots){
    const t=Date.parse(snap?.at);
    const raw=snap?.votes?.[name];
    if(raw===null||raw===undefined)continue;
    const value=Number(raw);
    if(!Number.isFinite(t)||!Number.isFinite(value))continue;
    if(t<=targetMs&&(!before||t>before.t))before={t,value};
    if(t>=targetMs&&(!after||t<after.t))after={t,value};
  }
  return {before,after};
}
function voteAtMeasuredTime(name,targetMs){
  if(!Number.isFinite(targetMs))return {value:null,estimated:false};
  const {before,after}=voteObservationsAround(name,targetMs);
  if(!before||!after)return {value:null,estimated:false};
  if(before.t===after.t)return {value:before.value,estimated:false};
  const f=(targetMs-before.t)/(after.t-before.t);
  return {
    value:before.value+(after.value-before.value)*f,
    estimated:true
  };
}
function baselineVoteAt(name,targetMs){
  const measured=voteAtMeasuredTime(name,targetMs);
  if(Number.isFinite(measured.value))return {value:measured.value,partial:false,estimated:measured.estimated};
  const {before,after}=voteObservationsAround(name,targetMs);
  if(before)return {value:before.value,partial:true,estimated:false};
  // Solo usar la primera medición posterior como base parcial, nunca asumir cero.
  if(after)return {value:after.value,partial:true,estimated:false};
  return {value:null,partial:true,estimated:false};
}
function gainWindowInterval(){
  const anchorMs=gainEndMs();
  const durationMs=gainWindowHours*60*60*1000;
  const valid=Number.isFinite(anchorMs);
  const forward=gainWindowDirection==="forward";
  return {
    fromMs:valid?(forward?anchorMs:anchorMs-durationMs):null,
    untilMs:valid?(forward?anchorMs+durationMs:anchorMs):null,
    anchorMs,
    direction:gainWindowDirection,
    durationHours:gainWindowHours
  };
}
function barRows(){
  const {firstMs,lastMs}=historyTimeBounds();
  const targetMs=gainMode==="gain"?gainStartMs():null;
  const interval=gainMode==="window"?gainWindowInterval():null;

  const rows=selectedGroups().map(g=>{
    const current=Number(g.votes);
    let value=null,partial=false,estimated=false;
    if(gainMode==="total"){
      value=Number.isFinite(current)?current:null;
    }else if(gainMode==="gain"){
      const base=baselineVoteAt(g.name,targetMs);
      value=Number.isFinite(current)&&Number.isFinite(base.value)?current-base.value:null;
      partial=base.partial;
      estimated=base.estimated;
    }else if(interval&&Number.isFinite(interval.fromMs)&&Number.isFinite(interval.untilMs)){
      const earlier=voteAtMeasuredTime(g.name,interval.fromMs);
      const later=voteAtMeasuredTime(g.name,interval.untilMs);
      if(Number.isFinite(earlier.value)&&Number.isFinite(later.value)){
        value=later.value-earlier.value;
        estimated=earlier.estimated||later.estimated;
      }
    }
    return {
      name:g.name,
      level:g.level,
      gain:value,
      partial,
      estimated
    };
  }).sort((x,y)=>{
    if(!Number.isFinite(x.gain))return Number.isFinite(y.gain)?1:x.name.localeCompare(y.name,"es");
    if(!Number.isFinite(y.gain))return -1;
    return y.gain-x.gain||x.name.localeCompare(y.name,"es");
  });

  return {
    rows,firstMs,lastMs,targetMs,interval,
    partialCount:rows.filter(r=>r.partial&&Number.isFinite(r.gain)).length,
    estimatedCount:rows.filter(r=>r.estimated&&Number.isFinite(r.gain)).length,
    missingCount:rows.filter(r=>!Number.isFinite(r.gain)).length
  };
}
function dailyGainRows(){
  return barRows();
}
function localNoonMs(referenceMs,dayOffset=0){
  const p=santiagoParts(referenceMs);
  const localDay=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)+dayOffset,12));
  return santiagoLocalToUtcMs(localDay.getUTCFullYear(),localDay.getUTCMonth()+1,localDay.getUTCDate(),12,0);
}
function parseChileDateTime(dateStr,timeStr){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)||!/^\d{2}:\d{2}$/.test(timeStr))return null;
  const [yy,mm,dd]=dateStr.split("-").map(Number);
  const [hh,mi]=timeStr.split(":").map(Number);
  if(hh>23||mi>59||mm<1||mm>12||dd<1||dd>31)return null;
  const converted=santiagoLocalToUtcMs(yy,mm,dd,hh,mi);
  return Number.isFinite(converted)?converted:null;
}
function setBarQuickEnd(preset){
  const {firstMs,lastMs}=historyTimeBounds();
  if(!Number.isFinite(lastMs))return;
  if(preset==="last"){
    gainUntilMs=gainWindowDirection==="forward"
      ?Math.max(firstMs,lastMs-gainWindowHours*60*60*1000)
      :null;
  }
  else if(preset==="today-noon")gainUntilMs=localNoonMs(lastMs,0);
  else if(preset==="yesterday-noon")gainUntilMs=localNoonMs(lastMs,-1);
  else return;
  gainMode="window";
  renderDailyGain();
}
function wireDailyGainControls(firstMs,lastMs){
  const mode=dailyGainPanel?.querySelector("#gainMode");
  const dateInput=dailyGainPanel?.querySelector("#gainFromDate");
  const timeInput=dailyGainPanel?.querySelector("#gainFromTime");
  const reset=dailyGainPanel?.querySelector("#gainFromStart");
  const durationSelect=dailyGainPanel?.querySelector("#gainWindowDuration");
  const directionSelect=dailyGainPanel?.querySelector("#gainWindowDirection");
  const customHours=dailyGainPanel?.querySelector("#gainWindowCustomHours");

  mode?.addEventListener("change",()=>{
    gainMode=["gain","window"].includes(mode.value)?mode.value:"total";
    renderDailyGain();
  });
  directionSelect?.addEventListener("change",()=>{
    const next=directionSelect.value==="forward"?"forward":"backward";
    if(next==="forward"&&gainWindowDirection!=="forward"&&!Number.isFinite(gainUntilMs)){
      gainUntilMs=Math.max(firstMs,lastMs-gainWindowHours*60*60*1000);
    }
    gainWindowDirection=next;
    renderDailyGain();
  });
  dateInput?.addEventListener("change",applyDateTime);
  timeInput?.addEventListener("change",applyDateTime);
  function applyDateTime(){
    if(!dateInput||!timeInput||!Number.isFinite(firstMs)||!Number.isFinite(lastMs))return;
    const ms=parseChileDateTime(dateInput.value,timeInput.value);
    if(!Number.isFinite(ms))return;
    if(gainMode==="gain")gainFromMs=Math.max(firstMs,Math.min(lastMs,ms));
    if(gainMode==="window")gainUntilMs=Math.min(lastMs,ms);
    renderDailyGain();
  }
  reset?.addEventListener("click",()=>{
    gainFromMs=null;
    renderDailyGain();
  });
  durationSelect?.addEventListener("change",()=>{
    if(durationSelect.value==="custom"){
      gainWindowCustom=true;
    }else{
      gainWindowCustom=false;
      const hrs=Number(durationSelect.value);
      if(Number.isFinite(hrs)&&hrs>=0.5)gainWindowHours=hrs;
    }
    renderDailyGain();
  });
  customHours?.addEventListener("change",()=>{
    const hours=Number(customHours.value);
    if(Number.isFinite(hours)){
      gainWindowCustom=true;
      gainWindowHours=Math.min(336,Math.max(0.5,Math.round(hours*2)/2));
      renderDailyGain();
    }
  });
  dailyGainPanel?.querySelectorAll("[data-gain-preset]").forEach(button=>{
    button.addEventListener("click",()=>setBarQuickEnd(button.dataset.gainPreset));
  });
}
function renderDailyGain(){
  if(!dailyGainPanel)return;
  const {rows,targetMs,interval,firstMs,lastMs,partialCount,estimatedCount,missingCount}=barRows();
  const isTotal=gainMode==="total",isWindow=gainMode==="window";
  const hasHistory=Number.isFinite(firstMs)&&Number.isFinite(lastMs);
  const fromMs=Number.isFinite(targetMs)?targetMs:firstMs;
  const untilMs=Number.isFinite(interval?.untilMs)?interval.untilMs:lastMs;
  const anchorMs=Number.isFinite(interval?.anchorMs)?interval.anchorMs:lastMs;
  const dataMs=Date.parse(latestData?.updatedAt);
  const currentMs=Number.isFinite(dataMs)?dataMs:lastMs;
  const maxValue=Math.max(1,...rows.map(r=>Number.isFinite(r.gain)?Math.max(0,r.gain):0));
  const category=selected==="General"?"Todos los coros":selected;

  let detail="Votos totales acumulados";
  if(gainMode==="gain")detail=hasHistory
    ?`Ganados desde ${dailyGainDateLabel(fromMs)} hasta ${dailyGainDateLabel(currentMs)}`
    :"Sin historial disponible";
  if(isWindow)detail=hasHistory
    ?`Ventana de ${n(gainWindowHours)} h: ${dailyGainDateLabel(interval.fromMs)} → ${dailyGainDateLabel(interval.untilMs)}`
    :"Sin historial disponible";

  const header=`
    <div class="daily-gain-head">
      <div>
        <h2>Gráfico de barras · Ranking ${esc(selected)}</h2>
        <p>${esc(category)} · ${esc(detail)}${isTotal&&Number.isFinite(currentMs)?` · actualizado ${dailyGainDateLabel(currentMs)}`:""}</p>
      </div>
      <strong>${rows.length} ${rows.length===1?"coro":"coros"}</strong>
    </div>`;

  const modeOptions=[
    ["total","Todos los votos (total)"],
    ["gain","Ganados desde fecha y hora"],
    ["window","Ventana de horas (antes o después)"]
  ];
  const modeSelect=`
    <label>
      <span>Mostrar</span>
      <select id="gainMode" aria-label="Tipo de gráfico de barras">
        ${modeOptions.map(([key,label])=>`<option value="${key}" ${gainMode===key?"selected":""}>${label}</option>`).join("")}
      </select>
    </label>`;

  const controls=!isTotal&&hasHistory
    ? isWindow
      ?`
        <label>
          <span>Dirección</span>
          <select id="gainWindowDirection" aria-label="Contar horas hacia atrás o hacia adelante">
            <option value="backward" ${gainWindowDirection==="backward"?"selected":""}>Hacia atrás</option>
            <option value="forward" ${gainWindowDirection==="forward"?"selected":""}>Hacia adelante</option>
          </select>
        </label>
        <label>
          <span>${gainWindowDirection==="forward"?"Desde (fecha)":"Hasta (fecha)"}</span>
          <input id="gainFromDate" type="date"
            min="${inputDateValue(firstMs)}" max="${inputDateValue(lastMs)}"
            value="${inputDateValue(anchorMs)}">
        </label>
        <label>
          <span>Hora (Chile)</span>
          <input id="gainFromTime" type="time" step="60" value="${inputTimeValue(anchorMs)}">
        </label>
        <label>
          <span>Duración de la ventana</span>
          <select id="gainWindowDuration">
            ${[1,3,6,12,24,48,72,168].map(hr=>`
              <option value="${hr}" ${!gainWindowCustom&&gainWindowHours===hr?"selected":""}>${hr} h</option>`).join("")}
            <option value="custom" ${gainWindowCustom?"selected":""}>Personalizar…</option>
          </select>
        </label>
        ${gainWindowCustom?`
        <label>
          <span>Horas (0,5–336)</span>
          <input id="gainWindowCustomHours" type="number" min="0.5" max="336" step="0.5"
            value="${gainWindowHours}">
        </label>`:""}
        <div class="gain-quick-presets" aria-label="Hora de referencia rápida">
          <span>${gainWindowDirection==="forward"?"Desde:":"Hasta:"}</span>
          <button type="button" data-gain-preset="last">${gainWindowDirection==="forward"?"Última ventana":"Último registro"}</button>
          <button type="button" data-gain-preset="today-noon">Hoy 12:00</button>
          <button type="button" data-gain-preset="yesterday-noon">Ayer 12:00</button>
        </div>`
      :`
        <label>
          <span>Desde (fecha)</span>
          <input id="gainFromDate" type="date"
            min="${inputDateValue(firstMs)}" max="${inputDateValue(lastMs)}"
            value="${inputDateValue(fromMs)}">
        </label>
        <label>
          <span>Hora (Chile)</span>
          <input id="gainFromTime" type="time" step="60" value="${inputTimeValue(fromMs)}">
        </label>
        <button id="gainFromStart" type="button" ${Number.isFinite(gainFromMs)?"":"disabled"}>Primer registro</button>`
    :"";

  const controlMarkup=`
    <div class="daily-gain-controls" aria-label="Configurar el período del gráfico de barras">
      ${modeSelect}
      ${controls}
    </div>`;

  const levels=[...new Set(rows.map(r=>r.level))].sort(levelSort);
  const colorLegend=selected==="General"?`
    <div class="daily-gain-color-legend" aria-label="Colores de cada categoría">
      ${levels.map(level=>`
        <span><i style="background:${CATEGORY_BAR_COLORS[level]||FALLBACK_BAR_COLOR}"></i>${esc(level||"Otra categoría")}</span>`).join("")}
    </div>`:"";

  if(!isTotal&&!hasHistory){
    dailyGainPanel.innerHTML=header+controlMarkup+
      '<div class="daily-gain-empty">Aún no existe historial para ese cálculo. Prueba “Todos los votos (total)”.</div>';
    wireDailyGainControls(firstMs,lastMs);
    return;
  }
  if(!rows.length){
    dailyGainPanel.innerHTML=header+controlMarkup+
      '<div class="daily-gain-empty">No hay coros en esta categoría.</div>';
    wireDailyGainControls(firstMs,lastMs);
    return;
  }

  const bars=rows.map((item,i)=>{
    const valid=Number.isFinite(item.gain);
    const value=valid?Math.round(item.gain):null;
    const width=valid&&item.gain>0?Math.max(1.5,item.gain/maxValue*100):0;
    const numberText=value===null?"—":(isTotal?"":value>=0?"+":"")+n(value)+(item.partial?" *":"")+(item.estimated?" ≈":"");
    const desc=[item.level,item.partial?"base parcial":null,item.estimated?"valor interpolado":null].filter(Boolean).join(" · ");
    const color=CATEGORY_BAR_COLORS[item.level]||FALLBACK_BAR_COLOR;
    return `
      <div class="daily-gain-row">
        <div class="daily-gain-rank">#${i+1}</div>
        <div class="daily-gain-name" title="${esc(item.name+" · "+desc)}">${esc(item.name)}</div>
        <div class="daily-gain-track">
          <div class="daily-gain-fill" style="width:${width}%;--bar-color:${color};${width===0?"min-width:0;":""}"></div>
        </div>
        <strong class="daily-gain-value" title="${esc(desc)}">${numberText}</strong>
      </div>`;
  }).join("");

  let note="Votos totales actuales: incluye los votos anteriores a nuestro primer registro.";
  if(gainMode==="gain"){
    note="Ganancias calculadas a partir del historial disponible.";
    if(partialCount)note+=` * ${partialCount} coro(s) sin medición previa a la fecha: usamos su primera medición disponible, sin asumir cero.`;
  }
  if(isWindow){
    note=`Periodo: ${dailyGainDateLabel(interval.fromMs)} a ${dailyGainDateLabel(interval.untilMs)}. Se comparan los votos en ambos extremos, no los totales actuales.`;
    if(Number.isFinite(firstMs)&&interval.fromMs<firstMs)note+=` La ventana empieza antes del primer registro disponible (`+dailyGainDateLabel(firstMs)+`), por lo que algunos resultados no se pueden calcular.`;
    if(Number.isFinite(lastMs)&&interval.untilMs>lastMs)note+=` La ventana termina después del último registro disponible (`+dailyGainDateLabel(lastMs)+`), por lo que algunos resultados no se pueden calcular.`;
    if(missingCount)note+=` ${missingCount} coro(s) sin registros suficientes para ambos extremos aparecen como —.`;
  }
  if(estimatedCount)note+=` ≈ ${estimatedCount} valor(es) se estimaron interpolando entre registros.`;

  dailyGainPanel.innerHTML=header+controlMarkup+colorLegend+`
    <div class="daily-gain-bars" role="img" aria-label="${esc(isTotal?"Votos totales":isWindow?"Votos ganados durante la ventana":"Votos ganados desde fecha")}">
      ${bars}
    </div>
    <p class="daily-gain-note">${esc(note)}</p>`;
  wireDailyGainControls(firstMs,lastMs);
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
  const ranked=rows
    .map(g=>({
      name:g.name,
      votes:Number(snapshot.votes[g.name]),
      base:baseOrder.get(g.name)??9999
    }))
    .filter(g=>Number.isFinite(g.votes));
  if(!ranked.length)return null;
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
      const now=currentRanks?.get(g.name);
      const before=previousRanks?.get(g.name);
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

function normalizeSearch(value){
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("es").trim();
}
function applyChoirSearch(){
  if(!choirSearchInput||!rankings)return;
  const query=normalizeSearch(choirSearchInput.value);
  const groups=selectedGroups();
  const matches=groups.filter(g=>normalizeSearch(g.name).includes(query));
  const matchingNames=new Set(matches.map(g=>g.name));
  const section=[...rankings.querySelectorAll(".level")].find(el=>el.dataset.level===selected);
  section?.querySelectorAll("[data-choir]").forEach(el=>{
    const matched=!query||matchingNames.has(el.dataset.choir);
    el.hidden=!matched;
    el.classList.toggle("search-match",Boolean(query)&&matched);
  });
  choirSearchClear.hidden=!query;
  choirSearchStatus.textContent=query
    ? `${matches.length} de ${groups.length} coros encontrados en ${selected}.`
    :"Busca por nombre dentro de la categoría seleccionada.";
  choirSearchEmpty.hidden=!query||matches.length>0;
}
function initChoirSearch(){
  choirSearchInput?.addEventListener("input",applyChoirSearch);
  choirSearchClear?.addEventListener("click",()=>{
    choirSearchInput.value="";
    applyChoirSearch();
    choirSearchInput.focus();
  });
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
  renderChart();
  renderDailyGain();
  applyChoirSearch();
}
function setFilters(levels){
  const labels=["General",...levels];
  tabs.innerHTML=labels.map(label=>`<button type="button" data-level="${esc(label)}" class="${selected===label?"active":""}">${esc(label)}</button>`).join("");
  tabs.querySelectorAll("button").forEach(btn=>btn.addEventListener("click",()=>chooseLevel(btn.dataset.level)));
}
function desktopRows(rows,leader,showLevel,moves){
  return rows.map((g,i)=>{
    const ch=groupChanges(g.name,Number(g.votes)||0);
    const votes=Number(g.votes)||0;
    const previousVotes=i>0?(Number(rows[i-1]?.votes)||0):null;
    return `<tr data-choir="${esc(g.name)}">
      <td class="pos"><div class="pos-main"><span class="medal">${medal(i)}</span>${i+1}</div>${movementBadge(moves.get(g.name))}</td>
      <td class="name">${esc(g.name)}${showLevel?`<span class="level-tag">${esc(g.level)}</span>`:""}</td>
      <td class="votes">${n(g.votes)}</td>
      <td class="change">${changeSpans(ch)}</td>
      <td class="diff">${i<2?"—":"−"+n(previousVotes-votes)}</td>
      <td class="diff">${i===0?"—":"−"+n(leader-votes)}</td>
    </tr>`;
  }).join("");
}
function mobileCards(rows,leader,showLevel,moves){
  return rows.map((g,i)=>{
    const ch=groupChanges(g.name,Number(g.votes)||0);
    const votes=Number(g.votes)||0;
    const previousVotes=i>0?(Number(rows[i-1]?.votes)||0):null;
    return `<article class="mobile-card" data-choir="${esc(g.name)}">
      <div class="mobile-rank"><span class="medal">${medal(i)}</span><span>${i+1}</span>${movementBadge(moves.get(g.name))}</div>
      <div class="mobile-main">
        <div class="mobile-name">${esc(g.name)}</div>
        <div class="mobile-meta">
          ${showLevel?`<span class="level-tag">${esc(g.level)}</span>`:""}
          <span class="mobile-votes">${n(g.votes)} votos</span>
          <span class="mobile-diff">${i===0?"Líder":i===1?"−"+n(leader-votes)+" del líder":"−"+n(previousVotes-votes)+" del anterior"}</span>
          ${i<2?"":`<span class="mobile-diff">−${n(leader-votes)} del líder</span>`}
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
        <thead><tr><th>#</th><th>Coro</th><th style="text-align:right">Votos</th><th>Cambio</th><th style="text-align:right">Dif. anterior</th><th style="text-align:right">Dif. líder</th></tr></thead>
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
  applyChoirSearch();
  updateCategoryTotal();
  renderChart();
  renderDailyGain();
  updateStatus(data);
}
function updateStatus(data){
  const dt=data.updatedAt?new Date(data.updatedAt):null;
  const latest=historySnapshots.at(-1);
  const previous=historySnapshots.at(-2);
  const latestMs=latest?Date.parse(latest.at):NaN;
  const previousMs=previous?Date.parse(previous.at):NaN;
  const dataMs=dt&&!Number.isNaN(dt.valueOf())?dt.getTime():NaN;
  const ageMs=Number.isFinite(dataMs)?Math.max(0,Date.now()-dataMs):NaN;
  const delayed=Number.isFinite(ageMs)&&ageMs>DELAY_WARNING_MS;
  const stale=Boolean(data.stale)||delayed;
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
  dot.className="dot "+(stale?"stale":"live");
  statusEl.textContent=data.stale
    ?"Último dato disponible"
    :delayed
      ?"Actualización retrasada"
      :"Datos actualizados";
  warning.classList.toggle("hidden",!stale);
  if(data.stale){
    warning.textContent="No se pudo actualizar la fuente; se muestran los últimos datos disponibles.";
  }else if(delayed){
    const ageMinutes=Math.floor(ageMs/60000);
    warning.textContent=`Los datos llevan ${ageMinutes} min sin actualizar. La página seguirá reintentando automáticamente.`;
  }else{
    warning.textContent="";
  }
}
async function load(){
  if(loadingPromise)return loadingPromise;
  loadingPromise=(async()=>{
    try{
      const stamp=Date.now();
      const dataRes=await fetch(`${FALLBACK_DATA}?t=${stamp}`,{cache:"no-store"});
      if(!dataRes.ok)throw new Error(`HTTP ${dataRes.status}`);
      const data=await dataRes.json();
      const currentMark=data.updatedAt||"";
      if(!historySnapshots.length||lastHistorySourceAt!==currentMark){
        try{
          const historyRes=await fetch(`${HISTORY_DATA}?t=${stamp}`,{cache:"no-store"});
          if(historyRes.ok){
            const history=await historyRes.json();
            historySnapshots=Array.isArray(history?.snapshots)
              ?history.snapshots.filter(s=>s?.at&&s?.votes).sort((x,y)=>Date.parse(x.at)-Date.parse(y.at))
              :[];
            lastHistorySourceAt=currentMark;
          }
        }catch{
          // Keep the previous valid history if this read fails.
        }
      }
      render(data);
    }catch(err){
      dot.className="dot error";
      statusEl.textContent="Sin conexión a datos";
      warning.classList.remove("hidden");
      warning.textContent="No se pudieron cargar datos nuevos. Se conserva el último ranking disponible.";
    }
  })().finally(()=>{loadingPromise=null;});
  return loadingPromise;
}

initTheme();
initWindowPicker();
initChoirSearch();
initCharts();
load();
setInterval(()=>{if(document.visibilityState!=="hidden")load();},REFRESH_MS);

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")load();
});
window.addEventListener("pageshow",()=>load());
window.addEventListener("focus",()=>load());