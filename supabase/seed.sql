-- Seed de desenvolvimento — dados do bolão real de referência

INSERT INTO tenants (id, nome, slug, status, taxa_administrativa_pct, branding)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Bolão Principal',
  'bolao-principal',
  'ATIVO',
  15.00,
  '{"corPrimaria": "#1F4E79", "nomeCustomizado": "NossoBolão"}'
);

-- Bolão de referência (concursos 2994–2999)
INSERT INTO boloes (id, tenant_id, nome, status, valor_cota, data_inicio, data_termino)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Bolão Mega-Sena Abril 2026',
  'FINALIZADO',
  30.00,
  '2026-04-01',
  '2026-04-23'
);

-- Categorias (soma = 100%)
INSERT INTO categorias_premiacao
  (tenant_id, bolao_id, nome, tipo, acertos_alvo, sorteio_referencia, percentual, acumula_sem_ganhador, ordem)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Taxa Administrativa',    'TAXA_ADMINISTRATIVA',     NULL, NULL, 15, false, 1),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Premio Principal',       'ACERTOS_EXATOS',            10, NULL, 55, false, 2),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Mais Pontos 1o Sorteio', 'MAIOR_PONTUACAO_SORTEIO',  NULL,    1, 10, false, 3),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   '09 Pontos',              'ACERTOS_EXATOS',             9, NULL, 10, true,  4),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Menos Pontos',           'MENOR_PONTUACAO_GERAL',    NULL, NULL, 10, false, 5);

-- Sorteios de referência
INSERT INTO sorteios
  (tenant_id, bolao_id, numero_concurso, data_sorteio, bolas_sorteadas, sequencia_no_bolao, eh_primeiro, processado)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   2994, '2026-04-09', ARRAY[1,10,23,31,40,55], 1, true,  true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   2995, '2026-04-11', ARRAY[8,29,42,49,50,58], 2, false, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   2996, '2026-04-14', ARRAY[7,9,27,38,49,52],  3, false, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   2997, '2026-04-16', ARRAY[14,20,32,37,39,42],4, false, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   2998, '2026-04-18', ARRAY[15,18,28,31,52,58],5, false, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   2999, '2026-04-23', ARRAY[9,24,26,38,45,58], 6, false, true);

-- Ganhador principal (cota 213)
INSERT INTO cotas
  (tenant_id, bolao_id, nome_identificacao, numero_sequencial, palpites,
   status_pagamento, total_acertos_acumulados, status_resultado)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'ADERSON AMORIM RODOVIARIA',
  213,
  ARRAY[1,7,8,14,15,23,26,32,42,55],
  'PAGO',
  10,
  'PREMIADO'
);

-- Templates WhatsApp automáticos (dev) — variáveis {{nomeBolao}}, {{numeroConcurso}}, {{dataSorteio}}, {{bolas}}, {{totalCotas}}, {{arrecadacao}}, {{nomeGanhador}}, {{premio}}
INSERT INTO whatsapp_templates (id, tenant_id, nome, conteudo, tipo, ativo)
VALUES
  (
    '11111111-1111-4111-8111-111111110001',
    '00000000-0000-0000-0000-000000000001',
    'Resultado Mega-Sena',
    $msg1$🎯 *{{nomeBolao}}*

*Sorteio da Mega-Sena* — concurso *{{numeroConcurso}}*
📅 {{dataSorteio}}

*Números sorteados:*
{{bolas}}

👥 Cotas pagas: *{{totalCotas}}*
💰 Arrecadação bruta: *{{arrecadacao}}*

Boa sorte na próxima rodada!
— *{{nomeBolao}}*$msg1$,
    'RESULTADO_SORTEIO',
    true
  ),
  (
    '11111111-1111-4111-8111-111111110002',
    '00000000-0000-0000-0000-000000000001',
    'Ranking parcial',
    $msg2$📊 *Ranking parcial — {{nomeBolao}}*

Concurso *{{numeroConcurso}}* · {{dataSorteio}}
Bolas: {{bolas}}

Segue a *atualização do top acertos* após este sorteio (lista no sistema / planilha anexa, se houver).

🎫 Cotas no bolão: *{{totalCotas}}*
💰 Arrecadação: *{{arrecadacao}}*

Qualquer dúvida, fale com o administrador.$msg2$,
    'RANKING_PARCIAL',
    true
  ),
  (
    '11111111-1111-4111-8111-111111110003',
    '00000000-0000-0000-0000-000000000001',
    'Premiados · bolão encerrado',
    $msg3$🏆 *{{nomeBolao}}*
*BOLÃO ENCERRADO — premiados*

Parabéns aos contemplados!

🥇 *Destaque principal:* {{nomeGanhador}}
💵 *Prêmio (referência):* {{premio}}

💰 Arrecadação total: *{{arrecadacao}}*
🎫 Total de cotas: *{{totalCotas}}*

Obrigado a todos que participaram!$msg3$,
    'PREMIADOS',
    true
  ),
  (
    '11111111-1111-4111-8111-111111110004',
    '00000000-0000-0000-0000-000000000001',
    'Ganhadores · 1º sorteio',
    $msg4$🏅 *{{nomeBolao}}*

*Ganhadores · 1º sorteio*
Concurso *{{numeroConcurso}}* · {{dataSorteio}}

Bolas: {{bolas}}

🥇 *Destaque (categoria 1º sorteio):* {{nomeGanhador}}
💵 *Prêmio:* {{premio}}

🎫 Cotas no bolão: {{totalCotas}}

Confira o ranking completo e as demais categorias no painel do bolão.$msg4$,
    'RANKING_PARCIAL',
    true
  ),
  (
    '11111111-1111-4111-8111-111111110005',
    '00000000-0000-0000-0000-000000000001',
    'Comunicado · após apuração',
    $msg5$📣 *{{nomeBolao}}*

*Apuração registrada* — concurso {{numeroConcurso}} ({{dataSorteio}}).

Resultado das bolas:
{{bolas}}

Em breve divulgamos ranking e premiações. *{{totalCotas}}* cotas seguem no bolão.

💰 Arrecadação acumulada: *{{arrecadacao}}*

— Administração *{{nomeBolao}}*$msg5$,
    'AVISO_ADMIN',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- Calcula acertos para todos os sorteios seeded com processado=true
-- Necessário porque o CalcAcertosJob pula sorteios já marcados como processados
WITH missing AS (
  SELECT
    s.tenant_id,
    s.bolao_id,
    s.id AS sorteio_id,
    c.id AS cota_id,
    (SELECT COUNT(*)::int FROM unnest(c.palpites) p WHERE p = ANY(s.bolas_sorteadas)) AS acertos
  FROM sorteios s
  JOIN cotas c ON c.bolao_id = s.bolao_id
              AND c.tenant_id = s.tenant_id
              AND c.status_pagamento = 'PAGO'
  WHERE s.processado = TRUE
)
INSERT INTO acertos_sorteio (tenant_id, bolao_id, sorteio_id, cota_id, acertos)
SELECT tenant_id, bolao_id, sorteio_id, cota_id, acertos FROM missing
ON CONFLICT DO NOTHING;

UPDATE cotas
SET total_acertos_acumulados = (
  SELECT COALESCE(SUM(a.acertos), 0)
  FROM acertos_sorteio a
  WHERE a.cota_id = cotas.id
),
atualizado_em = NOW()
WHERE status_pagamento = 'PAGO';
