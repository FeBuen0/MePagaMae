import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const h={'Cache-Control':'no-store'};
 try{
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:'Entre na sua conta para continuar.',code:'sign_in'},{status:401,headers:h});
  if(req.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'Pedido não permitido.'},{status:403,headers:h});
  if(!req.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Formato inválido.'},{status:415,headers:h});
  if(Number(req.headers.get('content-length')||0)>6500000)return Response.json({error:'Arquivo muito grande.'},{status:413,headers:h});
  const {SUPABASE_EDGE_URL,FAMILY_API_SECRET}=env as unknown as Record<string,string>;
  if(!SUPABASE_EDGE_URL||!FAMILY_API_SECRET)return Response.json({error:'Estamos conectando o banco de dados. Por enquanto, você pode explorar o exemplo.',code:'not_configured'},{status:503,headers:h});
  const body=await req.json() as Record<string,unknown>;
  if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Pedido inválido.'},{status:400,headers:h});
  const result=await fetch(SUPABASE_EDGE_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Family-Secret':FAMILY_API_SECRET},body:JSON.stringify({...body,actor:{id:user.userId,email:user.email,name:user.displayName}}),signal:AbortSignal.timeout(25000)});
  const data=await result.json();return Response.json(data,{status:result.status,headers:h});
 }catch{return Response.json({error:'Não foi possível conectar agora. Tente novamente.'},{status:502,headers:h});}
}
