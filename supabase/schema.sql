-- Opcional: use no Supabase se preferir em vez da API local
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text,
  telefone text,
  estado text,
  cidade text,
  banco text,
  marca text,
  modelo text,
  ano text,
  parcelas_atrasadas text,
  parcelas_pagas text,
  deu_entrada text,
  valor_entrada text,
  tem_debito text,
  valor_debito text,
  quilometragem text,
  usa_aplicativo text,
  qualified boolean not null default false,
  quality text,
  score int
);

alter table public.leads enable row level security;

create policy "allow insert leads"
  on public.leads for insert
  to anon, authenticated
  with check (true);

create policy "allow read leads"
  on public.leads for select
  to anon, authenticated
  using (true);
