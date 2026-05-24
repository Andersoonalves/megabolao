import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoriaPremiacao, Premio, Prisma } from '@prisma/client';
import { CategoriaTipo, PaginatedResponse } from '@nossobolao/shared-types';
import { arredondarMonetario } from '@nossobolao/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PaginationDto } from '../../common/dto/pagination.dto';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type PremioComRelacoes = Premio & {
  cota: { nomeIdentificacao: string; numeroSequencial: number };
  categoriaPremiacao: { nome: string; tipo: string; ordem: number };
};

export interface PremioResponse {
  id: string;
  tenantId: string;
  bolaoId: string;
  cotaId: string;
  cotaNome: string;
  cotaSequencial: number;
  categoriaNome: string;
  categoriaTipo: CategoriaTipo;
  valorTotalCategoria: number;
  valorPorGanhador: number;
  statusPagamento: string;
  dataPagamento: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface RankingItem {
  posicao: number;
  cotaId: string;
  nomeIdentificacao: string;
  numeroSequencial: number;
  totalAcertosAcumulados: number;
  statusPagamento: string;
}

const PREMIO_INCLUDE = {
  cota: { select: { nomeIdentificacao: true, numeroSequencial: true } },
  categoriaPremiacao: { select: { nome: true, tipo: true, ordem: true } },
} as const;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PremioService {
  constructor(private readonly prisma: PrismaService) {}

  async calcular(tenantId: string | null, bolaoId: string): Promise<PremioResponse[]> {
    this.assertTenantId(tenantId);

    // 1. Validar bolão
    const bolao = await this.prisma.bolao.findFirst({
      where: { id: bolaoId, tenantId },
      include: { categoriasPremiacao: { orderBy: { ordem: 'asc' } } },
    });
    if (!bolao) {
      throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });
    }
    if (bolao.status !== 'FINALIZADO' && bolao.status !== 'PREMIADO') {
      throw new BusinessException('BOLAO_NAO_FINALIZADO', 'Cálculo de prêmios requer bolão FINALIZADO ou PREMIADO');
    }

    // 2. Validar sorteios
    const [totalSorteios, sorteiosPendentes] = await Promise.all([
      this.prisma.sorteio.count({ where: { bolaoId, tenantId } }),
      this.prisma.sorteio.count({ where: { bolaoId, tenantId, processado: false } }),
    ]);
    if (totalSorteios === 0) {
      throw new BusinessException('SEM_SORTEIOS', 'Bolão não possui sorteios registrados');
    }
    if (sorteiosPendentes > 0) {
      throw new BusinessException(
        'SORTEIOS_PENDENTES',
        `${sorteiosPendentes} sorteio(s) ainda não processado(s). Aguarde o CalcAcertosJob.`,
      );
    }

    // 3. Idempotência: já calculado → retorna existentes
    const existentes = await this.prisma.premio.findMany({
      where: { bolaoId, tenantId },
      include: PREMIO_INCLUDE,
      orderBy: { categoriaPremiacao: { ordem: 'asc' } },
    });
    if (existentes.length > 0) {
      return existentes.map((p) => this.toResponse(p as PremioComRelacoes));
    }

    // 4. Base de cálculo
    const cotasAtivas = await this.prisma.cota.count({
      where: { bolaoId, tenantId, statusPagamento: 'PAGO' },
    });
    const valorCota = (bolao.valorCota as unknown as Prisma.Decimal).toNumber();
    const valorBruto = arredondarMonetario(cotasAtivas * valorCota);

    // 5. Calcular prêmios por categoria
    const premiosParaCriar: Prisma.PremioCreateManyInput[] = [];
    const acumulacoes: { id: string; valorAcumuladoAnterior: number }[] = [];

