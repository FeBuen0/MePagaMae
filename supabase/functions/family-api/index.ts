// Deployed separately to Supabase. A SHA-256 hash is configured when provisioning.
// The raw app secret is kept only in Sites runtime secrets. Never in this file.
import {createClient} from 'npm:@supabase/supabase-js@2';
const APP_SECRET_SHA256='__CONFIGURE_SECRET_SHA256__';
const categories=['Alimentação','Transporte','Estudos','Saúde','Compras','Lazer','Outros'];
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function problem(message:string,status=400):never{throw Object.assign(new Error(message),{status})}
function text(v:unknown,max:number,required=true){if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))problem('Confira os campos preenchidos.');return (v as string).trim()}
function uuid(v:unknown){return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)}
function expenseInput(b:any){
 const description=text(b.description,180),note=text(b.note||'',500,false),date=text(b.date,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)problem('Confira a data do gasto.');
 if(!Number.isInteger(b.amount)||b.amount<1||b.amount>100000000)problem('Confira o valor do gasto.');
 if(!categories.includes(b.category))problem('Escolha uma categoria para cada gasto.');
 return {description,note,date,amount:b.amount,category:b.category,receipt_path:b.receipt_path?text(b.receipt_path,240):null,receipt_name:b.receipt_name?text(b.receipt_name,160):null};
}
function safeError(error:any){
 const msg=String(error?.message||'');
 const known:Record<string,string>={ALREADY_JOINED:'Você já faz parte de uma família.',INVALID_INVITE:'O convite não existe, expirou ou já foi usado.',WRONG_EMAIL:'Este convite foi feito para outro e-mail.',FAMILY_FULL:'Esta família atingiu o limite de pessoas.',PARENT_EXISTS:'Sua família já tem um responsável.',FORBIDDEN:'Seu perfil não permite essa ação.',INVALID_RECEIPT:'Não encontramos esse comprovante.'};
 for(const k in known)if(msg.includes(k))return known[k];
 if(error?.code==='23505')return 'Esse cadastro já existe. Atualize a página e tente novamente.';
 return 'Não foi possível salvar agora. Tente novamente.';
}
Deno.serve(async(req:Request)=>{
 try{
  if(req.method!=='POST')return reply({error:'Método não permitido.'},405);
  const secret=req.headers.get('X-Family-Secret')||'';
  if(secret.length<40||await hash(secret)!==APP_SECRET_SHA256)return reply({error:'Acesso não permitido.'},401);
  const raw=await req.text();if(raw.length>6500000)return reply({error:'Arquivo muito grande.'},413);
  const b=JSON.parse(raw);const actor=b.actor;
  if(!actor||typeof actor.id!=='string'||!actor.id||typeof actor.email!=='string')return reply({error:'Entre na sua conta.'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const unwrap=(r:any)=>{if(r.error)throw r.error;return r.data};
  const me=unwrap(await db.from('cec_members').select('*').eq('user_id',actor.id).maybeSingle());
  if(b.op==='data'){
   if(!me)return reply({data:null});
   const family=unwrap(await db.from('cec_families').select('id,name,creator_id').eq('id',me.family_id).single());
   const members=unwrap(await db.from('cec_members').select('user_id,name,role').eq('family_id',me.family_id).order('created_at'));
   const expenses:any[]=[];let done=false;
   for(let offset=0;offset<100000;offset+=1000){let q=db.from('cec_expenses').select('id,user_id,description,amount,date,category,status,note,receipt_path,receipt_name,review_note,created_at').eq('family_id',me.family_id);if(me.role!=='parent')q=q.eq('user_id',actor.id);const page=unwrap(await q.order('date',{ascending:false}).order('id').range(offset,offset+999));expenses.push(...page);if(page.length<1000){done=true;break}}
   if(!done)problem('Há muitos registros para carregar. Entre em contato para ampliar o histórico.',413);
   return reply({data:{family,me:{user_id:me.user_id,name:me.name,role:me.role},members,expenses}});
  }
  if(b.op==='setup'){
   if(me)problem('Você já faz parte de uma família.');
   if(!['parent','child'].includes(b.role))problem('Escolha seu perfil.');
   unwrap(await db.rpc('cec_create_family',{p_actor:actor.id,p_email:actor.email,p_name:text(b.name,40),p_family_name:text(b.family_name,60),p_role:b.role}));
   return reply({ok:true});
  }
  if(b.op==='join'){
   unwrap(await db.rpc('cec_join_family',{p_actor:actor.id,p_email:actor.email,p_name:text(b.name,40),p_token_hash:await hash(text(b.token,128))}));return reply({ok:true});
  }
  if(!me)problem('Crie sua família ou entre usando um convite.',403);
  const family=unwrap(await db.from('cec_families').select('creator_id').eq('id',me.family_id).single());
  if(b.op==='invite'){
   if(me.role!=='parent'&&family.creator_id!==actor.id)problem('Somente o responsável pode convidar pessoas.',403);
   if(!['parent','child'].includes(b.role))problem('Escolha o perfil do convite.');
   if(b.role==='parent'){const existing=unwrap(await db.from('cec_members').select('user_id').eq('family_id',me.family_id).eq('role','parent'));if(existing.length)problem('Sua família já tem um responsável.');}
   const email=b.email?text(b.email,254).toLowerCase():null;if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))problem('Confira o e-mail.');
   const count=await db.from('cec_invites').select('*',{count:'exact',head:true}).eq('family_id',me.family_id).gte('created_at',new Date(Date.now()-3600000).toISOString());if(count.error)throw count.error;if((count.count||0)>=20)problem('Aguarde um pouco antes de criar novos convites.',429);
   const token=Array.from(crypto.getRandomValues(new Uint8Array(24))).map(x=>x.toString(16).padStart(2,'0')).join('');
   unwrap(await db.from('cec_invites').insert({family_id:me.family_id,token_hash:await hash(token),role:b.role,email,expires_at:new Date(Date.now()+7*86400000).toISOString()}));return reply({token});
  }
  if(b.op==='upload'){
   if(me.role!=='child')problem('Somente os filhos enviam comprovantes.',403);
   const name=text(b.name,160).replace(/[\x00-\x1f\/\\]/g,'_');
   if(typeof b.base64!=='string'||b.base64.length>5600000)problem('Envie um arquivo de até 4 MB.');
   let decoded:string;try{decoded=atob(b.base64)}catch{problem('O arquivo está inválido.')}
   const bytes=Uint8Array.from(decoded!,c=>c.charCodeAt(0));if(!bytes.length||bytes.length>4194304)problem('Envie um arquivo de até 4 MB.');
   const ext=name.split('.').pop()?.toLowerCase();const magic=new TextDecoder().decode(bytes.slice(0,12));let mime='';
   if(ext==='pdf'&&magic.startsWith('%PDF'))mime='application/pdf';
   else if(['jpg','jpeg'].includes(ext||'')&&bytes[0]===255&&bytes[1]===216)mime='image/jpeg';
   else if(ext==='png'&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78)mime='image/png';
   else if(ext==='webp'&&magic.startsWith('RIFF')&&magic.includes('WEBP'))mime='image/webp';
   else if(['csv','ofx','txt'].includes(ext||''))mime='application/octet-stream';
   else problem('Envie PDF, JPG, PNG, WEBP ou seu extrato CSV/OFX.');
   const path=me.family_id+'/'+actor.id+'/'+crypto.randomUUID()+'.'+ext;
   const up=await db.storage.from('cec-receipts').upload(path,bytes,{contentType:mime,upsert:false});if(up.error)throw up.error;
   try{unwrap(await db.from('cec_files').insert({path,family_id:me.family_id,user_id:actor.id,name,mime,size:bytes.length}))}catch(err){await db.storage.from('cec-receipts').remove([path]);throw err;}
   return reply({path});
  }
  if(b.op==='submit'){
   if(me.role!=='child')problem('Este perfil é para revisar os gastos.',403);
   if(!Array.isArray(b.items)||b.items.length<1||b.items.length>300)problem('Envie entre 1 e 300 gastos por vez.');
   if(!uuid(b.request_id))problem('Atualize a página e tente novamente.');
   const items=b.items.map(expenseInput);const added=unwrap(await db.rpc('cec_submit_expenses',{p_actor:actor.id,p_request:b.request_id,p_items:items}));return reply({ok:true,added});
  }
  if(b.op==='pay'){
   if(!Array.isArray(b.ids)||b.ids.length<1||b.ids.length>1000||!b.ids.every(uuid))problem('Selecione os gastos.');
   const count=unwrap(await db.rpc('cec_mark_paid',{p_actor:actor.id,p_ids:b.ids}));return reply({ok:true,count});
  }
  if(['update','edit','delete','receipt'].includes(b.op)){
   if(!uuid(b.id))problem('Gasto inválido.');
   const expense=unwrap(await db.from('cec_expenses').select('*').eq('id',b.id).eq('family_id',me.family_id).maybeSingle());
   if(!expense||(me.role!=='parent'&&expense.user_id!==actor.id))problem('Gasto não encontrado.',404);
   if(b.op==='receipt'){
    if(!expense.receipt_path)problem('Este gasto não tem comprovante.',404);
    const file=unwrap(await db.from('cec_files').select('name').eq('path',expense.receipt_path).eq('family_id',me.family_id).single());
    const signed=await db.storage.from('cec-receipts').createSignedUrl(expense.receipt_path,120,{download:file.name});if(signed.error)throw signed.error;return reply({url:signed.data.signedUrl});
   }
   if(b.op==='update'){
    if(me.role!=='parent')problem('Somente o responsável revisa os gastos.',403);
    if(!((expense.status==='review'&&['approved','rejected'].includes(b.status))||(expense.status==='approved'&&b.status==='paid')))problem('O gasto já foi atualizado. Atualize a página.');
    const changed=unwrap(await db.from('cec_expenses').update({status:b.status,review_note:text(b.review_note||'',500,false),updated_at:new Date().toISOString(),...(b.status==='paid'?{paid_at:new Date().toISOString()}:{reviewed_at:new Date().toISOString()})}).eq('id',b.id).eq('family_id',me.family_id).eq('status',expense.status).select('id'));
    if(!changed.length)problem('O gasto já foi atualizado. Atualize a página.',409);return reply({ok:true});
   }
   if(me.role!=='child'||expense.user_id!==actor.id||expense.status!=='review')problem('Você só pode editar ou excluir seus gastos que aguardam revisão.',403);
   if(b.op==='delete'){const removed=unwrap(await db.from('cec_expenses').delete().eq('id',b.id).eq('user_id',actor.id).eq('status','review').select('id'));if(!removed.length)problem('O gasto já foi atualizado. Atualize a página.',409);return reply({ok:true});}
   const changes=expenseInput({...b,receipt_path:b.receipt_path||expense.receipt_path,receipt_name:b.receipt_name||expense.receipt_name});
   if(changes.receipt_path){const f=unwrap(await db.from('cec_files').select('path').eq('path',changes.receipt_path).eq('user_id',actor.id).eq('family_id',me.family_id).maybeSingle());if(!f)problem('Comprovante inválido.');}
   const changed=unwrap(await db.from('cec_expenses').update({...changes,updated_at:new Date().toISOString()}).eq('id',b.id).eq('user_id',actor.id).eq('status','review').select('id'));if(!changed.length)problem('O gasto já foi atualizado. Atualize a página.',409);return reply({ok:true});
  }
  return reply({error:'Ação não encontrada.'},404);
 }catch(error:any){if(error?.status)return reply({error:error.message},error.status);return reply({error:safeError(error)},400);}
});
