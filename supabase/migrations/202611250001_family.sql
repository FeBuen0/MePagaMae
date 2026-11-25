begin;
create table public.cec_families (
 id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 60),
 creator_id text not null, created_at timestamptz not null default now()
);
create table public.cec_members (
 user_id text primary key, family_id uuid not null references public.cec_families(id) on delete cascade,
 name text not null check(length(name) between 1 and 40), email text not null,
 role text not null check(role in ('parent','child')), created_at timestamptz not null default now()
);
create unique index cec_one_parent on public.cec_members(family_id) where role='parent';
create index cec_members_family on public.cec_members(family_id);
create table public.cec_invites (
 token_hash text primary key, family_id uuid not null references public.cec_families(id) on delete cascade,
 role text not null check(role in ('parent','child')), email text, expires_at timestamptz not null,
 used_by text, created_at timestamptz not null default now()
);
create table public.cec_files (
 path text primary key, family_id uuid not null references public.cec_families(id) on delete cascade,
 user_id text not null references public.cec_members(user_id), name text not null, mime text not null,
 size integer not null check(size between 1 and 4194304), created_at timestamptz not null default now()
);
create table public.cec_expenses (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.cec_families(id) on delete cascade,
 user_id text not null references public.cec_members(user_id), description text not null check(length(description) between 1 and 180),
 amount integer not null check(amount between 1 and 100000000), date date not null,
 category text not null check(category in ('Alimentação','Transporte','Estudos','Saúde','Compras','Lazer','Outros')),
 status text not null default 'review' check(status in ('review','approved','paid','rejected')), note text not null default '',
 receipt_path text references public.cec_files(path), receipt_name text, review_note text,
 batch_key text not null, paid_at timestamptz, reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,batch_key)
);
create index cec_expenses_family_date on public.cec_expenses(family_id,date desc);
create index cec_expenses_owner on public.cec_expenses(user_id,date desc);
alter table public.cec_families enable row level security;
alter table public.cec_members enable row level security;
alter table public.cec_invites enable row level security;
alter table public.cec_expenses enable row level security;
alter table public.cec_files enable row level security;
-- All browser access is denied. The authenticated Sites server calls a private Edge API.
revoke all on public.cec_families,public.cec_members,public.cec_invites,public.cec_expenses,public.cec_files from anon,authenticated;
grant all on public.cec_families,public.cec_members,public.cec_invites,public.cec_expenses,public.cec_files to service_role;

create function public.cec_create_family(p_actor text,p_email text,p_name text,p_family_name text,p_role text)
returns uuid language plpgsql security definer set search_path=public as $$
declare fid uuid;
begin
 if exists(select 1 from cec_members where user_id=p_actor) then raise exception 'ALREADY_JOINED'; end if;
 insert into cec_families(name,creator_id) values(p_family_name,p_actor) returning id into fid;
 insert into cec_members(user_id,family_id,name,email,role) values(p_actor,fid,p_name,lower(p_email),p_role);
 return fid;
end; $$;
create function public.cec_join_family(p_actor text,p_email text,p_name text,p_token_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare inv cec_invites; fid uuid;
begin
 if exists(select 1 from cec_members where user_id=p_actor) then raise exception 'ALREADY_JOINED'; end if;
 select * into inv from cec_invites where token_hash=p_token_hash for update;
 if inv.token_hash is null or inv.used_by is not null or inv.expires_at<now() then raise exception 'INVALID_INVITE'; end if;
 if inv.email is not null and lower(p_email)<>inv.email then raise exception 'WRONG_EMAIL'; end if;
 -- Lock the family row to serialize joins and enforce the member limit.
 perform id from cec_families where id=inv.family_id for update;
 if (select count(*) from cec_members where family_id=inv.family_id)>=20 then raise exception 'FAMILY_FULL'; end if;
 if inv.role='parent' and exists(select 1 from cec_members where family_id=inv.family_id and role='parent') then raise exception 'PARENT_EXISTS'; end if;
 insert into cec_members(user_id,family_id,name,email,role) values(p_actor,inv.family_id,p_name,lower(p_email),inv.role);
 update cec_invites set used_by=p_actor where token_hash=p_token_hash;
 return inv.family_id;
end; $$;
create function public.cec_submit_expenses(p_actor text,p_request text,p_items jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare mem cec_members; item jsonb; i integer:=0; added integer:=0; n integer;
begin
 select * into mem from cec_members where user_id=p_actor;
 if mem.user_id is null or mem.role<>'child' then raise exception 'FORBIDDEN'; end if;
 if jsonb_array_length(p_items) not between 1 and 300 then raise exception 'INVALID_ITEMS'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if item->>'receipt_path' is not null and not exists(select 1 from cec_files where path=item->>'receipt_path' and user_id=p_actor and family_id=mem.family_id) then raise exception 'INVALID_RECEIPT'; end if;
  insert into cec_expenses(family_id,user_id,description,amount,date,category,note,receipt_path,receipt_name,batch_key)
  values(mem.family_id,p_actor,item->>'description',(item->>'amount')::integer,(item->>'date')::date,item->>'category',coalesce(item->>'note',''),item->>'receipt_path',item->>'receipt_name',p_request||':'||i)
  on conflict(user_id,batch_key) do nothing;
  get diagnostics n=row_count;added:=added+n;i:=i+1;
 end loop;
 return added;
end; $$;
create function public.cec_mark_paid(p_actor text,p_ids uuid[])
returns integer language plpgsql security definer set search_path=public as $$
declare mem cec_members; n integer;
begin
 select * into mem from cec_members where user_id=p_actor;
 if mem.user_id is null or mem.role<>'parent' then raise exception 'FORBIDDEN'; end if;
 if coalesce(array_length(p_ids,1),0) not between 1 and 1000 then raise exception 'INVALID_ITEMS'; end if;
 update cec_expenses set status='paid',paid_at=now(),updated_at=now() where id=any(p_ids) and family_id=mem.family_id and status='approved';
 get diagnostics n=row_count;return n;
end; $$;
revoke execute on function public.cec_create_family(text,text,text,text,text) from public,anon,authenticated;
revoke execute on function public.cec_join_family(text,text,text,text) from public,anon,authenticated;
revoke execute on function public.cec_submit_expenses(text,text,jsonb) from public,anon,authenticated;
revoke execute on function public.cec_mark_paid(text,uuid[]) from public,anon,authenticated;
grant execute on function public.cec_create_family(text,text,text,text,text),public.cec_join_family(text,text,text,text),public.cec_submit_expenses(text,text,jsonb),public.cec_mark_paid(text,uuid[]) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('cec-receipts','cec-receipts',false,4194304) on conflict(id) do nothing;
commit;
