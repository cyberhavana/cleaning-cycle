create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 60)
);

create table public.rings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  cadence text not null,
  active_task_position smallint not null default 0,
  cycle_count bigint not null default 0,
  current_since timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rings_cadence_check
    check (cadence in ('daily', 'weekly', 'monthly')),
  constraint rings_active_task_position_check
    check (active_task_position between 0 and 11),
  constraint rings_cycle_count_check
    check (cycle_count >= 0),
  constraint rings_user_cadence_unique
    unique (user_id, cadence),
  constraint rings_id_user_id_unique
    unique (id, user_id)
);

create table public.tasks (
  id bigint generated always as identity primary key,
  ring_id bigint not null,
  user_id uuid not null,
  position smallint not null,
  name text not null,
  icon text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_ring_owner_fkey
    foreign key (ring_id, user_id)
    references public.rings (id, user_id)
    on delete cascade,
  constraint tasks_position_check
    check (position between 0 and 11),
  constraint tasks_name_length
    check (char_length(btrim(name)) between 1 and 80),
  constraint tasks_icon_length
    check (char_length(icon) between 1 and 32),
  constraint tasks_ring_position_unique
    unique (ring_id, position)
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_ring_id_user_id_idx on public.tasks (ring_id, user_id);

comment on column public.rings.active_task_position is
  'Zero-based active task position. Visual rotation is derived by the client and is intentionally not persisted.';

alter table public.profiles enable row level security;
alter table public.rings enable row level security;
alter table public.tasks enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.rings from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.rings to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;

grant usage, select on sequence public.rings_id_seq to authenticated;
grant usage, select on sequence public.tasks_id_seq to authenticated;
