**DOCUMENTO DE REQUISITOS**

**Sistema Multitenant de Gestao de Bolaos**

*Nosso Bolao*

Versao 3.0 \| Abril 2026

| **Campo** | **Valor**                                                          |
|-----------|--------------------------------------------------------------------|
| Gestor    | AA                                                                 |
| Contato   | \(83\) 9 XXXX-XXXX \| WhatsApp                                     |
| CNPJ      |                                                                    |
| Planilha  |                                                                    |
| Stack     | Angular 21 + NestJS + Supabase (PostgreSQL) + whatsapp-web.js      |
| Historico | v1.0 Abr/2026 --- levantamento inicial (PDFs)                      |
|           | v2.0 Abr/2026 --- arquitetura, multitenant, WhatsApp               |
|           | v3.0 Abr/2026 --- Supabase, premiacoes livres, portal participante |

# 1. Visao Geral e Contexto {#visao-geral-e-contexto}

O Nosso Bolao e uma plataforma multitenant SaaS para gestao de bolaes coletivos vinculados aos sorteios da Mega-Sena. Cada empresa (tenant) gerencia seus proprios bolaes, participantes e premiacoes de forma completamente independente.

A versao 3.0 deste documento incorpora tres decisoes tecnicas e de negocio tomadas apos a v2.0:

- Banco de dados: Supabase (PostgreSQL gerenciado) com avaliacao futura de Auth, Storage e Realtime nativos

- Premiacoes totalmente livres: ao criar um bolao, o Admin define livremente quantas categorias de premio existem, quais quantidades de acertos contemplam e qual percentual cada uma recebe

