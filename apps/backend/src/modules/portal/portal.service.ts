import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { WhatsAppClientManager } from '../whatsapp/whatsapp-client-manager.service';

export interface PortalPremioResponse {
  id: string;
  categoriaNome: string;
  valorPorGanhador: number;
  statusPagamento: string;
  dataPagamento: string | null;
}

export interface PortalCotaResponse {
  id: string;
  nomeIdentificacao: string;
  numeroSequencial: number;
  palpites: number[];
  statusPagamento: string;
  dataConfirmacaoPagamento: string | null;
  totalAcertosAcumulados: number;
  statusResultado: string;
  premios: PortalPremioResponse[];
}

export interface PortalBolaoResponse {
  id: string;
  nome: string;
  status: string;
  valorCota: number;
  dataInicio: string | null;
  dataTermino: string | null;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  /**
   * URL `https://wa.me/...` para falar com o organizador.
   * Prioridade: celular do primeiro ADMIN no perfil; senão, número da sessão WhatsApp do tenant (conectada).
   */
  linkWhatsappOrganizador: string | null;
  cotas: PortalCotaResponse[];
  sorteios: {
    id: string;
    numeroConcurso: number;
    dataSorteio: string;
    bolasSorteadas: number[];
    sequenciaNoBolao: number;
    processado: boolean;
  }[];
}

export interface PortalResumoResponse {
  participante: { nome: string; celular: string };
  resumo: {
    totalBoloes: number;
    totalCotas: number;
    melhorAcertos: number;
    totalPremios: number;
  };
  boloes: PortalBolaoResponse[];
}

