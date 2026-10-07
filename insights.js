/* RankingCoro: exploración histórica. No se sustituyen votos sin medición. */
(function(){
"use strict";
const $=s=>document.querySelector(s),H=3600000;
const colors=["#2563eb","#16a34a","#9333ea","#d97706","#0891b2","#dc2626","#64748b"];
const state={level:"",compare:{},cmpHours:6,growthHours:6,at:null,follow:true,playing:null,};
const snapList=()=>historySnapshots.filter(s=>s?.votes&&Number.isFinite(Date.parse(s.at)))
  .slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
const groups=()=>selectedGroups().slice().sort((a,b)=>(Number(b.votes)||0)-(Number(a.votes)||0));
const dateLabel=ms=>Number.isFinite(ms)?dailyGainDateLabel(ms):"Sin registros";
const vote=(s,name)=>{
  const v=s?.votes?.[name];return v===undefined||v===null||v===""||!Number.isFinite(Number(v))?null:Number(v);
};
function measuredAt(name,t){
  if(!Number.isFinite(t))return {value:null,estimated:false};
  let before=null,after=null;
  for(const s of snapList()){
    const ms=Date.parse(s.at),v=vote(s,name);
    if(v===null)continue;
    if(ms<=t)before={ms,v};
    if(ms>=t){after={ms,v};break;}
  }
  if(!before||!after)return {value:null,estimated:false};
  if(before.ms===after.ms)return {value:before.v,estimated:false};
  if(after.ms-before.ms>20*60000)return {value:null,estimated:false};
  return {value:before.v+(after.v-before.v)*(t-before.ms)/(after.ms-before.ms),estimated:true};
}
function selectedCompare(){
  const all=groups(),valid=new Set(all.map(g=>g.name));
  if(state.level!==selected){
    state.level=selected;
    state.compare[selected]=(state.compare[selected]||all.slice(0,2).map(g=>g.name)).filter(x=>valid.has(x));
  }else state.compare[selected]=(state.compare[selected]||[]).filter(x=>valid.has(x));
  return state.compare[selected];
}
function drawCompare(all,snaps){
  const series=all.map((g,i)=>({name:g.name,color:colors[i%colors.length],p:snaps.map(s=>({t:Date.parse(s.at),v:vote(s,g.name)})).filter(p=>p.v!==null)})).filter(s=>s.p.length);
  if(!series.length)return '<p class="insight-empty">No hay mediciones comparables para estas curvas.</p>';
  const W=900,T=255,L=54,R=15,B=38,U=15,allPoints=series.flatMap(s=>s.p);
  const minX=Math.min(...allPoints.map(p=>p.t)),maxX=Math.max(...allPoints.map(p=>p.t));
  let minY=Math.min(...allPoints.map(p=>p.v)),maxY=Math.max(...allPoints.map(p=>p.v));
  if(minY===maxY){minY--;maxY++;}
  const xx=t=>L+(t-minX)/Math.max(1,maxX-minX)*(W-L-R);
  const yy=v=>T-B-(v-minY)/(maxY-minY)*(T-B-U);
  const grid=Array.from({length:17},(_,i)=>{
    const x=L+i/16*(W-L-R),y=U+i/16*(T-U-B),cl=i%4?"insight-grid-minor":"insight-grid-major";
    return `<line x1="${x}" x2="${x}" y1="${U}" y2="${T-B}" class="${cl}"/>
      <line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" class="${cl}"/>`;
  }).join("");
  const axis=[0,.25,.5,.75,1].map(f=>{
    const t=minX+f*(maxX-minX);
    return `<text x="${xx(t)}" y="${T-9}" text-anchor="middle" class="insight-axis">${esc(chartTimeLabel(t,maxX-minX))}</text>`;
  }).join("");
  const curves=series.map(s=>{
    const every=Math.max(1,Math.ceil(s.p.length/250));
    const p=s.p.filter((_,i)=>i%every===0||i===s.p.length-1).map(v=>xx(v.t).toFixed(1)+","+yy(v.v).toFixed(1)).join(" ");
    return `<polyline points="${p}" stroke="${s.color}" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  return `<div class="insight-legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>
    <div class="insight-plot"><svg viewBox="0 0 ${W} ${T}" role="img" aria-label="Evolución comparativa de votos">
      <g aria-hidden="true">${grid}</g>${axis}${curves}</svg></div>`;
}
function renderCompare(){
  const pick=$("#insightComparePick"),out=$("#insightCompareResults");
  if(!pick||!out)return;
  const chosen=new Set(selectedCompare());
  const included=groups().filter(g=>chosen.has(g.name)),available=groups().filter(g=>!chosen.has(g.name));
  pick.innerHTML=`<div class="insight-chips">${included.map(g=>`<button type="button" data-compare-remove="${esc(g.name)}">${esc(g.name)} ×</button>`).join("")}</div>
    <select id="insightCompareAdd" aria-label="Agregar coro al comparador" ${available.length?"":"disabled"}>
      <option value="">Agregar coro…</option>${available.map(g=>`<option value="${esc(g.name)}">${esc(g.name)}</option>`).join("")}</select>`;
  if(!included.length){out.innerHTML='<p class="insight-empty">Agrega uno o más coros.</p>';return;}
  const ss=snapList(),last=ss.at(-1),end=Date.parse(last?.at),start=end-state.cmpHours*H;
  const series=ss.filter(s=>Date.parse(s.at)>=start);
  const prior=ss.filter(s=>Date.parse(s.at)<start).at(-1);
  if(prior)series.unshift(prior);
  let gap="";
  if(included.length>1){
    const [a,b]=included,current=Math.abs(Number(a.votes)-Number(b.votes));
    const a0=measuredAt(a.name,start),b0=measuredAt(b.name,start);
    const a1=vote(last,a.name),b1=vote(last,b.name);
    let trend="No hay historial suficiente para calcular el cambio de brecha.";
    if(a0.value!==null&&b0.value!==null&&a1!==null&&b1!==null){
      const d=Math.abs(a1-b1)-Math.abs(a0.value-b0.value);
      trend=d<0?`Brecha reducida en ${n(Math.round(-d))} votos`:
        d>0?`Brecha ampliada en ${n(Math.round(d))} votos`:"Brecha sin cambios";
      if(a0.estimated||b0.estimated)trend+=" · inicio estimado ≈";
    }
    gap=`<div class="insight-gap"><strong>${n(current)} votos de diferencia actual</strong><span>${esc(a.name)} · ${esc(b.name)}</span><small>${esc(trend)}</small></div>`;
  }
  out.innerHTML=`${gap}<div class="insight-stat-row">${included.map((g,i)=>`<div class="insight-stat"><i style="background:${colors[i%colors.length]}"></i><small>${esc(g.name)}</small><strong>${n(Number(g.votes))}</strong></div>`).join("")}</div>
    ${drawCompare(included,series)}<p class="insight-help">Gráfico basado en el historial. Brecha actual según los últimos votos públicos.</p>`;
}
function growthRows(){
  const ss=snapList(),last=ss.at(-1);
  if(!last)return [];
  const from=Date.parse(last.at)-state.growthHours*H;
  return groups().map(g=>{
    const base=measuredAt(g.name,from),end=vote(last,g.name);
    return {name:g.name,level:g.level,gain:base.value===null||end===null?null:end-base.value,estimated:base.estimated};
  }).sort((a,b)=>a.gain===null?(b.gain===null?a.name.localeCompare(b.name,"es"):1):
    b.gain===null?-1:b.gain-a.gain||a.name.localeCompare(b.name,"es"));
}
function renderGrowth(){
  const out=$("#insightGrowthResults"),meta=$("#insightGrowthMeta");
  if(!out||!meta)return;
  const ss=snapList(),last=ss.at(-1),rows=growthRows();
  meta.textContent=last?`Medido entre ${dateLabel(Date.parse(last.at)-state.growthHours*H)} y ${dateLabel(Date.parse(last.at))}.`:
    "Todavía no existen mediciones suficientes.";
  if(!rows.length){out.innerHTML='<p class="insight-empty">Sin datos históricos comparables.</p>';return;}
  const max=Math.max(1,...rows.map(r=>Math.max(0,r.gain||0)));
  out.innerHTML=`<div class="insight-grow-list">${rows.map((r,i)=>{
    const value=r.gain===null?"—":(r.gain>=0?"+":"")+n(Math.round(r.gain))+(r.estimated?" ≈":"");
    const w=r.gain===null?0:Math.max(0,r.gain)/max*100;
    return `<div class="insight-grow-row"><span>#${i+1}</span><span>${esc(r.name)}</span>
      <div class="insight-track"><div style="width:${w}%;background:${CATEGORY_BAR_COLORS[r.level]||FALLBACK_BAR_COLOR}"></div></div>
      <strong>${value}</strong></div>`;
  }).join("")}</div><p class="insight-help">— Sin datos suficientes · ≈ Estimación entre registros próximos (máx. 20 min).</p>`;
}
function historicIndex(ms){
  const ss=snapList();
  if(!ss.length)return -1;
  if(!Number.isFinite(ms))return ss.length-1;
  if(Date.parse(ss[0].at)>ms)return -1;
  let lo=0,hi=ss.length-1;
  while(lo<hi){
    const mid=Math.ceil((lo+hi)/2);
    if(Date.parse(ss[mid].at)<=ms)lo=mid;else hi=mid-1;
  }
  return lo;
}
function currentIndex(){return state.follow?snapList().length-1:historicIndex(state.at);}
function stop(){
  if(state.playing!==null){clearInterval(state.playing);state.playing=null;}
  if($("#insightPlay"))$("#insightPlay").textContent="▶ Reproducir";
}
function frame(i){
  const ss=snapList();
  if(!ss[i])return;
  state.follow=false;state.at=Date.parse(ss[i].at);renderHistory();
}
function playback(){
  if(state.playing!==null){stop();return;}
  const ss=snapList();
  if(ss.length<2)return;
  if(currentIndex()===ss.length-1)frame(0);
  $("#insightPlay").textContent="⏸ Pausar";
  state.playing=setInterval(()=>{
    const i=currentIndex()+1;
    if(i>=snapList().length){stop();return;}
    frame(i);
    if(i===snapList().length-1)stop();
  },state.speed);
}
function renderHistory(){
  const label=$("#insightFrameLabel"),out=$("#insightHistoryRows"),slider=$("#insightSlider");
  if(!label||!out||!slider)return;
  const ss=snapList(),index=currentIndex();
  slider.min=0;slider.max=Math.max(0,ss.length-1);slider.value=Math.max(0,index);slider.disabled=ss.length<2;
  $("#insightPrevious").disabled=index<=0;
  $("#insightNext").disabled=index>=ss.length-1;
  $("#insightPlay").disabled=ss.length<2;
  if(index<0){label.textContent="No hay registros para esta fecha.";out.innerHTML='<p class="insight-empty">Sin ranking histórico disponible.</p>';return;}
  const s=ss[index],ts=Date.parse(s.at),all=groups();
  label.textContent=`Registro ${index+1} de ${ss.length} · ${dateLabel(ts)} (Chile)`;
  $("#insightDatetime").value=inputDateValue(ts)+"T"+inputTimeValue(ts);
  const rows=all.map(g=>({name:g.name,value:vote(s,g.name)})).filter(g=>g.value!==null)
    .sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,"es"));
  const previous=index?rankMapAt(all,ss[index-1]):null;
  out.innerHTML=`<p class="insight-help">${rows.length} de ${all.length} coros registrados. Valores reales, sin interpolación.</p>
    <div class="insight-history-list">${rows.map((g,i)=>{
      const prior=previous?.get(g.name),delta=prior===undefined?null:prior-i-1;
      const indicator=delta===null?"":delta>0?"↑"+delta:delta<0?"↓"+Math.abs(delta):"=";
      return `<div class="insight-history-row"><span>#${i+1}</span><span>${esc(g.name)}</span>
        <strong>${n(g.value)}</strong><small>${indicator}</small></div>`;
    }).join("")}</div>`;
}
function renderQuality(){
  const out=$("#insightQualityContent");
  if(!out)return;
  const ss=snapList(),last=ss.at(-1),first=ss[0],dt=Date.parse(latestData?.updatedAt);
  const age=Date.now()-dt,stale=latestData?.stale||!Number.isFinite(dt)||age>DELAY_WARNING_MS;
  const gaps=ss.slice(1).map((s,i)=>Date.parse(s.at)-Date.parse(ss[i].at)).filter(v=>v>0);
  const interval=gaps.slice().sort((a,b)=>a-b)[Math.floor(gaps.length/2)]||0;
  const outages=gaps.filter(v=>v>Math.max(20*60000,interval*3)).length;
  const covered=last?currentGroups.filter(g=>vote(last,g.name)!==null).length:0;
  $("#insightQualityCaption").textContent=`${ss.length} registros · ${stale?"Actualización retrasada":"Datos recientes"}`;
  out.innerHTML=`<div class="insight-quality-grid">
    <div><small>Fuente</small><strong>${stale?"Retrasada":"Actualizada"}</strong><span>${dateLabel(dt)}</span></div>
    <div><small>Historial</small><strong>${ss.length} mediciones</strong><span>${first?dateLabel(Date.parse(first.at))+" → "+dateLabel(Date.parse(last.at)):"No disponible"}</span></div>
    <div><small>Cobertura última medición</small><strong>${covered} / ${currentGroups.length} coros</strong><span>Sin asumir votos ausentes</span></div>
    <div><small>Interrupciones posibles</small><strong>${outages}</strong><span>Intervalos anormalmente largos</span></div>
  </div>`;
}
function renderAll(){renderCompare();renderGrowth();renderHistory();renderQuality();}
function parseArray(json){
  try{const a=JSON.parse(json||"[]");return Array.isArray(a)?a.filter(x=>typeof x==="string"&&x.length<170).slice(0,100):[];}
  catch{return [];}
}
function parseLink(){
  if(!window.location?.href||typeof URL!=="function")return;
  const p=new URL(window.location.href).searchParams;
  if(p.has("cat")&&p.get("cat").length<110)selected=p.get("cat");
  if(p.get("view")==="categories"){
    showAllCategories=true;
    previousSingleCategory=p.get("return")?.slice(0,110)||"Intermedio";
    selected="General";
  }
  if(["votes","new","gain","rank","gap"].includes(p.get("chart")))chartType.value=p.get("chart");
  if(["1","3","6","12","24","all"].includes(p.get("period")))chartPeriod.value=p.get("period");
  if(p.has("choirs")){chartSelectionsByLevel[selected]=parseArray(p.get("choirs"));chartSelectionLevel="";}
  if(["total","gain","window"].includes(p.get("bar")))gainMode=p.get("bar");
  if(p.get("dir")==="forward")gainWindowDirection="forward";
  const hours=Number(p.get("hours"));
  if(p.has("hours")&&hours>=.5&&hours<=336){gainWindowHours=hours;gainWindowCustom=![1,3,6,12,24,48,72,168].includes(hours);}
  for(const [key,fn] of [["from",v=>gainFromMs=v],["at",v=>gainUntilMs=v]]){
    const v=Number(p.get(key));if(p.has(key)&&Number.isFinite(v)&&v>0)fn(v);
  }
  if(p.has("cmp"))state.compare[selected]=parseArray(p.get("cmp"));
  for(const [key,fn] of [["cwin",v=>state.cmpHours=v],["gwin",v=>state.growthHours=v]]){
    const v=Number(p.get(key));if([1,3,6,12,24,48].includes(v))fn(v);
  }
  if(p.has("hist")){
    const v=Number(p.get("hist"));if(Number.isFinite(v)&&v>0){state.at=v;state.follow=false;}
  }
  if($("#choirSearch")&&p.has("search")){
    const search=p.get("search").slice(0,160);
    $("#choirSearch").value=search;
    // Shared searches must be visibly editable, not hidden behind a closed magnifier.
    if(search.trim()){
      const popover=$("#rankingSearchPanel"),toggle=$("#choirSearchToggle");
      if(popover)popover.hidden=false;
      toggle?.setAttribute("aria-expanded","true");
      toggle?.setAttribute("aria-label","Cerrar búsqueda de coros");
    }
  }
  const panelLookup={
    chart:".chart-panel",
    bars:"#barChartDetails",
    comparison:"#insightComparePanel",
    growth:"#insightGrowthPanel",
    history:"#insightHistoryPanel",
    quality:"#insightQualityPanel",
    changes:"#windowPicker"
  };
  if(p.has("views")){
    const openViews=new Set((p.get("views")||"").split(","));
    for(const [name,selector] of Object.entries(panelLookup)){
      const el=$(selector);if(el)el.open=openViews.has(name);
    }
  }else{
    // Compatibility with links generated before the foldout state was shared.
    if(p.has("hist")&&$("#insightHistoryPanel"))$("#insightHistoryPanel").open=true;
    if(["window","gain"].includes(p.get("bar"))&&$("#barChartDetails"))$("#barChartDetails").open=true;
  }
}
function makeLink(){
  const u=new URL(window.location.href),p=u.searchParams;
  p.set("cat",selected);p.set("chart",chartType?.value||"votes");p.set("period",chartPeriod?.value||"6");
  if(showAllCategories){p.set("view","categories");p.set("return",previousSingleCategory);}
  else{p.delete("view");p.delete("return");}
  ensureChartSelection();p.set("choirs",JSON.stringify([...chartSelectedNames]));
  p.set("bar",gainMode);p.set("dir",gainWindowDirection);p.set("hours",String(gainWindowHours));
  for(const [k,v] of [["from",gainFromMs],["at",gainUntilMs]])if(Number.isFinite(v))p.set(k,v);else p.delete(k);
  p.set("cmp",JSON.stringify(selectedCompare()));p.set("cwin",String(state.cmpHours));p.set("gwin",String(state.growthHours));
  if(!state.follow&&Number.isFinite(state.at))p.set("hist",String(state.at));else p.delete("hist");
  const text=$("#choirSearch")?.value.trim();
  if(text)p.set("search",text);else p.delete("search");
  const viewLookup={
    chart:".chart-panel",
    bars:"#barChartDetails",
    comparison:"#insightComparePanel",
    growth:"#insightGrowthPanel",
    history:"#insightHistoryPanel",
    quality:"#insightQualityPanel",
    changes:"#windowPicker"
  };
  p.set("views",Object.entries(viewLookup)
    .filter(([,selector])=>Boolean($(selector)?.open))
    .map(([name])=>name).join(","));
  return u.toString();
}
async function copyLink(){
  const link=makeLink();
  let ok=false;
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);ok=true;}}catch{}
  if(!ok){
    const ta=document.createElement("textarea");ta.value=link;ta.style.position="fixed";ta.style.left="-9999px";
    document.body.appendChild(ta);ta.select();try{ok=document.execCommand("copy");}catch{}ta.remove();
  }
  $("#insightLinkStatus").textContent=ok?"Enlace copiado, con tus filtros y coros.":
    "No se pudo copiar automáticamente. Usa la barra de direcciones.";
}
function init(){
  parseLink();
  $("#insightShareLink")?.addEventListener("click",copyLink);
  $("#insightComparePick")?.addEventListener("click",e=>{
    const button=e.target.closest("[data-compare-remove]");
    if(button){state.compare[selected]=selectedCompare().filter(x=>x!==button.dataset.compareRemove);renderCompare();}
  });
  $("#insightComparePick")?.addEventListener("change",e=>{
    const name=e.target.value;
    if(name&&groups().some(g=>g.name===name)){state.compare[selected]=[...selectedCompare(),name];renderCompare();}
  });
  $("#insightCompareWindow")?.addEventListener("change",e=>{state.cmpHours=Number(e.target.value)||6;renderCompare();});
  $("#insightGrowthWindow")?.addEventListener("change",e=>{state.growthHours=Number(e.target.value)||6;renderGrowth();});
  $("#insightCompareWindow").value=String(state.cmpHours);
  $("#insightGrowthWindow").value=String(state.growthHours);
  $("#insightSlider")?.addEventListener("input",e=>{stop();frame(Number(e.target.value));});
  $("#insightDatetime")?.addEventListener("change",e=>{
    const [date,time]=(e.target.value||"").split("T");
    if(!date||!time)return;
    const t=parseChileDateTime(date,time.slice(0,5));
    if(Number.isFinite(t)){stop();state.at=t;state.follow=false;renderHistory();}
  });
  $("#insightPrevious")?.addEventListener("click",()=>{stop();frame(currentIndex()-1);});
  $("#insightNext")?.addEventListener("click",()=>{stop();frame(currentIndex()+1);});
  $("#insightPlay")?.addEventListener("click",playback);
  $("#insightSpeed")?.addEventListener("change",e=>{state.speed=Number(e.target.value)||1000;if(state.playing!==null){stop();playback();}});
  $("#insightLatest")?.addEventListener("click",()=>{stop();state.follow=true;state.at=null;renderHistory();});
  window.addEventListener("pagehide",stop);
  if(currentGroups.length)renderAll();
}
window.renderInsights=renderAll;
window.renderDataQuality=renderQuality;
init();
})();