    for (const cat of bolao.categoriasPremiacao) {
      if (cat.tipo === 'TAXA_ADMINISTRATIVA') continue;

      const percentual = (cat.percentual as unknown as Prisma.Decimal).toNumber();
      const acumuladoAnterior = (cat.valorAcumuladoAnterior as unknown as Prisma.Decimal).toNumber();
      const valorCategoria = arredondarMonetario((percentual / 100) * valorBruto + acumuladoAnterior);

      const vencedores = await this.findVencedores(tenantId, bolaoId, cat);

      if (vencedores.length === 0) {
        if (cat.acumulaSemGanhador) {
          acumulacoes.push({ id: cat.id, valorAcumuladoAnterior: valorCategoria });
        }
        continue;
      }

      const valorPorGanhador = arredondarMonetario(valorCategoria / vencedores.length);

      for (const cotaId of vencedores) {
        premiosParaCriar.push({
          tenantId,
          bolaoId,
          cotaId,
          categoriaPremiacaoId: cat.id,
          valorTotalCategoria: valorCategoria,
          valorPorGanhador,
        });
      }
    }

    // 6. Persistir atomicamente
    await this.prisma.$transaction(async (tx) => {
      if (premiosParaCriar.length > 0) {
        await tx.premio.createMany({ data: premiosParaCriar });
      }
      for (const ac of acumulacoes) {
        await tx.categoriaPremiacao.update({
          where: { id: ac.id },
          data: { valorAcumuladoAnterior: ac.valorAcumuladoAnterior },
        });
      }
    });

    const premios = await this.prisma.premio.findMany({
      where: { bolaoId, tenantId },
      include: PREMIO_INCLUDE,
      orderBy: { categoriaPremiacao: { ordem: 'asc' } },
    });

