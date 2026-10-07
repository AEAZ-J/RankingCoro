import { readFile, writeFile } from "node:fs/promises";

const API="https://app.juntossuenamejor.cl/api/voting/choirs?round_code=first";
const DATA="data.json";
const HISTORY="history.json";
const LIVE_HISTORY="https://aeaz-j.github.io/RankingCoro/history.json";
const LIVE_DATA="https://aeaz-j.github.io/RankingCoro/data.json";
const MAX_AGE_MS=30*24*60*60*1000;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function fetchJson(url,label,attempts=3,timeoutMs=15000){
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const res=await fetch(url,{
        headers:{accept:"application/json"},
        signal:AbortSignal.timeout(timeoutMs)
      });
      if(!res.ok)throw new Error(`${label} HTTP ${res.status}`);
      return await res.json();
    }catch(err){
      lastError=err;
      console.warn(`${label}: intento ${attempt}/${attempts} falló: ${err?.message||err}`);
      if(attempt<attempts)await sleep(1500*attempt);
    }
  }
  throw lastError || new Error(`${label}: error desconocido`);
}

const categoryMap={
  basic:"Inicial",
  intermediate:"Intermedio",
  advanced:"Avanzado"
};

let previous={groups:[]};
try{ previous=JSON.parse(await readFile(DATA,"utf8")); }catch{}

async function loadPublishedData(){
  const json=await fetchJson(`${LIVE_DATA}?t=${Date.now()}`,"data publicado",2,12000);
  if(!Array.isArray(json?.groups) || json.groups.length<10) throw new Error("data publicado inválido");
  return json;
}

async function loadPublishedHistory(){
  try{
    const json=await fetchJson(`${LIVE_HISTORY}?t=${Date.now()}`,"history publicado",2,12000);
    return Array.isArray(json?.snapshots)?json.snapshots:[];
  }catch{
    try{
      const local=JSON.parse(await readFile(HISTORY,"utf8"));
      return Array.isArray(local?.snapshots)?local.snapshots:[];
    }catch{
      return [];
    }
  }
}

try{
  const payload=await fetchJson(API,"API de votación",3,15000);
  if(!payload?.ok || !Array.isArray(payload.choirs)){
    throw new Error("Formato inesperado de la API");
  }

  const groups=payload.choirs.map(c=>({
    name:String(c.choir_name||"").trim(),
    level:categoryMap[c.competition_category] || "Coro participante",
    votes:Number(c.accepted_votes||0)
  })).filter(g=>g.name && Number.isFinite(g.votes));

  if(groups.length<10) throw new Error(`Solo llegaron ${groups.length} coros desde la API`);

  const now=new Date();
  const nowIso=now.toISOString();

  await writeFile(DATA,JSON.stringify({
    source:API,
    round:payload.round?.label || "Primera ronda",
    updatedAt:nowIso,
    stale:false,
    groups
  },null,2));

  let snapshots=await loadPublishedHistory();
  const cutoff=now.getTime()-MAX_AGE_MS;
  snapshots=snapshots.filter(s=>{
    const t=Date.parse(s?.at);
    return Number.isFinite(t) && t>=cutoff && s?.votes && typeof s.votes==="object";
  });

  const votes=Object.fromEntries(groups.map(g=>[g.name,g.votes]));
  const last=snapshots.at(-1);
  const sameAsLast=last && Object.keys(votes).length===Object.keys(last.votes||{}).length
    && Object.entries(votes).every(([name,count])=>Number(last.votes?.[name])===count);

  // Keep a fresh timestamp even if vote totals did not change, so hourly/day comparisons
  // have regular reference points. Avoid duplicate snapshots created within 2 minutes.
  const lastMs=last?Date.parse(last.at):NaN;
  if(!Number.isFinite(lastMs) || now.getTime()-lastMs>=2*60*1000){
    snapshots.push({at:nowIso,votes});
  }else if(!sameAsLast){
    snapshots[snapshots.length-1]={at:nowIso,votes};
  }

  await writeFile(HISTORY,JSON.stringify({
    version:1,
    source:API,
    updatedAt:nowIso,
    snapshots
  }));

  console.log(`OK: ${groups.length} coros cargados desde API; ${snapshots.length} mediciones históricas`);
}catch(err){
  console.error(err);
  console.warn("::warning::API de votación no disponible: se publicarán los últimos votos válidos con aviso de datos desactualizados.");
  let fallback=previous;
  try{ fallback=await loadPublishedData(); }catch{}
  await writeFile(DATA,JSON.stringify({
    ...fallback,
    source:API,
    lastAttemptAt:new Date().toISOString(),
    stale:true,
    error:String(err?.message||err)
  },null,2));

  try{
    const snapshots=await loadPublishedHistory();
    if(snapshots.length){
      await writeFile(HISTORY,JSON.stringify({
        version:1,
        source:API,
        updatedAt:snapshots.at(-1)?.at || new Date().toISOString(),
        snapshots
      }));
    }
  }catch{}
}