- Portal do participante: acesso publico via numero de celular, sem login, exibindo todos os bolaes, palpites, ranking e historico de pagamento das cotas

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Principais capacidades da plataforma:</strong></p>
<p>Gestao de multiplos bolaes por diferentes empresas (tenants)</p>
<p>Premiacoes 100% configuradas por bolao: categorias, acertos e percentuais livres</p>
<p>Portal publico do participante: busca por celular, sem necessidade de login</p>
<p>Compra e validacao de cotas com confirmacao de pagamento</p>
<p>Cadastro de palpites (10 numeros de 01 a 60 por cota)</p>
<p>Apuracao automatica com base nos resultados da Mega-Sena</p>
<p>Comunicacao integrada com grupos de WhatsApp (whatsapp-web.js)</p>
<p>Painel administrativo com RBAC (Master / Admin / Participante)</p>
<p>Exportacao de relatorios em PDF e XLSX</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 2. Escopo do Sistema {#escopo-do-sistema}

- Gestao de tenants: criacao, configuracao e branding por empresa

- Controle de acesso por papel: Master, Admin, Participante

- Criacao de bolaes com categorias de premiacao totalmente livres por bolao

- Cadastro e gestao de participantes, cotas e palpites

- Registro de sorteios e calculo automatico de acertos em lote (job assincrono)

- Calculo, distribuicao e controle de pagamento de premios

- Portal publico do participante: busca por celular, sem login

- Integracao com WhatsApp via whatsapp-web.js: grupos, templates e notificacoes

- Geracao e exportacao de relatorios (ranking, ganhadores, planilha completa)

# 3. Arquitetura e Stack Tecnologica {#arquitetura-e-stack-tecnologica}

A plataforma segue arquitetura frontend/backend desacoplados com Supabase como infraestrutura principal --- utilizando todas as suas features: PostgreSQL, Auth, Realtime e Storage. O NestJS atua como camada de API e orquestracao de regras de negocio, consumindo o Supabase via SDK oficial. O isolamento multitenant e garantido via Row Level Security (RLS) no PostgreSQL em combinacao com o Supabase Auth.

## 3.1 Stack Definida {#stack-definida}

| **Camada**     | **Tecnologia**                                         | **Decisao / Observacao**                                                                                                                                                                                                                                                       |
|----------------|--------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Frontend       | Angular 21                                             | Standalone Components, Signals, RxJS, Tailwind CSS; consome Supabase JS SDK diretamente para Auth e Realtime                                                                                                                                                                   |
| Backend        | NestJS (Node.js + TypeScript)                          | Arquitetura modular por dominio; consome Supabase via SDK (@supabase/supabase-js); ORM Prisma para queries complexas                                                                                                                                                           |
| Banco de Dados | Supabase --- PostgreSQL                                | Banco relacional gerenciado; Row Level Security (RLS) como camada de isolamento multitenant no nivel do banco                                                                                                                                                                  |
| Autenticacao   | Supabase Auth                                          | DECISAO: usar Supabase Auth como provedor unico de autenticacao. Gerencia sessoes de Admin e Master. Portal do participante usa Magic Link ou OTP via WhatsApp/SMS integrado ao Supabase Auth                                                                                  |
| Tempo Real     | Supabase Realtime                                      | Ranking ao vivo no portal do participante; atualizacao automatica de status do bolao no painel Admin sem polling                                                                                                                                                               |
| Storage        | Supabase Storage                                       | Armazenamento de relatorios exportados (PDF/XLSX) e assets de branding dos tenants (logos)                                                                                                                                                                                     |
| Jobs / Filas   | BullMQ + Redis                                         | Processamento assincrono de acertos apos sorteio e envio de mensagens WhatsApp; Redis via Upstash Free na fase inicial (10.000 comandos/dia --- gratis); migrar para instancia dedicada quando limite for atingido (ver secao 30)                                              |
| WhatsApp       | whatsapp-web.js                                        | Solucao gratuita; sessao por tenant; limitacoes de escala documentadas abaixo                                                                                                                                                                                                  |
| Infraestrutura | Fly.io Free (backend) + Vercel Free (frontend) + CI/CD | FASE 0 --- Custo zero: Fly.io Free para NestJS e Worker BullMQ (nao hiberna, 3 GB volume persistente para sessoes WhatsApp); Vercel Free para Angular (deploy automatico via GitHub, CDN global, SSL incluso); GitHub Actions para CI/CD. Guia de deploy completo na secao 34. |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Decisao tomada — Supabase All-in:</strong></p>
<p>A plataforma utiliza o ecossistema Supabase de forma completa:</p>
<p>PostgreSQL: banco principal com RLS para isolamento multitenant</p>
<p>Supabase Auth: autenticacao de Master e Admin; OTP para portal do participante</p>
<p>Supabase Realtime: ranking ao vivo e atualizacoes de status sem polling</p>
<p>Supabase Storage: relatorios exportados e assets de branding por tenant</p>
<p>O NestJS complementa com regras de negocio, jobs BullMQ e integracao WhatsApp</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 3.2 Limitacoes do whatsapp-web.js (gratuito) {#limitacoes-do-whatsapp-web.js-gratuito}

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Limitacoes conhecidas do whatsapp-web.js que devem ser consideradas no desenvolvimento:</strong></p>
<p>Nao e uma API oficial — pode parar de funcionar apos atualizacoes do WhatsApp</p>
<p>Requer um numero de celular fisico conectado (nao pode usar numero virtual facilmente)</p>
<p>Sessao pode cair e precisar de reconexao manual; implementar reconexao automatica</p>
<p>Rate limiting informal: muitos envios em curto periodo podem resultar em banimento do numero</p>
<p>Nao suporta mensagens interativas (botoes, listas) — apenas texto e midia simples</p>
<p>Quando o volume crescer, migrar para WhatsApp Business API oficial (pago)</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 3.3 Modelo Multitenant com Supabase Auth + RLS {#modelo-multitenant-com-supabase-auth-rls}

A combinacao de Supabase Auth com Row Level Security (RLS) no PostgreSQL oferece isolamento multitenant em tres camadas distintas:

- Camada 1 --- Supabase Auth: cada usuario (Master/Admin) possui um JWT emitido pelo Supabase Auth contendo tenant_id nos metadados customizados (user_metadata). Esse token e validado automaticamente pelo Supabase em toda requisicao.

- Camada 2 --- RLS no PostgreSQL: politicas RLS em cada tabela filtram por tenant_id extraido do JWT do Supabase Auth via auth.jwt() -\> \'user_metadata\' -\> \'tenant_id\'. Nenhuma query retorna dados de outro tenant, mesmo em caso de bug no NestJS.

- Camada 3 --- NestJS Guard: middleware adicional valida o papel do usuario (MASTER \| ADMIN) e injeta tenant_id em todas as operacoes de escrita como segunda verificacao de seguranca.

- Portal do participante: acesso via Supabase Auth com Magic Link ou OTP enviado por WhatsApp/email para o celular cadastrado, sem necessidade de senha.

## 3.4 Papeis e Controle de Acesso (RBAC) {#papeis-e-controle-de-acesso-rbac}

| **Papel**             | **Escopo**         | **Autenticacao**                                     | **Principais Permissoes**                                                                                                      |
|-----------------------|--------------------|------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Master                | Plataforma inteira | Supabase Auth (email + senha)                        | Criar/editar/suspender tenants; acessar painel de qualquer tenant; configurar plataforma global                                |
| Admin                 | Tenant especifico  | Supabase Auth (email + senha)                        | Criar bolaes com premiacoes livres; confirmar pagamentos; registrar sorteios; gerenciar premios; WhatsApp; exportar relatorios |
| Participante (portal) | Proprio celular    | Supabase Auth OTP (Magic Link via WhatsApp ou email) | Busca por celular; visualiza proprios bolaes, palpites, ranking e historico de pagamento; somente leitura                      |

# 4. Sistema de Premiacoes Totalmente Livres {#sistema-de-premiacoes-totalmente-livres}

Esta e uma das principais mudancas da v3.0. Nao existem mais categorias fixas de premiacao. Ao criar cada bolao, o Admin define livremente quantas categorias existem, quais quantidades de acertos contemplam e qual percentual do valor bruto arrecadado cada categoria recebe.

## 4.1 Como Funciona {#como-funciona}

- Cada bolao possui uma lista de CategoriaPremiacao, criada pelo Admin no momento da criacao do bolao

- Cada categoria tem: um nome livre, a condicao de acertos que contempla, o percentual do bruto e se acumula caso nao haja ganhador

- A soma de todos os percentuais das categorias + taxa administrativa deve totalizar exatamente 100%

- O sistema valida e bloqueia a criacao do bolao se o total nao fechar 100%

- Apos a criacao do bolao, as categorias sao imutaveis (nao podem ser alteradas com o bolao em andamento)

## 4.2 Tipos de Condicao de Premio {#tipos-de-condicao-de-premio}

| **Tipo de Condicao**    | **Descricao**                                                              | **Exemplo de Uso**                  |
|-------------------------|----------------------------------------------------------------------------|-------------------------------------|
| ACERTOS_EXATOS          | Contempla quem acertou exatamente N numeros acumulados                     | 10 acertos = Premio Principal (55%) |
| MAIOR_PONTUACAO_SORTEIO | Contempla quem teve mais acertos em um sorteio especifico (ex: 1o sorteio) | Mais pontos no 1o sorteio (10%)     |
| MAIOR_PONTUACAO_GERAL   | Contempla quem tiver mais acertos acumulados ao encerrar                   | Maior pontuacao total (10%)         |
| MENOR_PONTUACAO_GERAL   | Contempla quem tiver menos acertos acumulados ao encerrar                  | Menor pontuacao total (10%)         |
| TAXA_ADMINISTRATIVA     | Percentual reservado para a organizacao; nao e premio                      | Taxa da casa (15%)                  |

## 4.3 Exemplo Pratico --- Configuracao do Bolao Atual {#exemplo-pratico-configuracao-do-bolao-atual}

A configuracao do bolao Nosso Bolao atual, representada no novo modelo livre, ficaria assim:

| **Nome da Categoria**     | **Tipo de Condicao**    | **Condicao**                | **Percentual** | **Acumula?**                       |
|---------------------------|-------------------------|-----------------------------|----------------|------------------------------------|
| Taxa Administrativa       | TAXA_ADMINISTRATIVA     | ---                         | 15%            | Nao                                |
| Premio Principal          | ACERTOS_EXATOS          | 10 acertos acumulados       | 55%            | Nao                                |
| Mais Pontos 1o Sorteio    | MAIOR_PONTUACAO_SORTEIO | 1o sorteio do bolao         | 10%            | Nao                                |
| 09 Pontos --- Mais Pontos | ACERTOS_EXATOS          | 09 acertos acumulados       | 10%            | SIM --- acumula para proximo bolao |
| Menos Pontos              | MENOR_PONTUACAO_GERAL   | Menor pontuacao ao encerrar | 10%            | Nao                                |

## 4.4 Exemplo de Configuracao Alternativa (Demonstra Liberdade) {#exemplo-de-configuracao-alternativa-demonstra-liberdade}

Um tenant diferente poderia criar um bolao com uma estrutura completamente diferente, como:

| **Nome da Categoria**   | **Tipo**                | **Condicao**          | **Percentual** | **Acumula?** |
|-------------------------|-------------------------|-----------------------|----------------|--------------|
| Organizacao             | TAXA_ADMINISTRATIVA     | ---                   | 20%            | Nao          |
| Jackpot                 | ACERTOS_EXATOS          | 10 acertos acumulados | 40%            | Nao          |
| Quase la                | ACERTOS_EXATOS          | 9 acertos acumulados  | 15%            | SIM          |
| Bom desempenho          | ACERTOS_EXATOS          | 8 acertos acumulados  | 10%            | Nao          |
| Sorte Grande 1o Sorteio | MAIOR_PONTUACAO_SORTEIO | 1o sorteio            | 10%            | Nao          |
| Zebra                   | MENOR_PONTUACAO_GERAL   | Menor pontuacao       | 5%             | Nao          |

# 5. Portal do Participante {#portal-do-participante}

O portal e uma tela publica e anonima --- nao requer cadastro de usuario nem senha. O participante acessa pelo numero de celular cadastrado pelo Admin no momento do registro da cota.

## 5.1 Fluxo de Acesso com Supabase Auth OTP {#fluxo-de-acesso-com-supabase-auth-otp}

| **Etapa**                     | **Acao**                                                                             | **Sistema**                                                                            |
|-------------------------------|--------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| 1                             | Participante acessa a URL publica do portal do tenant (ex: portal.nossobolao.com.br) | Sistema exibe tela de busca com campo de celular                                       |
| 2                             | Participante digita seu numero de celular (DDD + numero)                             | Sistema verifica se existe cota com aquele celular no tenant                           |
| 3a --- Celular nao encontrado | ---                                                                                  | Sistema exibe mensagem amigavel: \'Numero nao encontrado neste bolao\'                 |
| 3b --- Celular encontrado     | ---                                                                                  | Sistema aciona Supabase Auth OTP: envia Magic Link para email ou WhatsApp cadastrado   |
| 4                             | Participante clica no Magic Link recebido                                            | Supabase Auth valida o OTP e cria sessao autenticada temporaria                        |
| 5                             | Sessao ativa                                                                         | Sistema exibe lista de todos os bolaes com cotas vinculadas ao celular                 |
| 6                             | Participante seleciona um bolao                                                      | Sistema exibe detalhes: palpites, acertos, ranking, premiacao e historico de pagamento |

## 5.2 Dados Exibidos no Portal (por Bolao) {#dados-exibidos-no-portal-por-bolao}

**Sobre o Bolao**

- Nome do bolao e status (Em Andamento / Finalizado)

- Total de cotas ativas e valor bruto arrecadado

- Data de inicio e data de termino (se encerrado)

- Historico de sorteios realizados: numero do concurso, data e numeros sorteados

- Grid visual de 01 a 60 com numeros ja sorteados destacados

**Sobre as Cotas do Participante**

- Lista de todas as cotas com numero de identificacao e palpites registrados

- Total de acertos acumulados de cada cota

- Posicao no ranking geral do bolao

- Status de premiacao: Nao Premiado / Premio a Receber / Pago

- Valor do premio a receber (se contemplado)

- Historico de pagamento de cada cota: status (Pago / Pendente), data de confirmacao

**Ranking Geral (publico)**

- Ranking completo do bolao com todos os participantes ordenados por acertos

- Destaque visual para as posicoes premiadas

- Distribuicao de participantes por faixa de pontuacao

## 5.3 Regras e Restricoes do Portal {#regras-e-restricoes-do-portal}

- Acesso autenticado via Supabase Auth OTP --- apenas o dono do celular/email recebe e pode usar o Magic Link

- As politicas RLS garantem que a sessao OTP acesse exclusivamente dados do celular autenticado

- O numero de celular e informado pelo Admin no cadastro da cota; o participante nao se auto-cadastra

- Um mesmo numero de celular pode ter cotas em multiplos bolaes do mesmo tenant

- O portal exibe apenas dados do tenant cuja URL foi acessada (isolamento multitenant por RLS)

- Portal e somente leitura: nenhuma operacao de escrita e permitida por sessao OTP

- Supabase Realtime atualiza ranking e status do bolao automaticamente sem necessidade de recarregar a pagina

# 6. Fluxo Completo do Sistema {#fluxo-completo-do-sistema}

| **Etapa** | **Acao**                                                                                 | **Responsavel**       | **Status Resultante**            |
|-----------|------------------------------------------------------------------------------------------|-----------------------|----------------------------------|
| 1         | Criar tenant e configurar percentuais padrao                                             | Master                | Tenant ATIVO                     |
| 2         | Criar bolao: definir nome, datas e categorias de premiacao livres (validar soma = 100%)  | Admin                 | Bolao A_SER_INICIADO             |
| 3         | Vender cotas: cadastrar participante com celular, palpites e confirmar pagamento         | Admin                 | Cotas ATIVAS                     |
| 4         | Registrar sorteio da Mega-Sena (numero do concurso + 6 numeros)                          | Admin (manual) ou Job | Sorteio registrado               |
| 5         | Calcular acertos de todas as cotas ativas em lote (job BullMQ assincrono)                | Sistema               | Acertos atualizados              |
| 6         | Verificar condicoes de encerramento: alguma cota atingiu os acertos do premio principal? | Sistema               | Bolao FINALIZADO ou EM_ANDAMENTO |
| 7         | Publicar ranking e notificar via WhatsApp                                                | Sistema (automatico)  | Mensagens enviadas               |
| 8         | Calcular premios por categoria e gerar relatorio de ganhadores                           | Sistema               | Premios A_PAGAR                  |
| 9         | Admin registra pagamentos; participante consulta pelo portal                             | Admin + Participante  | Premios PAGOS                    |

# 7. Entidades e Modelo de Dados (PostgreSQL / Supabase) {#entidades-e-modelo-de-dados-postgresql-supabase}

Todas as tabelas possuem tenant_id como chave de isolamento. As relacoes seguem o modelo relacional do PostgreSQL com chaves estrangeiras e indices.

## 7.1 Tenant {#tenant}

| **Coluna**              | **Tipo**      | **Descricao**                                                      |
|-------------------------|---------------|--------------------------------------------------------------------|
| id                      | UUID PK       | Identificador unico do tenant                                      |
| nome                    | TEXT NOT NULL | Nome da empresa/organizacao                                        |
| slug                    | TEXT UNIQUE   | Identificador URL-friendly (ex: nosso-bolao-cg)                    |
| status                  | ENUM          | ATIVO \| INATIVO \| SUSPENSO                                       |
| taxa_administrativa_pct | DECIMAL(5,2)  | Percentual padrao da taxa administrativa (sugerido ao criar bolao) |
| whatsapp_sessao_id      | TEXT          | ID da sessao whatsapp-web.js deste tenant                          |
| branding                | JSONB         | Logo, cores, nome customizado para o frontend                      |
| criado_em               | TIMESTAMPTZ   | Data de criacao                                                    |

## 7.2 Bolao {#bolao}

| **Coluna**             | **Tipo**      | **Descricao**                                          |
|------------------------|---------------|--------------------------------------------------------|
| id                     | UUID PK       | Identificador unico                                    |
| tenant_id              | UUID FK       | Referencia ao tenant (obrigatorio em todas as tabelas) |
| nome                   | TEXT NOT NULL | Nome do bolao                                          |
| status                 | ENUM          | A_SER_INICIADO \| EM_ANDAMENTO \| FINALIZADO           |
| valor_cota             | DECIMAL(10,2) | Valor unitario da cota                                 |
| total_cotas_ativas     | INTEGER       | Calculado: cotas com status PAGO                       |
| valor_bruto_arrecadado | DECIMAL(12,2) | Calculado: total_cotas_ativas x valor_cota             |
| data_inicio            | DATE          | Data do primeiro sorteio                               |
| data_termino           | DATE          | Data do sorteio que encerrou o bolao                   |
| criado_em              | TIMESTAMPTZ   | Data de criacao do bolao                               |

## 7.3 CategoriaPremiacao {#categoriapremiacao}

Entidade central da v3.0. Cada bolao possui N categorias definidas pelo Admin na criacao. Substituem as categorias fixas das versoes anteriores.

| **Coluna**               | **Tipo**                | **Descricao**                                                                                                      |
|--------------------------|-------------------------|--------------------------------------------------------------------------------------------------------------------|
| id                       | UUID PK                 | Identificador unico                                                                                                |
| tenant_id                | UUID FK                 | Isolamento multitenant                                                                                             |
| bolao_id                 | UUID FK                 | Bolao ao qual esta categoria pertence                                                                              |
| nome                     | TEXT NOT NULL           | Nome livre da categoria (ex: \'Premio Principal\', \'Jackpot\', \'Zebra\')                                         |
| tipo                     | ENUM                    | TAXA_ADMINISTRATIVA \| ACERTOS_EXATOS \| MAIOR_PONTUACAO_SORTEIO \| MAIOR_PONTUACAO_GERAL \| MENOR_PONTUACAO_GERAL |
| acertos_alvo             | INTEGER NULL            | Para ACERTOS_EXATOS: quantidade de acertos que contempla. NULL para outros tipos                                   |
| sorteio_referencia       | INTEGER NULL            | Para MAIOR_PONTUACAO_SORTEIO: numero de sequencia do sorteio (1 = 1o sorteio). NULL para outros                    |
| percentual               | DECIMAL(5,2) NOT NULL   | Percentual do valor bruto arrecadado destinado a esta categoria                                                    |
| acumula_sem_ganhador     | BOOLEAN DEFAULT false   | Se true, o valor acumula para o proximo bolao quando nao ha ganhadores                                             |
| valor_acumulado_anterior | DECIMAL(12,2) DEFAULT 0 | Valor acumulado de bolaes anteriores a ser somado a esta categoria                                                 |
| ordem                    | INTEGER                 | Ordem de exibicao no painel e relatorios                                                                           |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Regra critica de validacao:</strong></p>
<p>A soma de todos os percentuais das CategoriaPremiacao de um bolao deve ser exatamente 100,00%.</p>
<p>O sistema deve validar no backend (NestJS) E no frontend (Angular) antes de salvar.</p>
<p>A criacao do bolao deve ser bloqueada se a soma nao fechar 100%.</p>
<p>Apos a criacao do bolao (status != A_SER_INICIADO), as categorias sao imutaveis.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 7.4 Usuario (gerenciado pelo Supabase Auth) {#usuario-gerenciado-pelo-supabase-auth}

Os usuarios Master e Admin sao gerenciados nativamente pelo Supabase Auth. A tabela publica \'perfis\' complementa com dados de negocio nao gerenciados pelo Auth.

| **Coluna / Campo**           | **Origem**    | **Descricao**                                                                              |
|------------------------------|---------------|--------------------------------------------------------------------------------------------|
| id (auth.users.id)           | Supabase Auth | UUID do usuario; chave primaria gerenciada pelo Supabase                                   |
| email (auth.users.email)     | Supabase Auth | E-mail de login; gerenciado pelo Supabase Auth                                             |
| created_at (auth.users)      | Supabase Auth | Data de criacao da conta                                                                   |
| tenant_id (perfis.tenant_id) | Tabela perfis | UUID do tenant; armazenado em user_metadata e espelhado na tabela perfis; NULL para Master |
| papel (perfis.papel)         | Tabela perfis | ENUM: MASTER \| ADMIN; armazenado em user_metadata para uso nas politicas RLS              |
| nome (perfis.nome)           | Tabela perfis | Nome completo do usuario                                                                   |
| ativo (perfis.ativo)         | Tabela perfis | Se o usuario esta habilitado; Admin pode desativar sem excluir do Supabase Auth            |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Como o tenant_id flui pelo Supabase Auth:</strong></p>
<p>1. Ao criar um Admin, o Master define tenant_id e papel nos user_metadata do Supabase Auth</p>
<p>2. O Supabase Auth emite JWT com esses metadados embutidos automaticamente</p>
<p>3. Politicas RLS acessam auth.jwt() -&gt; user_metadata -&gt; tenant_id para filtrar dados por tenant</p>
<p>4. NestJS extrai tenant_id do JWT Supabase via middleware — sem necessidade de JWT proprio</p>
<p>5. Portal do participante: Supabase Auth OTP envia Magic Link via email ou WhatsApp para acesso temporario e seguro</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 7.5 Cota (Participante) {#cota-participante}

| **Coluna**                                                                                                                                                                                              |     | **Tipo**             | **Descricao**                                                             |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|----------------------|---------------------------------------------------------------------------|
| id                                                                                                                                                                                                      |     | UUID PK              | Identificador unico da cota                                               |
| tenant_id                                                                                                                                                                                               |     | UUID FK              | Isolamento multitenant                                                    |
| bolao_id                                                                                                                                                                                                |     | UUID FK              | Bolao ao qual pertence                                                    |
| nome_identificacao                                                                                                                                                                                      |     | TEXT NOT NULL        | Nome ou apelido do participante                                           |
| numero_celular                                                                                                                                                                                          |     | TEXT NOT NULL        | Celular com DDD --- chave de acesso ao portal do participante             |
| numero_sequencial                                                                                                                                                                                       |     | INTEGER NOT NULL     | Numero de identificacao no bolao (ex: 213, 4164)                          |
| palpites                                                                                                                                                                                                |     | INTEGER\[\] NOT NULL | Array com exatamente 10 inteiros distintos de 01 a 60, em ordem crescente |
| status_pagamento                                                                                                                                                                                        |     | ENUM                 | PENDENTE \| PAGO \| INATIVO                                               |
| data_confirmacao_pagamento                                                                                                                                                                              |     | TIMESTAMPTZ NULL     | Quando o Admin confirmou o pagamento                                      |
| total_acertos_acumulados                                                                                                                                                                                |     | INTEGER DEFAULT 0    | Soma de acertos em todos os sorteios realizados                           |
| status_resultado                                                                                                                                                                                        |     | ENUM                 | EM_ANDAMENTO \| PREMIADO \| NAO_PREMIADO                                  |
| criado_em                                                                                                                                                                                               |     | TIMESTAMPTZ          | Data de cadastro da cota                                                  |
| **numero_celular e a chave de acesso ao portal publico do participante. O Admin deve sempre informar o celular ao cadastrar a cota. Validar formato (DDD + numero, apenas digitos, 10 ou 11 digitos).** |     |                      |                                                                           |

## 7.6 Sorteio {#sorteio}

| **Coluna**         | **Tipo**              | **Descricao**                                        |
|--------------------|-----------------------|------------------------------------------------------|
| id                 | UUID PK               | Identificador unico                                  |
| tenant_id          | UUID FK               | Isolamento                                           |
| bolao_id           | UUID FK               | Bolao ao qual pertence                               |
| numero_concurso    | INTEGER NOT NULL      | Numero do concurso da Mega-Sena (ex: 2994)           |
| data_sorteio       | DATE NOT NULL         | Data oficial do sorteio                              |
| bolas_sorteadas    | INTEGER\[\] NOT NULL  | Array com exatamente 6 inteiros distintos de 01 a 60 |
| sequencia_no_bolao | INTEGER NOT NULL      | Posicao: 1, 2, 3 \...                                |
| processado         | BOOLEAN DEFAULT false | True apos o job de calculo de acertos concluir       |
| criado_em          | TIMESTAMPTZ           | Data de registro                                     |

## 7.7 AcertoPorSorteio {#acertoporsorteio}

Registro granular de acertos por cota por sorteio. Permite auditoria, calculo incremental e exibicao no portal do participante.

| **Coluna**            | **Tipo** | **Descricao**                                |
|-----------------------|----------|----------------------------------------------|
| cota_id               | UUID FK  | Cota avaliada                                |
| sorteio_id            | UUID FK  | Sorteio referenciado                         |
| tenant_id             | UUID FK  | Isolamento                                   |
| acertos_neste_sorteio | INTEGER  | Acertos obtidos exclusivamente neste sorteio |
| acertos_acumulados    | INTEGER  | Total de acertos da cota ate este sorteio    |

## 7.8 Premio {#premio}

| **Coluna**             | **Tipo**         | **Descricao**                                                       |
|------------------------|------------------|---------------------------------------------------------------------|
| id                     | UUID PK          | Identificador unico                                                 |
| tenant_id              | UUID FK          | Isolamento                                                          |
| bolao_id               | UUID FK          | Bolao ao qual pertence                                              |
| cota_id                | UUID FK          | Cota ganhadora                                                      |
| categoria_premiacao_id | UUID FK          | Categoria que gerou este premio (FK para CategoriaPremiacao)        |
| valor_total_categoria  | DECIMAL(12,2)    | Valor total disponivel nesta categoria (% do bruto + acumulado)     |
| valor_por_ganhador     | DECIMAL(12,2)    | Valor dividido igualmente entre todos os ganhadores desta categoria |
| status_pagamento       | ENUM             | A_PAGAR \| PAGO                                                     |
| data_pagamento         | TIMESTAMPTZ NULL | Data em que o pagamento foi confirmado pelo Admin                   |

## 7.9 GrupoWhatsApp e MensagemWhatsApp {#grupowhatsapp-e-mensagemwhatsapp}

| **Coluna**                 | **Tipo**    | **Descricao**                                                              |
|----------------------------|-------------|----------------------------------------------------------------------------|
| \[grupo\] id               | UUID PK     | Identificador unico do grupo                                               |
| \[grupo\] tenant_id        | UUID FK     | Tenant                                                                     |
| \[grupo\] bolao_id         | UUID FK     | Bolao associado                                                            |
| \[grupo\] nome_grupo       | TEXT        | Nome do grupo no WhatsApp                                                  |
| \[grupo\] grupo_id_externo | TEXT        | ID do grupo na API whatsapp-web.js                                         |
| \[grupo\] ativo            | BOOLEAN     | Se esta recebendo notificacoes                                             |
| \[msg\] id                 | UUID PK     | Identificador da mensagem                                                  |
| \[msg\] grupo_id           | UUID FK     | Grupo de destino                                                           |
| \[msg\] tipo               | ENUM        | RESULTADO_SORTEIO \| RANKING_PARCIAL \| PREMIADOS \| AVISO_ADMIN \| MANUAL |
| \[msg\] conteudo           | TEXT        | Texto enviado                                                              |
| \[msg\] status_envio       | ENUM        | PENDENTE \| ENVIADO \| FALHA                                               |
| \[msg\] enviado_em         | TIMESTAMPTZ | Timestamp do envio efetivo                                                 |
| \[msg\] erro_detalhe       | TEXT NULL   | Descricao do erro se status = FALHA                                        |

# 8. Requisitos Funcionais {#requisitos-funcionais}

## RF-01: Gestao de Tenants (Master)

1.  O Master deve poder criar novos tenants informando nome, slug, taxa administrativa padrao e branding.

2.  O Master deve poder editar, ativar, inativar ou suspender qualquer tenant.

3.  O dashboard Master deve exibir lista de todos os tenants com status e metricas agregadas.

4.  O Master deve poder acessar o painel de qualquer tenant sem relogin.

## RF-02: Autenticacao com Supabase Auth

1.  A autenticacao de Master e Admin e feita integralmente via Supabase Auth (email + senha). Nao ha JWT proprio --- o token Supabase e usado diretamente em todas as requisicoes.

2.  O tenant_id e o papel do usuario devem ser armazenados nos user_metadata do Supabase Auth e espelhados na tabela publica \'perfis\' para uso nas politicas RLS.

3.  O portal do participante utiliza Supabase Auth OTP: o sistema envia um Magic Link para o celular cadastrado (via WhatsApp ou email). Apos validacao, o participante recebe uma sessao temporaria com acesso somente leitura aos proprios dados.

4.  As politicas de Row Level Security (RLS) devem ser configuradas em todas as tabelas usando auth.jwt() -\> user_metadata -\> tenant_id para isolamento automatico por tenant no nivel do banco.

5.  Guards no NestJS validam o papel (MASTER \| ADMIN) extraido do JWT Supabase antes de executar qualquer operacao de escrita.

6.  O Supabase Storage deve ter politicas de acesso configuradas por tenant: cada tenant so acessa seus proprios arquivos (relatorios e assets de branding).

7.  Log de auditoria para todas as acoes administrativas criticas com usuario autenticado, timestamp e tenant_id.

## RF-03: Criacao de Bolao com Premiacoes Livres

1.  O Admin deve poder criar um bolao informando: nome, data de inicio prevista e valor da cota.

2.  Na mesma tela de criacao, o Admin define N categorias de premiacao com: nome, tipo, condicao (acertos ou sorteio de referencia), percentual e se acumula.

3.  O sistema deve calcular e exibir em tempo real a soma dos percentuais conforme o Admin preenche as categorias.

4.  O sistema deve bloquear a criacao do bolao se a soma dos percentuais nao totalizar exatamente 100%.

5.  Apos a criacao, as categorias de premiacao sao imutaveis. Apenas o Admin Master pode alterar em casos excepcionais.

6.  O sistema deve exibir um resumo da configuracao de premiacoes antes de confirmar a criacao.

## RF-04: Gestao de Cotas e Participantes

1.  O Admin deve poder cadastrar participantes com: nome/identificacao, numero de celular (DDD + numero) e palpites (10 numeros).

2.  O sistema deve validar os palpites: exatamente 10 numeros distintos entre 01 e 60, em ordem crescente.

3.  O Admin deve poder confirmar o pagamento de uma cota, alterando seu status para PAGO e registrando a data.

4.  Somente cotas com status PAGO participam dos calculos de acertos e premios.

5.  O sistema deve exibir o total de cotas ativas e o valor bruto arrecadado em tempo real.

6.  Um participante pode ter multiplas cotas no mesmo bolao; cada cota tem numero sequencial unico.

## RF-05: Gestao de Sorteios

1.  O Admin deve poder registrar sorteios informando: numero do concurso, data e os 6 numeros sorteados.

2.  Apos o registro, o sistema dispara job BullMQ assincrono para calcular acertos de todas as cotas ativas em lote.

3.  O primeiro sorteio e identificado automaticamente para fins de categorias do tipo MAIOR_PONTUACAO_SORTEIO.

4.  O sistema deve exibir historico de todos os sorteios e um grid visual de 01 a 60 com numeros sorteados destacados.

## RF-06: Calculo de Acertos e Ranking

1.  O job de calculo deve processar a intersecao entre palpites e bolas sorteadas para cada cota ativa.

2.  Total de acertos = soma acumulada de acertos em todos os sorteios realizados.

3.  Apos o calculo, o sistema verifica as condicoes de todas as CategoriaPremiacao do bolao.

4.  Se a condicao de alguma categoria principal (ex: ACERTOS_EXATOS com o alvo maximo) for atingida, o bolao e finalizado automaticamente.

5.  O ranking deve ser atualizado apos cada sorteio e exibido publicamente no portal do participante.

## RF-07: Calculo e Gestao de Premios

1.  Ao encerrar o bolao, o sistema calcula o valor de cada categoria: percentual x valor_bruto_arrecadado + valor_acumulado_anterior.

2.  O sistema identifica os ganhadores de cada categoria conforme o tipo e condicao definidos.

3.  Quando ha mais de um ganhador na mesma categoria, o valor e dividido igualmente.

4.  Categorias com acumula_sem_ganhador = true e sem ganhadores transferem o valor para o proximo bolao.

5.  O Admin deve poder registrar o pagamento de cada premio individualmente, com data de pagamento.

6.  O sistema deve garantir que cotas PENDENTE ou INATIVO nao recebam premios, mesmo que os palpites acertem.

## RF-08: Portal do Participante com Supabase Auth OTP

1.  O portal e acessivel via URL publica do tenant. O participante informa seu numero de celular e o sistema verifica se existe cota cadastrada com aquele numero no tenant.

2.  Se o celular existir, o sistema aciona o Supabase Auth OTP: envia um Magic Link para o email ou WhatsApp cadastrado. O participante clica no link e recebe uma sessao autenticada temporaria.

3.  Com a sessao OTP ativa, o portal exibe todos os bolaes, palpites, acertos, ranking, status de premiacao e historico de pagamento das cotas vinculadas ao celular.

4.  O Supabase Realtime deve ser usado para atualizar o ranking e o status do bolao automaticamente, sem necessidade de recarregar a pagina.

5.  As politicas RLS do portal garantem que a sessao OTP acesse apenas os dados do celular autenticado --- nenhum dado de outros participantes e exposto, mesmo com sessao ativa.

6.  O portal e somente leitura --- nenhuma operacao de escrita e permitida por sessao OTP.

7.  O portal deve ser responsivo e otimizado para dispositivos moveis.

## RF-09: Integracao com WhatsApp (whatsapp-web.js) {#rf-09-integracao-com-whatsapp-whatsapp-web.js}

1.  Cada tenant configura sua propria sessao whatsapp-web.js com numero fisico dedicado.

2.  O sistema deve detectar queda de sessao e tentar reconexao automatica; alertar o Admin em caso de falha persistente.

3.  O Admin deve poder cadastrar grupos de WhatsApp e associa-los ao bolao ativo.

4.  Envio automatico apos cada sorteio: resultado com numeros sorteados e ranking parcial.

5.  Envio automatico ao encerrar bolao: lista completa de premiados por categoria.

6.  O Admin deve poder enviar mensagens manuais para grupos selecionados.

7.  Todas as mensagens passam por fila BullMQ com retry automatico (ate 3 tentativas) antes de marcar como FALHA.

8.  O sistema deve aplicar rate limiting no envio para evitar banimento do numero.

9.  Historico completo de mensagens enviadas com status e timestamp.

## RF-10: Relatorios, Exportacao e Supabase Storage

1.  Planilha completa de participantes: nome, palpites, acertos por sorteio, acertos acumulados, resultado e premiacao.

2.  Relatorio de ganhadores: por categoria, valor por ganhador, status de pagamento.

3.  Relatorio de sorteios: historico completo com datas, concursos e bolas sorteadas.

4.  Todos os relatorios gerados devem ser armazenados no Supabase Storage em bucket privado por tenant. O Admin recebe um link de download temporario (signed URL) valido por 1 hora.

5.  Politicas de acesso no Supabase Storage: cada tenant so acessa arquivos do proprio bucket, isolado por tenant_id.

6.  Assets de branding (logos dos tenants) sao armazenados em bucket publico do Supabase Storage, com path isolado por tenant_id.

7.  Importacao de dados legados via CSV/XLSX para migracao de bolaes historicos.

## RF-11: Painel Administrativo por Papel

**Master**

- Dashboard com todos os tenants: status, arrecadacao, bolaes ativos

- CRUD de tenants; acesso ao painel de qualquer tenant

**Admin**

- Dashboard: arrecadacao, status do bolao, contemplados, premios pendentes

- Criar bolao com categorias de premiacao livres (validacao de soma 100%)

- Gestao de cotas e participantes (cadastro, confirmacao de pagamento)

- Registro de sorteios e acompanhamento de jobs de calculo

- Gestao de premios: visualizar ganhadores, registrar pagamentos

- WhatsApp: sessao, grupos, mensagens manuais e historico

- Exportacao de relatorios

**Participante (portal publico)**

- Busca por celular sem login

- Visualizacao de bolaes, palpites, acertos, ranking e premiacao

- Historico de pagamento das cotas

# 9. Telas do Frontend (Angular 21) {#telas-do-frontend-angular-21}

| **Tela**                           | **Papel**      | **Descricao**                                                                                                       |
|------------------------------------|----------------|---------------------------------------------------------------------------------------------------------------------|
| Login / Autenticacao               | Master / Admin | Login com JWT; deteccao automatica de tenant pelo slug da URL                                                       |
| Dashboard Master                   | Master         | Lista de tenants, status, metricas; criar/editar tenant                                                             |
| Dashboard Admin                    | Admin          | Resumo do bolao ativo: arrecadacao, status, premios pendentes, proximo sorteio                                      |
| Criar Bolao                        | Admin          | Formulario com nome, valor da cota e editor de categorias de premiacao (com soma em tempo real e validacao de 100%) |
| Gestao de Cotas                    | Admin          | Listagem, busca, cadastro de participante+celular+palpites; confirmar pagamento; editar                             |
| Registrar Sorteio                  | Admin          | Formulario: concurso, data, 6 numeros; exibe grid de bolas sorteadas acumuladas                                     |
| Ranking / Resultados               | Admin / Portal | Tabela de acertos por participante; distribuicao por faixa; grid visual de bolas                                    |
| Relatorio de Ganhadores            | Admin          | Premiados por categoria; valor; status de pagamento; botao exportar                                                 |
| Gestao de Premios                  | Admin          | Registrar pagamentos; ver pendencias; historico de pagos                                                            |
| WhatsApp                           | Admin          | Sessao, grupos, enviar mensagem manual, templates, historico                                                        |
| Portal do Participante --- Busca   | Publico        | Campo de celular; sem login; responsivo para mobile                                                                 |
| Portal do Participante --- Detalhe | Publico        | Cards de bolaes; palpites; acertos; ranking; premiacao; historico de pagamento                                      |
| Minha Conta                        | Master / Admin | Edicao de dados pessoais e senha                                                                                    |

# 10. Requisitos Nao Funcionais {#requisitos-nao-funcionais}

## RNF-01: Desempenho

- Calculo de acertos para 9.244 cotas em menos de 10 segundos via job BullMQ assincrono

- Telas de consulta e relatorios carregando em menos de 3 segundos

- Portal do participante: busca por celular retornando em menos de 2 segundos

- Envio de mensagens WhatsApp totalmente assincrono --- nao bloqueia o fluxo principal

## RNF-02: Confiabilidade e Integridade

- Calculos financeiros com precisao DECIMAL(12,2) --- sem arredondamento indevido

- Validacao de palpites: exatamente 10 numeros distintos, de 01 a 60, em ordem crescente --- no backend E no frontend

- Validacao de premiacoes: soma dos percentuais = 100,00% --- no backend E no frontend, com feedback em tempo real

- Jobs de calculo de acertos idempotentes: reprocessar o mesmo sorteio nao altera o resultado

- Categorias de premiacao imutaveis apos inicio do bolao

## RNF-03: Seguranca

- Autenticacao de Master e Admin via Supabase Auth (email + senha); sem JWT proprio no NestJS

- tenant_id e papel armazenados em user_metadata do Supabase Auth e usados diretamente nas politicas RLS

- Row Level Security (RLS) em todas as tabelas usando auth.jwt() --- isolamento garantido no nivel do banco

- Portal do participante protegido por Supabase Auth OTP: Magic Link com validade limitada e uso unico

- Supabase Storage com politicas de acesso por tenant: buckets privados (relatorios) e publicos (branding) isolados por tenant_id

- Rate limiting na rota de busca por celular do portal para evitar enumeracao de dados

- LGPD: coleta minima de dados, prazo de retencao definido, direito de exclusao do celular e dados pessoais

- Log de auditoria imutavel para acoes criticas com usuario autenticado Supabase

- Sessoes whatsapp-web.js criptografadas e isoladas por tenant

## RNF-04: Usabilidade

- Frontend responsivo --- gestao feita majoritariamente via celular

- Portal do participante otimizado para mobile (layout em coluna unica, fontes grandes, touch-friendly)

- Validacao de soma de percentuais em tempo real na tela de criacao do bolao

- Confirmacao explicita para acoes irreversiveis: registrar sorteio, encerrar bolao, confirmar pagamento

## RNF-05: Disponibilidade e Escalabilidade

- 99% de disponibilidade --- especialmente nos dias de sorteio da Mega-Sena

- Docker para containerizacao; CI/CD via GitHub Actions

- Jobs BullMQ com retry, dead-letter queue e alertas de falha persistente

- Plano de migracao para WhatsApp Business API oficial quando o volume exigir

# 11. Regras de Negocio Criticas {#regras-de-negocio-criticas}

| **ID** | **Categoria**       | **Regra**                                                                                                                                                                                                                                                     |
|--------|---------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| RN-01  | Cota                | So participam do bolao cotas com status_pagamento = PAGO. Cota pendente ou inativa nao conta em acertos nem em premios, mesmo que os palpites acertem.                                                                                                        |
| RN-02  | Palpite             | Cada cota deve ter exatamente 10 numeros distintos entre 01 e 60 em ordem crescente. Qualquer desvio deve ser rejeitado com mensagem clara.                                                                                                                   |
| RN-03  | Premiacao livre     | A soma dos percentuais de todas as CategoriaPremiacao de um bolao deve ser exatamente 100,00%. A criacao do bolao e bloqueada se a validacao falhar.                                                                                                          |
| RN-04  | Imutabilidade       | Apos a criacao do bolao (status != A_SER_INICIADO), as categorias de premiacao sao imutaveis. Apenas o Master pode alterar em casos excepcionais.                                                                                                             |
| RN-05  | Calculo de premio   | Valor de cada categoria = (percentual / 100) x valor_bruto_arrecadado + valor_acumulado_anterior.                                                                                                                                                             |
| RN-06  | Divisao de premio   | Quando ha mais de um ganhador na mesma categoria, o valor total e dividido igualmente entre eles.                                                                                                                                                             |
| RN-07  | Acumulo             | Categorias com acumula_sem_ganhador = true transferem o valor para o bolao seguinte via campo valor_acumulado_anterior da nova CategoriaPremiacao equivalente.                                                                                                |
| RN-08  | Encerramento        | O bolao so encerra automaticamente quando ao menos uma cota satisfaz a condicao da categoria de maior hierarquia (normalmente ACERTOS_EXATOS com alvo maximo). Pode ser encerrado manualmente pelo Admin em casos excepcionais.                               |
| RN-09  | Portal participante | O acesso ao portal do participante e autenticado via Supabase Auth OTP (Magic Link). O sistema so envia o OTP se o celular informado estiver cadastrado em uma cota do tenant. Apos autenticacao, a sessao acessa apenas os dados do proprio celular via RLS. |
| RN-10  | Multitenancy RLS    | Todas as tabelas possuem politicas RLS baseadas em auth.jwt() -\> user_metadata -\> tenant_id. O isolamento ocorre no nivel do banco --- nenhuma query retorna dados de outro tenant, independente da camada de aplicacao.                                    |
| RN-11  | Celular obrigatorio | O Admin deve informar o celular do participante ao cadastrar a cota. Campo obrigatorio para garantir acesso ao portal.                                                                                                                                        |
| RN-12  | WhatsApp            | Mensagens com status FALHA apos 3 tentativas sao movidas para dead-letter queue e geram alerta para o Admin. O Admin pode reenviar manualmente.                                                                                                               |

# 12. Principais Casos de Uso {#principais-casos-de-uso}

## UC-01: Criar Bolao com Premiacoes Livres

**Ator:** Admin

**Pre-condicao:** Tenant ATIVO, Admin autenticado.

1.  Admin acessa \'Criar Bolao\' e preenche nome, data prevista e valor da cota.

2.  Admin adiciona categorias de premiacao: para cada uma informa nome, tipo, condicao, percentual e se acumula.

3.  Sistema exibe em tempo real a soma dos percentuais e indica se esta valida (verde) ou invalida (vermelho).

4.  Admin confirma a criacao. Sistema valida no backend: soma = 100% e dados consistentes.

5.  Sistema cria o bolao com status A_SER_INICIADO e as categorias associadas (imutaveis daqui em diante).

## UC-02: Registrar Sorteio e Calcular Acertos

**Ator:** Admin

**Pre-condicao:** Bolao EM_ANDAMENTO ou A_SER_INICIADO.

1.  Admin informa numero do concurso, data e 6 numeros sorteados.

2.  Sistema valida: 6 numeros distintos de 01 a 60.

3.  Sistema registra o sorteio e identifica se e o 1o do bolao (flag eh_primeiro = true).

4.  Sistema enfileira job BullMQ de calculo de acertos.

5.  Job processa todas as cotas ativas: calcula intersecao com bolas sorteadas, atualiza acertos_neste_sorteio e acertos_acumulados, grava em AcertoPorSorteio.

6.  Sistema verifica condicoes de todas as categorias: alguma cota satisfaz a condicao de encerramento?

7.  Se sim: bolao muda para FINALIZADO, sistema calcula premios e enfileira notificacao WhatsApp de premiados.

8.  Se nao: sistema enfileira notificacao WhatsApp de resultado parcial.

## UC-03: Acessar Portal via Supabase Auth OTP

**Ator:** Participante (acesso publico)

1.  Participante acessa URL publica do portal do tenant.

2.  Participante digita seu numero de celular com DDD.

3.  Sistema verifica se existe cota com aquele celular no tenant. Se nao: exibe mensagem amigavel e encerra.

4.  Se encontrado: sistema aciona Supabase Auth OTP --- envia Magic Link para email ou WhatsApp cadastrado na cota.

5.  Participante clica no Magic Link. Supabase Auth valida o token e cria sessao autenticada temporaria com escopo restrito ao celular.

6.  Sistema exibe cards de todos os bolaes com cotas daquele celular. Ranking atualiza em tempo real via Supabase Realtime.

7.  Participante seleciona um bolao e visualiza: palpites, acertos por sorteio, posicao no ranking, status de premiacao e historico de pagamento das cotas.

## UC-04: Encerrar Bolao e Distribuir Premios

**Ator:** Sistema (automatico) ou Admin (manual)

1.  Sistema detecta cota satisfazendo condicao de encerramento.

2.  Sistema altera status do bolao para FINALIZADO.

3.  Para cada CategoriaPremiacao: calcula valor total (percentual x bruto + acumulado), identifica ganhadores, divide valor igualmente.

4.  Categorias sem ganhadores e acumula_sem_ganhador = true: valor transferido para proximo bolao.

5.  Sistema gera registros na tabela Premio para cada cota ganhadora.

6.  Sistema enfileira mensagem WhatsApp com lista de premiados.

7.  Admin visualiza relatorio de premiados e registra pagamentos individualmente.

## UC-05: Enviar Notificacao WhatsApp

**Ator:** Sistema (automatico) ou Admin (manual)

1.  Evento dispara enfileiramento: resultado de sorteio, encerramento do bolao ou acao manual do Admin.

2.  Worker BullMQ pega a mensagem da fila, monta o conteudo (template + dados) e tenta enviar via whatsapp-web.js.

3.  Sucesso: status = ENVIADO, timestamp registrado.

4.  Falha: incrementa tentativas. Apos 3 tentativas: status = FALHA, envia alerta para o Admin, move para dead-letter queue.

## UC-06: Criar Tenant (Master)

**Ator:** Master

1.  Master acessa dashboard de tenants e clica em \'Novo Tenant\'.

2.  Preenche: nome, slug (validado como unico), taxa administrativa padrao e branding.

3.  Sistema cria o tenant com status ATIVO.

4.  Master cria o primeiro usuario Admin para o tenant.

5.  Admin do tenant ja pode criar bolaes com premiacoes livres.

# 13. Criterios de Aceite {#criterios-de-aceite}

| **ID** | **Criterio**                             | **Como Verificar**                                                                                                              |
|--------|------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| CA-01  | Criar bolao com categorias livres        | Admin cria bolao com 4 categorias; soma bate 100%; bolao e criado com sucesso                                                   |
| CA-02  | Bloquear criacao com soma invalida       | Admin tenta criar bolao com soma 98%; sistema bloqueia e exibe erro claro                                                       |
| CA-03  | Categorias imutaveis apos criacao        | Admin tenta editar categoria de bolao EM_ANDAMENTO; sistema recusa                                                              |
| CA-04  | Registrar cotas e confirmar pagamentos   | Cota cadastrada fica PENDENTE; Admin confirma pagamento; cota aparece no calculo                                                |
| CA-05  | Validar palpites invalidos               | Palpite com 9 numeros, numero \> 60 ou repetido e rejeitado com mensagem clara                                                  |
| CA-06  | Calcular acertos em lote                 | Apos inserir sorteio, 9.244 acertos calculados em menos de 10 segundos via job                                                  |
| CA-07  | Encerramento automatico                  | Cota com 10 acertos acumulados encerra o bolao e gera premios automaticamente                                                   |
| CA-08  | Divisao correta de premios               | 22 ganhadores em categoria de R\$ 27.732,00 = R\$ 1.260,55 cada (sem arredondamento)                                            |
| CA-09  | Acumulo de categoria                     | Categoria sem ganhador com acumula=true transfere valor para o proximo bolao                                                    |
| CA-10  | Portal --- OTP enviado ao celular        | Celular valido aciona Supabase Auth OTP; Magic Link e enviado; participante autentica e ve seus dados                           |
| CA-11  | Portal --- celular nao encontrado        | Celular nao cadastrado exibe mensagem amigavel sem acionar OTP e sem expor dados de outros                                      |
| CA-12  | Portal --- isolamento por sessao OTP     | Sessao OTP de celular A nao acessa dados de celular B --- validado pelas politicas RLS                                          |
| CA-13  | RLS Supabase                             | Query direta no banco sem JWT valido retorna zero registros em todas as tabelas para todos os tenants                           |
| CA-14  | WhatsApp --- envio automatico            | Apos sorteio, mensagem e enfileirada e entregue ao grupo; log registra ENVIADO                                                  |
| CA-15  | WhatsApp --- retry e falha               | Simulando falha de envio: sistema tenta 3x e marca FALHA; Admin recebe alerta                                                   |
| CA-16  | Exportar relatorio de ganhadores         | Admin exporta PDF/XLSX com premiados, valores e status de pagamento corretos                                                    |
| CA-17  | RBAC correto                             | Participante nao acessa rotas de Admin; Admin nao acessa rotas de outro tenant                                                  |
| CA-18  | Painel de testes --- disparo manual      | Master clica \'Disparar Testes\'; GitHub Actions e acionado; painel exibe RUNNING; resultado aparece em tempo real via Realtime |
| CA-19  | Painel de testes --- webhook autenticado | Requisicao POST /internal/test-results sem HMAC valido e rejeitada com 401                                                      |
| CA-20  | Painel de testes --- detalhamento        | Clicar em suite expande testes individuais; testes com falha exibem erro e stack trace                                          |
| CA-21  | Cobertura minima                         | Pipeline falha (bloqueia merge) se cobertura de BolaoService, PremioService ou CalcAcertosJob cair abaixo de 80%                |
| CA-22  | Testes unitarios --- calculo de acertos  | Fixture com palpites conhecidos e bolas sorteadas conhecidas resulta no numero exato esperado de acertos                        |
| CA-23  | Testes unitarios --- divisao de premios  | 22 ganhadores em R\$ 27.732,00 = R\$ 1.260,545\... com truncamento correto para 2 casas decimais                                |

# 14. Estrategia de Testes {#estrategia-de-testes}

O sistema adota uma estrategia de testes em tres camadas (piramide de testes), cobrindo unitarios, integracao e E2E. Todos os testes sao executados automaticamente no pipeline CI/CD (GitHub Actions) a cada push, e os resultados sao persistidos no Supabase para exibicao no painel do Master.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Piramide de Testes adotada:</strong></p>
<p>Camada 1 — Unitarios: funcoes, services, pipes, guards e componentes isolados (maior volume, mais rapidos)</p>
<p>Camada 2 — Integracao: modulos NestJS conversando entre si; componentes Angular com dependencias reais mockadas</p>
<p>Camada 3 — E2E: fluxos completos simulando o usuario real no browser (menor volume, mais lentos)</p>
<p>Cobertura minima exigida: 80% de linhas em services e use-cases criticos do backend</p>
<p>Todos os testes geram relatorio JSON consumido pelo painel do Master</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 14.1 Testes Unitarios --- Backend (NestJS + Jest) {#testes-unitarios-backend-nestjs-jest}

Ferramenta: Jest com ts-jest. Cada modulo NestJS tem seu proprio arquivo .spec.ts. Dependencias externas (Supabase, BullMQ, whatsapp-web.js) sao sempre mockadas.

| **Modulo / Arquivo**        | **O que testar**                                                                                                 | **Tecnica**                                                                                             |
|-----------------------------|------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| bolao.service.spec.ts       | criarBolao(): validar soma de percentuais = 100%; rejeitar soma invalida; criar categorias corretamente          | Mock do SupabaseClient; testar cada branch de validacao separadamente                                   |
| bolao.service.spec.ts       | encerrarBolao(): mudar status; calcular premios; identificar ganhadores por tipo de categoria                    | Mock do PremioService; verificar chamadas e parametros                                                  |
| calculo-acertos.job.spec.ts | calcularAcertos(): intersecao correta entre palpites e bolas; acertos acumulados incrementais; idempotencia      | Dados fixos (fixtures) com casos-limite: 0 acertos, 10 acertos, palpites repetidos                      |
| premio.service.spec.ts      | calcularValorCategoria(): percentual x bruto + acumulado; divisao entre N ganhadores sem arredondamento indevido | Testar com 22 ganhadores e R\$ 27.732,00 --- resultado deve ser R\$ 1.260,545\... truncado corretamente |
| premio.service.spec.ts      | acumularCategoria(): transferir valor para proximo bolao quando sem ganhadores                                   | Verificar campo valor_acumulado_anterior do novo bolao                                                  |
| palpite.validator.spec.ts   | validarPalpites(): 10 numeros; distintos; entre 01-60; ordem crescente; rejeitar cada caso invalido              | Parametrized tests: cobrir todos os casos de rejeicao com it.each()                                     |
| auth.guard.spec.ts          | RoleGuard: bloquear ADMIN em rota MASTER; bloquear sem tenant_id; permitir papel correto                         | Mock do ExecutionContext com diferentes payloads JWT                                                    |
| tenant.middleware.spec.ts   | injetarTenantId(): extrair tenant_id do JWT Supabase; rejeitar requisicao sem tenant                             | Mock do Request com headers validos e invalidos                                                         |
| whatsapp.service.spec.ts    | enfileirarMensagem(): adicionar job na fila BullMQ com payload correto; nao enviar direto                        | Mock do BullMQ Queue; verificar job.add() foi chamado com dados corretos                                |
| relatorio.service.spec.ts   | gerarRelatorioGanhadores(): montar estrutura correta de dados; upload no Supabase Storage; retornar signed URL   | Mock do SupabaseStorage; verificar path do bucket por tenant_id                                         |

## 14.2 Testes Unitarios --- Frontend (Angular + Jest) {#testes-unitarios-frontend-angular-jest}

Ferramenta: Jest com jest-preset-angular (substitui Karma/Jasmine por ser mais rapido e compativel com CI). Cada componente e service tem seu .spec.ts. HttpClient e Services externos sao sempre mockados com provideHttpClientTesting ou jest.fn().

| **Componente / Service**        | **O que testar**                                                                                                    | **Tecnica**                                                                           |
|---------------------------------|---------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| criar-bolao.component.spec.ts   | somaPercentuais(): reativo com Signals; atualizar ao adicionar/remover categoria; exibir erro visual quando != 100% | TestBed com fixture; disparar eventos de input e verificar estado do Signal           |
| criar-bolao.component.spec.ts   | submitBolao(): bloquear envio com soma invalida; chamar BolaoService.criar() com payload correto                    | Spy no BolaoService; verificar que nao chama o service quando invalido                |
| palpite-input.component.spec.ts | validarPalpites(): feedback visual por numero (verde/vermelho); desabilitar submit com palpites invalidos           | Simular selecao de numeros no grid 01-60; verificar classes CSS aplicadas             |
| ranking.component.spec.ts       | Supabase Realtime: atualizar lista ao receber evento do canal; nao duplicar entradas                                | Mock do RealtimeChannel; emitir evento INSERT/UPDATE e verificar lista re-renderizada |
| bolao.service.spec.ts           | criarBolao(): chamar endpoint correto; tratar erro 400 (soma invalida) exibindo mensagem                            | provideHttpClientTesting; HttpTestingController para verificar requests               |
| auth.guard.spec.ts              | canActivate(): redirecionar para login sem sessao Supabase; permitir acesso com sessao valida                       | Mock do SupabaseAuthService; testar rotas protegidas por papel                        |
| portal-busca.component.spec.ts  | buscaPorCelular(): exibir erro quando celular nao encontrado; disparar OTP quando encontrado                        | Mock do ParticipanteService; verificar mensagens de feedback                          |
| premio-calculo.pipe.spec.ts     | formatarValorPremio(): R\$ com 2 casas; divisao por N ganhadores; valor acumulado somado                            | Pipe puro --- testar diretamente sem TestBed; cobrir casos de divisao nao-exata       |

## 14.3 Testes de Integracao --- Backend {#testes-de-integracao-backend}

Ferramenta: Jest com supertest. Sobe o modulo NestJS completo com banco de dados de teste dedicado no Supabase (schema \'test\' isolado). Cada suite limpa e re-popula os dados antes de rodar.

| **Suite**                  | **Escopo**                                                   | **Cenarios cobertos**                                                                                                 |
|----------------------------|--------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| BolaoModule integration    | BolaoController + BolaoService + Supabase real (schema test) | POST /bolaes com categorias validas (201); POST com soma != 100% (400); GET /bolaes filtra por tenant_id corretamente |
| SorteioModule integration  | SorteioController + CalcAcertosJob + Supabase real           | POST /sorteios registra sorteio; job e enfileirado; acertos calculados corretamente para fixtures de cotas            |
| PremioModule integration   | PremioService + Supabase real com bolao finalizado           | Calcular premios: valores corretos por categoria; divisao exata; acumulo para proximo bolao                           |
| AuthModule integration     | Guards + Supabase Auth (modo test)                           | Token ADMIN nao acessa rota MASTER; token sem tenant_id rejeitado; RLS bloqueia dados de outro tenant                 |
| WhatsAppModule integration | WhatsAppService + BullMQ (Redis test)                        | Mensagem e enfileirada apos sorteio; worker processa e chama mock da API; falha gera retry; 3 falhas = FALHA          |

## 14.4 Testes de Integracao --- Frontend (Angular) {#testes-de-integracao-frontend-angular}

Ferramenta: Jest com Testing Library (@testing-library/angular). Testa componentes com suas dependencias reais, mockando apenas o backend (MSW --- Mock Service Worker intercepta as chamadas HTTP).

| **Suite**              | **Escopo**                                           | **Cenarios cobertos**                                                                                      |
|------------------------|------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| CriarBolaoFlow         | CriarBolaoComponent + BolaoService + validacoes      | Preencher formulario; adicionar 4 categorias; validar soma em tempo real; submeter; ver bolao na lista     |
| RegistrarSorteioFlow   | SorteioComponent + SorteioService + RankingComponent | Registrar sorteio; grid de bolas atualiza; ranking re-ordena; Realtime mock dispara atualizacao            |
| PortalParticipanteFlow | PortalBuscaComponent + PortalDetalheComponent        | Digitar celular valido; receber OTP mockado; ver bolaes, palpites e premiacao; celular invalido exibe erro |
| GestaoPremiосFlow      | PremioComponent + PremioService                      | Ver lista de ganhadores; marcar como PAGO; status atualiza; exportar relatorio (mock do Storage)           |

## 14.5 Testes E2E (Playwright) {#testes-e2e-playwright}

Ferramenta: Playwright. Roda contra ambiente de staging dedicado com banco de dados de staging no Supabase. Simula o usuario real no browser Chrome/Firefox/Safari. Cada teste limpa o estado via API de reset do staging.

| **Fluxo E2E**              | **Atores**        | **Passos principais**                                                                                                                                                                              |
|----------------------------|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Ciclo completo de um bolao | Master + Admin    | Master cria tenant → Admin loga → cria bolao com 3 categorias → cadastra 5 participantes → confirma pagamentos → registra sorteio → verifica ranking → encerra bolao → verifica premios calculados |
| Portal do participante     | Participante      | Acessa URL do portal → digita celular → recebe OTP (email de staging) → autentica → ve palpites e acertos → verifica premiacao → ranking atualiza em tempo real (Realtime)                         |
| Validacoes criticas        | Admin             | Tenta criar bolao com soma 98% → bloqueado; tenta cadastrar palpite invalido → bloqueado; tenta acessar outro tenant → bloqueado                                                                   |
| WhatsApp (mock)            | Admin             | Registra sorteio → mensagem e enfileirada → worker envia para mock da API → historico exibe ENVIADO; simula falha → exibe FALHA apos 3 tentativas                                                  |
| Isolamento multitenant     | Admin A + Admin B | Admin A loga; acessa /bolaes; todos os resultados sao do Tenant A; tenta URL com ID de bolao do Tenant B → 403                                                                                     |

# 15. Painel de Testes do Master {#painel-de-testes-do-master}

O painel de testes e uma tela exclusiva do Dashboard Master que exibe o resultado dos testes do sistema, permite disparar uma nova execucao sob demanda e acompanhar o progresso em tempo real via Supabase Realtime.

## 15.1 Arquitetura do Painel {#arquitetura-do-painel}

| **Componente**                   | **Tecnologia**                | **Responsabilidade**                                                                                                                              |
|----------------------------------|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| GitHub Actions Workflow          | CI/CD                         | Executa os tres tipos de teste (unitarios, integracao, E2E) em paralelo; gera relatorio JSON unificado; envia resultado via webhook para o NestJS |
| Webhook Receiver (NestJS)        | POST /internal/test-results   | Recebe o payload do GitHub Actions; valida o secret do webhook; persiste resultado no Supabase                                                    |
| Tabela test_runs (Supabase)      | PostgreSQL                    | Armazena cada execucao: id, trigger (push \| manual), branch, status, duracao, timestamp e relatorio JSON completo com resultado de cada suite    |
| Supabase Realtime                | Canal test_runs               | Notifica o frontend Angular em tempo real quando uma nova execucao e inserida ou atualizada (status muda de RUNNING para PASSED/FAILED)           |
| PainelTestes Component (Angular) | Angular 21 + Signals          | Exibe lista de execucoes; progresso em tempo real; resultado detalhado por suite e por teste individual                                           |
| Botao \'Disparar Testes\'        | Angular + NestJS + GitHub API | Master clica → NestJS chama GitHub Actions API (workflow_dispatch) → Actions inicia → Realtime notifica → painel atualiza                         |

## 15.2 Tabela test_runs (Supabase) {#tabela-test_runs-supabase}

| **Coluna**       | **Tipo**         | **Descricao**                                                       |
|------------------|------------------|---------------------------------------------------------------------|
| id               | UUID PK          | Identificador da execucao                                           |
| trigger          | ENUM             | PUSH \| MANUAL \| SCHEDULED                                         |
| branch           | TEXT             | Branch do git que gerou a execucao                                  |
| commit_sha       | TEXT             | Hash do commit                                                      |
| commit_message   | TEXT             | Mensagem do commit                                                  |
| status           | ENUM             | PENDING \| RUNNING \| PASSED \| FAILED \| CANCELLED                 |
| total_testes     | INTEGER          | Numero total de testes na execucao                                  |
| testes_passou    | INTEGER          | Quantos passaram                                                    |
| testes_falhou    | INTEGER          | Quantos falharam                                                    |
| cobertura_pct    | DECIMAL(5,2)     | Percentual de cobertura de codigo (linhas)                          |
| duracao_segundos | INTEGER          | Tempo total de execucao                                             |
| relatorio_json   | JSONB            | Relatorio completo: suites, testes individuais, erros, stack traces |
| actions_run_url  | TEXT             | URL da execucao no GitHub Actions para debug                        |
| criado_em        | TIMESTAMPTZ      | Quando a execucao foi iniciada                                      |
| finalizado_em    | TIMESTAMPTZ NULL | Quando a execucao terminou                                          |

## 15.3 Estrutura do relatorio_json {#estrutura-do-relatorio_json}

O campo relatorio_json armazena o resultado detalhado de cada suite e teste individual, gerado pelo Jest (\--json) e Playwright (\--reporter=json), unificado pelo CI em um unico payload:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Estrutura do JSON de resultado (simplificado):</strong></p>
<p>{</p>
<p>'run_id': 'uuid',</p>
<p>'camadas': {</p>
<p>'unitarios': {</p>
<p>'status': 'PASSED',</p>
<p>'total': 84, 'passou': 84, 'falhou': 0, 'duracao_ms': 3200,</p>
<p>'cobertura': { 'linhas': 87.3, 'funcoes': 91.2, 'branches': 82.1 },</p>
<p>'suites': [</p>
<p>{ 'nome': 'BolaoService', 'status': 'PASSED', 'testes': [</p>
<p>{ 'nome': 'deve rejeitar soma de percentuais != 100%', 'status': 'PASSED', 'duracao_ms': 12 },</p>
<p>{ 'nome': 'deve calcular premios com 22 ganhadores', 'status': 'PASSED', 'duracao_ms': 8 }</p>
<p>]}</p>
<p>]</p>
<p>},</p>
<p>'integracao': { ... },</p>
<p>'e2e': { ... }</p>
<p>}</p>
<p>}</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 15.4 Fluxo: Disparo Manual pelo Master {#fluxo-disparo-manual-pelo-master}

| **Etapa**                                 | **Onde**                      | **O que acontece**                                                                                                         |
|-------------------------------------------|-------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| 1 --- Master clica \'Rodar Testes\'       | Angular (PainelTestes)        | Componente chama POST /internal/trigger-tests no NestJS                                                                    |
| 2 --- NestJS aciona GitHub Actions        | NestJS → GitHub API           | POST para api.github.com/repos/\.../actions/workflows/tests.yml/dispatches com workflow_dispatch e branch main             |
| 3 --- GitHub Actions inicia               | GitHub                        | Workflow e enfileirado; insere registro na tabela test_runs com status RUNNING via webhook inicial                         |
| 4 --- Painel atualiza para \'Executando\' | Angular via Supabase Realtime | Canal test_runs recebe INSERT; painel exibe spinner com status RUNNING e commit info                                       |
| 5 --- GitHub Actions executa testes       | GitHub (paralelo)             | Unitarios (Jest backend) + Unitarios (Jest frontend) + Integracao + E2E (Playwright) rodando em paralelo em jobs separados |
| 6 --- Resultado enviado via webhook       | GitHub → NestJS               | Apos finalizar, Actions chama POST /internal/test-results com relatorio JSON e secret de autenticacao                      |
| 7 --- NestJS persiste resultado           | NestJS → Supabase             | Atualiza test_runs com status final, duracao, metricas e relatorio_json completo                                           |
| 8 --- Painel exibe resultado final        | Angular via Supabase Realtime | Canal recebe UPDATE; painel exibe PASSED (verde) ou FAILED (vermelho) com detalhes de cada suite                           |

## 15.5 O que o Master Ve na Tela {#o-que-o-master-ve-na-tela}

**Cabecalho do painel**

- Status da ultima execucao: badge PASSOU (verde) ou FALHOU (vermelho)

- Metricas resumidas: X/Y testes passaram \| Cobertura: 87% \| Duracao: 3m 42s

- Botao \'Disparar Testes Agora\' (desabilitado enquanto ha execucao em andamento)

- Link para a execucao no GitHub Actions para debug detalhado

**Cards por camada de teste**

- Card \'Testes Unitarios Backend\': status geral + N suites + N testes + cobertura de linhas

- Card \'Testes Unitarios Frontend\': idem para o Angular

- Card \'Testes de Integracao\': status + suites de integracao NestJS e Angular

- Card \'Testes E2E\': status + cada fluxo E2E com duracao individual

**Detalhe expansivel por suite**

- Clicar em uma suite expande a lista de testes individuais

- Cada teste exibe: nome, status (icone verde/vermelho), duracao em ms

- Testes com falha exibem o erro e o stack trace colapsavel

**Historico de execucoes**

- Tabela com as ultimas 20 execucoes: data, trigger (push/manual), branch, commit, status e duracao

- Clicar em uma execucao anterior exibe o relatorio completo daquela execucao

## 15.6 Requisitos Funcionais do Painel de Testes {#requisitos-funcionais-do-painel-de-testes}

- RF-TESTES-01: O painel deve exibir o resultado da ultima execucao ao carregar, buscando o registro mais recente da tabela test_runs

- RF-TESTES-02: O botao \'Disparar Testes\' so e habilitado quando nao ha execucao com status RUNNING ou PENDING

- RF-TESTES-03: O painel deve atualizar em tempo real via Supabase Realtime (canal test_runs) sem necessidade de recarregar a pagina

- RF-TESTES-04: O webhook do GitHub Actions deve ser autenticado com HMAC-SHA256 (secret configurado tanto no GitHub quanto no NestJS via variavel de ambiente)

- RF-TESTES-05: O painel e exclusivo do papel MASTER --- nenhum Admin tem acesso

- RF-TESTES-06: O historico deve preservar os ultimos 90 dias de execucoes

- RF-TESTES-07: Em caso de execucao com status FAILED, o sistema deve destacar visualmente quais suites falharam e quantos testes falharam em cada camada

## 15.7 Configuracao do Pipeline CI/CD (GitHub Actions) {#configuracao-do-pipeline-cicd-github-actions}

O workflow tests.yml e disparado em dois eventos: push na branch main/develop e workflow_dispatch (disparo manual via API). Os jobs rodam em paralelo para minimizar o tempo total de execucao.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Estrutura do workflow tests.yml:</strong></p>
<p>on: [push, workflow_dispatch]</p>
<p>jobs:</p>
<p>unit-backend:</p>
<p>runs-on: ubuntu-latest</p>
<p>steps: checkout → setup Node → install → jest --coverage --json --outputFile=result-unit-backend.json</p>
<p>unit-frontend:</p>
<p>runs-on: ubuntu-latest</p>
<p>steps: checkout → setup Node → install → jest --preset jest-preset-angular --json</p>
<p>integration:</p>
<p>runs-on: ubuntu-latest</p>
<p>needs: [unit-backend, unit-frontend]</p>
<p>env: SUPABASE_URL_TEST, SUPABASE_KEY_TEST (projeto de test dedicado)</p>
<p>steps: checkout → setup → install → jest --testPathPattern=integration --json</p>
<p>e2e:</p>
<p>runs-on: ubuntu-latest</p>
<p>needs: [integration]</p>
<p>steps: checkout → setup → install → playwright install → playwright test --reporter=json</p>
<p>notify:</p>
<p>needs: [unit-backend, unit-frontend, integration, e2e]</p>
<p>steps: unificar JSONs → POST /internal/test-results com HMAC-SHA256</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 15.8 Boas Praticas de Testes Adotadas {#boas-praticas-de-testes-adotadas}

**Backend (NestJS + Jest)**

- AAA pattern em todos os testes: Arrange (preparar dados) → Act (executar) → Assert (verificar)

- Um arquivo .spec.ts por service/controller/guard --- nunca misturar modulos

- Mocks com jest.fn() e jest.spyOn(); nunca chamar banco real em testes unitarios

- Fixtures em arquivos separados (/test/fixtures): dados reutilizaveis entre suites

- it.each() para testes parametrizados (ex: cobrir todos os casos invalidos de palpite em um unico bloco)

- beforeEach() limpa todos os mocks: jest.clearAllMocks()

- Testes de casos-limite obrigatorios: 0 acertos, 10 acertos, 1 ganhador, N ganhadores iguais, divisao com decimal

- Cobertura minima de 80% em services de dominio criticos (BolaoService, PremioService, CalcAcertosJob)

**Frontend (Angular + Jest)**

- Componentes testados via Testing Library (@testing-library/angular): interagir pelo que o usuario ve, nao por seletores de implementacao

- Services HTTP mockados com MSW (Mock Service Worker) nos testes de integracao frontend

- Signals testados de forma sincrona: verificar valor do signal antes e depois da acao

- Evitar acesso direto ao DOM via fixture.debugElement --- preferir queries semanticas (getByRole, getByText)

- Testes de acessibilidade basica com @axe-core/angular nos componentes principais

**E2E (Playwright)**

- Page Object Model (POM): cada pagina tem uma classe com seus seletores e acoes encapsulados

- Cada teste E2E deve ser completamente independente: criar e limpar seus proprios dados via API de staging

- Usar expect.soft() para validacoes nao-criticas --- nao abortar o teste inteiro por falha menor

- Screenshots automaticos em caso de falha (configurado no playwright.config.ts)

- Rodar em paralelo com workers = 4 para reduzir tempo total

- Variaveis de ambiente separadas para staging: nunca apontar E2E para producao

# 16. Especificacao de Seguranca {#especificacao-de-seguranca}

Esta secao define as praticas, controles e requisitos de seguranca que devem ser implementados em todas as camadas do sistema. A abordagem adota os principios de Security by Design e Defense in Depth --- seguranca nao e uma camada adicionada ao final, mas uma propriedade de cada decisao de arquitetura e implementacao.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Principios fundamentais adotados:</strong></p>
<p>Security by Design: seguranca considerada desde a primeira linha de codigo, nao como afterthought</p>
<p>Defense in Depth: multiplas camadas de controle — se uma falha, as outras ainda protegem</p>
<p>Least Privilege: cada componente, usuario e processo acessa apenas o minimo necessario</p>
<p>Zero Trust: nenhuma requisicao e confiavel por padrao, nem dentro da propria rede</p>
<p>Fail Secure: em caso de erro, o sistema assume a postura mais restritiva</p>
<p>Auditability: toda acao critica e rastreavel, imutavel e correlacionavel</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 16.1 Autenticacao e Gestao de Sessao {#autenticacao-e-gestao-de-sessao}

**Supabase Auth --- configuracoes obrigatorias**

- Habilitar MFA (Multi-Factor Authentication) obrigatoriamente para todos os usuarios com papel MASTER; opcional mas fortemente recomendado para ADMIN

- Configurar tempo de expiracao do JWT de acesso para 1 hora maxima (access_token_ttl); refresh token com expiracao de 7 dias

- Habilitar rotacao automatica de refresh tokens (rotate_refresh_token = true): cada uso invalida o token anterior, detectando roubo de sessao

- Configurar deteccao de sessoes suspeitas: multiplos logins de IPs distintos em curto intervalo devem gerar alerta e exigir reautenticacao

- Desabilitar sign-up publico no Supabase Auth: apenas o Master pode criar novos usuarios Admin via painel; participantes usam OTP vinculado a celular cadastrado

- Habilitar email confirmation obrigatoria para novos usuarios Admin

**OTP para portal do participante**

- Magic Links com expiracao de 10 minutos (otp_expiry = 600)

- Uso unico: token invalidado imediatamente apos o primeiro uso

- Rate limiting no endpoint de solicitacao de OTP: maximo 3 tentativas por celular por hora, com bloqueio progressivo (15 min → 1h → 24h)

- Nunca revelar se o celular existe ou nao no sistema antes do OTP --- retornar sempre \'Se o numero estiver cadastrado, voce recebera um link\' para evitar enumeracao de usuarios

**Gestao de senhas (usuarios Admin/Master)**

- Delegado ao Supabase Auth: bcrypt com custo minimo 10; nunca implementar hash proprio

- Politica de senha: minimo 12 caracteres, ao menos 1 maiuscula, 1 minuscula, 1 numero e 1 caractere especial

- Bloqueio de conta apos 5 tentativas de login falhas consecutivas (lock_out_after = 5); desbloqueio apenas via email de recuperacao

- Proibir reutilizacao das ultimas 5 senhas

## 16.2 Autorizacao, RBAC e Row Level Security {#autorizacao-rbac-e-row-level-security}

**Principio do menor privilegio na pratica**

- Service Role Key do Supabase (chave de admin do banco) NUNCA exposta no frontend, NUNCA em variavel de ambiente do cliente; usada apenas no NestJS em contexto server-side

- Frontend Angular usa exclusivamente a Anon Key do Supabase, cujas permissoes sao limitadas pelas politicas RLS

- NestJS usa a Service Role Key somente para operacoes que requerem bypass de RLS (ex: jobs em background que processam dados de multiplos tenants)

- Cada modulo NestJS declara explicitamente quais papeis podem acessar cada endpoint via @Roles() decorator --- nao existe endpoint sem decorador de papel

**Politicas RLS --- padroes obrigatorios**

- Toda tabela deve ter RLS habilitado (ALTER TABLE \... ENABLE ROW LEVEL SECURITY)

- Politica padrao negativa: sem uma politica explicita permitindo, nenhum acesso e concedido (deny-by-default)

- Politica de SELECT por tenant: USING (tenant_id = (auth.jwt() -\> \'user_metadata\' -\>\> \'tenant_id\')::uuid)

- Politica de INSERT: WITH CHECK garantindo que tenant_id inserido corresponde ao tenant do JWT --- impossibilita insercao de dados em outro tenant

- Politica para MASTER: papel \'MASTER\' no JWT bypassa filtro de tenant_id para operacoes de gestao da plataforma

- Politica para portal do participante (OTP): sessao OTP acessa apenas cotas onde numero_celular = auth.jwt() -\> user_metadata -\>\> \'celular\'

- Testar politicas RLS com o Supabase Policy Tester antes de deploy; cobrir: tenant correto, tenant errado, sem autenticacao, papel incorreto

**Auditoria de acessos**

- Toda escalada de privilegio (ex: Master acessando dados de um tenant especifico) deve ser registrada em tabela audit_logs com: usuario, acao, tenant_id alvo, timestamp e IP

- Tabela audit_logs com RLS restritiva: apenas MASTER pode ler; nenhum usuario pode deletar ou atualizar registros de auditoria

## 16.3 Seguranca da API (NestJS) {#seguranca-da-api-nestjs}

**Validacao e sanitizacao de entrada**

- Usar class-validator + class-transformer em todos os DTOs: nenhum campo pode chegar ao service sem validacao previa no controller

- Habilitar ValidationPipe globalmente com whitelist: true (remove campos nao declarados no DTO) e forbidNonWhitelisted: true (rejeita requisicao com campos extras)

- Sanitizacao de strings: remover tags HTML e caracteres de controle de todos os campos de texto livre (usar sanitize-html ou DOMPurify no backend)

- Validar arrays de palpites com regras compostas: IsArray, ArrayMinSize(10), ArrayMaxSize(10), cada elemento IsInt, Min(1), Max(60), e validador customizado de unicidade e ordem crescente

- Nunca confiar em dados vindos do frontend para calculos financeiros: recalcular sempre no backend (valor de premio, acertos, percentuais)

**Rate Limiting e protecao contra abuso**

| **Endpoint**                          | **Limite**               | **Janela** | **Acao ao exceder**                               |
|---------------------------------------|--------------------------|------------|---------------------------------------------------|
| POST /auth/otp (portal)               | 3 tentativas por celular | 1 hora     | Bloqueio progressivo: 15min → 1h → 24h            |
| POST /auth/login                      | 5 tentativas por IP      | 15 minutos | Bloqueio do IP por 30 minutos; alerta para Master |
| GET /portal/participante              | 30 requests por sessao   | 1 minuto   | HTTP 429 com Retry-After header                   |
| POST /sorteios                        | 10 requests por tenant   | 1 hora     | HTTP 429; evita registro acidental em loop        |
| POST /internal/test-results (webhook) | 100 requests             | 1 hora     | HTTP 429; protege contra flood no webhook         |
| Endpoints gerais autenticados         | 500 requests por usuario | 1 minuto   | HTTP 429 com mensagem padrao                      |

**Headers de seguranca HTTP**

- Helmet.js habilitado globalmente no NestJS: configura automaticamente Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security e Referrer-Policy

- Content-Security-Policy restritiva: default-src \'self\'; script-src \'self\'; connect-src \'self\' \*.supabase.co; img-src \'self\' data: blob:; object-src \'none\'

- X-Frame-Options: DENY --- impede clickjacking

- Strict-Transport-Security: max-age=31536000; includeSubDomains --- forcra HTTPS

- Permissions-Policy: desabilitar camera, microphone, geolocation e outras APIs nao usadas

- CORS configurado explicitamente: listar apenas dominios permitidos; nunca usar origin: \'\*\' em producao

**Protecao contra injecao**

- SQL Injection: usando Supabase SDK e Prisma com queries parametrizadas --- nunca concatenar strings SQL; proibir uso de db.execute() com interpolacao

- NoSQL Injection: nao aplicavel (PostgreSQL), mas validar todos os filtros de query params antes de passar ao Supabase

- Prototype Pollution: usar class-transformer com excludeExtraneousValues: true; evitar spread de objetos de entrada nao validados

- Path Traversal: validar nomes de arquivos no upload com regex estrita; usar UUIDs como nomes de arquivo no Supabase Storage, nunca o nome original

**Webhook Security**

- Webhook do GitHub Actions validado com HMAC-SHA256: calcular hmac(secret, payload) e comparar com X-Hub-Signature-256 usando timingSafeEqual (evita timing attacks)

- Secret do webhook armazenado em variavel de ambiente; nunca em codigo fonte ou logs

- Payload do webhook limitado a 1MB; rejeitar payloads maiores com 413

## 16.4 Seguranca dos Dados e Criptografia {#seguranca-dos-dados-e-criptografia}

**Dados em repouso**

- Supabase habilita criptografia em repouso (AES-256) automaticamente em todos os planos, incluindo o Free

- Dados financeiros sensiveis (valor de premios, historico de pagamentos) nunca armazenados em texto puro no frontend ou em logs

| **FASE 0 --- SEM BACKUPS AUTOMATICOS: o plano Free do Supabase nao inclui backups diarios automaticos. Substituido por job semanal de pg_dump conforme secao 30.3. Habilitar backups automaticos ao migrar para o plano Pro (gatilho: secao 30.5).** |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **FASE 0 --- SEM PITR: Point-in-Time Recovery indisponivel no plano Free. Habilitar ao migrar para o plano Pro. Gatilho definido na secao 30.5.**                                                                                                    |

**Dados em transito**

- TLS 1.2 minimo em todas as conexoes; TLS 1.3 preferencial --- verificar configuracao do CDN/proxy

- Conexoes do NestJS ao Supabase sempre via HTTPS; proibir conexoes nao-criptografadas mesmo em ambiente interno

- Sessoes do whatsapp-web.js criptografadas localmente antes de persistir no disco (usar LocalAuth com chave derivada de variavel de ambiente)

- Signed URLs do Supabase Storage com expiracao de 1 hora para relatorios; nunca expor URLs publicas permanentes de arquivos privados

**Variaveis de ambiente e secrets**

- Nenhuma secret em codigo fonte --- uso obrigatorio de variaveis de ambiente para: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, REDIS_URL, GITHUB_WEBHOOK_SECRET, WHATSAPP_SESSION_SECRET

- Arquivo .env nunca comitado no git --- .gitignore deve incluir .env, .env.local, .env.\*.local

- Arquivo .env.example com chaves sem valores commitado como documentacao

- Em producao: usar secrets manager (GitHub Actions Secrets, Doppler ou AWS Secrets Manager) --- nunca variaveis de ambiente plain text em arquivos de deploy

- Rotacao periodica de secrets: Service Role Key do Supabase e GitHub Webhook Secret a cada 90 dias

- Separacao estrita de environments: secrets de producao nunca usados em staging ou desenvolvimento

**Dados pessoais e LGPD**

- Mapeamento de dados pessoais: numero_celular, nome_identificacao e email sao dados pessoais sujeitos a LGPD

- Base legal documentada: execucao de contrato (participacao no bolao) e interesse legitimo (notificacoes de resultado)

- Direito de acesso: participante pode solicitar via portal exportacao de todos os seus dados

- Direito ao esquecimento: Admin pode anonimizar dados de participante (substituir nome por \'Participante Anonimo\' e celular por hash irreversivel) sem perder integridade dos calculos historicos

- Prazo de retencao: dados de bolaes encerrados retidos por 5 anos (obrigacao fiscal) e entao anonimizados automaticamente via job agendado

- Transferencia internacional de dados: verificar regiao do Supabase; preferir regiao Brasil (sa-east-1) ou documentar transferencia para a UE com garantias adequadas

## 16.5 Seguranca da Infraestrutura {#seguranca-da-infraestrutura}

**Containers Docker**

- Imagens base: usar imagens oficiais Alpine (node:22-alpine) --- menor superficie de ataque

- Executar processos Node.js como usuario nao-root dentro do container (USER node no Dockerfile)

- Multi-stage build: imagem final de producao nao contem devDependencies, arquivos de teste, .env.example nem qualquer artefato de desenvolvimento

- Escanear imagens Docker com trivy ou snyk antes de cada deploy --- pipeline deve falhar se houver vulnerabilidades criticas (CRITICAL) ou altas (HIGH) sem mitigacao

- Nunca usar :latest como tag de imagem em producao; usar tags imutaveis (ex: node:22.4.0-alpine)

- Arquivo .dockerignore excluindo: node_modules, .git, .env\*, test/, \*.spec.ts, coverage/

**Dependencias e Supply Chain**

- npm audit executado em todo CI: pipeline falha com vulnerabilidades HIGH ou CRITICAL sem resolucao

- Dependabot ou Renovate configurado para PRs automaticos de atualizacao de dependencias

- package-lock.json sempre comitado e usado (npm ci em vez de npm install em CI/CD)

- Revisar permissoes de pacotes npm: desconfiar de pacotes que solicitam acesso a filesystem, rede ou processos sem justificativa clara

- Usar npm audit signatures para verificar integridade dos pacotes instalados

**CI/CD Pipeline Security**

- Secrets do GitHub Actions acessados via \${{ secrets.NOME }} --- nunca impressos em logs (add-mask automatico)

- Permissoes minimas para o GITHUB_TOKEN: apenas o que cada job precisa (contents: read, deployments: write, etc.)

- Pinning de actions de terceiros por commit SHA imutavel, nao por tag (ex: uses: actions/checkout@a81bbbf8 em vez de @v3)

- Ambientes de deploy protegidos no GitHub: producao requer aprovacao manual de pelo menos um revisor antes do deploy

- Branch protection rules: main requer PR aprovado, CI verde e nao permite force push

**Monitoramento e deteccao de incidentes**

- Logging centralizado: FASE 0 --- usar Logtail Free (1 GB/mes, 3 dias retencao) ou logs nativos do Fly.io. Upgrade para retencao maior apenas quando o primeiro incidente exigir historico mais longo (gatilho: secao 30.4).

- Alertas configurados para: taxa de erro HTTP 5xx \> 1% em 5 minutos; latencia P99 \> 5s; falha de autenticacao \> 20 por minuto; job BullMQ falhando por mais de 15 minutos

- Nunca logar dados sensiveis: proibir log de senhas, tokens JWT completos, numeros de celular e valores de premio em texto puro

- Estrutura de log padronizada em JSON com campos: timestamp, level, requestId, tenantId (nunca dados pessoais), modulo e mensagem

- Health check endpoint publico (/health) retornando status de cada dependencia: Supabase, Redis/BullMQ e WhatsApp session --- usado pelo load balancer e monitoramento

## 16.6 Seguranca do Frontend (Angular 21) {#seguranca-do-frontend-angular-21}

**Protecao contra XSS**

- Angular sanitiza automaticamente interpolacoes {{ }} e bindings \[innerHTML\] --- nunca usar bypassSecurityTrustHtml() sem revisao de seguranca

- Proibir uso de bypassSecurityTrust\* em codigo de producao sem comentario explicando o risco e aprovacao no code review

- Content-Security-Policy no servidor impede execucao de scripts inline --- Angular com strict CSP: usar nonces gerados pelo servidor em vez de \'unsafe-inline\'

- DOMPurify para qualquer conteudo externo que precise ser renderizado como HTML (ex: mensagens do WhatsApp exibidas no historico)

**Gerenciamento de estado e dados sensiveis**

- Tokens JWT (session do Supabase) armazenados apenas em memoria (variavel no AuthService) ou no storage gerenciado pelo Supabase SDK --- nunca em localStorage diretamente sem criptografia

- Dados do participante buscados por demanda, nunca cacheados em localStorage entre sessoes

- Limpar estado da aplicacao completamente no logout: chamar supabase.auth.signOut() e resetar todos os Signals e stores

- Nao expor tenant_id ou IDs internos em URLs publicas do portal --- usar tokens opacos ou parâmetros de rota sem significado externo

**Dependencias frontend**

- npm audit no build do Angular --- pipeline falha com vulnerabilidades criticas

- Subresource Integrity (SRI) para scripts de terceiros carregados via CDN

- Auditar bundle final com source-map-explorer: identificar dependencias inesperadas ou codigo excessivo

## 16.7 Seguranca da Integracao WhatsApp {#seguranca-da-integracao-whatsapp}

- Sessao do whatsapp-web.js persistida com criptografia: chave derivada de variavel de ambiente via PBKDF2; nunca salvar sessao em texto puro no disco

- Isolamento por tenant: cada tenant tem sessao em diretorio exclusivo; paths nao podem ser manipulados por input do usuario (validar tenant_id como UUID antes de usar no path)

- Rate limiting no envio: maximo 10 mensagens por minuto por tenant para evitar banimento; fila BullMQ com limiter configurado

- Conteudo das mensagens validado antes do envio: tamanho maximo de 4096 caracteres; remover caracteres de controle e URLs maliciosas

- Nao enviar dados financeiros completos (valores exatos de premio) em mensagens de grupo publico --- usar apenas indicadores como \'voce tem um premio a receber, acesse o portal\'

- Log de todas as mensagens enviadas para auditoria, com hash do conteudo (nao o conteudo completo se houver dados pessoais)

- Alertas automaticos se a sessao do WhatsApp cair: notificar Admin via email (Supabase Edge Function ou SendGrid)

## 16.8 Modelagem de Ameacas (STRIDE) {#modelagem-de-ameacas-stride}

Analise das principais ameacas ao sistema seguindo o modelo STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege):

| **Ameaca**                                                   | **Categoria STRIDE**                     | **Vetor**                                                   | **Controle implementado**                                                                       |
|--------------------------------------------------------------|------------------------------------------|-------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Participante A acessa dados do participante B pelo portal    | Spoofing + Info Disclosure               | Manipular celular na busca ou reutilizar sessao OTP         | Supabase Auth OTP de uso unico; RLS filtra por celular da sessao autenticada                    |
| Admin de Tenant A acessa dados do Tenant B                   | Elevation of Privilege                   | Manipular tenant_id em headers ou body                      | RLS no banco + middleware NestJS + JWT scoped por tenant; 3 camadas independentes               |
| Injecao de dados falsos no resultado de sorteio              | Tampering                                | Admin malicioso ou comprometido inserindo sorteio incorreto | Audit log imutavel; validacao dos numeros do concurso contra API publica da Caixa (recomendado) |
| Flood no endpoint de OTP para enumerar celulares             | Denial of Service + Info Disclosure      | Automatizar requisicoes de OTP                              | Rate limiting progressivo + resposta padrao sem revelar se celular existe                       |
| Roubo de Service Role Key do Supabase                        | Info Disclosure + Elevation of Privilege | Exposicao em logs, git ou variaveis de ambiente             | Nunca no frontend; secrets manager; rotacao a cada 90 dias; alertas de uso anomalo              |
| Webhook falso simulando resultado de CI                      | Tampering                                | POST /internal/test-results sem autenticacao real           | HMAC-SHA256 com timingSafeEqual; rejeitar sem header X-Hub-Signature-256 valido                 |
| Sessao WhatsApp comprometida enviando mensagens fraudulentas | Spoofing                                 | Acesso ao servidor onde a sessao esta salva                 | Criptografia da sessao; isolamento por tenant; rate limiting; log de auditoria de envios        |
| Exfiltração de dados via relatorios                          | Info Disclosure                          | Admin exporta relatorio e vaza dados de participantes       | Signed URLs com expiracao de 1h; log de downloads; politicas de retencao LGPD                   |

## 16.9 Checklist de Seguranca por Fase {#checklist-de-seguranca-por-fase}

**Antes do primeiro deploy em producao**

- \[ \] Todas as variaveis de ambiente configuradas via secrets manager --- zero secrets em codigo

- \[ \] RLS habilitado e testado em todas as tabelas do Supabase

- \[ \] MFA obrigatorio ativado para o usuario Master no Supabase Auth

- \[ \] Sign-up publico desabilitado no Supabase Auth

- \[ \] Helmet.js configurado com CSP restritiva

- \[ \] Rate limiting configurado em todos os endpoints sensiveis

- \[ \] npm audit sem vulnerabilidades CRITICAL ou HIGH

- \[ \] Trivy/Snyk scan de imagens Docker sem criticos

- \[ \] .gitignore incluindo todos os arquivos .env

- \[ \] Backup manual configurado: job semanal pg_dump para Supabase Storage (ver secao 30.3) --- substitui PITR no plano Free

- \[ \] Branch protection rules configuradas no GitHub

- \[ \] Logging centralizado funcionando com alertas ativos

- \[ \] Health check endpoint respondendo corretamente

- \[ \] Sessoes WhatsApp criptografadas antes de persistir

**A cada sprint / pull request**

- \[ \] Code review com checklist de seguranca: nenhum bypassSecurityTrust\*, nenhuma secret em codigo, DTOs com validacao completa

- \[ \] npm audit automatico no CI --- PR bloqueado com vulnerabilidades criticas

- \[ \] Novos endpoints decorados com @Roles() --- nenhum endpoint sem controle de acesso

- \[ \] Novas tabelas com RLS habilitado e politicas testadas

- \[ \] Testes de seguranca (auth guard, RLS, rate limiting) cobrindo novos fluxos

**Periodicamente (a cada 90 dias)**

- \[ \] Rotacao da Service Role Key do Supabase e GitHub Webhook Secret

- \[ \] Revisao de usuarios Admin ativos --- desativar contas sem uso

- \[ \] Revisao de logs de auditoria --- verificar acessos anomalos

- \[ \] Atualizacao de dependencias criticas (security patches)

- \[ \] Teste de penetracao basico nos endpoints de autenticacao e portal do participante

# 17. Estrategia de Migrations de Banco {#estrategia-de-migrations-de-banco}

Migrations sao a unica forma segura de evoluir o schema do PostgreSQL sem risco de perda de dados ou inconsistencia entre ambientes. Toda alteracao no banco --- criar tabela, adicionar coluna, criar indice, alterar tipo, criar politica RLS --- deve ser feita exclusivamente via migration versionada. Nunca alteracoes manuais no banco, mesmo em desenvolvimento.

## 17.1 Ferramenta e Integracao com Supabase {#ferramenta-e-integracao-com-supabase}

- Ferramenta principal: Supabase CLI (supabase db diff, supabase migration new, supabase db push)

- Fluxo: desenvolver localmente com supabase start (instancia Docker local do Supabase) → gerar migration → testar → commitar → CI aplica em staging → aprovacao manual → CI aplica em producao

- Cada migration e um arquivo SQL com timestamp no nome: 20260427120000_create_boloes.sql

- Migrations sao imutaveis apos merge na main: nunca editar um arquivo de migration ja aplicado; criar uma nova migration para corrigir

- Diretorio padrao: supabase/migrations/ versionado no git junto com o codigo

## 17.2 Convencoes de Nomenclatura {#convencoes-de-nomenclatura}

| **Tipo de Alteracao**  | **Prefixo do arquivo** | **Exemplo**                                  |
|------------------------|------------------------|----------------------------------------------|
| Criar tabela           | create\_               | 20260427_create_boloes.sql                   |
| Adicionar coluna       | add_column\_           | 20260428_add_column_status_to_cotas.sql      |
| Remover coluna         | drop_column\_          | 20260429_drop_column_legado_from_boloes.sql  |
| Criar indice           | create_index\_         | 20260430_create_index_cotas_tenant_bolao.sql |
| Criar politica RLS     | add_rls_policy\_       | 20260501_add_rls_policy_boloes_tenant.sql    |
| Alterar tipo de coluna | alter_column\_         | 20260502_alter_column_palpites_to_array.sql  |
| Seed de dados fixos    | seed\_                 | 20260503_seed_tipos_categoria_premiacao.sql  |
| Rollback de emergencia | rollback\_             | 20260504_rollback_20260503.sql               |

## 17.3 Fluxo Completo de uma Migration {#fluxo-completo-de-uma-migration}

| **Etapa**                 | **Comando / Acao**                                                                            | **Responsavel**              |
|---------------------------|-----------------------------------------------------------------------------------------------|------------------------------|
| 1 --- Criar migration     | supabase migration new nome_descritivo                                                        | Dev que implementa a feature |
| 2 --- Escrever SQL        | Editar o arquivo gerado: CREATE TABLE, ALTER TABLE, politicas RLS, indices                    | Dev                          |
| 3 --- Testar localmente   | supabase db reset (aplica todas as migrations do zero) + rodar suite de testes de integracao  | Dev                          |
| 4 --- Code review         | PR com o arquivo de migration revisado por outro Dev: verificar reversibilidade, indices, RLS | Revisor                      |
| 5 --- Aplicar em staging  | CI executa supabase db push \--project-ref STAGING_REF automaticamente apos merge             | CI/CD                        |
| 6 --- Validar em staging  | Rodar testes de integracao contra staging; verificar dados e politicas RLS                    | Dev / QA                     |
| 7 --- Aplicar em producao | CI executa supabase db push \--project-ref PROD_REF apos aprovacao manual no GitHub           | Master / CI/CD               |
| 8 --- Monitorar           | Verificar logs do Supabase e metricas de latencia por 30 minutos pos-deploy                   | Dev de plantao               |

## 17.4 Regras Criticas de Migration {#regras-criticas-de-migration}

- Toda nova tabela deve incluir na propria migration: RLS habilitado, politicas de SELECT/INSERT/UPDATE/DELETE e indices necessarios --- nunca criar tabela sem RLS

- Migrations destrutivas (DROP TABLE, DROP COLUMN) exigem: migration de backup de dados antes, periodo de deprecacao de 1 sprint, e aprovacao do Master

- Adicionar coluna NOT NULL em tabela com dados existentes: sempre adicionar primeiro como nullable, popular os dados, depois adicionar constraint NOT NULL em migration separada

- Nunca usar CASCADE em DROP em producao sem revisao explicita de impacto

- Indices criados com CREATE INDEX CONCURRENTLY para nao bloquear tabelas em producao

- Migration de rollback documentada para qualquer migration critica: arquivo rollback_TIMESTAMP.sql no mesmo PR

## 17.5 Indices Obrigatorios (Performance) {#indices-obrigatorios-performance}

| **Tabela**          | **Indice**                                | **Justificativa**                                       |
|---------------------|-------------------------------------------|---------------------------------------------------------|
| cotas               | (tenant_id, bolao_id)                     | Todas as queries de listagem filtram por tenant + bolao |
| cotas               | (numero_celular, tenant_id)               | Busca do portal do participante                         |
| cotas               | (bolao_id, total_acertos_acumulados DESC) | Ranking --- query mais frequente do sistema             |
| acertos_por_sorteio | (cota_id, sorteio_id)                     | JOIN critico no calculo de acertos                      |
| acertos_por_sorteio | (sorteio_id, tenant_id)                   | Processamento em lote por sorteio                       |
| premios             | (bolao_id, status_pagamento)              | Dashboard de premios pendentes                          |
| mensagens_whatsapp  | (tenant_id, status_envio, criado_em)      | Fila de reenvio e historico                             |
| test_runs           | (status, criado_em DESC)                  | Painel de testes --- ultima execucao                    |
| audit_logs          | (tenant_id, criado_em DESC)               | Consulta de auditoria por periodo                       |

# 18. Setup de Ambiente Local e Onboarding de Desenvolvedores {#setup-de-ambiente-local-e-onboarding-de-desenvolvedores}

Esta secao descreve o processo completo para um desenvolvedor --- humano ou agente de IA --- configurar o ambiente local e comecar a contribuir. O objetivo e que qualquer dev consiga ter o projeto rodando do zero em menos de 30 minutos.

## 18.1 Pre-requisitos {#pre-requisitos}

| **Ferramenta**        | **Versao Minima** | **Instalacao**                                                          |
|-----------------------|-------------------|-------------------------------------------------------------------------|
| Node.js               | 22.x LTS          | nvm install 22 (usar nvm para gerenciar versoes)                        |
| npm                   | 10.x              | Incluido com Node.js                                                    |
| Docker Desktop        | 26.x              | docker.com/get-started --- necessario para Supabase local e Redis local |
| Supabase CLI          | 1.x               | npm install -g supabase                                                 |
| Git                   | 2.40+             | git-scm.com                                                             |
| VS Code (recomendado) | Qualquer          | Com extensoes: Angular Language Service, ESLint, Prettier, REST Client  |

## 18.2 Passo a Passo de Setup {#passo-a-passo-de-setup}

| **Passo** | **Comando / Acao**                                              | **Observacao**                                                                                                                   |
|-----------|-----------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| 1         | git clone https://github.com/org/nosso-bolao && cd nosso-bolao  | Clonar o repositorio                                                                                                             |
| 2         | cp .env.example .env.local                                      | Criar arquivo de variaveis locais a partir do exemplo documentado                                                                |
| 3         | supabase start                                                  | Sobe instancia local do Supabase (PostgreSQL + Auth + Storage + Realtime) via Docker. Aguardar URL e chaves exibidas no terminal |
| 4         | Copiar as chaves exibidas pelo supabase start para o .env.local | SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_KEY locais                                                                    |
| 5         | supabase db reset                                               | Aplica todas as migrations e seeds de dados de desenvolvimento. Banco zerado e populado                                          |
| 6         | docker compose up redis -d                                      | Sobe instancia local do Redis para o BullMQ                                                                                      |
| 7         | cd apps/backend && npm ci                                       | Instala dependencias do NestJS                                                                                                   |
| 8         | cd apps/backend && npm run start:dev                            | NestJS em modo watch. API disponivel em http://localhost:3000                                                                    |
| 9         | cd apps/frontend && npm ci                                      | Instala dependencias do Angular                                                                                                  |
| 10        | cd apps/frontend && npm run start                               | Angular em modo dev. App disponivel em http://localhost:4200                                                                     |
| 11        | Acessar http://localhost:4200                                   | Login com credenciais do seed: master@nossobolao.dev / Senha123!                                                                 |

## 18.3 Estrutura do Monorepo (Nx) {#estrutura-do-monorepo-nx}

| **Caminho**                     | **Conteudo**                                                                          |
|---------------------------------|---------------------------------------------------------------------------------------|
| apps/backend/                   | Aplicacao NestJS --- API e workers BullMQ                                             |
| apps/frontend/                  | Aplicacao Angular 21                                                                  |
| apps/backend/src/modules/       | Modulos NestJS por dominio: bolao, sorteio, premio, auth, tenant, whatsapp, relatorio |
| apps/frontend/src/app/features/ | Features Angular por dominio: matching com modulos do backend                         |
| libs/shared-types/              | Tipos TypeScript e DTOs compartilhados entre frontend e backend (gerados do OpenAPI)  |
| libs/shared-utils/              | Funcoes utilitarias puras sem dependencias de framework                               |
| supabase/migrations/            | Todas as migrations SQL em ordem cronologica                                          |
| supabase/seed.sql               | Dados de seed para ambiente de desenvolvimento                                        |
| supabase/seed.test.sql          | Dados de seed especificos para testes de integracao                                   |
| .github/workflows/              | Pipelines CI/CD: tests.yml, deploy-staging.yml, deploy-prod.yml                       |
| docs/                           | ADRs, guias de contribuicao e diagramas                                               |
| docs/adr/                       | Architecture Decision Records numerados                                               |

## 18.4 Variaveis de Ambiente --- Referencia Completa {#variaveis-de-ambiente-referencia-completa}

| **Variavel**            | **Ambiente**       | **Descricao**                                        | **Exemplo**                          |
|-------------------------|--------------------|------------------------------------------------------|--------------------------------------|
| SUPABASE_URL            | Backend + Frontend | URL da instancia Supabase                            | http://localhost:54321 (local)       |
| SUPABASE_ANON_KEY       | Frontend           | Chave publica; usada no Angular para Auth e Realtime | eyJh\...                             |
| SUPABASE_SERVICE_KEY    | Backend APENAS     | Chave de admin; nunca exposta no frontend            | eyJh\...                             |
| REDIS_URL               | Backend            | URL do Redis para BullMQ                             | redis://localhost:6379               |
| GITHUB_WEBHOOK_SECRET   | Backend            | Secret HMAC para validar webhooks do GitHub Actions  | string-aleatoria-32chars             |
| GITHUB_TOKEN            | Backend            | Token para disparar workflows via API                | ghp\_\...                            |
| GITHUB_REPO             | Backend            | Repositorio para dispatch: org/nosso-bolao           | org/nosso-bolao                      |
| WHATSAPP_SESSION_SECRET | Backend            | Chave para criptografar sessoes WhatsApp             | string-aleatoria-64chars             |
| APP_ENV                 | Backend + Frontend | Ambiente atual                                       | local \| staging \| production       |
| LOG_LEVEL               | Backend            | Nivel de log                                         | debug (local) \| info (staging/prod) |
| FRONTEND_URL            | Backend            | URL do frontend para CORS                            | http://localhost:4200                |

## 18.5 Dados de Seed para Desenvolvimento {#dados-de-seed-para-desenvolvimento}

O arquivo supabase/seed.sql popula o banco local com dados de desenvolvimento suficientes para trabalhar em todas as features sem precisar criar dados manualmente:

- 1 tenant ativo: \'Nosso Bolao CG\' (slug: nosso-bolao-cg)

- 1 usuario Master: master@nossobolao.dev / Senha123!

- 1 usuario Admin: admin@nossobolao.dev / Senha123!

- 1 bolao EM_ANDAMENTO com 5 categorias de premiacao configuradas

- 50 cotas ativas com palpites e acertos ja calculados (baseados nos dados reais das planilhas)

- 6 sorteios registrados (os concursos 2994 a 2999 dos dados reais)

- 1 grupo WhatsApp mockado

- Dados suficientes para renderizar ranking, premios e portal do participante sem erros

## 18.6 Comandos Uteis do Dia a Dia {#comandos-uteis-do-dia-a-dia}

| **Acao**                                       | **Comando**                                 |
|------------------------------------------------|---------------------------------------------|
| Resetar banco local (aplica migrations + seed) | supabase db reset                           |
| Criar nova migration                           | supabase migration new nome_da_migration    |
| Ver diff entre schema local e banco            | supabase db diff                            |
| Rodar todos os testes unitarios (backend)      | cd apps/backend && npm test                 |
| Rodar testes com coverage                      | cd apps/backend && npm run test:cov         |
| Rodar testes de integracao                     | cd apps/backend && npm run test:integration |
| Rodar E2E                                      | cd apps/frontend && npm run e2e             |
| Lint + format (ambos)                          | npm run lint && npm run format              |
| Gerar tipos do OpenAPI                         | npm run generate:types                      |
| Ver filas BullMQ (interface visual)            | http://localhost:3000/queues (Bull Board)   |
| Ver logs do Supabase local                     | supabase logs                               |
| Parar todos os servicos locais                 | supabase stop && docker compose down        |

# 19. Plano de Migracao de Dados (Planilhas → Sistema) {#plano-de-migracao-de-dados-planilhas-sistema}

O bolao atual possui 9.244 cotas, 6 sorteios e premiados ja definidos, todos gerenciados em planilhas Excel/PDF. A migracao deve ser feita com zero perda de dados, validacao completa e possibilidade de rollback. O sistema novo nao substitui a planilha de um dia para o outro --- ha um periodo de operacao paralela.

## 19.1 Fases da Migracao {#fases-da-migracao}

| **Fase**                    | **Descricao**                                                                                                                                   | **Duracao Estimada**         | **Criterio de Saida**                                                          |
|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------|--------------------------------------------------------------------------------|
| 0 --- Preparacao            | Mapear todos os campos das planilhas para as colunas do banco; identificar inconsistencias e dados faltantes (ex: cotas sem celular cadastrado) | 1 semana                     | Mapeamento 100% documentado; lista de inconsistencias resolvidas               |
| 1 --- Script de Import      | Desenvolver e testar script de importacao CSV → banco com validacoes completas                                                                  | 1 semana                     | Script importa 100% dos dados do seed de teste sem erro                        |
| 2 --- Importacao em Staging | Importar os dados reais do bolao atual no ambiente de staging; validar integridade                                                              | 3 dias                       | Contagens batem: 9.244 cotas, 6 sorteios, acertos corretos, premiados corretos |
| 3 --- Operacao Paralela     | Sistema novo rodando em staging com dados reais; planilha continua sendo a oficial                                                              | 2 semanas                    | Admin valida dados visualmente; nenhuma divergencia encontrada                 |
| 4 --- Cutover               | Importacao final no banco de producao; sistema novo vira o oficial; planilha fica como backup somente leitura                                   | 1 dia (janela de manutencao) | Todos os dados validados; Admin logado e operando no sistema novo              |
| 5 --- Pos-migracao          | Monitoramento intensivo por 2 semanas; suporte ao Admin para adaptacao                                                                          | 2 semanas                    | Zero incidentes criticos; Admin operando com autonomia                         |

## 19.2 Script de Importacao {#script-de-importacao}

- Localizado em: tools/import/import-bolao.ts --- script TypeScript standalone executado via ts-node

- Entrada: arquivo CSV exportado da planilha Excel, com colunas mapeadas e documentadas

- Validacoes antes de inserir cada registro: palpites validos (10 numeros, 01-60, sem repeticao); acertos consistentes com os sorteios; status de pagamento valido

- Modo dry-run (\--dry-run): valida todos os dados sem inserir nada no banco --- obrigatorio rodar antes do import real

- Log detalhado: arquivo import_TIMESTAMP.log com cada linha processada, validacoes aplicadas e eventuais erros

- Transacional: toda a importacao dentro de uma unica transaction PostgreSQL --- se qualquer linha falhar, rollback automatico de tudo

- Idempotente: re-executar o script com os mesmos dados nao cria duplicatas (upsert por numero sequencial + bolao_id)

## 19.3 Mapeamento de Campos Planilha → Banco {#mapeamento-de-campos-planilha-banco}

| **Campo na Planilha**                     | **Coluna no Banco**            | **Transformacao / Observacao**                                                        |
|-------------------------------------------|--------------------------------|---------------------------------------------------------------------------------------|
| No (numero sequencial)                    | cotas.numero_sequencial        | Inteiro direto; validar unicidade por bolao                                           |
| IDENTIFICACAO DO PARTICIPANTE             | cotas.nome_identificacao       | Texto; trim de espacos                                                                |
| ATIVO (SIM/NOU)                           | cotas.status_pagamento         | SIM → PAGO; NAO → INATIVO                                                             |
| PALPITES DE 10 NUMEROS (ex: 01 05 10\...) | cotas.palpites                 | Parsear string para INTEGER\[\]; validar 10 elementos, ordenar crescente              |
| ACERTOS                                   | cotas.total_acertos_acumulados | Inteiro; validar contra recalculo dos sorteios                                        |
| RESULTADO                                 | cotas.status_resultado         | Mapear texto para ENUM                                                                |
| PREMIACAO                                 | premios.valor_por_ganhador     | Decimal; vincular ao registro de Premio correspondente                                |
| Celular (nao existe na planilha atual)    | cotas.numero_celular           | CAMPO FALTANTE: Admin deve preencher antes da migracao ou usar placeholder temporario |

| **ATENCAO --- Campo celular faltante: a planilha atual nao possui numero de celular dos participantes. O Admin deve coletar esses dados antes da migracao para que o portal do participante funcione. Estrategia sugerida: migrar sem celular (campo nullable temporariamente), Admin preenche os celulares no sistema novo, depois tornar o campo obrigatorio via migration.** |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## 19.4 Validacoes Pos-Migracao {#validacoes-pos-migracao}

- Contagem de registros: total de cotas importadas deve ser exatamente 9.244

- Recalculo de acertos: rodar o job de calculo de acertos para todos os 6 sorteios e comparar com os valores da planilha --- tolerancia zero

- Validacao de premiados: os 39 ganhadores listados na planilha devem existir no banco com os valores corretos

- Validacao financeira: valor bruto arrecadado calculado pelo sistema (cotas_ativas x R\$ 30) deve ser R\$ 277.320,00

- Teste do portal: buscar pelo celular de 5 participantes cadastrados e verificar que os dados exibidos batem com a planilha

# 20. Estrategia de Tratamento de Erros {#estrategia-de-tratamento-de-erros}

Uma estrategia uniforme de erros e fundamental para debugging, experiencia do usuario e coordenacao entre agentes. Todo erro no sistema --- de validacao, de negocio, de infraestrutura --- deve seguir o mesmo formato e o mesmo fluxo de tratamento.

## 20.1 Formato Padrao de Resposta de Erro (API) {#formato-padrao-de-resposta-de-erro-api}

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Todas as respostas de erro da API devem seguir este formato JSON:</strong></p>
<p>{</p>
<p>'statusCode': 422,</p>
<p>'error': 'VALIDATION_ERROR',</p>
<p>'message': 'Os palpites informados sao invalidos.',</p>
<p>'details': [</p>
<p>{ 'field': 'palpites', 'code': 'INVALID_COUNT', 'message': 'Deve conter exatamente 10 numeros.' },</p>
<p>{ 'field': 'palpites[2]', 'code': 'OUT_OF_RANGE', 'message': 'Numero 65 fora do intervalo 01-60.' }</p>
<p>],</p>
<p>'requestId': 'uuid-da-requisicao',</p>
<p>'timestamp': '2026-04-27T12:00:00Z'</p>
<p>}</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 20.2 Catalogo de Codigos de Erro {#catalogo-de-codigos-de-erro}

| **Codigo de Erro**      | **HTTP Status** | **Descricao**                | **Quando Usar**                                                     |
|-------------------------|-----------------|------------------------------|---------------------------------------------------------------------|
| VALIDATION_ERROR        | 422             | Dados de entrada invalidos   | Palpites, percentuais, campos obrigatorios                          |
| BUSINESS_RULE_VIOLATION | 422             | Regra de negocio violada     | Soma != 100%, cota inativa tentando receber premio                  |
| RESOURCE_NOT_FOUND      | 404             | Recurso nao encontrado       | Bolao, cota ou tenant nao existe                                    |
| UNAUTHORIZED            | 401             | Sem autenticacao             | JWT ausente, expirado ou invalido                                   |
| FORBIDDEN               | 403             | Sem permissao                | Admin tentando acessar outro tenant; papel insuficiente             |
| CONFLICT                | 409             | Conflito de estado           | Tentar registrar sorteio ja existente; numero de concurso duplicado |
| BOLAO_ALREADY_FINISHED  | 422             | Bolao ja encerrado           | Tentativa de acao em bolao FINALIZADO                               |
| INVALID_SORTEIO_NUMBERS | 422             | Numeros do sorteio invalidos | Bolas fora do intervalo ou repetidas                                |
| PERCENTUAL_SUM_INVALID  | 422             | Soma de percentuais != 100%  | Criacao de bolao com configuracao invalida                          |
| TENANT_SUSPENDED        | 403             | Tenant suspenso              | Acoes bloqueadas para tenant com status SUSPENSO                    |
| RATE_LIMIT_EXCEEDED     | 429             | Rate limit atingido          | Com header Retry-After indicando quando tentar novamente            |
| INTERNAL_ERROR          | 500             | Erro interno inesperado      | Nunca expor detalhes tecnicos; logar internamente com requestId     |

## 20.3 Implementacao no NestJS {#implementacao-no-nestjs}

- Global Exception Filter: captura todas as excecoes nao tratadas e as formata no padrao acima; registrado como APP_FILTER no AppModule

- Excecoes de dominio customizadas: criar classes BolaoNotFoundException, PercentualSumInvalidException etc. estendendo HttpException --- nunca lancar Error generico nos services

- ValidationPipe global com exceptionFactory customizado: transforma erros do class-validator para o formato padrao com campo details\[\]

- requestId: gerado por middleware no inicio de cada requisicao (UUID v4), injetado no contexto e retornado em todo erro --- permite correlacionar log com resposta de erro

- Erros 500: logar o stack trace completo internamente com o requestId; retornar ao cliente apenas \'Erro interno. Referencia: {requestId}\' --- nunca expor stack trace em producao

- Erros do Supabase: interceptar erros do SDK e mapear para excecoes de dominio antes de propagar

## 20.4 Tratamento de Erros no Angular {#tratamento-de-erros-no-angular}

- Global Error Handler: implementar ErrorHandler customizado que captura erros nao tratados, loga no servico de monitoramento e exibe toast de erro generico

- HTTP Interceptor de erros: interceptar todas as respostas de erro da API; mapear statusCode para mensagem amigavel; redirecionar para login em 401; exibir toast em 422/403

- Error Boundaries por feature: cada feature module trata seus proprios erros de forma contextual --- erro ao carregar ranking nao deve derrubar o dashboard inteiro

- Retry automatico: erros de rede (0, 504) fazem retry automatico com backoff exponencial (1s, 2s, 4s) --- maximo 3 tentativas

- Mensagens de erro para o usuario: sempre em portugues, sem jargao tecnico, com acao sugerida quando possivel (\'Tente novamente\' ou \'Entre em contato com o suporte\')

- Formularios: erros de validacao exibidos inline no campo correspondente usando o campo field dos details\[\] da resposta de erro

## 20.5 Tratamento de Erros em Jobs BullMQ {#tratamento-de-erros-em-jobs-bullmq}

- Cada worker define onFailed(): logar erro com jobId, payload e stack trace; atualizar status na tabela correspondente se necessario

- Dead Letter Queue: jobs que falharam 3 vezes sao movidos para fila separada dead_letter; gerar alerta para o Admin

- Erros transitorios vs permanentes: distinguir erros de rede (retry automatico) de erros de dados invalidos (mover direto para dead letter sem retry)

- Job de calculo de acertos: erro em uma cota nao deve abortar o processamento das demais --- processar tudo, coletar erros, reportar ao final

# 21. Documentacao de API (OpenAPI / Swagger) {#documentacao-de-api-openapi-swagger}

A documentacao de API e o contrato oficial entre o agente de backend e o agente de frontend. Todo endpoint deve estar documentado antes de ser implementado (API-first), e a documentacao deve ser gerada automaticamente pelo NestJS para garantir que nunca fique desatualizada.

## 21.1 Configuracao do Swagger no NestJS {#configuracao-do-swagger-no-nestjs}

- Usar @nestjs/swagger com decoradores @ApiTags, @ApiOperation, @ApiResponse, @ApiBearerAuth em todos os controllers e DTOs

- Swagger UI disponivel em /api/docs (apenas em local e staging; desabilitado em producao)

- Exportar OpenAPI JSON em /api/docs-json --- usado para geracao de tipos no frontend

- Versionar a API: prefixo /api/v1 em todas as rotas --- facilita evolucao sem quebrar clientes existentes

- Documentar todos os codigos de resposta possiveis por endpoint: 200, 201, 400, 401, 403, 404, 422, 429, 500

## 21.2 Geracao de Tipos Compartilhados {#geracao-de-tipos-compartilhados}

- Script npm run generate:types no package.json raiz: executa openapi-generator-cli apontando para /api/docs-json e gera tipos TypeScript em libs/shared-types/

- Tipos gerados sao importados diretamente no Angular: os services do frontend consomem as interfaces geradas --- zero tipos duplicados

- Executar generate:types no CI apos cada build do backend: se os tipos mudarem, o PR do frontend correspondente deve ser aberto junto

- DTOs de request e response documentados com @ApiProperty em cada campo: tipo, descricao, exemplo e se e obrigatorio

## 21.3 Endpoints por Modulo --- Referencia {#endpoints-por-modulo-referencia}

| **Modulo** | **Metodo** | **Rota**                              | **Papel**      | **Descricao Resumida**                        |
|------------|------------|---------------------------------------|----------------|-----------------------------------------------|
| Auth       | POST       | /api/v1/auth/otp                      | Publico        | Solicitar OTP para portal do participante     |
| Tenant     | GET        | /api/v1/tenants                       | MASTER         | Listar todos os tenants                       |
| Tenant     | POST       | /api/v1/tenants                       | MASTER         | Criar novo tenant                             |
| Tenant     | PATCH      | /api/v1/tenants/:id                   | MASTER         | Atualizar tenant                              |
| Bolao      | GET        | /api/v1/bolaes                        | ADMIN          | Listar boloes do tenant autenticado           |
| Bolao      | POST       | /api/v1/bolaes                        | ADMIN          | Criar bolao com categorias livres             |
| Bolao      | GET        | /api/v1/bolaes/:id                    | ADMIN          | Detalhe de um bolao                           |
| Cota       | GET        | /api/v1/bolaes/:id/cotas              | ADMIN          | Listar cotas do bolao                         |
| Cota       | POST       | /api/v1/bolaes/:id/cotas              | ADMIN          | Criar cota com palpites                       |
| Cota       | PATCH      | /api/v1/cotas/:id/confirmar-pagamento | ADMIN          | Confirmar pagamento da cota                   |
| Sorteio    | POST       | /api/v1/bolaes/:id/sorteios           | ADMIN          | Registrar sorteio e disparar calculo          |
| Premio     | GET        | /api/v1/bolaes/:id/premios            | ADMIN          | Listar premios do bolao                       |
| Premio     | PATCH      | /api/v1/premios/:id/pagar             | ADMIN          | Marcar premio como pago                       |
| Ranking    | GET        | /api/v1/bolaes/:id/ranking            | ADMIN + Portal | Ranking completo do bolao                     |
| Portal     | GET        | /api/v1/portal/participante           | OTP            | Dados do participante autenticado             |
| WhatsApp   | POST       | /api/v1/whatsapp/mensagens            | ADMIN          | Enviar mensagem manual                        |
| Relatorio  | POST       | /api/v1/bolaes/:id/relatorios         | ADMIN          | Gerar e salvar relatorio no Storage           |
| CI         | POST       | /api/v1/internal/test-results         | Webhook (HMAC) | Receber resultado de testes do GitHub Actions |
| CI         | POST       | /api/v1/internal/trigger-tests        | MASTER         | Disparar testes via GitHub Actions API        |

# 22. Git Workflow e Padroes de Codigo {#git-workflow-e-padroes-de-codigo}

Padroes de trabalho com git sao essenciais quando multiplos agentes trabalham em paralelo. Sem convencoes claras, branches conflitam, historico fica ilegivel e o CI quebra por razoes evitaveis.

## 22.1 Estrategia de Branches {#estrategia-de-branches}

| **Branch**                | **Protecao**         | **Proposito**                         | **Regra**                                                   |
|---------------------------|----------------------|---------------------------------------|-------------------------------------------------------------|
| main                      | Totalmente protegida | Codigo em producao; sempre deployavel | Apenas via PR aprovado + CI verde + aprovacao manual        |
| staging                   | Protegida            | Espelho do ambiente de staging        | Merge automatico de develop apos CI verde                   |
| develop                   | Protegida            | Integracao continua das features      | Apenas via PR; CI deve passar                               |
| feature/TASK-ID-descricao | Livre                | Nova funcionalidade                   | Criada a partir de develop; ex: feature/BOLT-42-criar-bolao |
| fix/TASK-ID-descricao     | Livre                | Correcao de bug em develop            | ex: fix/BOLT-99-calculo-acertos-arredondamento              |
| hotfix/TASK-ID-descricao  | Livre                | Correcao urgente em producao          | Criada a partir de main; PR para main E develop             |
| migration/descricao       | Livre                | Migration de banco isolada            | Revisao obrigatoria antes do merge                          |

## 22.2 Convencao de Commits (Conventional Commits) {#convencao-de-commits-conventional-commits}

Todos os commits devem seguir o padrao Conventional Commits. Isso permite geracao automatica de changelog e versionamento semantico.

| **Tipo**  | **Quando Usar**                      | **Exemplo**                                                                 |
|-----------|--------------------------------------|-----------------------------------------------------------------------------|
| feat      | Nova funcionalidade                  | feat(bolao): adicionar validacao de soma de percentuais                     |
| fix       | Correcao de bug                      | fix(calculo): corrigir arredondamento na divisao de premios                 |
| refactor  | Refatoracao sem mudar comportamento  | refactor(auth): extrair logica de OTP para servico separado                 |
| test      | Adicionar ou corrigir testes         | test(premio): adicionar caso de 22 ganhadores com divisao exata             |
| docs      | Documentacao                         | docs(api): adicionar exemplos de resposta no swagger do endpoint de sorteio |
| chore     | Tarefas de manutencao (deps, config) | chore(deps): atualizar @nestjs/swagger para 7.4.0                           |
| migration | Migration de banco                   | migration: criar tabela categoria_premiacao com indices e RLS               |
| security  | Correcao de seguranca                | security(auth): adicionar rate limiting no endpoint de OTP                  |
| perf      | Melhoria de performance              | perf(ranking): adicionar cache Redis para ranking do bolao                  |

## 22.3 Processo de Pull Request {#processo-de-pull-request}

- Todo PR deve referenciar uma task: \'\[FEAT-42\] Criar bolao com premiacoes livres\'

- Descricao obrigatoria no PR: O que foi feito, Por que foi feito, Como testar, Screenshots se envolver UI

- Checklist obrigatorio no PR (template no repositorio): testes adicionados/atualizados, Swagger documentado, migration incluida se necessario, sem secrets no codigo, sem console.log em producao

- Code review por ao menos 1 desenvolvedor: foco em logica de negocio, seguranca (RLS, validacoes), testes e convencoes

- CI deve estar verde antes do merge: lint, testes unitarios, testes de integracao e build

- Squash merge para features: historico limpo na branch principal; commit message segue Conventional Commits

- Deletar branch apos merge: configuracao automatica no GitHub

## 22.4 Configuracao de Qualidade de Codigo {#configuracao-de-qualidade-de-codigo}

| **Ferramenta**               | **Proposito**                      | **Configuracao**                                                                                           |
|------------------------------|------------------------------------|------------------------------------------------------------------------------------------------------------|
| ESLint                       | Linting TypeScript                 | @typescript-eslint/recommended + regras customizadas; proibir any implicito, console.log, imports ciclicos |
| Prettier                     | Formatacao automatica              | Integrado ao ESLint; semicolons, aspas simples, trailing comma, print width 100                            |
| Husky                        | Git hooks locais                   | pre-commit: lint-staged (lint + format nos arquivos alterados); commit-msg: validar Conventional Commits   |
| lint-staged                  | Lint apenas nos arquivos do commit | Nao reprocessar o projeto inteiro a cada commit; apenas os arquivos alterados                              |
| TypeScript strict mode       | Tipagem rigorosa                   | strict: true em todos os tsconfig; noImplicitAny, strictNullChecks, noUncheckedIndexedAccess               |
| Nx enforce-module-boundaries | Arquitetura de imports             | Frontend nao importa diretamente do backend; apenas de libs/shared-\*                                      |

# 23. Observabilidade Completa {#observabilidade-completa}

Observabilidade e a capacidade de entender o estado interno do sistema a partir de seus outputs externos. Tres pilares: Logs (o que aconteceu), Metricas (quanta vezes e com qual performance) e Traces (como uma requisicao fluiu pelo sistema).

## 23.1 Logging Estruturado {#logging-estruturado}

- Biblioteca: Pino (NestJS) --- logging estruturado em JSON, alta performance, redaction automatico de campos sensiveis

- Campos obrigatorios em todo log: timestamp, level, requestId, tenantId, modulo, mensagem

- Campos proibidos em logs: senha, token JWT completo, numero de celular, valor de premio

- Niveis de log: ERROR (falhas que precisam de atencao imediata), WARN (anomalias nao criticas), INFO (eventos de negocio importantes), DEBUG (apenas local/staging)

- Eventos de negocio sempre logados em INFO: sorteio registrado, bolao encerrado, premio marcado como pago, mensagem WhatsApp enviada, tenant criado

- Destino logs: FASE 0 --- Logtail Free ou Fly.io logs nativos. FASE 1 (primeiro tenant pagante) --- Logtail Starter com 30 dias de retencao. Nunca configurar Datadog ou Grafana pago antes do gatilho da secao 30.4.

## 23.2 Metricas {#metricas}

- Biblioteca: @willsoto/nestjs-prometheus --- expoe metricas no endpoint /metrics para coleta pelo Prometheus

| **Metrica**                        | **Tipo**  | **Descricao**                                              |
|------------------------------------|-----------|------------------------------------------------------------|
| http_requests_total                | Counter   | Total de requisicoes por metodo, rota e status code        |
| http_request_duration_seconds      | Histogram | Latencia por rota --- permite calcular P50, P95, P99       |
| bolao_sorteios_processados_total   | Counter   | Total de sorteios registrados com sucesso                  |
| bolao_acertos_job_duration_seconds | Histogram | Tempo do job de calculo de acertos por quantidade de cotas |
| whatsapp_mensagens_enviadas_total  | Counter   | Mensagens WhatsApp por status (ENVIADO/FALHA) e tenant     |
| bullmq_jobs_active                 | Gauge     | Jobs em processamento por fila (calculo_acertos, whatsapp) |
| bullmq_jobs_failed_total           | Counter   | Jobs falhados por fila --- alerta se \> 0 em 5 minutos     |
| supabase_query_duration_seconds    | Histogram | Latencia das principais queries por operacao               |

## 23.3 Distributed Tracing {#distributed-tracing}

- Biblioteca: OpenTelemetry SDK (@opentelemetry/sdk-node) com exportador para Jaeger ou Grafana Tempo

- Span automatico por request HTTP no NestJS (via @opentelemetry/instrumentation-nestjs-core)

- Span manual nos pontos criticos: inicio e fim do job de calculo de acertos, envio de mensagem WhatsApp, queries ao Supabase

- requestId propagado como trace ID --- correlaciona o log do Angular com o trace do NestJS e o job do BullMQ

- Permite responder: \'Esse sorteio demorou 8 segundos --- qual parte foi mais lenta?\'

## 23.4 Alertas e SLAs {#alertas-e-slas}

| **Alerta**                     | **Condicao**                                         | **Severidade** | **Acao**                                         |
|--------------------------------|------------------------------------------------------|----------------|--------------------------------------------------|
| Alta taxa de erro              | HTTP 5xx \> 1% das requests em 5 minutos             | CRITICO        | Notificar on-call imediatamente; investigar logs |
| Latencia alta                  | P99 \> 3 segundos em qualquer rota por 10 minutos    | ALTO           | Investigar queries lentas e cache                |
| Job de acertos travado         | Job calculo_acertos com status ACTIVE \> 60 segundos | ALTO           | Verificar workers BullMQ e Redis                 |
| WhatsApp desconectado          | Sessao whatsapp-web.js offline por mais de 5 minutos | MEDIO          | Notificar Admin do tenant por email              |
| Muitos jobs falhados           | bullmq_jobs_failed_total \> 10 em 30 minutos         | MEDIO          | Verificar dead letter queue e logs dos workers   |
| Uso de CPU/Memoria             | CPU \> 85% ou Memoria \> 90% por 15 minutos          | MEDIO          | Escalar horizontalmente ou investigar leak       |
| Falha de autenticacao em massa | 401/403 \> 50 por minuto                             | ALTO           | Possivel ataque; verificar IPs de origem         |
| Supabase indisponivel          | Timeout nas queries por mais de 2 minutos            | CRITICO        | Ativar plano de contingencia; notificar usuarios |

## 23.5 Dashboard Operacional {#dashboard-operacional}

Dashboard no Grafana (ou ferramenta equivalente) com paineis para o time tecnico:

- Painel de saude: status de cada servico (API, BullMQ, Supabase, WhatsApp por tenant) com semaforo verde/amarelo/vermelho

- Painel de negocio: cotas vendidas por hora, sorteios registrados, premios pagos, mensagens enviadas --- metricas que mostram que o sistema esta sendo usado

- Painel de performance: latencia P50/P95/P99 por endpoint, duracao media dos jobs, queries mais lentas

- Painel de erros: taxa de erro por modulo, top 10 erros mais frequentes, jobs na dead letter queue

# 24. Estrategia de Cache {#estrategia-de-cache}

Cache reduz carga no Supabase, melhora latencia e e essencial para suportar picos de acesso (ex: varios participantes acessando o portal simultaneamente apos um sorteio ser registrado). O Redis ja esta na infraestrutura para o BullMQ --- aproveitar a mesma instancia para cache.

## 24.1 O que Cachear e por Quanto Tempo {#o-que-cachear-e-por-quanto-tempo}

| **Dado**                                          | **TTL**        | **Estrategia de Invalidacao**                        | **Justificativa**                                    |
|---------------------------------------------------|----------------|------------------------------------------------------|------------------------------------------------------|
| Ranking do bolao (lista ordenada por acertos)     | 5 minutos      | Invalidar apos job de calculo concluir               | Query mais cara do sistema; muda apenas apos sorteio |
| Distribuicao de acertos por faixa                 | 5 minutos      | Invalidar apos job de calculo concluir               | Agregacao pesada; muda apenas apos sorteio           |
| Dados do bolao (status, arrecadacao, config)      | 10 minutos     | Invalidar ao salvar bolao                            | Muda raramente; muito acessado no portal             |
| Dados do participante no portal (cotas, palpites) | 2 minutos      | Invalidar ao confirmar pagamento ou calcular acertos | Acessado por celular; muda apos acoes do Admin       |
| Configuracao do tenant (branding, percentuais)    | 60 minutos     | Invalidar ao editar tenant                           | Muda raramente; lida em todo request                 |
| Resultado do ultimo sorteio                       | 10 minutos     | Nao invalidar (imutavel)                             | Historico nao muda                                   |
| Sessao do usuario (JWT payload)                   | Duracao do JWT | Invalidar no logout                                  | Evitar re-parse do JWT a cada request                |

## 24.2 Implementacao {#implementacao}

- Decorador @Cacheable() customizado no NestJS: wrapa o metodo do service, verifica cache antes de executar, salva resultado no Redis com TTL

- Chave de cache sempre inclui tenant_id para isolamento: \'ranking:{tenant_id}:{bolao_id}\'

- Cache-aside pattern: aplicacao verifica cache → miss → busca no Supabase → salva no cache → retorna

- Cache no nivel do NestJS, nao do Supabase: evitar dependencia de features pagas do Supabase para cache

- Invalidacao por tag: ao encerrar um bolao, invalidar todas as chaves com prefixo \'{tenant_id}:{bolao_id}:\*\'

- Nunca cachear dados de escrita (POST/PATCH/DELETE): apenas leitura (GET)

- Monitorar hit rate do cache: se \< 60% em producao, revisar TTLs e estrategia de invalidacao

# 25. Gestao de Releases e Versionamento {#gestao-de-releases-e-versionamento}

## 25.1 Semantic Versioning (SemVer) {#semantic-versioning-semver}

- Formato: MAJOR.MINOR.PATCH (ex: 1.3.2)

- PATCH: correcao de bug sem quebrar compatibilidade (fix commits)

- MINOR: nova funcionalidade retrocompativel (feat commits)

- MAJOR: mudanca que quebra compatibilidade de API ou comportamento critico

- Versao inicial do sistema: 0.1.0 --- indica que ainda esta em desenvolvimento ativo antes do primeiro release publico

## 25.2 Release Automatizado {#release-automatizado}

- Ferramenta: semantic-release --- analisa os commits desde o ultimo tag e determina automaticamente o proximo numero de versao

- Executado no CI apos merge na main: gera tag git, cria GitHub Release, gera CHANGELOG.md e publica a versao

- CHANGELOG.md gerado automaticamente a partir dos commits Conventional Commits --- separado por feat, fix, security, perf

- Imagens Docker tagueadas com a versao: nosso-bolao-api:1.3.2 e nosso-bolao-api:latest

## 25.3 Processo de Hotfix {#processo-de-hotfix}

| **Etapa**                   | **Acao**                                                                              |
|-----------------------------|---------------------------------------------------------------------------------------|
| 1 --- Identificar           | Incidente critico em producao identificado via alerta ou relato                       |
| 2 --- Branch                | Criar hotfix/TASK-ID-descricao a partir da tag de producao atual (nao de develop)     |
| 3 --- Corrigir              | Implementar correcao minima; adicionar teste que reproduz o bug                       |
| 4 --- PR para main          | PR com aprovacao express de 1 revisor; CI deve passar                                 |
| 5 --- Deploy em producao    | Merge na main dispara deploy automatico; monitorar por 30 minutos                     |
| 6 --- Backport para develop | Abrir segundo PR do mesmo hotfix para develop; evitar regressao futura                |
| 7 --- Post-mortem           | Documento em docs/postmortems/ descrevendo: causa raiz, impacto, correcao e prevencao |

# 26. Acessibilidade (A11y) {#acessibilidade-a11y}

O portal do participante e uma tela publica acessada por qualquer pessoa via celular. A conformidade com WCAG 2.1 nivel AA e obrigatoria para garantir inclusao e evitar riscos legais (Lei Brasileira de Inclusao, Art. 63).

## 26.1 Requisitos WCAG 2.1 AA Aplicados ao Sistema {#requisitos-wcag-2.1-aa-aplicados-ao-sistema}

| **Criterio**                     | **Aplicacao no Sistema**                                                             | **Como Verificar**                                 |
|----------------------------------|--------------------------------------------------------------------------------------|----------------------------------------------------|
| 1.1.1 --- Texto alternativo      | Toda imagem (logos de tenant, icones) com alt text descritivo                        | axe DevTools; revisar no code review               |
| 1.3.1 --- Info e Relacionamentos | Tabelas de ranking com headers; formularios com labels associados aos inputs         | Inspecao de acessibilidade do browser              |
| 1.4.3 --- Contraste              | Razao de contraste minima 4.5:1 para texto normal; 3:1 para texto grande             | Colour Contrast Analyser; definir no Design System |
| 1.4.4 --- Redimensionar texto    | Interface funcional com zoom de ate 200% sem perda de conteudo                       | Testar manualmente no browser                      |
| 2.1.1 --- Teclado                | Todas as acoes acessiveis via teclado: navegacao, confirmacoes, envio de formularios | Testar navegacao sem mouse                         |
| 2.4.3 --- Ordem de foco          | Ordem de foco logica e consistente com o layout visual                               | Inspecao manual com Tab key                        |
| 2.4.6 --- Cabecalhos e Labels    | Hierarquia de headings (h1→h2→h3) correta; labels em todos os inputs                 | axe DevTools; revisar HTML gerado pelo Angular     |
| 3.1.1 --- Idioma da pagina       | lang=\'pt-BR\' no elemento html                                                      | Verificar no template Angular                      |
| 3.3.1 --- Identificacao de erro  | Erros de formulario descritos em texto, nao apenas por cor                           | Testar com leitor de tela (NVDA/VoiceOver)         |
| 4.1.2 --- Nome, Funcao, Valor    | Componentes interativos com role, aria-label e aria-expanded corretos                | axe DevTools automatizado no CI                    |

## 26.2 Implementacao no Angular {#implementacao-no-angular}

- Usar elementos HTML semanticos: \<button\> para acoes, \<a\> para navegacao, \<table\> para dados tabulares, \<nav\> para menus --- nunca \<div\> clicavel sem role

- LiveRegion para atualizacoes dinamicas: quando o ranking atualizar via Realtime, anunciar via aria-live=\'polite\' para leitores de tela

- Focus management: ao abrir modal ou expandir secao, mover foco para o primeiro elemento interativo; ao fechar, retornar ao elemento que abriu

- Testes automatizados de acessibilidade com @axe-core/angular nos componentes principais --- integrado ao CI

- Paleta de cores do Design System validada para contraste WCAG AA antes de implementar

# 27. Feature Flags {#feature-flags}

Feature flags permitem ativar ou desativar funcionalidades sem deploy, fazer rollout gradual para tenants especificos e desativar uma feature com bug em producao instantaneamente. Essencial para um sistema multitenant onde diferentes tenants podem precisar de diferentes configuracoes.

## 27.1 Implementacao {#implementacao-1}

- Tabela feature_flags no Supabase: id, nome (ex: \'portal_participante\'), habilitado_globalmente (boolean), tenant_exceptions (UUID\[\] de tenants com comportamento diferente)

- FeatureFlagService no NestJS: metodo isEnabled(flagName, tenantId) --- verifica flag global e excecoes por tenant; resultado cacheado no Redis por 5 minutos

- Guard @FeatureFlag(\'portal_participante\') nos controllers: retorna 404 se flag desabilitada --- transparente para o cliente

- No Angular: FeatureFlagDirective \*featureFlag=\'portal_participante\' --- oculta elementos de UI de features desabilitadas

- Master pode ativar/desativar flags pelo painel sem deploy

## 27.2 Flags Previstas para o Lancamento {#flags-previstas-para-o-lancamento}

| **Flag**                  | **Descricao**                               | **Estado Inicial**                                               |
|---------------------------|---------------------------------------------|------------------------------------------------------------------|
| portal_participante       | Portal publico de busca por celular com OTP | Desabilitado --- ativar apos migracao de celulares               |
| supabase_realtime_ranking | Ranking ao vivo via Supabase Realtime       | Desabilitado --- ativar apos validar performance em staging      |
| whatsapp_auto_notify      | Envio automatico de mensagens apos sorteio  | Desabilitado --- ativar apos sessao WhatsApp validada por tenant |
| relatorio_storage         | Salvar relatorios no Supabase Storage       | Habilitado desde o inicio                                        |
| painel_testes_master      | Painel de testes no dashboard Master        | Habilitado apenas para tenant Master                             |
| importacao_csv            | Tela de importacao de dados legados         | Habilitado --- desativar apos conclusao da migracao              |

# 28. Processo de Onboarding de Novos Tenants {#processo-de-onboarding-de-novos-tenants}

O onboarding de um novo tenant envolve etapas tecnicas e operacionais. Este processo deve ser documentado e seguido a risca para garantir que o tenant esteja 100% configurado e operacional antes de vender a primeira cota.

## 28.1 Checklist de Onboarding {#checklist-de-onboarding}

| **Etapa**                  | **Responsavel** | **Acao**                                                                                                       | **Criterio de Conclusao**  |
|----------------------------|-----------------|----------------------------------------------------------------------------------------------------------------|----------------------------|
| 1 --- Contrato             | Comercial       | Assinar contrato e definir plano (numero de bolaes, cotas max, suporte)                                        | Contrato assinado          |
| 2 --- Criar tenant         | Master          | Criar tenant no painel: nome, slug, taxa administrativa padrao, branding (logo e cores)                        | Tenant ATIVO no sistema    |
| 3 --- Criar Admin          | Master          | Criar usuario Admin com email do cliente; Supabase envia email de boas-vindas com link de primeiro acesso      | Admin logado com sucesso   |
| 4 --- Configurar WhatsApp  | Admin do tenant | Escanear QR code do whatsapp-web.js com o numero dedicado do tenant; validar sessao                            | Sessao CONECTADA no painel |
| 5 --- Criar grupo WhatsApp | Admin do tenant | Criar grupo no WhatsApp; adicionar o numero do sistema; associar ao tenant no painel                           | Grupo listado e ativo      |
| 6 --- Treinamento          | Suporte         | Sessao de 1 hora demonstrando: criar bolao, cadastrar cotas, registrar sorteio, gerenciar premios, usar portal | Admin opera com autonomia  |
| 7 --- Bolao de teste       | Admin do tenant | Criar bolao de teste com 5 cotas, registrar 1 sorteio simulado, verificar ranking e mensagem WhatsApp          | Todos os fluxos validados  |
| 8 --- Migracao de dados    | Dev + Admin     | Executar script de importacao se houver dados historicos de planilhas                                          | Dados validados no sistema |
| 9 --- Go-live              | Master + Admin  | Ativar feature flags necessarias; comunicar participantes sobre o novo portal                                  | Primeiro bolao real criado |

# 29. Disaster Recovery e Plano de Contingencia {#disaster-recovery-e-plano-de-contingencia}

## 29.1 Objetivos de Recuperacao {#objetivos-de-recuperacao}

| **Metrica**                    | **Definicao**                                                            | **Meta**                                                                              |
|--------------------------------|--------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| RTO (Recovery Time Objective)  | Tempo maximo aceitavel de indisponibilidade antes de restaurar o servico | \< 4 horas para incidentes criticos; \< 30 minutos para incidentes de alta severidade |
| RPO (Recovery Point Objective) | Quantidade maxima de dados que pode ser perdida (janela de tempo)        | \< 1 hora --- backups automaticos a cada hora no Supabase                             |
| MTTR (Mean Time to Recover)    | Tempo medio de recuperacao historico                                     | Meta: \< 2 horas; medir e melhorar a cada incidente                                   |

## 29.2 Cenarios e Planos de Contingencia {#cenarios-e-planos-de-contingencia}

| **Cenario**                        | **Probabilidade** | **Plano de Acao**                                                                                                                                                                                                                                                                        |
|------------------------------------|-------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Supabase indisponivel (banco fora) | Baixa             | 1\) Exibir pagina de manutencao customizada; 2) Comunicar participantes via WhatsApp; 3) Aguardar restauracao do Supabase (SLA deles: 99.9%); 4) Verificar status em status.supabase.com                                                                                                 |
| Redis/BullMQ indisponivel          | Media             | 1\) Jobs de calculo param --- sorteios nao processados; 2) NestJS pode continuar respondendo requests simples; 3) Restaurar Redis; 4) Reprocessar jobs pendentes manualmente via endpoint de admin                                                                                       |
| Sessao WhatsApp desconectada       | Alta              | 1\) Alerta automatico ao Admin do tenant; 2) Admin reconecta via QR code no painel; 3) Mensagens nao enviadas ficam na fila e sao enviadas apos reconexao                                                                                                                                |
| Deploy com bug critico             | Media             | 1\) Rollback automatico: reverter para imagem Docker da versao anterior; 2) Procedimento: git revert + push + CI redeploy; 3) Hotfix documentado                                                                                                                                         |
| Corrupcao de dados por migration   | Muito Baixa       | FASE 0 (sem PITR): restaurar a partir do backup semanal pg_dump mais recente (RPO maximo: 7 dias). Reaplicar migrations a partir do backup. FASE 1 (plano Pro): acionar PITR do Supabase para restaurar para o ponto anterior com granularidade de segundos. Notificar tenants afetados. |
| Vazamento de Service Role Key      | Muito Baixa       | 1\) Revogar chave IMEDIATAMENTE no painel Supabase; 2) Gerar nova chave; 3) Atualizar em todos os environments via secrets manager; 4) Auditar logs de acesso das ultimas 24h; 5) Notificar ANPD se dados pessoais foram comprometidos (LGPD)                                            |

