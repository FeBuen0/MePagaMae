'use client';
export type Account={id:string;name:string;username:string;email:string};
type Session={access_token:string;refresh_token:string;expires_at:number;user:Account};
const storageKey='mepagamae.session.v1';
let refreshing:Promise<Session>|null=null;
export function session():Session|null{try{return JSON.parse(localStorage.getItem(storageKey)||'null')}catch{return null}}
function save(value:Session|null){if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey);window.dispatchEvent(new Event('mepagamae-auth'));}
async function call(op:string,payload:Record<string,unknown>,token?:string){
 const r=await fetch('/api/family',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({op,...payload})});
 const d=await r.json() as any;if(!r.ok)throw Object.assign(new Error(d.error||'Não foi possível concluir.'),{status:r.status,code:d.code});return d;
}
export async function authenticate(op:'login'|'register',payload:Record<string,unknown>){const d=await call(op,payload);save(d.session);return d.session as Session;}
async function renew(){
 if(!refreshing)refreshing=(async()=>{const s=session();if(!s)throw new Error('Entre na sua conta.');try{const d=await call('refresh',{refresh_token:s.refresh_token});save(d.session);return d.session as Session}catch(e:any){if(e.status===401)save(null);throw e}})().finally(()=>{refreshing=null});
 return refreshing;
}
export async function request(op:string,payload:Record<string,unknown>={}){
 let s=session();if(!s)throw new Error('Entre na sua conta.');if(s.expires_at*1000<Date.now()+30000)s=await renew();
 try{return await call(op,payload,s.access_token)}catch(e:any){if(e.status!==401)throw e;s=await renew();return call(op,payload,s.access_token)}
}
export async function signOut(){const s=session();save(null);if(s)await call('logout',{},s.access_token).catch(()=>{});}
