import { readFile, writeFile } from "node:fs/promises";

const API="https://app.juntossuenamejor.cl/api/voting/choirs?round_code=first";
const DATA="data.json";

const categoryMap={
  basic:"Inicial",
  intermediate:"Intermedio",
  advanced:"Avanzado"
};

let previous={groups:[]};
try{ previous=JSON.parse(await readFile(DATA,"utf8")); }catch{}

try{
  const res=await fetch(API,{headers:{"accept":"application/json"}});
  if(!res.ok) throw new Error(`API HTTP ${res.status}`);

  const payload=await res.json();
  if(!payload?.ok || !Array.isArray(payload.choirs)){
    throw new Error("Formato inesperado de la API");
  }

  const groups=payload.choirs.map(c=>({
    name:String(c.choir_name||"").trim(),
    level:categoryMap[c.competition_category] || "Coro participante",
    votes:Number(c.accepted_votes||0)
  })).filter(g=>g.name && Number.isFinite(g.votes));

  if(groups.length<10) throw new Error(`Solo llegaron ${groups.length} coros desde la API`);

  await writeFile(DATA,JSON.stringify({
    source:API,
    round:payload.round?.label || "Primera ronda",
    updatedAt:new Date().toISOString(),
    stale:false,
    groups
  },null,2));

  console.log(`OK: ${groups.length} coros cargados desde API`);
}catch(err){
  console.error(err);
  await writeFile(DATA,JSON.stringify({
    ...previous,
    source:API,
    lastAttemptAt:new Date().toISOString(),
    stale:true,
    error:String(err?.message||err)
  },null,2));
}