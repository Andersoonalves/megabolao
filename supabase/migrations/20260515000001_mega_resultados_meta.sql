-- Adiciona colunas de metadados ao cache de resultados da Mega-Sena.
-- Necessário para servir o painel admin sem fazer chamadas à API da Caixa.
alter table mega_resultados
  add column if not exists ganhadores_sena          integer not null default 0,
  add column if not exists acumulado                boolean not null default false,
  add column if not exists valor_arrecadado         numeric(15,2),
  add column if not exists estimativa_proximo       numeric(15,2),
  add column if not exists data_proximo_concurso    varchar(20),
  add column if not exists numero_concurso_proximo  integer;