## 29.3 Runbook de Recuperacao {#runbook-de-recuperacao}

- Runbooks documentados em docs/runbooks/ para cada cenario acima: passo a passo executavel em situacao de stress

- Contatos de emergencia documentados: suporte Supabase, responsavel tecnico, Master do sistema

- Simulacao de DR a cada 6 meses: testar restore de backup em ambiente de staging; documentar resultado

- Post-mortem obrigatorio apos qualquer incidente de severidade ALTA ou CRITICA: causa raiz, impacto, correcao e prevencao futura

# 30. Gestao de Custos --- Estrategia Free-First {#gestao-de-custos-estrategia-free-first}

O projeto esta em fase inicial sem tenants pagantes. A diretriz e clara: custo zero enquanto nao houver receita. Toda configuracao que gere custo financeiro deve ser evitada ate o momento certo, substituida pela alternativa gratuita equivalente. Esta secao define o que usar agora, os limites de cada tier gratuito e os gatilhos exatos para upgrade.

| **REGRA GERAL: Antes de configurar qualquer servico pago, verificar se existe alternativa gratuita suficiente. Se existir, usar a gratuita e documentar o gatilho de upgrade aqui. Nenhum custo recorrente deve ser introduzido sem decisao explicita do responsavel pelo projeto.** |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## 30.1 Configuracao Fase 0 --- Custo Zero {#configuracao-fase-0-custo-zero}

