-- CR-017 desired schema draft. Apply only after destination/capacity review.
-- A private namespace and service-only invoker RPCs preserve the existing API boundary.
begin;

create schema prawnsplit;
revoke all on schema prawnsplit from public, anon, authenticated;
grant usage on schema prawnsplit to service_role;

create table prawnsplit.relay_control (
  singleton boolean primary key default true check (singleton),
  writes_enabled boolean not null default false,
  imports_enabled boolean not null default false,
  max_payload_bytes bigint not null default 0 check (max_payload_bytes >= 0),
  max_entries bigint not null default 0 check (max_entries >= 0),
  max_groups bigint not null default 0 check (max_groups >= 0),
  max_namespace_bytes bigint not null default 0 check (max_namespace_bytes >= 0),
  max_database_bytes bigint not null default 0 check (max_database_bytes >= 0),
  payload_bytes bigint not null default 0 check (payload_bytes >= 0),
  entry_count bigint not null default 0 check (entry_count >= 0),
  group_count bigint not null default 0 check (group_count >= 0)
);
insert into prawnsplit.relay_control (singleton) values (true);

create table prawnsplit.relay_topics (
  tag text primary key check (tag ~ '^[0-9a-f]{64}$'),
  commitment text check (commitment ~ '^[0-9a-f]{64}$'),
  last_ms numeric(20,0) not null default 0 check (last_ms between 0 and 18446744073709551615),
  last_seq numeric(20,0) not null default 0 check (last_seq between 0 and 18446744073709551615)
);

create table prawnsplit.relay_entries (
  tag text not null references prawnsplit.relay_topics(tag),
  cursor_ms numeric(20,0) not null check (cursor_ms between 0 and 18446744073709551615),
  cursor_seq numeric(20,0) not null check (cursor_seq between 0 and 18446744073709551615),
  blob text not null check (octet_length(blob) > 0),
  author text not null check (char_length(author) between 1 and 128),
  primary key (tag, cursor_ms, cursor_seq)
);
-- Non-unique: historical duplicate records/cursors must remain intact. This
-- digest only narrows lookup; exact blob + author comparison decides identity.
create index relay_entries_receipt on prawnsplit.relay_entries(tag, pg_catalog.md5(blob), author);

alter table prawnsplit.relay_control enable row level security;
alter table prawnsplit.relay_topics enable row level security;
alter table prawnsplit.relay_entries enable row level security;
revoke all on all tables in schema prawnsplit from public, anon, authenticated;
grant select, insert, update on all tables in schema prawnsplit to service_role;

