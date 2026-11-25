import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export async function GET(){
 try{const {SUPABASE_EDGE_URL,FAMILY_API_SECRET}=env as unknown as Record<string,string>;if(!SUPABASE_EDGE_URL||!FAMILY_API_SECRET)throw new Error();const r=await fetch(SUPABASE_EDGE_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Family-Secret':FAMILY_API_SECRET},body:'{"op":"health"}',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error();return Response.json({ready:true},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({ready:false},{status:503,headers:{'Cache-Control':'no-store'}})}
}