Toda a infraestrutura necessaria para desenvolver e colocar o sistema em producao com o primeiro tenant real, sem gastar nada:

| **Servico**               | **Alternativa Gratuita**    | **Limite do Tier Gratuito**                                                                    | **Configuracao**                                                                                                                                             |
|---------------------------|-----------------------------|------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Banco de dados            | Supabase Free (Spark Plan)  | 500 MB banco; 1 GB Storage; 50.000 MAU; pausa apos 7 dias sem acesso                           | Criar projeto no plano Free. DESABILITAR auto-pause em Settings → General → Infrastructure para evitar que o banco pause em producao.                        |
| Redis / BullMQ            | Upstash Free                | 10.000 comandos/dia; 256 MB; 1 database                                                        | Criar conta em upstash.com. Suficiente para BullMQ em baixo volume (1 sorteio a cada 2 dias = \~200 comandos/sorteio). Monitorar dashboard do Upstash.       |
| Servidor NestJS + Workers | Fly.io Free                 | 3 VMs shared-cpu-1x 256 MB; 3 GB volume persistente; sem sleep (diferente do Render e Railway) | 1 VM para API NestJS, 1 VM para Worker BullMQ. Volume persistente para sessoes whatsapp-web.js. Instalar Fly CLI: fly.io/install. Guia completo na secao 34. |
| Hosting Frontend Angular  | Vercel Free                 | Deploys ilimitados; CDN global; SSL automatico; sem limites de banda praticos                  | Conectar repositorio GitHub no vercel.com. Deploy automatico a cada push na main. Guia completo na secao 34.                                                 |
| CI/CD --- GitHub Actions  | GitHub Free                 | 2.000 min/mes repos privados; 500 MB storage                                                   | Suficiente para \~100 execucoes de testes unitarios/mes. Testes E2E (Playwright) sao lentos --- ver secao 30.2 sobre como economizar minutos.                |
| Logs centralizados        | Logtail (Better Stack) Free | 1 GB logs/mes; 3 dias retencao                                                                 | Criar conta em betterstack.com/logs. 1 GB e suficiente em baixo volume. Alternativa mais simples: usar apenas logs do Fly.io (fly logs) nos primeiros meses. |
| Monitoramento de erros    | Sentry Free                 | 5.000 erros/mes; 1 usuario                                                                     | sentry.io --- integrar no NestJS e Angular. Captura stack traces automaticamente. Suficiente para fase inicial.                                              |
| SSL / CDN                 | Cloudflare Free             | Ilimitado para SSL e CDN basico                                                                | Apontar dominio para Cloudflare. SSL automatico. Sem custo.                                                                                                  |
| Dominio                   | Registro.br ou similar      | \~R\$ 40-80/ano (custo unico anual)                                                            | Unico custo inevitavel. Comprar o dominio principal. Subdominio para staging pode ser gratis via Fly.io (.fly.dev).                                          |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Custo total real na Fase 0:</strong></p>
<p>Mensal recorrente: R$ 0,00</p>
<p>Anual unico (dominio): ~R$ 50-80</p>
<p>Tudo o mais: gratuito dentro dos limites documentados acima</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 30.2 Limitacoes dos Tiers Gratuitos --- O que vigiar {#limitacoes-dos-tiers-gratuitos-o-que-vigiar}

| **Servico**         | **Limitacao Critica**                   | **Sintoma**                                        | **O que fazer**                                                                                                     |
|---------------------|-----------------------------------------|----------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| Supabase Free       | Pausa automatica apos 7 dias sem acesso | API retorna erro de conexao; banco offline         | DESABILITAR auto-pause no painel imediatamente apos criar o projeto. Settings → General → Infrastructure → Disable. |
| Supabase Free       | Sem PITR (Point-in-Time Recovery)       | Corrupcao de dados sem rollback granular           | Substituir por backup manual semanal via pg_dump (ver secao 30.3). Aceitar este risco na fase inicial.              |
| Supabase Free       | Sem backups automaticos diarios         | Perda de dados em caso de falha sem backup recente | Configurar job agendado semanal de pg_dump para Supabase Storage (gratuito ate 1 GB). Custo: R\$ 0.                 |
| Upstash Free        | 10.000 comandos/dia                     | Jobs BullMQ falhando; cache nao funcionando        | Monitorar dashboard Upstash. Em dia de sorteio: \~500-1000 comandos. Limite e 10x o necessario inicialmente.        |
| Fly.io Free         | 256 MB RAM por VM                       | NestJS com memory leak ou carga alta trava         | Otimizar uso de memoria. Workers BullMQ em VM separada para isolar carga.                                           |
| GitHub Actions Free | 2.000 min/mes                           | CI falhando por cota esgotada                      | Economizar minutos: rodar testes E2E apenas em PRs para main (nao em todo push). Ver secao 30.2.1.                  |
| Logtail Free        | 3 dias de retencao                      | Nao conseguir investigar erros de mais de 3 dias   | Aceitavel na fase inicial. Usar Sentry para rastrear erros (retencao maior). Upgrade quando necessario.             |
| Sentry Free         | 5.000 erros/mes                         | Perda de rastreamento de erros                     | Improvavel exceder em fase inicial. Se exceder: otimizar codigo antes de pagar.                                     |

**30.2.1 Economizando Minutos do GitHub Actions**

- Testes unitarios (rapidos): rodar em todo push --- consomem \~2-3 minutos por execucao

- Testes de integracao: rodar apenas em PRs para develop e main --- nao em branches de feature

- Testes E2E (Playwright): rodar APENAS em PRs para main --- economiza \~8-10 minutos por push de feature

- Configurar no workflow: on: push para unit tests; on: pull_request com branches: \[main, develop\] para integracao+E2E

- Com 20 pushs/semana em features + 5 PRs/semana: \~200 min de unit tests + \~50 min de E2E = \~250 min/semana = \~1000 min/mes. Dentro do limite de 2.000 min.

## 30.3 Backup Manual Gratuito (substitui PITR do plano pago) {#backup-manual-gratuito-substitui-pitr-do-plano-pago}

Como o Supabase Free nao tem backups automaticos diarios nem PITR, implementar um job NestJS agendado para fazer pg_dump semanal e salvar no Supabase Storage (gratuito ate 1 GB):

- Job agendado: toda segunda-feira as 02:00 via BullMQ scheduler

- Comando: pg_dump via biblioteca node-postgres diretamente da string de conexao do Supabase

- Destino: bucket privado no Supabase Storage com path backups/YYYY-MM-DD.sql.gz

- Retencao: manter os ultimos 4 backups semanais (4 semanas)

- Alerta: se o job de backup falhar, notificar o Master via email

- RPO resultante: maximo 7 dias de perda de dados. Aceitavel na fase sem tenants pagantes.

- Quando tiver tenants pagantes: migrar para Supabase Pro com PITR de 7 dias (backup continuo).

## 30.4 Features Desabilitadas na Fase 0 (custo vs. beneficio) {#features-desabilitadas-na-fase-0-custo-vs.-beneficio}

As funcionalidades abaixo estao especificadas no documento mas devem ser DESABILITADAS ou simplificadas na fase inicial por gerarem custo ou complexidade desnecessaria. Cada item tem um gatilho claro para habilitacao:

| **Feature**                                  | **Status na Fase 0**                                                    | **Gatilho para Habilitar**                                                       | **Custo Estimado ao Habilitar**                                                  |
|----------------------------------------------|-------------------------------------------------------------------------|----------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| PITR (Supabase)                              | DESABILITADO --- usar backup manual semanal (secao 30.3)                | Primeiro tenant pagante OU qualquer bolao com \> R\$ 10.000 em premios           | Supabase Pro: US\$ 25/mes                                                        |
| Distributed Tracing (OpenTelemetry + Jaeger) | DESABILITADO --- overhead de configuracao sem beneficio em baixo volume | 5+ tenants ativos OU latencia P99 \> 2s recorrente                               | Grafana Cloud Free ate 50 GB traces/mes; pago acima disso                        |
| Prometheus + Grafana Dashboard               | SIMPLIFICADO --- usar apenas /health endpoint e logs do Fly.io          | 3+ tenants ativos OU primeiro incidente de producao nao detectado a tempo        | Grafana Cloud Free: ate 10.000 series de metricas --- suficiente por muito tempo |
| Logtail com retencao 90 dias                 | SIMPLIFICADO --- usar Logtail Free (3 dias) + Sentry para erros         | Primeiro incidente em que 3 dias de retencao foram insuficientes para investigar | Logtail Starter: US\$ 19/mes por 30 dias de retencao                             |
| Redis dedicado (instancia propria)           | DESNECESSARIO --- Upstash Free suficiente                               | Limite de 10.000 comandos/dia do Upstash atingido em 2 dias consecutivos         | Upstash Pay-per-use: \~US\$ 0.2 por 100.000 comandos                             |
| Staging environment separado                 | ADIADO --- usar apenas local + producao                                 | Antes do segundo tenant OU antes da primeira campanha de vendas                  | Custo do segundo ambiente: igual ao de producao (\~R\$ 0 no Fly.io Free)         |
| Supabase Realtime para ranking ao vivo       | DESABILITADO (feature flag OFF) --- usar polling a cada 30s             | Quando o portal do participante tiver \> 50 usuarios simultaneos                 | Incluido no plano Supabase atual --- sem custo adicional ao habilitar            |

## 30.5 Gatilhos de Upgrade --- Quando e Para Que Pagar {#gatilhos-de-upgrade-quando-e-para-que-pagar}

Cada upgrade tem um gatilho objetivo e mensuravel. Nenhum upgrade deve ser feito por antecipacao:

| **Gatilho**                                                              | **Upgrade Necessario**                                              | **Custo Mensal Adicional**          |
|--------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------|
| Banco \> 400 MB (80% do limite Free) OU primeiro tenant pagante          | Supabase Pro --- backups diarios + PITR + suporte                   | US\$ 25/mes (\~R\$ 130)             |
| Comandos Redis \> 8.000/dia em 3 dias consecutivos                       | Upstash Pay-per-use (sem plano --- paga pelo uso)                   | \~US\$ 1-5/mes inicialmente         |
| GitHub Actions \> 1.600 min/mes (80% do limite)                          | Otimizar workflows ANTES de pagar; se insuficiente: GitHub Teams    | US\$ 4/mes (+3.000 min)             |
| Incidente em producao nao detectado a tempo por falta de observabilidade | Logtail Starter (30 dias retencao) + configurar Grafana Cloud Free  | US\$ 19/mes (Logtail); Grafana Free |
| NestJS/Worker travando por falta de RAM no Fly.io Free                   | Fly.io shared-cpu-1x 512 MB (upgrade de VM)                         | \~US\$ 3-5/mes por VM               |
| Primeiro bolao com \> 5.000 cotas e sorteios frequentes (2x/semana+)     | Revisar todos os limites; provavelmente Supabase Pro + Upstash pago | \~US\$ 30-50/mes total              |

## 30.6 Monitoramento de Custos na Fase 0 {#monitoramento-de-custos-na-fase-0}

- Supabase: verificar uso no painel (Settings → Usage) uma vez por semana. Alertas de email automaticos ao atingir 75% de qualquer limite --- configurar em Settings → Billing.

- Upstash: verificar dashboard uma vez por semana, especialmente nos dias apos sorteios.

- GitHub Actions: verificar em Settings → Billing do repositorio. Configurar spending limit = \$0 para NUNCA cobrar automaticamente se exceder o limite gratuito --- o CI simplesmente para.

- Fly.io: uso gratuito nao gera cobranca automatica enquanto o cartao nao for adicionado. Adicionar cartao apenas quando decidir pagar.

- Revisao mensal: verificar todos os servicos no dia 1 de cada mes. Registrar uso e comparar com o mes anterior.

# 31. Architecture Decision Records (ADRs) {#architecture-decision-records-adrs}

ADRs documentam o raciocinio por tras de cada decisao tecnica importante. Sao criticos em projetos com multiplos agentes: garantem que a intencao original de cada escolha seja preservada mesmo quando o contexto muda. Cada ADR e imutavel --- se a decisao mudar, cria-se um novo ADR referenciando o anterior.

## 31.1 Template de ADR {#template-de-adr}

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Arquivo: docs/adr/ADR-NNN-titulo-curto.md</strong></p>
<p># ADR-001: Uso do Supabase como plataforma principal</p>
<p>Status: ACEITO</p>
<p>Data: 2026-04-27</p>
<p>Decisores: Daniel Estevao (idealizador), equipe tecnica</p>
<p>Contexto: precisamos de banco, auth, realtime e storage gerenciados...</p>
<p>Decisao: usar Supabase All-in com PostgreSQL, Auth, Realtime e Storage</p>
<p>Consequencias positivas: menor overhead operacional, RLS nativo, SDK unificado</p>
<p>Consequencias negativas: vendor lock-in; custo escala com volume</p>
<p>Alternativas consideradas: Firebase (NoSQL, menos adequado), AWS RDS + Cognito (maior complexidade)</p>
<p>ADRs relacionados: ADR-002 (multitenant com RLS), ADR-003 (whatsapp-web.js)</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 31.2 ADRs Iniciais a Documentar {#adrs-iniciais-a-documentar}

| **Numero** | **Titulo**                                | **Status**             | **Decisao Resumida**                                                                                                                                              |
|------------|-------------------------------------------|------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ADR-001    | Supabase como plataforma principal        | ACEITO                 | Usar PostgreSQL + Auth + Realtime + Storage do Supabase; justificativa: menor overhead operacional e RLS nativo para multitenant                                  |
| ADR-002    | Multitenancy com RLS no PostgreSQL        | ACEITO                 | Isolamento via tenant_id em todas as tabelas + politicas RLS; alternativa rejeitada: banco por tenant (custo proibitivo)                                          |
| ADR-003    | whatsapp-web.js vs Business API           | ACEITO TEMPORARIAMENTE | Usar whatsapp-web.js na fase inicial por custo zero; migrar para Business API ao atingir 3+ tenants ou 1000+ mensagens/dia                                        |
| ADR-004    | Monorepo com Nx para Angular + NestJS     | ACEITO                 | Tipos compartilhados entre front e back; builds incrementais; alternativa rejeitada: repos separados com contrato manual                                          |
| ADR-005    | Premiacoes totalmente livres por bolao    | ACEITO                 | CategoriaPremiacao como entidade configuravel; remove hardcode de categorias; exige validacao de soma = 100%                                                      |
| ADR-006    | BullMQ para jobs assincronos              | ACEITO                 | Processamento de 9.244 acertos nao pode ser sincrono; Redis ja disponivel; alternativa considerada: Supabase Edge Functions (sem suporte a jobs de longa duracao) |
| ADR-007    | Jest no lugar de Karma/Jasmine no Angular | ACEITO                 | Mais rapido, melhor CI support, mesma ferramenta do backend; migracao via jest-preset-angular                                                                     |
| ADR-008    | OpenAPI como contrato entre front e back  | ACEITO                 | Tipos gerados automaticamente; elimina divergencias manuais; alternativa rejeitada: tRPC (acoplamento forte entre repos)                                          |

# 32. Contrato de Trabalho Entre Agentes em Paralelo {#contrato-de-trabalho-entre-agentes-em-paralelo}

Esta secao e especifica para o modelo de desenvolvimento com multiplos agentes de IA trabalhando em paralelo. Define como os agentes se coordenam, quais sao as fronteiras de cada um e como conflitos sao resolvidos.

## 32.1 Divisao de Responsabilidades por Agente {#divisao-de-responsabilidades-por-agente}

| **Agente**          | **Dominio Exclusivo**                                             | **Pode Ler**                                               | **Nao Pode Alterar**                                                |
|---------------------|-------------------------------------------------------------------|------------------------------------------------------------|---------------------------------------------------------------------|
| Agente de Backend   | apps/backend/, supabase/migrations/, libs/shared-types/ (geracao) | apps/frontend/ para entender contrato de API; documentacao | apps/frontend/ diretamente; nunca alterar tipos gerados manualmente |
| Agente de Frontend  | apps/frontend/, libs/shared-types/ (consumo)                      | apps/backend/src para entender endpoints; swagger JSON     | apps/backend/ diretamente; nunca alterar migrations                 |
| Agente de Design    | docs/wireframes/, Design System, guias de estilo                  | Qualquer arquivo para entender contexto                    | Codigo de producao; migrations; logica de negocio                   |
| Agente de Testes    | Arquivos \*.spec.ts, \*.test.ts, playwright/                      | Todo o codigo para escrever testes corretos                | Codigo de producao (apenas sugerir correcoes via PR)                |
| Agente de Seguranca | Revisao de PRs, docs/security/                                    | Todo o codigo                                              | Nao faz merge autonomo; apenas revisa e sugere                      |

## 32.2 Regras de Ouro para Trabalho Paralelo {#regras-de-ouro-para-trabalho-paralelo}

- REGRA 1 --- API First: o Agente de Backend documenta o endpoint no Swagger ANTES de implementar. O Agente de Frontend implementa contra o Swagger, nao contra suposicoes. Se o Swagger nao existe, o Frontend usa MSW mock e aguarda.

- REGRA 2 --- Migrations sao exclusivas do Backend: o Agente de Frontend nunca propoe alteracoes de schema. Se precisar de um novo campo, abre uma issue para o Backend.

- REGRA 3 --- Tipos compartilhados sao gerados, nunca editados manualmente: editar libs/shared-types/ manualmente sera sobrescrito na proxima geracao. Mudancas de tipos passam pelo Backend via OpenAPI.

- REGRA 4 --- Sem dependencias circulares: Backend nao importa nada do Frontend; Frontend nao importa diretamente do Backend --- apenas de libs/shared-\*.

- REGRA 5 --- Feature flags para coordenacao: quando Backend e Frontend de uma feature nao estao prontos ao mesmo tempo, a feature e protegida por feature flag. Backend pode estar em producao com a flag desabilitada enquanto o Frontend termina.

- REGRA 6 --- Contexto completo em cada sessao: cada agente recebe este documento completo + os arquivos relevantes do seu dominio no inicio de cada sessao. Nao assumir que o agente lembra do contexto de sessoes anteriores.

- REGRA 7 --- Conflitos de merge resolvidos pelo humano: se dois agentes alteram o mesmo arquivo, o humano (coordenador) resolve o conflito --- nao um agente sobrescrevendo o trabalho do outro.

## 32.3 Fluxo de Comunicacao Entre Agentes {#fluxo-de-comunicacao-entre-agentes}

| **Situacao**                                | **Como Resolver**                                                                                                                                         |
|---------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Frontend precisa de novo endpoint           | Abrir issue descrevendo: rota, payload de request, resposta esperada, codigos de erro. Backend implementa e atualiza Swagger. Frontend consome.           |
| Backend muda contrato de endpoint existente | Backend atualiza Swagger; roda npm run generate:types; abre PR com breaking change claramente documentado; Frontend adapta em PR separado.                |
| Migration nova afeta query do Frontend      | Backend documenta nova coluna/tabela no Swagger e nos tipos gerados. Frontend nao precisa conhecer o SQL, apenas os tipos TypeScript.                     |
| Bug encontrado pelo Agente de Testes        | Agente de Testes cria issue com: comportamento esperado, comportamento atual, teste que reproduz o bug. Agente responsavel (Backend ou Frontend) corrige. |
| Duvida sobre regra de negocio               | Consultar este documento de requisitos. Se nao estiver documentado, escalar para o humano coordenador antes de assumir qualquer comportamento.            |

# 33. Integracao com Google Drive e Google Sheets {#integracao-com-google-drive-e-google-sheets}

A integracao com Google Drive permite que Admins leiam dados de participantes e cotas diretamente de planilhas Google Sheets (importacao) e exportem resultados, rankings e lista de premiados de volta para planilhas (exportacao). A sincronizacao ocorre manualmente sob demanda ou automaticamente em eventos chave do bolao.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Capacidades da integracao:</strong></p>
<p>LEITURA: importar participantes, cotas e palpites de planilha Google Sheets para o sistema</p>
<p>ESCRITA: exportar ranking, resultados de sorteios, premiados e historico de pagamentos para planilha</p>
<p>AUTENTICACAO DUPLA: conta Google central gerenciada pelo Master (Service Account) + conta propria por tenant (OAuth 2.0)</p>
<p>SYNC AUTOMATICO: planilha atualizada automaticamente apos cada sorteio registrado e ao encerrar bolao</p>
<p>SYNC MANUAL: Admin dispara importacao ou exportacao sob demanda pelo painel</p>
<p>TEMPLATE OFICIAL: planilha modelo disponibilizada pelo sistema com abas e colunas padrao</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 33.1 Modelo de Autenticacao com Google {#modelo-de-autenticacao-com-google}

O sistema suporta dois modos de autenticacao com a API do Google, que podem coexistir: Service Account central (configurada pelo Master) e OAuth 2.0 por tenant (cada Admin conecta sua propria conta Google).

| **Modo**                  | **Quem Configura**                            | **Como Funciona**                                                                                                                                                                                                  | **Quando Usar**                                                                                          |
|---------------------------|-----------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Service Account (Central) | Master --- via painel ou variavel de ambiente | Chave JSON da Service Account armazenada criptografada no sistema. O Admin compartilha a planilha com o email da Service Account (ex: bolao@projeto.iam.gserviceaccount.com). Sem necessidade de login interativo. | Tenants que preferem nao fazer login Google; conta central gerenciada pelo Master; melhor para automacao |
| OAuth 2.0 (Por Tenant)    | Admin --- fluxo de autorizacao pelo painel    | Admin clica em \'Conectar minha conta Google\'; fluxo OAuth Authorization Code com PKCE; refresh token criptografado salvo no Supabase por tenant. Acesso as planilhas do proprio Google Drive.                    | Tenants que querem usar suas proprias planilhas sem compartilhar com terceiros; maior autonomia          |

| **IMPORTANTE --- Scope minimo do OAuth: solicitar apenas o scope https://www.googleapis.com/auth/spreadsheets (leitura e escrita em Sheets) e https://www.googleapis.com/auth/drive.file (acesso apenas a arquivos criados pelo app). NUNCA solicitar https://www.googleapis.com/auth/drive completo. Escopo minimo e obrigatorio para aprovacao no Google OAuth Verification.** |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## 33.2 Novas Entidades no Banco de Dados {#novas-entidades-no-banco-de-dados}

**33.2.1 Tabela google_drive_configs**

Armazena a configuracao de Google Drive por tenant. Um tenant pode ter ate dois registros: um CENTRAL (Service Account) e um PROPRIO (OAuth).

| **Coluna**            | **Tipo**             | **Descricao**                                                                                                                                     |
|-----------------------|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| id                    | UUID PK              | Identificador unico                                                                                                                               |
| tenant_id             | UUID FK              | Tenant ao qual pertence (RLS obrigatorio)                                                                                                         |
| tipo                  | ENUM                 | CENTRAL \| PROPRIO                                                                                                                                |
| status                | ENUM                 | CONECTADO \| DESCONECTADO \| ERRO_TOKEN \| NAO_CONFIGURADO                                                                                        |
| google_email          | TEXT                 | Email da conta Google conectada (exibido no painel para identificacao)                                                                            |
| credentials_encrypted | TEXT                 | Credenciais criptografadas: refresh_token (OAuth) ou chave JSON (Service Account). Criptografado com AES-256-GCM usando GOOGLE_CREDENTIALS_SECRET |
| spreadsheet_id_padrao | TEXT NULL            | ID da planilha padrao para este tenant (extraido da URL do Google Sheets)                                                                         |
| ativo                 | BOOLEAN DEFAULT true | Se esta configuracao esta em uso                                                                                                                  |
| ultimo_sync_em        | TIMESTAMPTZ NULL     | Timestamp do ultimo sync bem-sucedido                                                                                                             |
| criado_em             | TIMESTAMPTZ          | Data de conexao                                                                                                                                   |
| atualizado_em         | TIMESTAMPTZ          | Data da ultima atualizacao do token                                                                                                               |

**33.2.2 Tabela google_sync_logs**

Historico completo de todas as operacoes de sincronizacao --- importacoes e exportacoes. Permite auditoria e debug de problemas.

| **Coluna**         | **Tipo**         | **Descricao**                                                                                    |
|--------------------|------------------|--------------------------------------------------------------------------------------------------|
| id                 | UUID PK          | Identificador unico                                                                              |
| tenant_id          | UUID FK          | Tenant                                                                                           |
| bolao_id           | UUID FK NULL     | Bolao relacionado (NULL para operacoes globais)                                                  |
| config_id          | UUID FK          | google_drive_config utilizada nesta operacao                                                     |
| tipo               | ENUM             | IMPORT_PARTICIPANTES \| EXPORT_RANKING \| EXPORT_SORTEIOS \| EXPORT_PREMIADOS \| EXPORT_COMPLETO |
| trigger            | ENUM             | MANUAL \| AUTO_SORTEIO \| AUTO_ENCERRAMENTO \| SCHEDULED                                         |
| spreadsheet_id     | TEXT             | ID da planilha utilizada                                                                         |
| aba_origem         | TEXT NULL        | Nome da aba lida (para imports)                                                                  |
| status             | ENUM             | PROCESSANDO \| CONCLUIDO \| CONCLUIDO_COM_ERROS \| FALHOU                                        |
| linhas_lidas       | INTEGER NULL     | Total de linhas lidas da planilha (import)                                                       |
| linhas_importadas  | INTEGER NULL     | Linhas importadas com sucesso                                                                    |
| linhas_atualizadas | INTEGER NULL     | Linhas atualizadas (upsert)                                                                      |
| linhas_ignoradas   | INTEGER NULL     | Linhas ignoradas por dados invalidos                                                             |
| celulas_escritas   | INTEGER NULL     | Total de celulas escritas (export)                                                               |
| erros_json         | JSONB NULL       | Lista de erros por linha: \[{linha: 5, erro: \'Palpite invalido\'}\]                             |
| iniciado_em        | TIMESTAMPTZ      | Inicio da operacao                                                                               |
| concluido_em       | TIMESTAMPTZ NULL | Fim da operacao                                                                                  |
| duracao_ms         | INTEGER NULL     | Duracao total em milissegundos                                                                   |

## 33.3 Template Oficial de Planilha {#template-oficial-de-planilha}

O sistema disponibiliza um template Google Sheets padrao que o Admin copia para seu Drive. O template possui 5 abas com colunas pre-definidas e validacoes nativas do Google Sheets (listas suspensas, validacao de numeros).

| **Aba**       | **Direcao**       | **Colunas**                                                                                                  | **Observacao**                                                                                                            |
|---------------|-------------------|--------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| Participantes | LEITURA + ESCRITA | A: Numero \| B: Nome \| C: Celular \| D-M: Palpite_1 a Palpite_10 \| N: Status_Pagamento                     | Aba principal de import. O sistema le esta aba para criar/atualizar cotas. Tambem escreve o status de pagamento de volta. |
| Ranking       | ESCRITA           | A: Posicao \| B: Numero \| C: Nome \| D: Acertos \| E: Resultado \| F: Premio                                | Gerada/atualizada automaticamente apos cada sorteio. Somente leitura para o Admin.                                        |
| Sorteios      | ESCRITA           | A: Sequencia \| B: Concurso \| C: Data \| D-I: Bola_1 a Bola_6 \| J-T: Acertos_00 a Acertos_10               | Historico de sorteios com distribuicao de acertos por faixa.                                                              |
| Premiados     | ESCRITA           | A: Numero \| B: Nome \| C: Categoria \| D: Pontuacao \| E: Valor \| F: Status_Pagamento \| G: Data_Pagamento | Preenchida automaticamente ao encerrar o bolao. Admin atualiza Status_Pagamento aqui e o sistema sincroniza.              |
| Config        | LEITURA           | A: Chave \| B: Valor                                                                                         | Metadados: nome do bolao, tenant_id, bolao_id. Usado pelo sistema para identificar a qual bolao a planilha pertence.      |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Como obter o template:</strong></p>
<p>1. Admin acessa Configuracoes &gt; Google Drive no painel</p>
<p>2. Clica em 'Copiar template para meu Drive'</p>
<p>3. Sistema usa a API do Google Drive para criar uma copia da planilha template na conta do Admin</p>
<p>4. A aba Config e automaticamente preenchida com tenant_id e bolao_id</p>
<p>5. Admin compartilha a planilha com o email da Service Account (se usar conta central)</p>
<p>6. ID da planilha e automaticamente registrado no sistema</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 33.4 Fluxo de Importacao (Planilha → Sistema) {#fluxo-de-importacao-planilha-sistema}

| **Etapa**                  | **Detalhe**                                                                                                                                                                                       |
|----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 --- Trigger              | Admin clica \'Importar Participantes\' no painel, selecionando a planilha e a aba de origem (default: aba Participantes)                                                                          |
| 2 --- Autenticacao         | Sistema seleciona a configuracao ativa do tenant (PROPRIO se disponivel; CENTRAL como fallback); obtem access_token via refresh_token ou Service Account                                          |
| 3 --- Leitura da planilha  | Google Sheets API v4: GET spreadsheets/{id}/values/Participantes!A2:M --- le todas as linhas a partir da linha 2 (pula cabecalho)                                                                 |
| 4 --- Validacao por linha  | Para cada linha: validar numero sequencial (inteiro), nome (nao vazio), celular (formato DDD+numero), 10 palpites (distintos, 01-60, ordem crescente), status_pagamento (PAGO\|PENDENTE\|INATIVO) |
| 5 --- Upsert no banco      | Linhas validas: INSERT \... ON CONFLICT (numero_sequencial, bolao_id) DO UPDATE --- atualiza se ja existe, cria se nao existe                                                                     |
| 6 --- Linhas invalidas     | Nao interromper o processo; registrar erro em erros_json com numero da linha e descricao do problema                                                                                              |
| 7 --- Resultado            | Atualizar google_sync_logs com totais; exibir relatorio no painel: X importadas, Y atualizadas, Z ignoradas (com detalhes dos erros)                                                              |
| 8 --- Feedback na planilha | Escrever na coluna N (Status_Import) de cada linha: \'OK\', \'ATUALIZADO\' ou \'ERRO: descricao\' --- Admin ve diretamente na planilha o resultado                                                |

| **CONFLITO DE DADOS: se uma cota existente no banco tiver status PAGO e a planilha trouxer status PENDENTE, o sistema NUNCA faz downgrade automatico de pagamento confirmado. Regra: status_pagamento so pode ser atualizado via planilha de PENDENTE para PAGO --- nunca o contrario. Downgrade exige acao manual do Admin no painel.** |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## 33.5 Fluxo de Exportacao (Sistema → Planilha) {#fluxo-de-exportacao-sistema-planilha}

| **Tipo de Export**       | **Trigger**                               | **Aba Destino** | **Dados Escritos**                                                                                    |
|--------------------------|-------------------------------------------|-----------------|-------------------------------------------------------------------------------------------------------|
| Ranking Parcial          | AUTO apos cada sorteio + MANUAL           | Ranking         | Lista completa ordenada por acertos acumulados; posicao, nome, total de acertos, resultado atual      |
| Historico de Sorteios    | AUTO apos cada sorteio                    | Sorteios        | Linha do novo sorteio: numero do concurso, data, 6 bolas, distribuicao de acertos por faixa (00 a 10) |
| Lista de Premiados       | AUTO ao encerrar bolao                    | Premiados       | Um registro por ganhador: categoria, pontuacao, valor do premio, status de pagamento                  |
| Status de Pagamentos     | MANUAL (Admin solicita sync)              | Premiados       | Atualiza coluna Status_Pagamento com dados mais recentes do banco                                     |
| Export Completo          | MANUAL                                    | Todas as abas   | Regenera todas as abas de uma vez: ranking + sorteios + premiados + participantes                     |
| Confirmacao de Pagamento | AUTO ao marcar premio como PAGO no painel | Premiados       | Atualiza a linha do ganhador: Status_Pagamento = PAGO, Data_Pagamento = hoje                          |

## 33.6 Sincronizacao Automatica por Eventos {#sincronizacao-automatica-por-eventos}

O sistema usa o BullMQ para processar sincronizacoes automaticas de forma assincrona --- o registro do sorteio ou o encerramento do bolao nao ficam bloqueados esperando a API do Google responder.

| **Evento no Sistema**                         | **Fila BullMQ** | **Job Disparado**                                   | **Delay**                                 |
|-----------------------------------------------|-----------------|-----------------------------------------------------|-------------------------------------------|
| Sorteio registrado (job de acertos concluido) | google-sync     | ExportRankingJob + ExportSorteiosJob                | Imediato apos calculo de acertos concluir |
| Bolao encerrado                               | google-sync     | ExportCompleto Job (ranking + sorteios + premiados) | Imediato apos calculo de premios          |
| Premio marcado como PAGO no painel            | google-sync     | SyncPagamentosJob                                   | Imediato                                  |
| Pagamento de cota confirmado                  | google-sync     | SyncStatusCotaJob (atualiza coluna N da planilha)   | Imediato                                  |

- Sincronizacao automatica ativa apenas para tenants com configuracao Google Drive CONECTADO e campo ativo = true

- Se a sincronizacao automatica falhar (token expirado, planilha deletada), o job vai para retry (3 tentativas com backoff exponencial)

- Apos 3 falhas: status da config muda para ERRO_TOKEN; alerta enviado ao Admin via email e WhatsApp; sync automatico suspenso ate reconexao

- Sync manual sempre disponivel independente do status de sync automatico

## 33.7 Limites da API do Google Sheets {#limites-da-api-do-google-sheets}

A API do Google Sheets possui limites que devem ser respeitados para evitar bloqueios. O BullMQ ja gerencia o rate limiting, mas o design deve considerar esses limites:

| **Limite**                        | **Valor**                                    | **Mitigacao Implementada**                                                                 |
|-----------------------------------|----------------------------------------------|--------------------------------------------------------------------------------------------|
| Requests por minuto (por projeto) | 300 req/min                                  | Rate limiter no worker BullMQ: maximo 5 requests/segundo; fila com concurrency = 2         |
| Requests por minuto (por usuario) | 60 req/min por conta Google                  | Distribuir tenants entre Service Account e contas OAuth; nao centralizar tudo em uma conta |
| Celulas por request de leitura    | Sem limite documentado (pratico: 5M celulas) | Paginar leituras de planilhas muito grandes (\> 10.000 linhas) em batches de 1.000         |
| Celulas por request de escrita    | 2 milhoes de celulas por requisicao          | Exportacoes grandes divididas em multiplos requests via batchUpdate                        |
| Requisicoes simultâneas           | Sem limite; sujeito ao rate limit total      | concurrency = 2 no worker garante no maximo 2 planilhas sendo processadas ao mesmo tempo   |

## 33.8 Novos Requisitos Funcionais (RF-13 e RF-14) {#novos-requisitos-funcionais-rf-13-e-rf-14}

**RF-13: Configuracao do Google Drive por Tenant**

- RF-13.1: O Admin deve poder conectar a conta Google do tenant via fluxo OAuth 2.0 no painel (botao \'Conectar conta Google\')

- RF-13.2: O Master deve poder configurar a Service Account central no painel Master, com upload do arquivo JSON da chave

- RF-13.3: O sistema deve exibir o status da conexao: CONECTADO (verde), ERRO_TOKEN (vermelho), NAO_CONFIGURADO (cinza)

- RF-13.4: O Admin deve poder vincular uma planilha especifica a um bolao informando a URL ou ID da planilha

- RF-13.5: O sistema deve verificar automaticamente se tem permissao de leitura e escrita na planilha ao vincular; exibir erro claro se nao tiver

- RF-13.6: O Admin deve poder desconectar a conta Google a qualquer momento, revogando o refresh_token no Google e removendo as credenciais do banco

- RF-13.7: O Admin deve poder ativar/desativar a sincronizacao automatica por bolao (sem desconectar a conta)

**RF-14: Operacoes de Sincronizacao**

- RF-14.1: O Admin deve poder disparar uma importacao manual a partir de uma planilha, selecionando o bolao destino e a aba de origem

- RF-14.2: O sistema deve exibir um preview das primeiras 5 linhas antes de confirmar a importacao, com validacoes visuais por campo

- RF-14.3: O Admin deve poder disparar exportacoes manuais por tipo: Ranking, Sorteios, Premiados ou Completo

- RF-14.4: O sistema deve exibir o historico completo de sincronizacoes com status, totais e link para a planilha utilizada

- RF-14.5: Em caso de erros parciais na importacao, o sistema deve exportar um relatorio de erros diretamente na coluna de status da planilha

- RF-14.6: O sistema deve enviar notificacao ao Admin (WhatsApp ou email) quando uma sincronizacao automatica falhar

- RF-14.7: O Admin deve poder fazer o download do template oficial de planilha diretamente pelo painel

## 33.9 Nova Tela: Configuracao Google Drive (Frontend) {#nova-tela-configuracao-google-drive-frontend}

| **Secao da Tela**           | **Conteudo**                                                                                                                                                                        |
|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Status da Conexao           | Badge colorido (CONECTADO/ERRO/NAO_CONFIGURADO); email da conta Google conectada; data da ultima sincronizacao; botao Conectar / Reconectar / Desconectar                           |
| Planilha Vinculada          | Campo para colar URL da planilha; botao Vincular; validacao de permissao em tempo real; link para abrir a planilha no Google Sheets; botao para copiar template                     |
| Sincronizacao Automatica    | Toggle por evento: Apos sorteio (ON/OFF) \| Ao encerrar bolao (ON/OFF) \| Ao confirmar pagamento (ON/OFF)                                                                           |
| Acoes Manuais               | Botoes: Importar Participantes \| Exportar Ranking \| Exportar Sorteios \| Exportar Premiados \| Export Completo --- cada botao exibe progresso em tempo real via Supabase Realtime |
| Historico de Sincronizacoes | Tabela com ultimas 50 operacoes: data, tipo, trigger, status, linhas processadas, duracao; expandir para ver erros detalhados; filtros por tipo e status                            |

## 33.10 Seguranca da Integracao Google {#seguranca-da-integracao-google}

- Credentials criptografadas: refresh_token (OAuth) e chave JSON (Service Account) armazenados criptografados com AES-256-GCM; chave de criptografia em variavel de ambiente GOOGLE_CREDENTIALS_SECRET --- nunca em texto puro no banco

- Revogacao imediata: ao desconectar, o sistema chama a API do Google para revogar o token antes de deletar do banco --- impede acesso residual

- Scope minimo obrigatorio: solicitar apenas spreadsheets e drive.file --- nunca drive completo

- Verificacao de propriedade da planilha: ao vincular uma planilha, verificar que o tenant tem acesso a ela --- nao permitir vincular planilhas de outros usuarios sem permissao

- RLS na tabela google_drive_configs: Admin so acessa configuracoes do proprio tenant; Service Account do Master acessivel apenas pelo papel MASTER

- Logs de auditoria: toda operacao de sync registrada em google_sync_logs com tenant_id, tipo e resultado --- imutavel

- Adicionar variavel de ambiente: GOOGLE_CREDENTIALS_SECRET (chave AES-256 para criptografar credentials), GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (OAuth app credentials), GOOGLE_SERVICE_ACCOUNT_JSON (chave da Service Account central)

## 33.11 Criterios de Aceite --- Google Drive {#criterios-de-aceite-google-drive}

| **ID**   | **Criterio**                        | **Como Verificar**                                                                                                                             |
|----------|-------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| CA-GD-01 | Conectar conta Google via OAuth     | Admin clica \'Conectar\'; fluxo OAuth abre; Admin autoriza; status muda para CONECTADO; email exibido corretamente                             |
| CA-GD-02 | Importar participantes da planilha  | Admin vincula planilha com 10 linhas validas; clica Importar; 10 cotas criadas no banco com palpites corretos                                  |
| CA-GD-03 | Rejeitar linhas invalidas           | Planilha com 2 linhas validas e 1 invalida (palpite errado): 2 importadas, 1 ignorada com erro na coluna N da planilha                         |
| CA-GD-04 | Nao fazer downgrade de pagamento    | Cota PAGO no banco; planilha traz PENDENTE para ela; importar: status continua PAGO no banco; log registra conflito                            |
| CA-GD-05 | Exportar ranking apos sorteio       | Registrar sorteio; job de acertos conclui; job google-sync exporta ranking; abrir planilha no Google Sheets e verificar aba Ranking atualizada |
| CA-GD-06 | Export automatico ao encerrar bolao | Bolao encerra; sistema exporta ranking + sorteios + premiados para planilha; Admin verifica as 3 abas atualizadas                              |
| CA-GD-07 | Sync manual sob demanda             | Admin clica Exportar Completo; progresso exibido em tempo real; todas as abas atualizadas ao concluir                                          |
| CA-GD-08 | Falha tratada com retry             | Simular token expirado; sistema tenta 3x; muda status para ERRO_TOKEN; Admin recebe alerta; sync automatico suspenso                           |
| CA-GD-09 | Isolamento por tenant               | Admin do Tenant A nao ve configuracoes do Tenant B; nao consegue importar para bolao de outro tenant                                           |
| CA-GD-10 | Credenciais criptografadas          | Verificar diretamente no banco: coluna credentials_encrypted nao contem JSON legivel --- apenas texto criptografado                            |

# 34. Especificacao de Responsividade e Design Mobile {#especificacao-de-responsividade-e-design-mobile}

A grande maioria dos usuarios acessa o sistema pelo celular: Admins gerenciam boloes, confirmam pagamentos e registram sorteios diretamente do telefone; participantes consultam seus palpites e ranking pelo portal. O sistema e desenvolvido com abordagem mobile-first --- o layout base e projetado para telas pequenas e expandido progressivamente para telas maiores.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Decisoes de navegacao tomadas:</strong></p>
<p>Painel Admin (Master + Admin): Sidebar como Drawer — hamburguer no header abre menu deslizando da esquerda</p>
<p>Portal do Participante: Bottom Navigation Bar — barra fixa na base com 4 itens de acesso rapido</p>
<p>Justificativa Admin: painel tem 9+ itens de menu; drawer suporta volume ilimitado e e padrao reconhecido</p>
<p>Justificativa Portal: participante acessa apenas 4 areas (Boloes, Ranking, Palpites, Premiacao); bottom nav e mais rapido</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 34.1 Breakpoints (Tailwind CSS) {#breakpoints-tailwind-css}

O sistema usa os breakpoints padrao do Tailwind com nomenclatura mobile-first. Todo componente e desenvolvido primeiro para sm, depois adaptado para md e lg:

| **Breakpoint** | **Largura** | **Dispositivo Alvo**        | **Comportamento Padrao**                                              |
|----------------|-------------|-----------------------------|-----------------------------------------------------------------------|
| (base)         | 0 --- 639px | Celular (prioridade maxima) | Layout base: coluna unica, drawer fechado, bottom nav ativo no portal |
| sm             | 640px+      | Celular grande / landscape  | Pequenos ajustes de espacamento; sidebar ainda drawer                 |
| md             | 768px+      | Tablet / iPad               | Sidebar expande para versao semi-colapsada (icones + labels curtos)   |
| lg             | 1024px+     | Notebook / Desktop          | Sidebar totalmente expandida e sempre visivel; bottom nav desaparece  |
| xl             | 1280px+     | Monitor grande              | Layouts de 2-3 colunas em telas de listagem                           |

## 34.2 Painel Admin --- Navegacao por Drawer {#painel-admin-navegacao-por-drawer}

**34.2.1 Comportamento do Drawer por breakpoint**

| **Breakpoint**      | **Estado do Drawer**                                                                                                             | **Header**                                                                                             | **Conteudo Principal**                                 |
|---------------------|----------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|--------------------------------------------------------|
| base / sm (celular) | Fechado por padrao; abre ao tocar no hamburguer; overlay escurece o fundo; fecha ao tocar no overlay ou em qualquer item do menu | Hamburguer (esquerda) + Nome da tela atual (centro) + Acao principal contextual (direita, ex: botao +) | Ocupa 100% da largura; padding horizontal 16px         |
| md (tablet)         | Semi-expandida e sempre visivel: mostra icones + label curto (72px de largura); sem hamburguer                                   | Apenas titulo da tela + acao contextual                                                                | Conteudo ocupa largura restante com margin-left: 72px  |
| lg+ (desktop)       | Totalmente expandida e fixada: mostra icone + label completo (240px); hamburguer vira botao de colapsar                          | Breadcrumb + acoes multiplas                                                                           | Conteudo ocupa largura restante com margin-left: 240px |

**34.2.2 Itens do Drawer Admin --- ordem e icones**

| **Ordem** | **Item**          | **Icone (Heroicons)**    | **Rota Angular**     | **Visivel para** |
|-----------|-------------------|--------------------------|----------------------|------------------|
| 1         | Dashboard         | squares-2x2              | /admin/dashboard     | ADMIN + MASTER   |
| 2         | Boloes            | ticket                   | /admin/bolaes        | ADMIN + MASTER   |
| 3         | Participantes     | users                    | /admin/participantes | ADMIN + MASTER   |
| 4         | Sorteios          | sparkles                 | /admin/sorteios      | ADMIN + MASTER   |
| 5         | Premios           | trophy                   | /admin/premios       | ADMIN + MASTER   |
| 6         | WhatsApp          | chat-bubble-left-right   | /admin/whatsapp      | ADMIN + MASTER   |
| 7         | Google Drive      | cloud-arrow-up           | /admin/google-drive  | ADMIN + MASTER   |
| 8         | Relatorios        | document-chart-bar       | /admin/relatorios    | ADMIN + MASTER   |
| \-\--     | Separador         | \-\--                    | \-\--                | \-\--            |
| 9         | Gestao de Tenants | building-office-2        | /master/tenants      | MASTER apenas    |
| 10        | Painel de Testes  | beaker                   | /master/testes       | MASTER apenas    |
| \-\--     | Separador         | \-\--                    | \-\--                | \-\--            |
| 11        | Configuracoes     | cog-6-tooth              | /admin/configuracoes | ADMIN + MASTER   |
| 12        | Sair              | arrow-right-on-rectangle | logout()             | ADMIN + MASTER   |

**34.2.3 Header mobile do painel Admin**

- Altura: 56px fixo; background na cor primaria do tenant (branding)

- Esquerda: botao hamburguer 44x44px (touch target minimo)

- Centro: nome da tela atual em 16px/500

- Direita: acao contextual da tela --- ex: botao \'+\' em listas, botao \'Exportar\' em relatorios, vazio em telas de detalhe

- Badge de notificacao no hamburguer: numero de premios a pagar pendentes (se \> 0)

## 34.3 Portal do Participante --- Bottom Navigation {#portal-do-participante-bottom-navigation}

**34.3.1 Estrutura da Bottom Navigation**

| **Posicao**  | **Item**    | **Icone**   | **Rota**          | **Descricao**                                                    |
|--------------|-------------|-------------|-------------------|------------------------------------------------------------------|
| 1 (esquerda) | Meus Boloes | home        | /portal/bolaes    | Lista de todos os boloes em que tem cotas                        |
| 2            | Ranking     | chart-bar   | /portal/ranking   | Ranking geral do bolao selecionado com posicao propria destacada |
| 3            | Palpites    | list-bullet | /portal/palpites  | Palpites registrados e acertos por sorteio                       |
| 4 (direita)  | Premiacao   | star        | /portal/premiacao | Status de premiacao, valor a receber e historico de pagamento    |

**34.3.2 Comportamento da Bottom Nav**

- Altura: 60px fixo + safe area do iPhone (padding-bottom: env(safe-area-inset-bottom)) para nao ficar atras da barra de home do iOS

- Sempre visivel no portal --- nao some ao fazer scroll

- Item ativo: icone na cor primaria (#1F4E79) + label em negrito; inativos em cinza

- Badge no item Premiacao: ponto vermelho se houver premio A_PAGAR nao visualizado

- No desktop (lg+): bottom nav some e os 4 itens viram sidebar lateral esquerda de 200px

**34.3.3 Header do portal do participante**

- Altura: 56px; background azul escuro (#1F4E79)

- Esquerda: logo/nome do tenant (branding)

- Direita: nome do participante (truncado) + botao de sair (limpar sessao OTP)

- Sem hamburguer --- a navegacao e toda pelo bottom nav

## 34.4 Adaptacao de Componentes para Mobile {#adaptacao-de-componentes-para-mobile}

**34.4.1 Tabelas de dados (listas de participantes, ranking, premios)**

- Mobile (base/sm): tabelas viram cards empilhados --- cada linha da tabela vira um card com os campos em layout de chave:valor. Ex: tabela de ranking com colunas (posicao, nome, acertos, premio) vira card com: \'3o lugar · Ana Silva · 8 acertos · A_PAGAR\'

- Tablet (md): tabela horizontal com scroll lateral --- wrapper com overflow-x: auto; mostrar apenas colunas essenciais (ocultar colunas secundarias com hidden md:table-cell)

- Desktop (lg+): tabela completa com todas as colunas

- Nunca usar tabela horizontal em mobile sem scroll --- texto nao pode ser truncado sem tooltip

**34.4.2 Formularios**

- Todos os inputs: width: 100% em mobile; nunca dois inputs lado a lado em telas \< 640px

- Labels sempre acima do input (nunca inline) em mobile

- Botoes de acao: width: 100% em mobile (facil de tocar); auto-width em desktop

- Teclado numerico para campos de numeros (inputmode=\'numeric\'): palpites, celular, numero de concurso

- Selects nativos do iOS/Android para listas curtas (\< 10 opcoes); custom dropdown para listas longas

**34.4.3 Grid de numeros (palpites --- 60 bolas)**

- Mobile: grid 10 colunas x 6 linhas de botoes 32x32px com gap de 4px --- cabe em 360px de largura

- Touch target de 32px e aceitavel para selecao deliberada (usuario escolhe com cuidado); menor nao e recomendado

- Numeros selecionados com fundo azul; sorteados com fundo verde; combinacao (palpite E sorteado) com estrela

- Contador fixo no topo: \'7 de 10 numeros selecionados\' --- atualiza em tempo real

**34.4.4 Cards de resumo (dashboard)**

- Mobile: 2 cards por linha (grid 2 colunas) com dados resumidos

- Desktop: 4 cards por linha

- Cada card: icone + label + valor grande --- sem graficos complexos no mobile

**34.4.5 Modais e dialogs de confirmacao**

- Mobile: modal ocupa 100% da largura e ancora na base da tela (bottom sheet) --- mais natural que modal centrado

- Desktop: modal centrado com largura maxima de 480px

- Nunca usar modais para formularios longos em mobile --- usar tela dedicada (navigate + back)

- Confirmacoes criticas (registrar sorteio, encerrar bolao): bottom sheet com texto explicativo + dois botoes empilhados

**34.4.6 Notificacoes e toasts**

- Posicao mobile: topo da tela (abaixo do header fixo), largura 100%

- Posicao desktop: canto inferior direito, largura 360px

- Auto-dismiss: 4 segundos para sucesso; 8 segundos para erro; toasts de erro tem botao \'Fechar\' explicito

## 34.5 Touch Targets e Espacamento {#touch-targets-e-espacamento}

| **Elemento**                       | **Tamanho Minimo**                                 | **Implementacao Tailwind**                  |
|------------------------------------|----------------------------------------------------|---------------------------------------------|
| Botoes de acao principal           | 48x48px                                            | min-h-12 min-w-12 (ou h-12 w-full)          |
| Itens do drawer                    | 48px de altura                                     | py-3 (12px top+bottom) com conteudo de 24px |
| Itens do bottom nav                | 60px de altura x largura do item                   | h-15 flex-1                                 |
| Hamburguer e icones de header      | 44x44px                                            | h-11 w-11 flex items-center justify-center  |
| Links e acoes secundarias          | 44px de altura                                     | min-h-11 inline-flex items-center           |
| Celulas de tabela em mobile (card) | 48px de altura minima                              | min-h-12 py-3                               |
| Bolas do grid de palpites          | 32x32px (excecao deliberada --- selecao cuidadosa) | h-8 w-8                                     |
| Espacamento entre itens clicaveis  | Minimo 8px entre bordas                            | gap-2                                       |

## 34.6 Tipografia Responsiva {#tipografia-responsiva}

| **Elemento**               | **Mobile (base)** | **Tablet (md)** | **Desktop (lg)** | **Tailwind**                                 |
|----------------------------|-------------------|-----------------|------------------|----------------------------------------------|
| Titulo da tela (h1)        | 20px / 500        | 22px / 500      | 24px / 500       | text-xl md:text-2xl font-medium              |
| Subtitulo de secao (h2)    | 16px / 500        | 18px / 500      | 18px / 500       | text-base md:text-lg font-medium             |
| Corpo / labels             | 14px / 400        | 14px / 400      | 15px / 400       | text-sm lg:text-\[15px\]                     |
| Dados de tabela            | 13px / 400        | 14px / 400      | 14px / 400       | text-\[13px\] md:text-sm                     |
| Valor de premio (destaque) | 24px / 500        | 28px / 500      | 32px / 500       | text-2xl md:text-3xl lg:text-4xl font-medium |
| Badge / status             | 11px / 500        | 12px / 500      | 12px / 500       | text-\[11px\] md:text-xs font-medium         |
| Numero de cota (grid)      | 13px / 500        | 13px / 500      | 13px / 500       | text-\[13px\] font-medium                    |

## 34.7 Performance Mobile {#performance-mobile}

- Lazy loading obrigatorio: cada feature module do Angular carregado apenas quando a rota e acessada --- reducao do bundle inicial para \< 200KB

- Imagens: usar NgOptimizedImage do Angular 15+ para srcset automatico e lazy loading nativo

- Listas longas (ranking com 9.244 itens): usar Virtual Scroll do Angular CDK (@angular/cdk/scrolling) --- renderiza apenas os itens visiveis

- Animacoes: usar prefers-reduced-motion para desabilitar transicoes em dispositivos que o usuario configurou assim

- Supabase Realtime: conectar o canal apenas quando a tela de ranking esta ativa; desconectar ao navegar para outra tela (ngOnDestroy)

## 34.8 Atualizacao do RNF-04 --- Usabilidade (Mobile-First) {#atualizacao-do-rnf-04-usabilidade-mobile-first}

Esta secao substitui e expande o RNF-04 original. Todos os requisitos abaixo sao obrigatorios:

- O sistema e desenvolvido mobile-first: toda decisao de layout comeca pelo breakpoint base (celular) e e expandida para telas maiores

- Painel Admin: drawer de navegacao no mobile, sidebar expandida no desktop --- especificado em detalhe na secao 34.2

- Portal do Participante: bottom navigation com 4 itens no mobile, sidebar no desktop --- especificado em detalhe na secao 34.3

- Touch targets minimos: 44px para acoes secundarias, 48px para acoes primarias --- exceto grid de palpites (32px deliberado)

- Formularios: inputs 100% de largura, labels acima, teclado numerico para campos numericos

- Tabelas: viram cards empilhados no mobile; scroll horizontal no tablet; completas no desktop

- Modais: bottom sheets no mobile; modais centrados no desktop

- Virtual scroll para listas com mais de 100 itens

- Bundle inicial \< 200KB via lazy loading de todos os feature modules

- Testar obrigatoriamente em: iPhone SE (375px) como menor tela suportada, Chrome DevTools com throttle de 3G lento

## 34.9 Criterios de Aceite --- Responsividade {#criterios-de-aceite-responsividade}

| **ID**    | **Criterio**                                   | **Como Verificar**                                                                             |
|-----------|------------------------------------------------|------------------------------------------------------------------------------------------------|
| CA-RES-01 | Drawer abre e fecha corretamente no mobile     | Em 375px: tocar hamburguer abre drawer; tocar overlay fecha; tocar item navega e fecha         |
| CA-RES-02 | Bottom nav do portal funciona em iOS e Android | Verificar safe area no iPhone (sem sobreposicao com barra de home); itens com 60px de altura   |
| CA-RES-03 | Tabela de ranking vira cards no mobile         | Em 375px: lista de participantes exibe cards, nao tabela horizontal com scroll                 |
| CA-RES-04 | Grid de palpites funciona em 375px             | 60 botoes de 32px cabem em 10 colunas sem overflow; toque seleciona o numero correto           |
| CA-RES-05 | Formulario de cota em mobile                   | Todos os inputs largura 100%; sem layout de 2 colunas; teclado numerico nos campos de palpite  |
| CA-RES-06 | Confirmacao critica como bottom sheet          | Em mobile: registrar sorteio abre bottom sheet; em desktop: abre modal centrado                |
| CA-RES-07 | Sidebar expandida no desktop                   | Em 1024px+: sidebar de 240px sempre visivel; nao tem hamburguer; conteudo usa largura restante |
| CA-RES-08 | Virtual scroll no ranking                      | Lista de 9.244 participantes carrega instantaneamente; scroll suave sem travar                 |
| CA-RES-09 | Bundle inicial abaixo de 200KB                 | Verificar no Chrome DevTools: Network → filtrar JS → soma dos chunks iniciais \< 200KB         |
| CA-RES-10 | Funciona no iPhone SE (375px)                  | Sem overflow horizontal em nenhuma tela; sem texto cortado; todos os botoes tocaveis           |

# 35. Progressive Web App (PWA) {#progressive-web-app-pwa}

O sistema e desenvolvido como PWA --- Progressive Web App. Isso significa que usuarios podem instalar o Nosso Bolao diretamente na tela inicial do celular, sem App Store, sem APK. O app instalado abre sem barra do navegador, com ícone proprio e splash screen, comportando-se como um aplicativo nativo.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>O que o usuario ganha com o PWA:</strong></p>
<p>Icone na tela inicial — acesso em 1 toque, sem abrir o navegador</p>
<p>Tela cheia sem barra de endereco — experiencia de app nativo</p>
<p>Carregamento instantaneo do shell — recursos estaticos cacheados pelo Service Worker</p>
<p>Funciona offline para dados cacheados — ranking e palpites visiveis sem internet</p>
<p>Notificacoes push (futuro) — alertar participante sobre resultado de sorteio</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 35.1 Configuracao Angular PWA {#configuracao-angular-pwa}

**35.1.1 Instalacao**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Adicionar suporte a PWA no projeto Angular:</strong></p>
<p>cd apps/frontend</p>
<p>ng add @angular/pwa</p>
<p># O comando gera automaticamente:</p>
<p># - ngsw-config.json (configuracao do Service Worker)</p>
<p># - manifest.webmanifest (metadados do app)</p>
<p># - Icones em src/assets/icons/ (vários tamanhos)</p>
<p># - Registra o Service Worker no app.config.ts</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

**35.1.2 Web App Manifest (manifest.webmanifest)**

O manifest define como o app aparece quando instalado. Configurar por tenant usando o branding (logo e cor primaria) salvo no Supabase Storage:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>manifest.webmanifest — valores base (personalizados por tenant via branding):</strong></p>
<p>{</p>
<p>'name': 'Nosso Bolao',</p>
<p>'short_name': 'Nosso Bolao',</p>
<p>'description': 'Gerencie seu bolao da Mega-Sena',</p>
<p>'start_url': '/',</p>
<p>'display': 'standalone',</p>
<p>'orientation': 'portrait',</p>
<p>'background_color': '#FFFFFF',</p>
<p>'theme_color': '#1F4E79',</p>
<p>'icons': [</p>
<p>{ 'src': 'assets/icons/icon-72x72.png', 'sizes': '72x72', 'type': 'image/png' },</p>
<p>{ 'src': 'assets/icons/icon-96x96.png', 'sizes': '96x96', 'type': 'image/png' },</p>
<p>{ 'src': 'assets/icons/icon-128x128.png', 'sizes': '128x128', 'type': 'image/png' },</p>
<p>{ 'src': 'assets/icons/icon-144x144.png', 'sizes': '144x144', 'type': 'image/png' },</p>
<p>{ 'src': 'assets/icons/icon-192x192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any maskable' },</p>
<p>{ 'src': 'assets/icons/icon-512x512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable' }</p>
<p>]</p>
<p>}</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- theme_color: usa a cor primaria do tenant (branding.cor_primaria) injetada em tempo de build ou via meta tag dinamica

- Icone maskable: obrigatorio para Android --- o sistema aplica mascara (circulo, squircle) sobre a imagem. Usar Safe Zone de 80% da area do icone para o conteudo principal

- Icones gerados com a ferramenta PWABuilder (pwabuilder.com) ou realfavicongenerator.net a partir do logo do tenant

## 35.2 Service Worker --- Estrategia de Cache {#service-worker-estrategia-de-cache}

O Service Worker e o cerebro do PWA --- intercepta requisicoes e decide o que buscar da rede ou do cache. Estrategias diferentes para tipos diferentes de recurso:

| **Tipo de Recurso**                | **Estrategia**                                                  | **TTL**                             | **Justificativa**                                                |
|------------------------------------|-----------------------------------------------------------------|-------------------------------------|------------------------------------------------------------------|
| App shell (HTML, JS, CSS, fontes)  | Cache First --- serve do cache; atualiza em background          | Vitalicio (invalida no novo deploy) | Carregamento instantaneo; o shell raramente muda                 |
| Assets estaticos (icones, imagens) | Cache First                                                     | 30 dias                             | Imagens nao mudam entre versoes                                  |
| API do NestJS (/api/v1/\*)         | Network First --- tenta a rede; usa cache em caso de falha      | 5 minutos                           | Dados frescos quando online; funciona offline com dados recentes |
| Ranking do bolao                   | Stale While Revalidate --- serve cache e atualiza em background | 2 minutos                           | Balanco entre velocidade e frescor dos dados                     |
| Supabase Realtime                  | Nao cacheavel --- sempre ao vivo                                | N/A                                 | WebSocket; sem cache possivel                                    |
| Autenticacao (tokens)              | Network Only --- nunca cacheado                                 | N/A                                 | Seguranca: tokens nunca ficam no cache do SW                     |
| Google Sheets API                  | Network Only                                                    | N/A                                 | Dados externos; cache pode desatualizar planilha                 |

**35.2.1 ngsw-config.json --- configuracao das estrategias**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>ngsw-config.json (principal):</strong></p>
<p>{</p>
<p>'index': '/index.html',</p>
<p>'assetGroups': [</p>
<p>{</p>
<p>'name': 'app-shell',</p>
<p>'installMode': 'prefetch',</p>
<p>'updateMode': 'prefetch',</p>
<p>'resources': { 'files': ['/favicon.ico', '/index.html', '/manifest.webmanifest', '/*.css', '/*.js'] }</p>
<p>},</p>
<p>{</p>
<p>'name': 'assets',</p>
<p>'installMode': 'lazy',</p>
<p>'updateMode': 'prefetch',</p>
<p>'resources': { 'files': ['/assets/**', '/*.(svg|cur|jpg|jpeg|png|webp|gif|otf|ttf|woff|woff2|ani)'] }</p>
<p>}</p>
<p>],</p>
<p>'dataGroups': [</p>
<p>{</p>
<p>'name': 'api-ranking',</p>
<p>'urls': ['/api/v1/bolaes/*/ranking'],</p>
<p>'cacheConfig': { 'strategy': 'freshness', 'maxSize': 10, 'maxAge': '2m', 'timeout': '3s' }</p>
<p>},</p>
<p>{</p>
<p>'name': 'api-geral',</p>
<p>'urls': ['/api/v1/**'],</p>
<p>'cacheConfig': { 'strategy': 'freshness', 'maxSize': 50, 'maxAge': '5m', 'timeout': '5s' }</p>
<p>}</p>
<p>]</p>
<p>}</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 35.3 Banner de Instalacao {#banner-de-instalacao}

O navegador emite o evento beforeinstallprompt quando o app pode ser instalado. O sistema intercepta esse evento e exibe um banner customizado --- diferente do prompt nativo do browser, que e generico. O design do banner foi definido acima e varia entre o painel Admin e o portal do participante.

**35.3.1 Painel Admin --- Banner branco ancorando na base**

- Visual: banner branco com borda superior sutil; icone do app (36x36px); titulo \'Nosso Bolao\'; subtitulo \'Instalar como app no celular\'; botao azul \'Instalar app\'; link \'Agora nao\'

- Posicao: fixed bottom-0; acima do conteudo (nao interfere com drawer nem header)

- Aparece: 30 segundos apos o primeiro login bem-sucedido do Admin

- Nao aparece se: usuario ja dispensou nos ultimos 30 dias (localStorage: pwa_dismissed_at) ou ja instalou

- Botao \'Instalar app\': chama deferredPrompt.prompt(); aguarda deferredPrompt.userChoice; loga resultado

- Botao \'Agora nao\': salva timestamp em localStorage; esconde banner por 30 dias

**35.3.2 Portal do Participante --- Banner azul acima do bottom nav**

- Visual: banner na cor primaria do tenant (#1F4E79); icone branco; titulo \'Salvar na tela inicial\'; subtitulo \'Acesse seu bolao em 1 toque\'; botao branco \'Adicionar a tela inicial\'; link discreto \'Talvez depois\'

- Posicao: ancorando logo acima do bottom nav (bottom: 60px) --- nao cobre a navegacao

- Aparece: na primeira vez que o participante autentica com OTP e acessa o portal

- Logica de supressao: identica ao Admin --- localStorage pwa_portal_dismissed_at; 30 dias

- Em iOS (Safari): o evento beforeinstallprompt nao existe. Exibir instrucao manual: \'Toque em Compartilhar (icone de upload) e depois em Adicionar a Tela Inicial\'

**35.3.3 PwaInstallService --- implementacao Angular**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>apps/frontend/src/app/core/services/pwa-install.service.ts — estrutura:</strong></p>
<p>@Injectable({ providedIn: 'root' })</p>
<p>export class PwaInstallService {</p>
<p>private deferredPrompt = signal&lt;BeforeInstallPromptEvent | null&gt;(null);</p>
<p>canInstall = computed(() =&gt; this.deferredPrompt() !== null);</p>
<p>isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());</p>
<p>isStandalone = window.matchMedia('(display-mode: standalone)').matches;</p>
<p>constructor() {</p>
<p>window.addEventListener('beforeinstallprompt', (e) =&gt; {</p>
<p>e.preventDefault();</p>
<p>this.deferredPrompt.set(e as BeforeInstallPromptEvent);</p>
<p>});</p>
<p>window.addEventListener('appinstalled', () =&gt; {</p>
<p>this.deferredPrompt.set(null);</p>
<p>this.logInstalacao();</p>
<p>});</p>
<p>}</p>
<p>async promptInstall(): Promise&lt;'accepted' | 'dismissed'&gt; {</p>
<p>const prompt = this.deferredPrompt();</p>
<p>if (!prompt) return 'dismissed';</p>
<p>prompt.prompt();</p>
<p>const { outcome } = await prompt.userChoice;</p>
<p>this.deferredPrompt.set(null);</p>
<p>return outcome;</p>
<p>}</p>
<p>shouldShowBanner(): boolean {</p>
<p>if (this.isStandalone) return false;</p>
<p>const dismissed = localStorage.getItem('pwa_dismissed_at');</p>
<p>if (!dismissed) return true;</p>
<p>const days30 = 30 * 24 * 60 * 60 * 1000;</p>
<p>return Date.now() - Number(dismissed) &gt; days30;</p>
<p>}</p>
<p>dismiss() { localStorage.setItem('pwa_dismissed_at', String(Date.now())); }</p>
<p>}</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 35.4 Comportamento Offline {#comportamento-offline}

Quando o usuario perde a conexao, o Service Worker entra em acao e o app continua funcionando para dados ja cacheados:

| **Tela / Funcionalidade**     | **Com internet**                      | **Sem internet**                                                                                             |
|-------------------------------|---------------------------------------|--------------------------------------------------------------------------------------------------------------|
| Dashboard Admin               | Dados ao vivo do Supabase             | Exibe ultima versao cacheada com banner amarelo: \'Voce esta offline --- exibindo dados de X minutos atras\' |
| Ranking do bolao              | Atualizado em tempo real via Realtime | Exibe cache de ate 2 minutos; Realtime desconecta graciosamente                                              |
| Cadastrar cota                | Funciona normalmente                  | Formulario bloqueado com mensagem: \'Conexao necessaria para cadastrar participantes\'                       |
| Registrar sorteio             | Funciona normalmente                  | Bloqueado --- operacao critica nao pode ser feita offline                                                    |
| Portal --- palpites e ranking | Ao vivo                               | Exibe cache; ranking pode estar desatualizado (indicado visualmente)                                         |
| Portal --- autenticacao OTP   | Funciona (envia email/WhatsApp)       | Bloqueado --- OTP requer conexao                                                                             |
| App shell e navegacao         | Rede + cache                          | 100% do cache --- navegacao entre telas funciona normalmente                                                 |

- Banner de offline: componente global que monitora navigator.onLine e o evento online/offline; exibe barra amarela no topo quando sem conexao; some automaticamente ao reconectar

- Dados com cache exibem timestamp: \'Atualizado ha X minutos\' no canto da tela quando em modo offline

## 35.5 Atualizacao do App {#atualizacao-do-app}

Quando um novo deploy e feito, o Service Worker detecta a nova versao em background. O usuario vê uma notificacao discreta:

- Notificacao: snackbar no topo --- \'Nova versao disponivel\' + botao \'Atualizar agora\'

- Ao clicar: SwUpdate.activateUpdate() + window.location.reload() --- aplica nova versao imediatamente

- Sem clique: nova versao ativa na proxima vez que fechar e reabrir o app

- Implementacao: SwUpdate do @angular/service-worker com versionUpdates pipe

## 35.6 Multitenancy e PWA {#multitenancy-e-pwa}

Em um sistema multitenant onde cada tenant tem seu proprio branding, o PWA precisa de cuidados especiais:

- theme_color dinamico: injetar a cor primaria do tenant via meta tag no index.html em tempo de build por tenant, ou via Angular Universal SSR se disponivel

- Icones por tenant: cada tenant tem seus proprios icones no Supabase Storage. O manifest e gerado dinamicamente pelo NestJS servindo uma rota /manifest.webmanifest?tenant=slug que retorna o JSON com os icones e cores corretos

- Service Worker por origem: como cada tenant tem seu proprio subdominio (ex: tenant1.nossobolao.com.br), o Service Worker e automaticamente isolado por origem --- sem conflito entre tenants

- Rota do manifest: configurar o Angular para apontar para /api/v1/pwa/manifest ao inves do arquivo estatico --- permite personalizacao dinamica por tenant

## 35.7 Criterios de Aceite --- PWA {#criterios-de-aceite-pwa}

| **ID**    | **Criterio**                             | **Como Verificar**                                                                                                                                |
|-----------|------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| CA-PWA-01 | App instalavel no Android                | Chrome em Android: visitar o app, aguardar 30 segundos de uso, banner aparece; instalar; icone aparece na tela inicial; abre sem barra do browser |
| CA-PWA-02 | App instalavel no iOS                    | Safari em iPhone: visitar o app, banner de instrucao aparece; seguir instrucao (Compartilhar → Adicionar); icone aparece; abre em modo standalone |
| CA-PWA-03 | Banner Admin aparece apos 30s            | Logar como Admin, aguardar 30 segundos; banner branco aparece na base da tela                                                                     |
| CA-PWA-04 | Banner Portal aparece na primeira visita | Autenticar com OTP no portal; banner azul aparece acima do bottom nav                                                                             |
| CA-PWA-05 | Dispensar esconde por 30 dias            | Clicar \'Agora nao\'; recarregar pagina; banner nao aparece; checar localStorage: pwa_dismissed_at salvo                                          |
| CA-PWA-06 | App funciona offline (shell + cache)     | Instalar o app; desativar wifi e dados; abrir o app; dashboard exibe cache com banner amarelo; navegacao entre telas funciona                     |
| CA-PWA-07 | Operacoes criticas bloqueadas offline    | Sem internet: tentar cadastrar cota; botao desabilitado com mensagem explicativa                                                                  |
| CA-PWA-08 | Notificacao de update                    | Fazer novo deploy; abrir o app instalado; snackbar \'Nova versao disponivel\' aparece; clicar Atualizar; app recarrega com nova versao            |
| CA-PWA-09 | Pontuacao Lighthouse \>= 90              | DevTools → Lighthouse → Progressive Web App; pontuar \>= 90 em todas as categorias PWA                                                            |
| CA-PWA-10 | manifest.webmanifest com cor do tenant   | Acessar /manifest.webmanifest com slug do tenant; theme_color deve refletir a cor configurada no branding do tenant                               |

# 36. Guia de Deploy --- Do Zero ao Online (Custo Zero) {#guia-de-deploy-do-zero-ao-online-custo-zero}

Este guia cobre o processo completo para colocar o sistema online pela primeira vez usando exclusivamente servicos gratuitos. Ao final, o sistema estara rodando com: banco Supabase, backend NestJS no Fly.io, frontend Angular no Vercel e Redis Upstash para o BullMQ.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Stack de deploy Fase 0 — R$ 0/mes:</strong></p>
<p>Banco + Auth + Storage: Supabase Free</p>
<p>Backend NestJS + Worker BullMQ: Fly.io Free (nao hiberna; 3 GB volume persistente)</p>
<p>Frontend Angular: Vercel Free (CDN global; SSL automatico; deploy por push)</p>
<p>Redis: Upstash Free (10.000 comandos/dia)</p>
<p>CI/CD: GitHub Actions Free (2.000 min/mes)</p>
<p>SSL + CDN: Cloudflare Free (opcional, recomendado para dominio proprio)</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 34.1 Contas a Criar (fazer antes de tudo) {#contas-a-criar-fazer-antes-de-tudo}

| **Servico** | **URL**      | **O que criar**                                                                  | **Tempo estimado** |
|-------------|--------------|----------------------------------------------------------------------------------|--------------------|
| GitHub      | github.com   | Repositorio privado para o monorepo. Habilitar GitHub Actions.                   | 5 min              |
| Supabase    | supabase.com | Novo projeto (plano Free). Anotar: URL do projeto, anon key e service_role key.  | 10 min             |
| Upstash     | upstash.com  | Novo banco Redis (plano Free). Anotar: REDIS_URL com senha embutida.             | 5 min              |
| Fly.io      | fly.io       | Conta gratuita. Nao precisa de cartao de credito para o tier Free. Instalar CLI. | 10 min             |
| Vercel      | vercel.com   | Conta gratuita conectada ao GitHub. Importar repositorio depois.                 | 5 min              |

## 34.2 Configuracao do Supabase (Passo 1) {#configuracao-do-supabase-passo-1}

**34.2.1 Criar o projeto e aplicar o schema**

| **Passo** | **Comando / Acao**                           | **Observacao**                                                                                  |
|-----------|----------------------------------------------|-------------------------------------------------------------------------------------------------|
| 1         | supabase login                               | Autenticar com a conta Supabase no CLI                                                          |
| 2         | supabase link \--project-ref SEU_PROJECT_REF | Project ref esta na URL: supabase.com/dashboard/project/SEU_PROJECT_REF                         |
| 3         | supabase db push                             | Aplica todas as migrations em supabase/migrations/ no banco remoto. Inclui o initial_schema.sql |
| 4         | supabase db push \--file supabase/seed.sql   | Aplica dados de seed (feature flags iniciais e usuario Master de dev)                           |

**34.2.2 Configuracoes obrigatorias no painel Supabase**

- CRITICO --- Desabilitar auto-pause: Settings → General → Infrastructure → \'Pause project\' → desabilitar. Sem isso o banco hiberna apos 7 dias sem acesso e quebra a producao.

- Desabilitar sign-up publico: Authentication → Providers → Email → desabilitar \'Enable sign ups\'. Apenas o Master cria usuarios via painel.

- Configurar OTP expiry: Authentication → Email Templates → \'Magic Link\' → definir expiry para 600 segundos (10 minutos).

- Criar usuario Master: Authentication → Users → \'Invite user\' → email do Master. Apos criar, editar user_metadata via SQL: UPDATE auth.users SET raw_user_meta_data = \'{\"papel\":\"MASTER\"}\'::jsonb WHERE email = \'master@seudominio.com\';

- Copiar as chaves: Settings → API → copiar \'Project URL\', \'anon public\' e \'service_role\' para o .env de producao.

## 34.3 Configuracao do Upstash Redis (Passo 2) {#configuracao-do-upstash-redis-passo-2}

| **Passo** | **Acao**                                                                                                        |
|-----------|-----------------------------------------------------------------------------------------------------------------|
| 1         | Acessar console.upstash.com → Create Database                                                                   |
| 2         | Nome: nosso-bolao-prod \| Regiao: escolher South America (sa-east-1) para menor latencia \| Plano: Free         |
| 3         | Apos criar: copiar a \'Redis URL\' no formato: rediss://:senha@host.upstash.io:6379                             |
| 4         | Colar no REDIS_URL do arquivo de secrets do Fly.io (passo 34.4)                                                 |
| 5         | Configurar no painel Upstash: Eviction Policy = noeviction (nao remover dados do BullMQ por pressao de memoria) |

## 34.4 Deploy do Backend NestJS no Fly.io (Passo 3) {#deploy-do-backend-nestjs-no-fly.io-passo-3}

**34.4.1 Instalar o Fly CLI e autenticar**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Instalacao do Fly CLI:</strong></p>
<p># macOS</p>
<p>brew install flyctl</p>
<p># Linux</p>
<p>curl -L https://fly.io/install.sh | sh</p>
<p># Windows</p>
<p>pwsh -Command 'iwr https://fly.io/install.ps1 -useb | iex'</p>
<p># Autenticar</p>
<p>fly auth login</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

**34.4.2 Dockerfile do NestJS**

Criar apps/backend/Dockerfile na raiz do projeto backend:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>apps/backend/Dockerfile</strong></p>
<p>FROM node:22-alpine AS builder</p>
<p>WORKDIR /app</p>
<p>COPY package*.json ./</p>
<p>RUN npm ci</p>
<p>COPY . .</p>
<p>RUN npm run build</p>
<p>FROM node:22-alpine AS production</p>
<p>WORKDIR /app</p>
<p># Rodar como usuario nao-root (seguranca — secao 16.5)</p>
<p>RUN addgroup -S appgroup &amp;&amp; adduser -S appuser -G appgroup</p>
<p>COPY --from=builder /app/dist ./dist</p>
<p>COPY --from=builder /app/node_modules ./node_modules</p>
<p>COPY --from=builder /app/package.json ./</p>
<p>USER appuser</p>
<p>EXPOSE 3000</p>
<p>CMD ['node', 'dist/main.js']</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

**34.4.3 Criar e configurar o app da API no Fly.io**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Comandos — API NestJS:</strong></p>
<p>cd apps/backend</p>
<p># Criar o app (responder as perguntas: nome, regiao sa (Sao Paulo))</p>
<p>fly launch --name nosso-bolao-api --region gru</p>
<p># Quando perguntar 'Would you like to deploy now?': responder NO</p>
<p># O comando gera o arquivo fly.toml automaticamente</p>
<p># Criar volume persistente para sessoes WhatsApp (3 GB gratis)</p>
<p>fly volumes create whatsapp_sessions --size 3 --region gru --app nosso-bolao-api</p>
<p># Configurar todos os secrets (variaveis de ambiente em producao)</p>
<p>fly secrets set APP_ENV=production --app nosso-bolao-api</p>
<p>fly secrets set SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co --app nosso-bolao-api</p>
<p>fly secrets set SUPABASE_ANON_KEY=eyJ... --app nosso-bolao-api</p>
<p>fly secrets set SUPABASE_SERVICE_KEY=eyJ... --app nosso-bolao-api</p>
<p>fly secrets set SUPABASE_JWT_SECRET=seu-jwt-secret --app nosso-bolao-api</p>
<p>fly secrets set REDIS_URL=rediss://:senha@host.upstash.io:6379 --app nosso-bolao-api</p>
<p>fly secrets set WHATSAPP_SESSION_SECRET=$(openssl rand -hex 32) --app nosso-bolao-api</p>
<p>fly secrets set WHATSAPP_SESSION_DIR=/data/whatsapp-sessions --app nosso-bolao-api</p>
<p>fly secrets set GOOGLE_CREDENTIALS_SECRET=$(openssl rand -hex 32) --app nosso-bolao-api</p>
<p>fly secrets set GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32) --app nosso-bolao-api</p>
<p>fly secrets set FRONTEND_URL=https://seu-app.vercel.app --app nosso-bolao-api</p>
<p>fly secrets set CORS_ORIGINS=https://seu-app.vercel.app --app nosso-bolao-api</p>
<p>fly secrets set LOG_LEVEL=info --app nosso-bolao-api</p>
<p># Fazer o primeiro deploy</p>
<p>fly deploy --app nosso-bolao-api</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

**34.4.4 fly.toml da API (gerado pelo fly launch, revisar estes pontos)**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>fly.toml — ajustes necessarios apos o fly launch:</strong></p>
<p>app = 'nosso-bolao-api'</p>
<p>primary_region = 'gru'</p>
<p>[build]</p>
<p>dockerfile = 'Dockerfile'</p>
<p>[env]</p>
<p>PORT = '3000'</p>
<p>API_PORT = '3000'</p>
<p>[[mounts]]</p>
<p>source = 'whatsapp_sessions'</p>
<p>destination = '/data/whatsapp-sessions'</p>
<p>[http_service]</p>
<p>internal_port = 3000</p>
<p>force_https = true</p>
<p>auto_stop_machines = false # IMPORTANTE: nao hibernar</p>
<p>auto_start_machines = true</p>
<p>min_machines_running = 1 # Sempre 1 instancia ativa</p>
<p>[[vm]]</p>
<p>memory = '256mb'</p>
<p>cpu_kind = 'shared'</p>
<p>cpus = 1</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 34.5 Deploy do Worker BullMQ no Fly.io (Passo 4) {#deploy-do-worker-bullmq-no-fly.io-passo-4}

O worker BullMQ roda como um processo separado --- ele processa as filas de calculo de acertos e envio de WhatsApp. Precisa de um app separado no Fly.io para isolamento de carga.

**34.5.1 Dockerfile do Worker**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>apps/backend/Dockerfile.worker</strong></p>
<p>FROM node:22-alpine AS builder</p>
<p>WORKDIR /app</p>
<p>COPY package*.json ./</p>
<p>RUN npm ci</p>
<p>COPY . .</p>
<p>RUN npm run build</p>
<p>FROM node:22-alpine AS production</p>
<p>WORKDIR /app</p>
<p>RUN addgroup -S appgroup &amp;&amp; adduser -S appuser -G appgroup</p>
<p>COPY --from=builder /app/dist ./dist</p>
<p>COPY --from=builder /app/node_modules ./node_modules</p>
<p>USER appuser</p>
<p># Worker usa entrypoint diferente da API</p>
<p>CMD ['node', 'dist/worker.js']</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Comandos — Worker BullMQ:</strong></p>
<p>cd apps/backend</p>
<p>fly launch --name nosso-bolao-worker --region gru</p>
<p># Quando perguntar se quer deploy agora: NO</p>
<p># O worker precisa acessar o mesmo volume de sessoes WhatsApp</p>
<p># Usar o mesmo volume criado para a API via mount compartilhado</p>
<p># Configurar os mesmos secrets da API (copiar os mesmos valores)</p>
<p>fly secrets set APP_ENV=production --app nosso-bolao-worker</p>
<p>fly secrets set SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co --app nosso-bolao-worker</p>
<p>fly secrets set SUPABASE_SERVICE_KEY=eyJ... --app nosso-bolao-worker</p>
<p>fly secrets set REDIS_URL=rediss://:senha@host.upstash.io:6379 --app nosso-bolao-worker</p>
<p>fly secrets set WHATSAPP_SESSION_SECRET=MESMO_VALOR_DA_API --app nosso-bolao-worker</p>
<p>fly secrets set WHATSAPP_SESSION_DIR=/data/whatsapp-sessions --app nosso-bolao-worker</p>
<p># Deploy</p>
<p>fly deploy --app nosso-bolao-worker --dockerfile Dockerfile.worker</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>fly.toml do Worker — pontos principais:</strong></p>
<p>app = 'nosso-bolao-worker'</p>
<p>primary_region = 'gru'</p>
<p>[build]</p>
<p>dockerfile = 'Dockerfile.worker'</p>
<p># Worker nao expoe porta HTTP — apenas processa filas</p>
<p># Remover a secao [http_service] completamente</p>
<p>[http_service] # APAGAR esta secao no worker</p>
<p>[[vm]]</p>
<p>memory = '256mb'</p>
<p>cpu_kind = 'shared'</p>
<p>cpus = 1</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 34.6 Deploy do Frontend Angular no Vercel (Passo 5) {#deploy-do-frontend-angular-no-vercel-passo-5}

**34.6.1 Configuracao inicial via painel Vercel**

| **Passo** | **Acao**                                                     | **Observacao**                                                       |
|-----------|--------------------------------------------------------------|----------------------------------------------------------------------|
| 1         | Acessar vercel.com → \'Add New Project\'                     | Fazer login com a conta GitHub                                       |
| 2         | Selecionar o repositorio nosso-bolao                         | Vercel detecta automaticamente que e um monorepo                     |
| 3         | Configurar Root Directory: apps/frontend                     | Apontar para a pasta do Angular dentro do monorepo                   |
| 4         | Framework Preset: Angular                                    | Vercel detecta automaticamente --- confirmar                         |
| 5         | Build Command: npm run build \-- \--configuration production | Garante build otimizado para producao                                |
| 6         | Output Directory: dist/frontend/browser                      | Caminho de saida padrao do Angular 17+; verificar no angular.json    |
| 7         | Configurar variaveis de ambiente (ver 34.6.2)                | Clicar em \'Environment Variables\' antes de fazer o primeiro deploy |
| 8         | Clicar em Deploy                                             | Vercel faz o build e publica. URL sera: nosso-bolao-xyz.vercel.app   |

**34.6.2 Variaveis de ambiente do Angular no Vercel**

No painel Vercel → Project → Settings → Environment Variables, adicionar:

| **Variavel**      | **Valor**                              | **Ambiente**         |
|-------------------|----------------------------------------|----------------------|
| SUPABASE_URL      | https://SEU_PROJECT_REF.supabase.co    | Production + Preview |
| SUPABASE_ANON_KEY | eyJhbGci\... (anon key --- publica)    | Production + Preview |
| API_URL           | https://nosso-bolao-api.fly.dev/api/v1 | Production           |
| APP_ENV           | production                             | Production           |

| **No Angular, variaveis de ambiente em tempo de build sao injetadas via environment.ts. O Vercel injeta as variaveis como variaveis de build --- configurar o angular.json para usar process.env ou usar a abordagem de environment files substituidos no build. Ver documentacao: angular.io/guide/build.** |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

**34.6.3 Deploy automatico a cada push**

- Vercel monitora a branch main por padrao --- todo push dispara rebuild e redeploy automatico

- PRs geram \'Preview Deployments\': URL unica por PR para testar antes de mergear na main

- Para configurar branch de producao: Project Settings → Git → Production Branch → main

- Para desabilitar previews de branches de feature (economizar build time): Project Settings → Git → desabilitar \'Preview for all branches\'

## 34.7 CI/CD Completo com GitHub Actions (Passo 6) {#cicd-completo-com-github-actions-passo-6}

Com Fly.io e Vercel configurados, o GitHub Actions orquestra: testes → deploy backend → deploy frontend. O Vercel ja faz o deploy automatico, entao o workflow do GitHub Actions foca no backend e nos testes.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>.github/workflows/deploy.yml — estrutura completa:</strong></p>
<p>name: CI/CD Pipeline</p>
<p>on:</p>
<p>push:</p>
<p>branches: [main]</p>
<p>pull_request:</p>
<p>branches: [main, develop]</p>
<p>jobs:</p>
<p># Job 1: Testes unitarios (roda em todo push e PR)</p>
<p>test-unit:</p>
<p>runs-on: ubuntu-latest</p>
<p>steps:</p>
<p>- uses: actions/checkout@v4</p>
<p>- uses: actions/setup-node@v4</p>
<p>with: { node-version: '22' }</p>
<p>- run: npm ci</p>
<p>- run: npm run test:ci # Jest com coverage</p>
<p># Job 2: Testes de integracao (apenas em PRs para main/develop)</p>
<p>test-integration:</p>
<p>if: github.event_name == 'pull_request'</p>
<p>needs: [test-unit]</p>
<p>runs-on: ubuntu-latest</p>
<p>env:</p>
<p>SUPABASE_URL_TEST: ${{ secrets.SUPABASE_URL_TEST }}</p>
<p>SUPABASE_SERVICE_KEY_TEST: ${{ secrets.SUPABASE_SERVICE_KEY_TEST }}</p>
<p>REDIS_URL: ${{ secrets.REDIS_URL_TEST }}</p>
<p>steps:</p>
<p>- uses: actions/checkout@v4</p>
<p>- run: npm ci &amp;&amp; npm run test:integration</p>
<p># Job 3: Deploy backend (apenas push na main, apos testes passarem)</p>
<p>deploy-backend:</p>
<p>if: github.ref == 'refs/heads/main' &amp;&amp; github.event_name == 'push'</p>
<p>needs: [test-unit]</p>
<p>runs-on: ubuntu-latest</p>
<p>steps:</p>
<p>- uses: actions/checkout@v4</p>
<p>- uses: superfly/flyctl-actions/setup-flyctl@master</p>
<p>- run: fly deploy --app nosso-bolao-api --remote-only</p>
<p>env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }</p>
<p>- run: fly deploy --app nosso-bolao-worker --dockerfile Dockerfile.worker --remote-only</p>
<p>env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }</p>
<p># Nota: deploy frontend e feito automaticamente pelo Vercel via GitHub integration</p>
<p># Nao precisa de job separado aqui</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

**Secrets necessarios no GitHub (Settings → Secrets → Actions):**

| **Secret**                | **Como obter**                                                                   |
|---------------------------|----------------------------------------------------------------------------------|
| FLY_API_TOKEN             | fly tokens create deploy -x 999999h (no terminal com fly CLI autenticado)        |
| SUPABASE_URL_TEST         | URL do projeto Supabase dedicado para testes (criar projeto separado)            |
| SUPABASE_SERVICE_KEY_TEST | service_role key do projeto de testes                                            |
| REDIS_URL_TEST            | URL do Upstash Free (pode ser o mesmo banco com prefixo diferente em dev)        |
| GITHUB_WEBHOOK_SECRET     | Mesmo valor configurado como secret no fly secrets set (para o painel de testes) |

## 34.8 Verificacao Pos-Deploy --- Checklist {#verificacao-pos-deploy-checklist}

**Supabase**

- \[ \] Auto-pause desabilitado: Settings → General → Infrastructure

- \[ \] Sign-up publico desabilitado: Authentication → Providers → Email

- \[ \] Schema aplicado: abrir Table Editor e confirmar que todas as 15 tabelas existem

- \[ \] RLS habilitado: abrir cada tabela e confirmar que \'Row Level Security\' aparece como ENABLED

- \[ \] Usuario Master criado: Authentication → Users → confirmar que existe com papel MASTER no user_metadata

- \[ \] Feature flags inseridas: Table Editor → feature_flags → confirmar 7 registros

**Fly.io --- API**

- \[ \] App online: fly status \--app nosso-bolao-api → State: running

- \[ \] Health check respondendo: curl https://nosso-bolao-api.fly.dev/health → {status: \'ok\', supabase: \'ok\', redis: \'ok\'}

- \[ \] Logs sem erros criticos: fly logs \--app nosso-bolao-api

- \[ \] Secrets configurados: fly secrets list \--app nosso-bolao-api (confirmar que todas as vars estao listadas)

- \[ \] Volume montado: fly volumes list \--app nosso-bolao-api → volume whatsapp_sessions listado

**Fly.io --- Worker**

- \[ \] Worker online: fly status \--app nosso-bolao-worker → State: running

- \[ \] Filas BullMQ ativas: fly logs \--app nosso-bolao-worker → confirmar log \'Worker conectado ao Redis\'

**Vercel --- Frontend**

- \[ \] Build bem-sucedido: acessar vercel.com → projeto → ultimo deployment com status \'Ready\'

- \[ \] App carregando: acessar https://nosso-bolao-xyz.vercel.app → tela de login aparece

- \[ \] Login funcionando: entrar com o usuario Master criado no Supabase

- \[ \] API conectada: painel do Master carrega sem erros de rede no console do browser

**Teste end-to-end manual de smoke test**

| **Teste**             | **Acao**                                                         | **Resultado Esperado**                                           |
|-----------------------|------------------------------------------------------------------|------------------------------------------------------------------|
| Login Master          | Acessar a URL do Vercel e logar com master@dominio.com           | Dashboard Master carrega; sem erros no console                   |
| Criar tenant          | Master cria um tenant de teste                                   | Tenant aparece na lista; slug unico validado                     |
| Criar Admin           | Master cria usuario Admin para o tenant                          | Email de boas-vindas enviado pelo Supabase Auth                  |
| Login Admin           | Admin acessa a URL e loga                                        | Dashboard Admin carrega com o tenant correto                     |
| Criar bolao           | Admin cria bolao com 3 categorias somando 100%                   | Bolao criado com status A_SER_INICIADO                           |
| Cadastrar cota        | Admin cadastra participante com 10 palpites e confirma pagamento | Cota aparece como PAGO; arrecadacao atualiza                     |
| Registrar sorteio     | Admin registra sorteio com 6 numeros                             | Job de calculo disparado; acertos atualizados em \< 10s          |
| Health check completo | GET /health retorna status de todas as dependencias              | {supabase: ok, redis: ok, whatsapp: connected_or_not_configured} |

## 34.9 Dominios Personalizados (Opcional --- Custo Zero via Cloudflare) {#dominios-personalizados-opcional-custo-zero-via-cloudflare}

Para usar seu proprio dominio (ex: nossobolao.com.br) no lugar das URLs do Fly.io e Vercel, sem custo adicional:

**Frontend (Vercel + Cloudflare)**

- Vercel: Project Settings → Domains → Add → digitar seu dominio (ex: app.nossobolao.com.br)

- Vercel exibe um registro CNAME para apontar no DNS

- Cloudflare: DNS → Add Record → CNAME → app → valor fornecido pelo Vercel → Proxy: OFF (laranja)

- SSL automatico pelo Vercel em alguns minutos

**Backend (Fly.io + Cloudflare)**

- fly certs add api.nossobolao.com.br \--app nosso-bolao-api

- Fly.io exibe registro CNAME ou A para apontar no DNS

- Cloudflare: DNS → Add Record → apontar api.nossobolao.com.br para o valor fornecido pelo Fly.io → Proxy: OFF

- Certificado SSL provisionado automaticamente pelo Fly.io via Let\'s Encrypt

- Apos configurar o dominio da API, atualizar CORS_ORIGINS no Fly.io: fly secrets set CORS_ORIGINS=https://app.nossobolao.com.br \--app nosso-bolao-api

# 37. Dados de Referencia do Bolao Atual {#dados-de-referencia-do-bolao-atual}

Extraidos das planilhas PDF fornecidas. Usados como base de validacao, testes e migracao de dados.

## 37.1 Configuracao Financeira {#configuracao-financeira}

| **Parametro**                          | **Valor**      |
|----------------------------------------|----------------|
| Total de cotas ativas                  | 9.244          |
| Valor da cota                          | R\$ 30,00      |
| Valor bruto arrecadado                 | R\$ 277.320,00 |
| Taxa administrativa (15%)              | R\$ 41.598,00  |
| Premio Mais Pontos 1o Sorteio (10%)    | R\$ 27.732,00  |
| Premio 09 Pontos --- Mais Pontos (10%) | R\$ 27.732,00  |
| Premio Menos Pontos (10%)              | R\$ 27.732,00  |
| Premio Principal 10 Pontos (55%)       | R\$ 152.526,00 |

## 37.2 Sorteios Realizados {#sorteios-realizados}

| **No.** | **Concurso** | **Data**   | **Bolas Sorteadas** |
|---------|--------------|------------|---------------------|
| 01      | 2994         | 09/04/2026 | 01 10 23 31 40 55   |
| 02      | 2995         | 11/04/2026 | 08 29 42 49 50 58   |
| 03      | 2996         | 14/04/2026 | 07 09 27 38 49 52   |
| 04      | 2997         | 16/04/2026 | 14 20 32 37 39 42   |
| 05      | 2998         | 18/04/2026 | 15 18 28 31 52 58   |
| 06      | 2999         | 23/04/2026 | 09 24 26 38 45 58   |

## 37.3 Distribuicao Final de Acertos {#distribuicao-final-de-acertos}

| **Pontos Acumulados**       | **Qtd. de Participantes** |
|-----------------------------|---------------------------|
| **10 --- Premio Principal** | **01**                    |
| 09 --- Mais Pontos          | 22                        |
| 08                          | 144                       |
| 07                          | 662                       |
| 06                          | 1.471                     |
| 05                          | 2.374                     |
| 04                          | 2.402                     |
| 03                          | 1.483                     |
| 02                          | 563                       |
| 01                          | 108                       |
| **00 --- Menos Pontos**     | 14                        |
| **TOTAL**                   | **9.244**                 |

## 37.4 Ganhadores por Categoria {#ganhadores-por-categoria}

| **Categoria**              | **Condicao**             | **Qtd.** | **Premio por Ganhador** | **Status** |
|----------------------------|--------------------------|----------|-------------------------|------------|
| Mais Pontos 1o Sorteio     | 05 acertos no 1o sorteio | 02       | R\$ 13.866,00           | PAGO       |
| Premio Principal (10 Pts.) | 10 acertos acumulados    | 01       | R\$ 152.526,00          | A PAGAR    |
| 09 Pontos (Mais Pontos)    | 09 acertos acumulados    | 22       | R\$ 1.260,55            | A PAGAR    |
| Menos Pontos               | 00 acertos acumulados    | 14       | R\$ 1.980,86            | A PAGAR    |
