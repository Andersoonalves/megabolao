// =============================================================================
// NossoBolão — Shared Types
// ENUMs e interfaces base: editar aqui.
// Tipos de request/response: GERADOS pelo OpenAPI — não editar abaixo de "GERADO".
// =============================================================================

// ── ENUMs (espelham os tipos do banco) ───────────────────────────────────────

export type TenantStatus = 'ATIVO' | 'INATIVO' | 'SUSPENSO';

export type BolaoStatus = 'A_SER_INICIADO' | 'EM_ANDAMENTO' | 'FINALIZADO';

export type PapelUsuario = 'MASTER' | 'ADMIN';

export type CategoriaTipo =
  | 'TAXA_ADMINISTRATIVA'
  | 'ACERTOS_EXATOS'
  | 'MAIOR_PONTUACAO_SORTEIO'
  | 'MAIOR_PONTUACAO_GERAL'
  | 'MENOR_PONTUACAO_GERAL';

export type PagamentoStatus = 'PENDENTE' | 'PAGO' | 'INATIVO';

export type ResultadoStatus = 'EM_ANDAMENTO' | 'PREMIADO' | 'NAO_PREMIADO';

export type MensagemTipo =
  | 'RESULTADO_SORTEIO'
  | 'RANKING_PARCIAL'
  | 'PREMIADOS'
  | 'AVISO_ADMIN'
  | 'MANUAL';

export type MensagemStatus = 'PENDENTE' | 'ENVIADO' | 'FALHA';

// ── Interfaces de domínio ────────────────────────────────────────────────────

export interface TenantBranding {
  logoUrl?: string;
  corPrimaria?: string;
  nomeCustomizado?: string;
}

export interface Tenant {
  id: string;
  nome: string;
  slug: string;
  status: TenantStatus;
  taxaAdministrativaPct: number;
  branding: TenantBranding;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CategoriaPremiacao {
  id: string;
  tenantId: string;
  bolaoId: string;
  nome: string;
  tipo: CategoriaTipo;
  acertosAlvo?: number;
  sorteioReferencia?: number;
  percentual: number;
  acumulaSemGanhador: boolean;
  valorAcumuladoAnterior: number;
  ordem: number;
}

export interface Bolao {
  id: string;
  tenantId: string;
  nome: string;
  status: BolaoStatus;
  valorCota: number;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  dataInicio?: string;
  dataTermino?: string;
  categorias: CategoriaPremiacao[];
  criadoEm: string;
  atualizadoEm: string;
}

export interface Cota {
  id: string;
  tenantId: string;
  bolaoId: string;
  nomeIdentificacao: string;
  numeroCelular?: string;
  numeroSequencial: number;
  palpites: number[];
  statusPagamento: PagamentoStatus;
  dataConfirmacaoPagamento?: string;
  totalAcertosAcumulados: number;
  statusResultado: ResultadoStatus;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Sorteio {
  id: string;
  tenantId: string;
  bolaoId: string;
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
  sequenciaNoBolao: number;
  ehPrimeiro: boolean;
  processado: boolean;
  criadoEm: string;
}

export interface Premio {
  id: string;
  tenantId: string;
  bolaoId: string;
  cotaId: string;
  categoriaPremiacaoId: string;
  valorTotalCategoria: number;
  valorPorGanhador: number;
  statusPagamento: PagamentoStatus;
  dataPagamento?: string;
  criadoEm: string;
  atualizadoEm: string;
}

// ── Resposta de erro padrão ──────────────────────────────────────────────────

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details: Array<{
    field?: string;
    code: string;
    message: string;
  }>;
  requestId: string;
  timestamp: string;
}

// ── Paginação ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// --- GERADO ---
// Tipos derivados do OpenAPI — não editar manualmente.
// Regenerar: npm run generate:types
export * from './generated';