    return premios.map((p) => this.toResponse(p as PremioComRelacoes));
  }

  async findAll(tenantId: string | null, bolaoId: string): Promise<PremioResponse[]> {
    this.assertTenantId(tenantId);
    const premios = await this.prisma.premio.findMany({
      where: { bolaoId, tenantId },
      include: PREMIO_INCLUDE,
      orderBy: { categoriaPremiacao: { ordem: 'asc' } },
    });
    return premios.map((p) => this.toResponse(p as PremioComRelacoes));
  }

  async findById(tenantId: string | null, bolaoId: string, id: string): Promise<PremioResponse> {
    this.assertTenantId(tenantId);
    const premio = await this.prisma.premio.findFirst({
      where: { id, bolaoId, tenantId },
      include: PREMIO_INCLUDE,
    });
    if (!premio) {
      throw new NotFoundException({ statusCode: 404, error: 'PREMIO_NAO_ENCONTRADO', message: `Prêmio ${id} não encontrado`, details: [] });
    }
    return this.toResponse(premio as PremioComRelacoes);
  }

  async pagar(tenantId: string | null, bolaoId: string, id: string): Promise<PremioResponse> {
    this.assertTenantId(tenantId);
    const premio = await this.prisma.premio.findFirst({
      where: { id, bolaoId, tenantId },
      include: PREMIO_INCLUDE,
    });
    if (!premio) {
      throw new NotFoundException({ statusCode: 404, error: 'PREMIO_NAO_ENCONTRADO', message: `Prêmio ${id} não encontrado`, details: [] });
    }
    if (premio.statusPagamento !== 'PENDENTE') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        `Apenas prêmios PENDENTE podem ser marcados como pagos. Status: ${premio.statusPagamento}`,
      );
    }
    const updated = await this.prisma.premio.update({
      where: { id },
      data: { statusPagamento: 'PAGO', dataPagamento: new Date() },
      include: PREMIO_INCLUDE,
    });
    return this.toResponse(updated as PremioComRelacoes);
  }

  async getRanking(
    tenantId: string | null,
    bolaoId: string,
    { page = 1, perPage = 50 }: PaginationDto,
  ): Promise<PaginatedResponse<RankingItem>> {
    this.assertTenantId(tenantId);
    const skip = (page - 1) * perPage;

    const [cotas, total] = await this.prisma.$transaction([
      this.prisma.cota.findMany({
        where: { bolaoId, tenantId, statusPagamento: 'PAGO' },
        orderBy: [
          { totalAcertosAcumulados: 'desc' },
          { numeroSequencial: 'asc' },
        ],
        skip,
        take: perPage,
      }),
      this.prisma.cota.count({ where: { bolaoId, tenantId, statusPagamento: 'PAGO' } }),
    ]);

    return {
      data: cotas.map((c, idx) => ({
        posicao: skip + idx + 1,
        cotaId: c.id,
        nomeIdentificacao: c.nomeIdentificacao,
        numeroSequencial: c.numeroSequencial,
        totalAcertosAcumulados: c.totalAcertosAcumulados,
        statusPagamento: c.statusPagamento,
      })),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private async findVencedores(
    tenantId: string,
    bolaoId: string,
    cat: CategoriaPremiacao,
  ): Promise<string[]> {
    switch (cat.tipo) {
      case 'ACERTOS_EXATOS': {
        const cotas = await this.prisma.cota.findMany({
          where: { bolaoId, tenantId, statusPagamento: 'PAGO', totalAcertosAcumulados: cat.acertosAlvo! },
          select: { id: true },
        });
        return cotas.map((c) => c.id);
      }

      case 'MAIOR_PONTUACAO_SORTEIO': {
        const sorteio = await this.prisma.sorteio.findFirst({
          where: { bolaoId, tenantId, sequenciaNoBolao: cat.sorteioReferencia! },
        });
        if (!sorteio) return [];
        const { _max } = await this.prisma.acertoSorteio.aggregate({
          where: { sorteioId: sorteio.id, tenantId },
          _max: { acertos: true },
        });
        if (_max.acertos === null) return [];
        const items = await this.prisma.acertoSorteio.findMany({
          where: { sorteioId: sorteio.id, tenantId, acertos: _max.acertos },
          select: { cotaId: true },
        });
        return items.map((i) => i.cotaId);
      }

      case 'MAIOR_PONTUACAO_GERAL': {
        const { _max } = await this.prisma.cota.aggregate({
          where: { bolaoId, tenantId, statusPagamento: 'PAGO' },
          _max: { totalAcertosAcumulados: true },
        });
        if (_max.totalAcertosAcumulados === null) return [];
        const cotas = await this.prisma.cota.findMany({
          where: { bolaoId, tenantId, statusPagamento: 'PAGO', totalAcertosAcumulados: _max.totalAcertosAcumulados },
          select: { id: true },
        });
        return cotas.map((c) => c.id);
      }

      case 'MENOR_PONTUACAO_GERAL': {
        const { _min } = await this.prisma.cota.aggregate({
          where: { bolaoId, tenantId, statusPagamento: 'PAGO' },
          _min: { totalAcertosAcumulados: true },
        });
        if (_min.totalAcertosAcumulados === null) return [];
        const cotas = await this.prisma.cota.findMany({
          where: { bolaoId, tenantId, statusPagamento: 'PAGO', totalAcertosAcumulados: _min.totalAcertosAcumulados },
          select: { id: true },
        });
        return cotas.map((c) => c.id);
      }

      default:
        return [];
    }
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }

  private toResponse(p: PremioComRelacoes): PremioResponse {
    return {
      id: p.id,
      tenantId: p.tenantId,
      bolaoId: p.bolaoId,
      cotaId: p.cotaId,
      cotaNome: p.cota.nomeIdentificacao,
      cotaSequencial: p.cota.numeroSequencial,
      categoriaNome: p.categoriaPremiacao.nome,
      categoriaTipo: p.categoriaPremiacao.tipo as CategoriaTipo,
      valorTotalCategoria: (p.valorTotalCategoria as unknown as Prisma.Decimal).toNumber(),
      valorPorGanhador: (p.valorPorGanhador as unknown as Prisma.Decimal).toNumber(),
      statusPagamento: p.statusPagamento,
      dataPagamento: p.dataPagamento?.toISOString() ?? null,
      criadoEm: p.criadoEm.toISOString(),
      atualizadoEm: p.atualizadoEm.toISOString(),
    };
  }
}
