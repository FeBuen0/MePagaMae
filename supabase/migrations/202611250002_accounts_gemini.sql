-- App accounts are Supabase Auth users. All family data remains server-only.
create extension if not exists supabase_vault with schema vault;
alter table public.cec_expenses add column merchant text not null default '' check(length(merchant)<=100);
alter table public.cec_invites add column max_uses integer not null default 1 check(max_uses between 1 and 10);
alter table public.cec_invites add column use_count integer not null default 0 check(use_count between 0 and 10);
update public.cec_invites set use_count=1 where used_by is not null;
create table public.cec_ai_config(
 family_id uuid primary key references public.cec_families(id) on delete cascade,
 vault_id uuid not null,
 model text not null default 'gemini-3.5-flash-lite',
 updated_at timestamptz not null default now()
);
create table public.cec_usage(
 kind text not null, subject text not null, day date not null default current_date,
 hits integer not null check(hits>0), primary key(kind,subject,day)
);
alter table public.cec_ai_config enable row level security;
alter table public.cec_usage enable row level security;
revoke all on public.cec_ai_config,public.cec_usage from anon,authenticated;
grant all on public.cec_ai_config,public.cec_usage to service_role;

create function public.cec_take_usage(p_kind text,p_subject text,p_limit integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if p_limit not between 1 and 2000 or length(p_subject)>128 then raise exception 'INVALID_LIMIT'; end if;
 insert into cec_usage(kind,subject,hits) values(p_kind,p_subject,1)
 on conflict(kind,subject,day) do update set hits=cec_usage.hits+1 where cec_usage.hits<p_limit
 returning hits into n;
 return n is not null;
end; $$;

create function public.cec_set_gemini_key(p_actor text,p_key text,p_model text)
returns void language plpgsql security definer set search_path=public as $$
declare mem cec_members; secret_id uuid;
begin
 select * into mem from cec_members where user_id=p_actor;
 if mem.user_id is null then raise exception 'FORBIDDEN'; end if;
 perform id from cec_families where id=mem.family_id and (creator_id=p_actor or mem.role='parent') for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 select vault_id into secret_id from cec_ai_config where family_id=mem.family_id;
 if p_key is null then
  delete from cec_ai_config where family_id=mem.family_id;
  delete from vault.secrets where id=secret_id;
  return;
 end if;
 if length(p_key) not between 20 and 200 or p_model not in ('gemini-3.5-flash-lite','gemini-3.8-flash') then raise exception 'INVALID_KEY'; end if;
 if secret_id is null then
  select vault.create_secret(p_key,'mepagamae-'||mem.family_id,'Gemini: configuração privada da família') into secret_id;
 else
  perform vault.update_secret(secret_id,p_key);
 end if;
 insert into cec_ai_config(family_id,vault_id,model) values(mem.family_id,secret_id,p_model)
 on conflict(family_id) do update set vault_id=excluded.vault_id,model=excluded.model,updated_at=now();
end; $$;
create function public.cec_gemini_key(p_actor text)
returns table(api_key text,model text) language sql security definer set search_path=public as $$
 select s.decrypted_secret,c.model from cec_members m join cec_ai_config c on c.family_id=m.family_id join vault.decrypted_secrets s on s.id=c.vault_id where m.user_id=p_actor;
$$;

create or replace function public.cec_join_family(p_actor text,p_email text,p_name text,p_token_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare inv cec_invites;
begin
 if exists(select 1 from cec_members where user_id=p_actor) then raise exception 'ALREADY_JOINED'; end if;
 select * into inv from cec_invites where token_hash=p_token_hash for update;
 if inv.token_hash is null or inv.use_count>=inv.max_uses or inv.expires_at<now() then raise exception 'INVALID_INVITE'; end if;
 if inv.email is not null and lower(p_email)<>inv.email then raise exception 'WRONG_EMAIL'; end if;
 perform id from cec_families where id=inv.family_id for update;
 if (select count(*) from cec_members where family_id=inv.family_id)>=20 then raise exception 'FAMILY_FULL'; end if;
 if inv.role='parent' and exists(select 1 from cec_members where family_id=inv.family_id and role='parent') then raise exception 'PARENT_EXISTS'; end if;
 insert into cec_members(user_id,family_id,name,email,role) values(p_actor,inv.family_id,p_name,lower(p_email),inv.role);
 update cec_invites set use_count=use_count+1,used_by=p_actor where token_hash=p_token_hash;
 return inv.family_id;
end; $$;

create or replace function public.cec_submit_expenses(p_actor text,p_request text,p_items jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare mem cec_members; item jsonb; i integer:=0; added integer:=0; n integer;
begin
 select * into mem from cec_members where user_id=p_actor;
 if mem.user_id is null or mem.role<>'child' then raise exception 'FORBIDDEN'; end if;
 if jsonb_array_length(p_items) not between 1 and 300 then raise exception 'INVALID_ITEMS'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if item->>'receipt_path' is not null and not exists(select 1 from cec_files where path=item->>'receipt_path' and user_id=p_actor and family_id=mem.family_id) then raise exception 'INVALID_RECEIPT'; end if;
  insert into cec_expenses(family_id,user_id,description,merchant,amount,date,category,note,receipt_path,receipt_name,batch_key)
  values(mem.family_id,p_actor,item->>'description',coalesce(item->>'merchant',''),(item->>'amount')::integer,(item->>'date')::date,item->>'category',coalesce(item->>'note',''),item->>'receipt_path',item->>'receipt_name',p_request||':'||i)
  on conflict(user_id,batch_key) do nothing;
  get diagnostics n=row_count;added:=added+n;i:=i+1;
 end loop;
 return added;
end; $$;
revoke execute on function public.cec_take_usage(text,text,integer),public.cec_set_gemini_key(text,text,text),public.cec_gemini_key(text) from public,anon,authenticated;
grant execute on function public.cec_take_usage(text,text,integer),public.cec_set_gemini_key(text,text,text),public.cec_gemini_key(text) to service_role;
-- Replaced functions preserve their service-role-only privileges from migration 001.