create function prawnsplit.reserve_capacity(p_bytes bigint, p_entries bigint, p_groups bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  quota prawnsplit.relay_control%rowtype;
  namespace_bytes bigint;
  reserve_bytes bigint;
  headroom_bytes constant bigint := 1048576;
begin
  if p_bytes is null or p_entries is null or p_groups is null or
     p_bytes < 0 or p_entries < 0 or p_groups < 0 then
    raise exception 'invalid capacity reservation';
  end if;
  select * into strict quota from prawnsplit.relay_control where singleton for update;
  -- Admission reserve, not an exact prediction or a shared-database hard cap.
  -- Heap, index and TOAST allocation can exceed payload size; first allocation
  -- already needs more than one 8 KiB page. Keep additional free headroom.
  reserve_bytes := p_bytes * 2 + (p_entries + p_groups) * 65536 + 65536;
  -- Measure allocated relations again even after a failed import: transaction
  -- rollback restores rows/counters but does not shrink allocated relation pages.
  namespace_bytes := pg_catalog.pg_total_relation_size('prawnsplit.relay_control'::regclass)
    + pg_catalog.pg_total_relation_size('prawnsplit.relay_topics'::regclass)
    + pg_catalog.pg_total_relation_size('prawnsplit.relay_entries'::regclass);
  if quota.payload_bytes + p_bytes > quota.max_payload_bytes
     or quota.entry_count + p_entries > quota.max_entries
     or quota.group_count + p_groups > quota.max_groups
     or namespace_bytes + reserve_bytes + headroom_bytes > quota.max_namespace_bytes
     or pg_catalog.pg_database_size(pg_catalog.current_database()) + reserve_bytes + headroom_bytes > quota.max_database_bytes then
    raise exception 'relay capacity exceeded';
  end if;
  update prawnsplit.relay_control set payload_bytes = payload_bytes + p_bytes,
    entry_count = entry_count + p_entries, group_count = group_count + p_groups where singleton;
end;
$$;

create function public.prawnsplit_relay_append(p_tag text, p_commitment text, p_blob text, p_author text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  topic prawnsplit.relay_topics%rowtype;
  next_ms numeric(20,0);
  next_seq numeric(20,0);
  is_new boolean;
  allowed boolean;
  prior_cursor text;
begin
  if p_tag is null or p_tag !~ '^[0-9a-f]{64}$' or p_commitment is null
     or p_commitment !~ '^[0-9a-f]{64}$' or p_blob is null
     or octet_length(p_blob) not between 1 and 131072
     or p_author is null or char_length(p_author) not between 1 and 128 then
    raise exception 'invalid relay write';
  end if;
  -- The same first lock serializes proof claiming, cursor allocation and quotas.
  select writes_enabled into strict allowed from prawnsplit.relay_control where singleton for update;
  if not allowed then raise exception 'relay writes are paused'; end if;
  select * into topic from prawnsplit.relay_topics where tag = p_tag;
  is_new := not found;
  -- A source stream with no proof is retained but cannot be silently re-claimed.
  if not is_new and topic.commitment is distinct from p_commitment then return null; end if;
  select e.cursor_ms::text || '-' || e.cursor_seq::text into prior_cursor
    from prawnsplit.relay_entries e where e.tag=p_tag
      and pg_catalog.md5(e.blob)=pg_catalog.md5(p_blob) and e.blob=p_blob and e.author=p_author
    order by e.cursor_ms, e.cursor_seq limit 1;
  if found then return prior_cursor; end if;
  perform prawnsplit.reserve_capacity(octet_length(p_blob) + octet_length(p_author), 1, case when is_new then 1 else 0 end);
  if is_new then
    insert into prawnsplit.relay_topics(tag, commitment) values (p_tag, p_commitment) returning * into topic;
  end if;
  next_ms := greatest(floor(extract(epoch from pg_catalog.clock_timestamp()) * 1000), topic.last_ms);
  next_seq := case when next_ms = topic.last_ms then topic.last_seq + 1 else 0 end;
  if next_seq > 18446744073709551615 then next_ms := next_ms + 1; next_seq := 0; end if;
  insert into prawnsplit.relay_entries(tag, cursor_ms, cursor_seq, blob, author)
    values (p_tag, next_ms, next_seq, p_blob, p_author);
  update prawnsplit.relay_topics set last_ms = next_ms, last_seq = next_seq where tag = p_tag;
  return next_ms::text || '-' || next_seq::text;
end;
$$;

create function public.prawnsplit_relay_read(p_tag text, p_cursor text default null,
  p_limit integer default 100, p_author text default null)
returns table(cursor text, blob text, author text)
language plpgsql stable security invoker set search_path = '' as $$
declare
  after_ms numeric(20,0) := 0;
  after_seq numeric(20,0) := 0;
  row_data prawnsplit.relay_entries%rowtype;
  bytes_sent bigint := 0;
  row_bytes bigint;
begin
  if p_tag is null or p_tag !~ '^[0-9a-f]{64}$' then raise exception 'invalid relay tag'; end if;
  if p_cursor is not null then
    if p_cursor !~ '^(0|[1-9][0-9]{0,19})-(0|[1-9][0-9]{0,19})$' then raise exception 'invalid relay cursor'; end if;
    after_ms := split_part(p_cursor, '-', 1)::numeric;
    after_seq := split_part(p_cursor, '-', 2)::numeric;
    if after_ms > 18446744073709551615 or after_seq > 18446744073709551615 then raise exception 'invalid relay cursor'; end if;
  end if;
  for row_data in
    select e.* from prawnsplit.relay_entries e where e.tag = p_tag
      and (p_cursor is null or (e.cursor_ms, e.cursor_seq) > (after_ms, after_seq))
    order by e.cursor_ms, e.cursor_seq limit least(500, greatest(1, coalesce(p_limit, 100)))
  loop
    cursor := row_data.cursor_ms::text || '-' || row_data.cursor_seq::text;
    blob := row_data.blob;
    author := row_data.author;
    row_bytes := octet_length(jsonb_build_object('cursor', cursor, 'blob', blob, 'author', author)::text) + 2;
    if bytes_sent + row_bytes > 2097152 then exit; end if;
    bytes_sent := bytes_sent + row_bytes;
    -- Legacy optional author filtering follows the bounded page, as in Redis.
    if p_author is null or author = p_author then return next; end if;
  end loop;
end;
$$;

create function public.prawnsplit_relay_import(p_tag text, p_commitment text, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  topic prawnsplit.relay_topics%rowtype;
  item jsonb;
  existing prawnsplit.relay_entries%rowtype;
  item_ms numeric(20,0);
  item_seq numeric(20,0);
  inserted integer := 0;
  allowed boolean;
begin
  if p_tag is null or p_tag !~ '^[0-9a-f]{64}$' or
     (p_commitment is not null and p_commitment !~ '^[0-9a-f]{64}$') or
     p_rows is null or jsonb_typeof(p_rows) <> 'array' or
     jsonb_array_length(p_rows) > 25 or octet_length(p_rows::text) > 2000000 then
    raise exception 'invalid relay import';
  end if;
  select imports_enabled into strict allowed from prawnsplit.relay_control where singleton for update;
  if not allowed then raise exception 'relay imports are paused'; end if;
  select * into topic from prawnsplit.relay_topics where tag = p_tag;
  if not found then
    perform prawnsplit.reserve_capacity(0, 0, 1);
    insert into prawnsplit.relay_topics(tag, commitment) values (p_tag, p_commitment) returning * into topic;
  elsif topic.commitment is distinct from p_commitment then
    raise exception 'relay commitment conflict';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) <> 'object' or (select count(*) from jsonb_object_keys(item)) <> 3 or
       jsonb_typeof(item->'cursor') <> 'string' or jsonb_typeof(item->'blob') <> 'string' or
       jsonb_typeof(item->'author') <> 'string' or
       coalesce(item->>'cursor', '') !~ '^(0|[1-9][0-9]{0,19})-(0|[1-9][0-9]{0,19})$' then
      raise exception 'invalid relay import row';
    end if;
    item_ms := split_part(item->>'cursor', '-', 1)::numeric;
    item_seq := split_part(item->>'cursor', '-', 2)::numeric;
    select * into existing from prawnsplit.relay_entries where tag = p_tag and cursor_ms = item_ms and cursor_seq = item_seq;
    if found then
      if existing.blob is distinct from item->>'blob' or existing.author is distinct from item->>'author' then
        raise exception 'relay cursor content conflict';
      end if;
    else
      perform prawnsplit.reserve_capacity(octet_length(item->>'blob') + octet_length(item->>'author'), 1, 0);
      insert into prawnsplit.relay_entries(tag, cursor_ms, cursor_seq, blob, author)
        values (p_tag, item_ms, item_seq, item->>'blob', item->>'author');
      inserted := inserted + 1;
    end if;
    update prawnsplit.relay_topics set last_ms = item_ms, last_seq = item_seq
      where tag = p_tag and (last_ms, last_seq) < (item_ms, item_seq);
  end loop;
  return inserted;
end;
$$;

create function public.prawnsplit_relay_topic_info(p_tag text)
returns table(commitment text, entry_count text, payload_bytes text)
language sql stable security invoker set search_path = '' as $$
  select t.commitment, count(e.tag)::text,
    coalesce(sum(octet_length(e.blob) + octet_length(e.author)), 0)::text
  from prawnsplit.relay_topics t left join prawnsplit.relay_entries e on e.tag = t.tag
  where t.tag = p_tag group by t.tag, t.commitment;
$$;

revoke all on function prawnsplit.reserve_capacity(bigint,bigint,bigint) from public, anon, authenticated;
revoke all on function public.prawnsplit_relay_append(text,text,text,text) from public, anon, authenticated;
revoke all on function public.prawnsplit_relay_read(text,text,integer,text) from public, anon, authenticated;
revoke all on function public.prawnsplit_relay_import(text,text,jsonb) from public, anon, authenticated;
revoke all on function public.prawnsplit_relay_topic_info(text) from public, anon, authenticated;
grant execute on function prawnsplit.reserve_capacity(bigint,bigint,bigint) to service_role;
grant execute on function public.prawnsplit_relay_append(text,text,text,text) to service_role;
grant execute on function public.prawnsplit_relay_read(text,text,integer,text) to service_role;
grant execute on function public.prawnsplit_relay_import(text,text,jsonb) to service_role;
grant execute on function public.prawnsplit_relay_topic_info(text) to service_role;

commit;
