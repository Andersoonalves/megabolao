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

export type AuditoriaSeveridade = 'INFO' | 'AVISO' | 'CRITICO';

/**
 * Wildcard de permissões. MASTER recebe `*` (acesso global).
 * Permissões granulares seguem o formato `<modulo>.<acao>`, ex.: `bolao.criar`.
 */
export const WILDCARD_PERMISSAO = '*';

export type CodigoPermissao = string; // ex: 'bolao.criar' ou '*'

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

// ── RBAC ─────────────────────────────────────────────────────────────────────

export interface Modulo {
  codigo: string;
  nome: string;
  descricao?: string;
  ordem: number;
  apenasMaster: boolean;
  ativo: boolean;
}

export interface Permissao {
  codigo: CodigoPermissao;
  moduloCodigo: string;
  nome: string;
  descricao?: string;
  apenasMaster: boolean;
}

export interface ModuloComPermissoes extends Modulo {
  permissoes: Permissao[];
}

export interface Perfil {
  id: string;
  tenantId: string;
  nome: string;
  descricao?: string;
  prioridade: number;
  ativo: boolean;
  sistema: boolean;
  permissoes: CodigoPermissao[];
  totalUsuarios?: number;
  criadoEm: string;
  atualizadoEm: string;
}

export interface UsuarioRBAC {
  id: string;
  email: string;
  papel: PapelUsuario;
  tenantId: string | null;
  celular: string | null;
  perfis: Array<Pick<Perfil, 'id' | 'nome' | 'sistema'>>;
  permissoes: CodigoPermissao[];
  criadoEm: string;
  atualizadoEm: string;
}

export interface AuditoriaItem {
  id: string;
  tenantId: string | null;
  userId: string | null;
  userEmail: string | null;
  acao: string;
  recurso: string | null;
  recursoId: string | null;
  severidade: AuditoriaSeveridade;
  detalhes: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  criadoEm: string;
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
