-- Tabela global de resultados da Mega-Sena (compartilhada entre todos os tenants)
create table if not exists mega_resultados (
  id                 serial primary key,
  numero_concurso    integer  not null unique,
  data_sorteio       date     not null,
  bolas_sorteadas    integer[] not null,
  criado_em          timestamptz not null default now()
);

-- Configurações por tenant para notificação/auto-apply de sorteios
alter table tenants
  add column if not exists sorteio_auto_apply    boolean not null default false,
  add column if not exists sorteio_ultimo_ignorado integer;

-- RLS: mega_resultados é leitura pública para usuários autenticados (sem tenantId)
alter table mega_resultados enable row level security;

create policy "mega_resultados_select" on mega_resultados
  for select using (true);

create policy "mega_resultados_insert_service" on mega_resultados
  for insert with check (true);
