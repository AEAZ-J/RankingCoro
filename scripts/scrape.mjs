import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";

const SOURCE="https://app.juntossuenamejor.cl/votacion";
const DATA="data.json";

const known=[
  ["UDP STAR","Inicial"],["Ñuñosingers","Inicial"],["Pulso Vocal","Inicial"],["Aguas de Maule","Inicial"],
  ["AM de El Bosque","Intermedio"],["Inti jalsu","Intermedio"],["Coro libre de cantar","Intermedio"],
  ["Celestia Choir","Intermedio"],["Æternum ensamble coral","Intermedio"],["Juntas para cantar","Intermedio"],
  ["Octava Nota","Intermedio"],["Estelares","Intermedio"],
  ["A viva voz","Avanzado"],["Aura Vocal","Avanzado"],["Cuarteto Albores","Avanzado"],
  ["Coro de profesores de Valparaíso","Avanzado"],["Coro Aitué de La Araucanía","Avanzado"],
  ["Coro Juntos Suena Mejor - D3","Coro participante"],["Coro Juntos Suena Mejor - D143","Coro participante"]
].map(([name,level])=>({name,level}));

function parseVotes(s){
  const m=s.match(/(\d[\d.\s]*)\s*votos?/i);
  return m ? Number(m[1].replace(/[.\s]/g,"")) : null;
}

let previous={groups:[]};
try{ previous=JSON.parse(await readFile(DATA,"utf8")); }catch{}

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({locale:"es-CL"});
  await page.goto(SOURCE,{waitUntil:"domcontentloaded",timeout:90000});
  await page.getByRole("button",{name:/Primera ronda/i}).click({timeout:5000}).catch(()=>{});
  await page.waitForTimeout(3500);

  for(let i=0;i<12;i++){
    const more=page.getByRole("button",{name:/cargar más|ver más|mostrar más/i}).first();
    if(await more.isVisible().catch(()=>false)){
      await more.click().catch(()=>{});
      await page.waitForTimeout(800);
    }else break;
  }

  const body=await page.locator("body").innerText();
  const groups=[];

  for(const item of known){
    const idx=body.toLocaleLowerCase("es").indexOf(item.name.toLocaleLowerCase("es"));
    if(idx<0) continue;
    const snippet=body.slice(Math.max(0,idx-80),idx+item.name.length+260);
    const votes=parseVotes(snippet);
    if(votes!==null) groups.push({...item,votes});
  }

  if(groups.length!==known.length){
    throw new Error(`Se esperaban ${known.length} coros y se pudieron leer ${groups.length}; se conserva la última lectura válida.`);
  }

  groups.sort((a,b)=>a.level.localeCompare(b.level,"es") || b.votes-a.votes);

  await writeFile(DATA,JSON.stringify({
    source:SOURCE,
    round:"Primera ronda",
    updatedAt:new Date().toISOString(),
    stale:false,
    groups
  },null,2));

  console.log(`OK: ${groups.length} coros actualizados`);
}catch(err){
  console.error(err);
  await writeFile(DATA,JSON.stringify({
    ...previous,
    source:SOURCE,
    lastAttemptAt:new Date().toISOString(),
    stale:true,
    error:String(err?.message||err)
  },null,2));
  process.exitCode=0;
}finally{
  await browser.close();
}