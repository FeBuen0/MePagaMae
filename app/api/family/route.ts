import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const h={'Cache-Control':'no-store'};
 try{
  if(req.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'Pedido não permitido.'},{status:403,headers:h});
  if(!req.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Formato inválido.'},{status:415,headers:h});
  if(Number(req.headers.get('content-length')||0)>6500000)return Response.json({error:'Arquivo muito grande.'},{status:413,headers:h});
  const {SUPABASE_EDGE_URL,FAMILY_API_SECRET,GEMINI_API_KEY,GEMINI_FAMILY_ID}=env as unknown as Record<string,string>;
  if(!SUPABASE_EDGE_URL||!FAMILY_API_SECRET)return Response.json({error:'A conexão está sendo preparada. Tente novamente em instantes.',code:'not_configured'},{status:503,headers:h});
  const raw=await req.text();if(raw.length>6500000)return Response.json({error:'Arquivo muito grande.'},{status:413,headers:h});
  const body=JSON.parse(raw) as Record<string,unknown>;
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.op!=='string'||body.op==='health')return Response.json({error:'Pedido inválido.'},{status:400,headers:h});
  const ip=req.headers.get('cf-connecting-ip')||'shared';
  const client_id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(FAMILY_API_SECRET+':'+ip)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const access_token=req.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  const result=await fetch(SUPABASE_EDGE_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Family-Secret':FAMILY_API_SECRET},body:JSON.stringify({...body,actor:undefined,access_token,client_id,bootstrap_key:body.op==='data'&&GEMINI_FAMILY_ID?GEMINI_API_KEY:undefined,bootstrap_family:body.op==='data'?GEMINI_FAMILY_ID:undefined}),signal:AbortSignal.timeout(45000)});
  return Response.json(await result.json(),{status:result.status,headers:h});
 }catch{return Response.json({error:'Não foi possível conectar agora. Tente novamente.'},{status:502,headers:h});}
}