export interface PortalRankingItem {
  posicao: number;
  cotaId: string;
  nomeIdentificacao: string;
  numeroSequencial: number;
  totalAcertosAcumulados: number;
  statusPagamento: string;
}

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waClient: WhatsAppClientManager,
  ) {}

  async solicitarOtp(celular: string): Promise<{ ok: true }> {
    const phone = this.normalizePhone(celular);
    const tenants = await this.findTenantIdsByPhone(phone);

    if (tenants.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'CELULAR_NAO_ENCONTRADO',
        message: 'Número não encontrado neste portal.',
        details: [{ field: 'celular', code: 'CELULAR_NAO_ENCONTRADO', message: 'Nenhuma cota vinculada a este celular' }],
      });
    }

    if (tenants.length > 1) {
      throw new ConflictException({
        statusCode: 409,
        error: 'CELULAR_MULTIPLOS_TENANTS',
        message: 'Este celular está vinculado a mais de um tenant. Acesse pelo portal específico do tenant.',
        details: [{ field: 'celular', code: 'CELULAR_AMBIGUO', message: 'Celular encontrado em mais de um tenant' }],
      });
    }

    return { ok: true };
  }

  async resumo(user: AuthenticatedUser): Promise<PortalResumoResponse> {
    const { tenantId, celular } = await this.resolvePortalContext(user);
    return this.buildResumo(tenantId, celular);
  }

  async resumoPorCelular(celularRaw: string): Promise<PortalResumoResponse> {
    const { tenantId, celular } = await this.resolvePublicPortalContext(celularRaw);
    return this.buildResumo(tenantId, celular);
  }

  private async buildResumo(tenantId: string, celular: string): Promise<PortalResumoResponse> {
    const phoneWhere = this.phoneWhere(celular);

    const boloes = await this.prisma.bolao.findMany({
      where: {
        tenantId,
        cotas: { some: phoneWhere },
      },
      include: {
        _count: { select: { cotas: { where: { statusPagamento: 'PAGO' } } } },
        sorteios: { orderBy: { sequenciaNoBolao: 'asc' } },
        cotas: {
          where: phoneWhere,
          orderBy: { numeroSequencial: 'asc' },
          include: {
            premios: {
              include: { categoriaPremiacao: true },
              orderBy: { criadoEm: 'asc' },
            },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    });

    if (boloes.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'COTAS_NAO_ENCONTRADAS',
        message: 'Nenhuma cota encontrada para este celular.',
        details: [],
      });
    }

    const nome = boloes[0].cotas[0]?.nomeIdentificacao ?? 'Participante';
    const dialOrganizador = await this.resolveOrganizadorWhatsappDial(tenantId);
    const mapped = boloes.map((b): PortalBolaoResponse => {
      const valorCota = b.valorCota.toNumber();
      return {
        id: b.id,
        nome: b.nome,
        status: b.status,
        valorCota,
        dataInicio: b.dataInicio?.toISOString() ?? null,
        dataTermino: b.dataTermino?.toISOString() ?? null,
        totalCotasAtivas: b._count.cotas,
        valorBrutoArrecadado: valorCota * b._count.cotas,
        linkWhatsappOrganizador: dialOrganizador
          ? this.buildWhatsappOrganizadorUrl(dialOrganizador, b.nome)
          : null,
        cotas: b.cotas.map((c): PortalCotaResponse => ({
          id: c.id,
          nomeIdentificacao: c.nomeIdentificacao,
          numeroSequencial: c.numeroSequencial,
          palpites: c.palpites,
          statusPagamento: c.statusPagamento,
          dataConfirmacaoPagamento: c.dataConfirmacaoPagamento?.toISOString() ?? null,
          totalAcertosAcumulados: c.totalAcertosAcumulados,
          statusResultado: c.statusResultado,
          premios: c.premios.map((p): PortalPremioResponse => ({
            id: p.id,
            categoriaNome: p.categoriaPremiacao.nome,
            valorPorGanhador: p.valorPorGanhador.toNumber(),
            statusPagamento: p.statusPagamento,
            dataPagamento: p.dataPagamento?.toISOString() ?? null,
          })),
        })),
        sorteios: b.sorteios.map((s) => ({
          id: s.id,
          numeroConcurso: s.numeroConcurso,
          dataSorteio: s.dataSorteio.toISOString(),
          bolasSorteadas: s.bolasSorteadas,
          sequenciaNoBolao: s.sequenciaNoBolao,
          processado: s.processado,
        })),
      };
    });

    const cotas = mapped.flatMap((b) => b.cotas);
    return {
      participante: { nome, celular },
      resumo: {
        totalBoloes: mapped.length,
        totalCotas: cotas.length,
        melhorAcertos: Math.max(0, ...cotas.map((c) => c.totalAcertosAcumulados)),
        totalPremios: cotas.flatMap((c) => c.premios).reduce((sum, p) => sum + p.valorPorGanhador, 0),
      },
      boloes: mapped,
    };
  }

  async ranking(user: AuthenticatedUser, bolaoId: string): Promise<PortalRankingItem[]> {
    const { tenantId, celular } = await this.resolvePortalContext(user);
    return this.buildRanking(tenantId, celular, bolaoId);
  }

  async rankingPorCelular(celularRaw: string, bolaoId: string): Promise<PortalRankingItem[]> {
    const { tenantId, celular } = await this.resolvePublicPortalContext(celularRaw);
    return this.buildRanking(tenantId, celular, bolaoId);
  }

  private async buildRanking(tenantId: string, celular: string, bolaoId: string): Promise<PortalRankingItem[]> {
    const temCotaNoBolao = await this.prisma.cota.count({
      where: { tenantId, bolaoId, ...this.phoneWhere(celular) },
    });
    if (temCotaNoBolao === 0) {
      throw new ForbiddenException('BOLAO_FORA_DO_PORTAL_DO_PARTICIPANTE');
    }

    const cotas = await this.prisma.cota.findMany({
      where: { tenantId, bolaoId, statusPagamento: 'PAGO' },
      orderBy: [{ totalAcertosAcumulados: 'desc' }, { numeroSequencial: 'asc' }],
      select: {
        id: true,
        nomeIdentificacao: true,
        numeroSequencial: true,
        totalAcertosAcumulados: true,
        statusPagamento: true,
      },
    });

    return cotas.map((c, idx) => ({
      posicao: idx + 1,
      cotaId: c.id,
      nomeIdentificacao: c.nomeIdentificacao,
      numeroSequencial: c.numeroSequencial,
      totalAcertosAcumulados: c.totalAcertosAcumulados,
      statusPagamento: c.statusPagamento,
    }));
  }

  private async resolvePortalContext(user: AuthenticatedUser): Promise<{ tenantId: string; celular: string }> {
    const celular = this.normalizePhone(user.celular ?? '');
    if (!celular) throw new ForbiddenException('CELULAR_DO_PORTAL_NAO_IDENTIFICADO');

    if (user.tenantId) return { tenantId: user.tenantId, celular };

    const tenants = await this.findTenantIdsByPhone(celular);
    if (tenants.length === 1) return { tenantId: tenants[0], celular };

    if (tenants.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'COTAS_NAO_ENCONTRADAS',
        message: 'Nenhuma cota encontrada para este celular.',
        details: [],
      });
    }

    throw new BusinessException(
      'CELULAR_MULTIPLOS_TENANTS',
      'Este celular está vinculado a mais de um tenant. Acesse pelo portal específico do tenant.',
      [{ field: 'celular', code: 'CELULAR_AMBIGUO', message: 'Celular encontrado em mais de um tenant' }],
    );
  }

  private async resolvePublicPortalContext(celularRaw: string): Promise<{ tenantId: string; celular: string }> {
    const celular = this.normalizePhone(celularRaw);
    const tenants = await this.findTenantIdsByPhone(celular);

    if (tenants.length === 1) return { tenantId: tenants[0], celular };

    if (tenants.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'COTAS_NAO_ENCONTRADAS',
        message: 'Nenhuma cota encontrada para este celular.',
        details: [],
      });
    }

    throw new BusinessException(
      'CELULAR_MULTIPLOS_TENANTS',
      'Este celular está vinculado a mais de um tenant. Acesse pelo portal específico do tenant.',
      [{ field: 'celular', code: 'CELULAR_AMBIGUO', message: 'Celular encontrado em mais de um tenant' }],
    );
  }

  private async findTenantIdsByPhone(celular: string): Promise<string[]> {
    const rows = await this.prisma.cota.findMany({
      where: this.phoneWhere(celular),
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    return rows.map((r) => r.tenantId);
  }

  private phoneWhere(celular: string): Prisma.CotaWhereInput {
    return {
      OR: [
        { numeroCelular: celular },
        { participante: { numeroCelular: celular } },
      ],
    };
  }

  private normalizePhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length > 11) return digits.slice(2);
    return digits;
  }

  /** Dígitos para `wa.me` (com DDI, sem `+`). */
  private toWhatsAppDialDigits(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10) return null;
    if (digits.startsWith('55')) return digits;
    if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
    return digits;
  }

  private buildWhatsappOrganizadorUrl(dialDigits: string, bolaoNome: string): string {
    const texto = [
      'Olá! Vim pelo portal do participante e gostaria de falar com o organizador.',
      `Bolão: ${bolaoNome}`,
    ].join(' ');
    return `https://wa.me/${dialDigits}?text=${encodeURIComponent(texto)}`;
  }

  private async findAdminWhatsappDial(tenantId: string): Promise<string | null> {
    const row = await this.prisma.userProfile.findFirst({
      where: { tenantId, papel: 'ADMIN', celular: { not: null } },
      orderBy: { criadoEm: 'asc' },
      select: { celular: true },
    });
    const raw = row?.celular?.trim();
    if (!raw) return null;
    return this.toWhatsAppDialDigits(raw);
  }

  /**
   * Número para `wa.me`: perfil do admin (preferencial) ou linha da sessão WhatsApp Web do tenant.
   */
  private async resolveOrganizadorWhatsappDial(tenantId: string): Promise<string | null> {
    const fromProfile = await this.findAdminWhatsappDial(tenantId);
    if (fromProfile) return fromProfile;
    const wa = this.waClient.getStatus(tenantId);
    if (wa.status === 'CONECTADO' && wa.numero) {
      return this.toWhatsAppDialDigits(wa.numero);
    }
    return null;
  }
}
