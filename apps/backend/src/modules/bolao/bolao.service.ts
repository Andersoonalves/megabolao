import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Bolao, CategoriaPremiacao, PagamentoStatus, Prisma } from '@prisma/client';
import { CategoriaTipo, PaginatedResponse } from '@nossobolao/shared-types';
import { arredondarMonetario } from '@nossobolao/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateBolaoDto } from './dto/create-bolao.dto';
import { UpdateBolaoDto } from './dto/update-bolao.dto';
import { UpdateCategoriasDto } from './dto/update-categorias.dto';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { WhatsAppClientManager } from '../whatsapp/whatsapp-client-manager.service';

type SorteioBolasResumo = { bolasSorteadas: number[] };

type BolaoComTudo = Bolao & {
  categoriasPremiacao: CategoriaPremiacao[];
  _count: { cotas: number; sorteios: number };
  sorteios?: SorteioBolasResumo[];
};

export interface CategoriaResponse {
  id: string;
  nome: string;
  tipo: CategoriaTipo;
  acertosAlvo: number | null;
  sorteioReferencia: number | null;
  percentual: number;
  acumulaSemGanhador: boolean;
  valorAcumuladoAnterior: number;
  ordem: number;
}

export interface BolaoResponse {
  id: string;
  tenantId: string;
  nome: string;
  status: string;
  valorCota: number;
  dataInicio: string | null;
  dataTermino: string | null;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  categorias: CategoriaResponse[];
  sorteiosRegistrados: number;
  bolasJaSorteadas: number[];
  /** Maior total de acertos entre cotas pagas no momento. */
  maiorPontuacaoAtual: number;
  maiorPontuacaoCotaNumero: number | null;
  maiorPontuacaoCotaNome: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

type MaiorPontuacaoResumo = {
  acertos: number;
  cotaNumero: number | null;
  cotaNome: string | null;
};

export interface ClonarBolaoResponse extends BolaoResponse {
  cotasClonadas: number;
}

@Injectable()
export class BolaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waClient: WhatsAppClientManager,
    private readonly tenantService: TenantService,
  ) {}

  async create(tenantId: string | null, dto: CreateBolaoDto): Promise<BolaoResponse> {
    this.assertTenantId(tenantId);
    await this.tenantService.assertTenantPermiteCadastros(tenantId);
    this.validarCategorias(dto.categorias);

    const bolao = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bolao.create({
        data: {
          tenantId,
          nome: dto.nome,
          valorCota: dto.valorCota,
          dataInicio: dto.dataInicio ? new Date(dto.dataInicio) : null,
          dataTermino: dto.dataTermino ? new Date(dto.dataTermino) : null,
        },
      });

      await tx.categoriaPremiacao.createMany({
        data: dto.categorias.map((c, i) => ({
          tenantId,
          bolaoId: created.id,
          nome: c.nome,
          tipo: c.tipo,
          acertosAlvo: c.acertosAlvo ?? null,
          sorteioReferencia: c.sorteioReferencia ?? null,
          percentual: c.percentual,
          acumulaSemGanhador: c.acumulaSemGanhador ?? false,
          ordem: c.ordem ?? i + 1,
        })),
      });

      return tx.bolao.findFirstOrThrow({
        where: { id: created.id },
        include: {
          categoriasPremiacao: { orderBy: { ordem: 'asc' } },
          _count: {
            select: {
              cotas: { where: { statusPagamento: PagamentoStatus.PAGO } },
              sorteios: true,
            },
          },
        },
      });
    });

    return this.toResponse(bolao);
  }

  async findAll(
    tenantId: string | null,
    { page = 1, perPage = 12, busca, status }: { page?: number; perPage?: number; busca?: string; status?: string },
  ): Promise<PaginatedResponse<BolaoResponse>> {
    this.assertTenantId(tenantId);
    const skip = (page - 1) * perPage;
    const where = {
      tenantId,
      ...(busca  && { nome: { contains: busca, mode: 'insensitive' as const } }),
      ...(status && { status: status as import('@prisma/client').BolaoStatus }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.bolao.findMany({
        where,
        include: {
          categoriasPremiacao: { orderBy: { ordem: 'asc' } },
          sorteios: {
            orderBy: { sequenciaNoBolao: 'asc' },
            select: { bolasSorteadas: true },
          },
          _count: {
            select: {
              cotas: { where: { statusPagamento: PagamentoStatus.PAGO } },
              sorteios: true,
            },
          },
        },
        skip,
        take: perPage,
        orderBy: { criadoEm: 'desc' },
      }),
      this.prisma.bolao.count({ where }),
    ]);

    const maiores = await this.buscarMaiorPontuacaoPorBolao(
      tenantId,
      data.map((b) => b.id),
    );

    return {
      data: data.map((b) =>
        this.toResponse(b as BolaoComTudo, maiores.get(b.id) ?? BolaoService.pontuacaoPadrao()),
      ),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findById(tenantId: string | null, id: string): Promise<BolaoResponse> {
    this.assertTenantId(tenantId);
    return this.toResponse(await this.findOrFail(tenantId, id));
  }

  async update(tenantId: string | null, id: string, dto: UpdateBolaoDto): Promise<BolaoResponse> {
    this.assertTenantId(tenantId);
    const bolao = await this.findOrFail(tenantId, id);

    if (bolao.status !== 'A_SER_INICIADO') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        'Bolão só pode ser editado quando está A_SER_INICIADO',
        [{ code: 'STATUS_INVALIDO', message: `Status atual: ${bolao.status}` }],
      );
    }

    const updated = await this.prisma.bolao.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined && { nome: dto.nome }),
        ...(dto.valorCota !== undefined && { valorCota: dto.valorCota }),
        ...(dto.dataInicio !== undefined && { dataInicio: dto.dataInicio ? new Date(dto.dataInicio) : null }),
        ...(dto.dataTermino !== undefined && { dataTermino: dto.dataTermino ? new Date(dto.dataTermino) : null }),
      },
      include: {
          categoriasPremiacao: { orderBy: { ordem: 'asc' } },
          _count: {
            select: {
              cotas: { where: { statusPagamento: PagamentoStatus.PAGO } },
              sorteios: true,
            },
          },
        },
    });

    return this.toResponse(updated as BolaoComTudo);
  }

  async updateCategorias(tenantId: string | null, bolaoId: string, dto: UpdateCategoriasDto): Promise<BolaoResponse> {
    this.assertTenantId(tenantId);
    const bolao = await this.findOrFail(tenantId, bolaoId);

    if (bolao.status !== 'A_SER_INICIADO') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        'Categorias só podem ser alteradas quando bolão está A_SER_INICIADO',
      );
    }

    this.validarCategorias(dto.categorias);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.categoriaPremiacao.deleteMany({ where: { bolaoId, tenantId } });

      await tx.categoriaPremiacao.createMany({
        data: dto.categorias.map((c, i) => ({
          tenantId,
          bolaoId,
          nome: c.nome,
          tipo: c.tipo,
          acertosAlvo: c.acertosAlvo ?? null,
          sorteioReferencia: c.sorteioReferencia ?? null,
          percentual: c.percentual,
          acumulaSemGanhador: c.acumulaSemGanhador ?? false,
          ordem: c.ordem ?? i + 1,
        })),
      });

      return tx.bolao.findFirstOrThrow({
        where: { id: bolaoId },
        include: {
          categoriasPremiacao: { orderBy: { ordem: 'asc' } },
          _count: {
            select: {
              cotas: { where: { statusPagamento: PagamentoStatus.PAGO } },
              sorteios: true,
            },
          },
        },
      });
    });

    return this.toResponse(updated as BolaoComTudo);
  }

  async iniciar(tenantId: string | null, id: string): Promise<BolaoResponse> {
    this.assertTenantId(tenantId);
    const bolao = await this.findOrFail(tenantId, id);

    if (bolao.status !== 'A_SER_INICIADO') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        `Bolão deve estar A_SER_INICIADO para iniciar. Status atual: ${bolao.status}`,
      );
    }

    const updated = await this.prisma.bolao.update({
      where: { id },
      data: { status: 'EM_ANDAMENTO' },
      include: {
          categoriasPremiacao: { orderBy: { ordem: 'asc' } },
          _count: {
            select: {
              cotas: { where: { statusPagamento: PagamentoStatus.PAGO } },
              sorteios: true,
            },
          },
        },
    });

    return this.toResponse(updated as BolaoComTudo);
  }

  async finalizar(tenantId: string | null, id: string): Promise<BolaoResponse> {
    this.assertTenantId(tenantId);
    const bolao = await this.findOrFail(tenantId, id);

    if (bolao.status !== 'EM_ANDAMENTO') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        `Bolão deve estar EM_ANDAMENTO para finalizar. Status atual: ${bolao.status}`,
      );
    }

    const updated = await this.prisma.bolao.update({
      where: { id },
      data: { status: 'FINALIZADO' },
      include: {
          categoriasPremiacao: { orderBy: { ordem: 'asc' } },
          _count: {
            select: {
              cotas: { where: { statusPagamento: PagamentoStatus.PAGO } },
              sorteios: true,
            },
          },
        },
    });

    return this.toResponse(updated as BolaoComTudo);
  }

  async clonar(tenantId: string | null, id: string): Promise<ClonarBolaoResponse> {
    this.assertTenantId(tenantId);

    const fonte = await this.prisma.bolao.findFirst({
      where: { id, tenantId },
      include: {
        categoriasPremiacao: { orderBy: { ordem: 'asc' } },
        cotas:               { orderBy: { numeroSequencial: 'asc' } },
      },
    });

    if (!fonte) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'BOLAO_NAO_ENCONTRADO',
        message: `Bolão ${id} não encontrado`,
        details: [],
      });
    }

    const clonado = await this.prisma.$transaction(async (tx) => {
      const novo = await tx.bolao.create({
        data: {
          tenantId,
          nome:       `${fonte.nome} (Cópia)`,
          valorCota:  fonte.valorCota,
          dataInicio:  null,
          dataTermino: null,
        },
      });

      if (fonte.categoriasPremiacao.length > 0) {
        await tx.categoriaPremiacao.createMany({
          data: fonte.categoriasPremiacao.map((c) => ({
            tenantId,
            bolaoId:                novo.id,
            nome:                   c.nome,
            tipo:                   c.tipo,
            acertosAlvo:            c.acertosAlvo,
            sorteioReferencia:      c.sorteioReferencia,
            percentual:             c.percentual,
            acumulaSemGanhador:     c.acumulaSemGanhador,
            valorAcumuladoAnterior: 0,
            ordem:                  c.ordem,
          })),
        });
      }

      if (fonte.cotas.length > 0) {
        await tx.cota.createMany({
          data: fonte.cotas.map((c) => ({
            tenantId,
            bolaoId:                 novo.id,
            participanteId:          c.participanteId,
            nomeIdentificacao:       c.nomeIdentificacao,
            numeroCelular:           c.numeroCelular,
            numeroSequencial:        c.numeroSequencial,
            palpites:                c.palpites,
            statusPagamento:         'PENDENTE' as const,
            dataConfirmacaoPagamento: null,
            totalAcertosAcumulados:  0,
            statusResultado:         'EM_ANDAMENTO' as const,
          })),
        });
      }

      return tx.bolao.findFirstOrThrow({
        where: { id: novo.id },
        include: {
          categoriasPremiacao: { orderBy: { ordem: 'asc' } },
          _count: {
            select: {
              cotas: { where: { statusPagamento: PagamentoStatus.PAGO } },
              sorteios: true,
            },
          },
        },
      });
    });

    return {
      ...this.toResponse(clonado as BolaoComTudo),
      cotasClonadas: fonte.cotas.length,
    };
  }

  async delete(tenantId: string | null, id: string): Promise<void> {
    this.assertTenantId(tenantId);
    const bolao = await this.findOrFail(tenantId, id);

    if (bolao.status !== 'A_SER_INICIADO') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        'Bolão só pode ser excluído quando está A_SER_INICIADO',
      );
    }

    await this.prisma.bolao.delete({ where: { id } });
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private async findOrFail(tenantId: string, id: string): Promise<BolaoComTudo> {
    const bolao = await this.prisma.bolao.findFirst({
      where: { id, tenantId },
      include: {
          categoriasPremiacao: { orderBy: { ordem: 'asc' } },
          _count: {
            select: {
              cotas: { where: { statusPagamento: PagamentoStatus.PAGO } },
              sorteios: true,
            },
          },
        },
    });

    if (!bolao) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'BOLAO_NAO_ENCONTRADO',
        message: `Bolão ${id} não encontrado`,
        details: [],
      });
    }

    return bolao as BolaoComTudo;
  }

  async dashboard(tenantId: string | null, bolaoId: string) {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({
      where: { id: bolaoId, tenantId },
      include: {
        sorteios:           { orderBy: { sequenciaNoBolao: 'asc' } },
        categoriasPremiacao: { orderBy: { ordem: 'asc' } },
      },
    });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    const [totalPago, totalPendente, cotasPagas, acertosPorCota] = await Promise.all([
      this.prisma.cota.count({ where: { bolaoId, tenantId, statusPagamento: 'PAGO' } }),
      this.prisma.cota.count({ where: { bolaoId, tenantId, statusPagamento: 'PENDENTE' } }),
      this.prisma.cota.findMany({
        where:  { bolaoId, tenantId, statusPagamento: 'PAGO' },
        select: { id: true, numeroSequencial: true, nomeIdentificacao: true, statusResultado: true },
      }),
      this.prisma.acertoSorteio.groupBy({
        by:    ['cotaId'],
        where: { bolaoId, tenantId },
        _sum:  { acertos: true },
      }),
    ]);

    // Mapa cotaId → acertos reais (da tabela acertos_sorteio)
    const acertosMap = new Map(
      acertosPorCota.map(a => [a.cotaId, a._sum.acertos ?? 0]),
    );

    // Ranking top 10 por acertos reais
    const ranking = cotasPagas
      .map(c => ({ ...c, totalAcertosAcumulados: acertosMap.get(c.id) ?? 0 }))
      .sort((a, b) => b.totalAcertosAcumulados - a.totalAcertosAcumulados)
      .slice(0, 10);

    // Distribuição por acertos (agrupa contagens)
    const distMap = new Map<number, number>();
    for (const c of cotasPagas) {
      const ac = acertosMap.get(c.id) ?? 0;
      distMap.set(ac, (distMap.get(ac) ?? 0) + 1);
    }
    const distribuicao = Array.from(distMap.entries()).map(([acertos, quantidade]) => ({ acertos, quantidade }));

    const bolasJaSorteadas = [...new Set(bolao.sorteios.flatMap(s => s.bolasSorteadas))].sort((a, b) => a - b);
    const valorBruto       = Number(bolao.valorCota) * totalPago;

    return {
      bolao: {
        nome:        bolao.nome,
        status:      bolao.status,
        valorCota:   Number(bolao.valorCota),
        dataInicio:  bolao.dataInicio?.toISOString().slice(0, 10) ?? null,
        dataTermino: bolao.dataTermino?.toISOString().slice(0, 10) ?? null,
        categorias:  bolao.categoriasPremiacao.length,
      },
      totalPago,
      totalPendente,
      valorBruto,
      categorias: bolao.categoriasPremiacao.map((c) => ({
        id:                     c.id,
        ordem:                  c.ordem,
        nome:                   c.nome,
        tipo:                   c.tipo as CategoriaTipo,
        acertosAlvo:            c.acertosAlvo,
        sorteioReferencia:      c.sorteioReferencia,
        percentual:             (c.percentual as unknown as Prisma.Decimal).toNumber(),
        acumulaSemGanhador:     c.acumulaSemGanhador,
        valorAcumuladoAnterior: (c.valorAcumuladoAnterior as unknown as Prisma.Decimal).toNumber(),
      })),
      sorteios: bolao.sorteios.map(s => ({
        numeroConcurso:   s.numeroConcurso,
        dataSorteio:      s.dataSorteio.toISOString().slice(0, 10),
        bolasSorteadas:   s.bolasSorteadas,
        sequenciaNoBolao: s.sequenciaNoBolao,
      })),
      bolasJaSorteadas,
      ranking: ranking.map((c, i) => ({
        posicao:                i + 1,
        numeroSequencial:       c.numeroSequencial,
        nomeIdentificacao:      c.nomeIdentificacao,
        totalAcertosAcumulados: c.totalAcertosAcumulados,
        statusResultado:        c.statusResultado,
      })),
      distribuicaoAcertos: distribuicao
        .sort((a, b) => a.acertos - b.acertos),
    };
  }

  async getWhatsappConfig(tenantId: string | null, bolaoId: string) {
    this.assertTenantId(tenantId);
    const bolao = await this.prisma.bolao.findFirst({
      where: { id: bolaoId, tenantId },
      select: { id: true, nome: true, whatsappGrupos: true },
    });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });
    const gruposStored = (bolao.whatsappGrupos as { id: string; nome: string }[]) ?? [];
    let grupos = gruposStored.map((g) => ({ ...g }));
    try {
      const live = await this.waClient.getGrupos(tenantId);
      const byId = new Map(live.map((item) => [item.id, item.qtdParticipantes]));
      grupos = grupos.map((g) => {
        const q = byId.get(g.id);
        return q !== undefined ? { ...g, qtdParticipantes: q } : { ...g };
      });
    } catch {
      /* sessão WhatsApp desconectada ou indisponível — devolve só id/nome persistidos */
    }
    return { bolaoId: bolao.id, bolaoNome: bolao.nome, grupos, configurado: grupos.length > 0 };
  }

  async setWhatsappConfig(
    tenantId: string | null,
    bolaoId: string,
    dto: { grupos: { id: string; nome: string }[] },
  ) {
    this.assertTenantId(tenantId);
    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    const gruposPersistidos = dto.grupos.map(({ id, nome }) => ({ id, nome }));

    await this.prisma.bolao.update({
      where: { id: bolaoId },
      data: { whatsappGrupos: gruposPersistidos },
    });

    return this.getWhatsappConfig(tenantId, bolaoId);
  }

  private validarCategorias(categorias: CreateCategoriaDto[]): void {
    const soma = arredondarMonetario(categorias.reduce((acc, c) => acc + c.percentual, 0));
    if (soma !== 100) {
      throw new BusinessException(
        'SOMA_PERCENTUAIS_INVALIDA',
        `Soma dos percentuais deve ser exatamente 100%. Atual: ${soma}%`,
        [{ field: 'categorias', code: 'SOMA_PERCENTUAIS_INVALIDA', message: `Soma = ${soma}%` }],
      );
    }

    for (const cat of categorias) {
      if (cat.tipo === 'ACERTOS_EXATOS' && (cat.acertosAlvo == null || cat.acertosAlvo < 0 || cat.acertosAlvo > 10)) {
        throw new BusinessException(
          'ACERTOS_ALVO_OBRIGATORIO',
          `Categoria "${cat.nome}" do tipo ACERTOS_EXATOS exige acertosAlvo entre 0 e 10`,
          [{ field: 'acertosAlvo', code: 'ACERTOS_ALVO_OBRIGATORIO', message: 'Campo obrigatório para ACERTOS_EXATOS (0–10)' }],
        );
      }
      if (cat.tipo === 'MAIOR_PONTUACAO_SORTEIO' && !cat.sorteioReferencia) {
        throw new BusinessException(
          'SORTEIO_REFERENCIA_OBRIGATORIO',
          `Categoria "${cat.nome}" do tipo MAIOR_PONTUACAO_SORTEIO exige sorteioReferencia`,
          [{ field: 'sorteioReferencia', code: 'SORTEIO_REFERENCIA_OBRIGATORIO', message: 'Campo obrigatório para MAIOR_PONTUACAO_SORTEIO' }],
        );
      }
    }
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }

  private static extrairBolasJaSorteadas(sorteios?: SorteioBolasResumo[]): number[] {
    if (!sorteios?.length) return [];
    return [...new Set(sorteios.flatMap((s) => s.bolasSorteadas))].sort((a, b) => a - b);
  }

  private static pontuacaoPadrao(): MaiorPontuacaoResumo {
    return { acertos: 0, cotaNumero: null, cotaNome: null };
  }

  /** Agrega maior pontuação (cotas pagas) para vários bolões em lote — usado na listagem. */
  private async buscarMaiorPontuacaoPorBolao(
    tenantId: string,
    bolaoIds: string[],
  ): Promise<Map<string, MaiorPontuacaoResumo>> {
    const map = new Map<string, MaiorPontuacaoResumo>();
    if (!bolaoIds.length) return map;

    const maximos = await this.prisma.cota.groupBy({
      by: ['bolaoId'],
      where: {
        tenantId,
        bolaoId: { in: bolaoIds },
        statusPagamento: PagamentoStatus.PAGO,
      },
      _max: { totalAcertosAcumulados: true },
    });

    for (const row of maximos) {
      map.set(row.bolaoId, {
        acertos: row._max.totalAcertosAcumulados ?? 0,
        cotaNumero: null,
        cotaNome: null,
      });
    }

    const comPontos = maximos.filter((r) => (r._max.totalAcertosAcumulados ?? 0) > 0);
    if (!comPontos.length) return map;

    const lideres = await this.prisma.cota.findMany({
      where: {
        tenantId,
        statusPagamento: PagamentoStatus.PAGO,
        OR: comPontos.map((r) => ({
          bolaoId: r.bolaoId,
          totalAcertosAcumulados: r._max.totalAcertosAcumulados!,
        })),
      },
      select: {
        bolaoId: true,
        numeroSequencial: true,
        nomeIdentificacao: true,
      },
      orderBy: [{ totalAcertosAcumulados: 'desc' }, { numeroSequencial: 'asc' }],
    });

    const visto = new Set<string>();
    for (const c of lideres) {
      if (visto.has(c.bolaoId)) continue;
      visto.add(c.bolaoId);
      const base = map.get(c.bolaoId) ?? BolaoService.pontuacaoPadrao();
      map.set(c.bolaoId, {
        ...base,
        cotaNumero: c.numeroSequencial,
        cotaNome: c.nomeIdentificacao,
      });
    }

    return map;
  }

  private toResponse(
    b: BolaoComTudo,
    pontuacao: MaiorPontuacaoResumo = BolaoService.pontuacaoPadrao(),
  ): BolaoResponse {
    const valorCota = (b.valorCota as unknown as Prisma.Decimal).toNumber();
    return {
      id: b.id,
      tenantId: b.tenantId,
      nome: b.nome,
      status: b.status,
      valorCota,
      dataInicio: b.dataInicio ? b.dataInicio.toISOString().split('T')[0] : null,
      dataTermino: b.dataTermino ? b.dataTermino.toISOString().split('T')[0] : null,
      totalCotasAtivas: b._count.cotas,
      valorBrutoArrecadado: arredondarMonetario(b._count.cotas * valorCota),
      categorias: b.categoriasPremiacao.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo as CategoriaTipo,
        acertosAlvo: c.acertosAlvo,
        sorteioReferencia: c.sorteioReferencia,
        percentual: (c.percentual as unknown as Prisma.Decimal).toNumber(),
        acumulaSemGanhador: c.acumulaSemGanhador,
        valorAcumuladoAnterior: (c.valorAcumuladoAnterior as unknown as Prisma.Decimal).toNumber(),
        ordem: c.ordem,
      })),
      sorteiosRegistrados: b._count.sorteios,
      bolasJaSorteadas: BolaoService.extrairBolasJaSorteadas(b.sorteios),
      maiorPontuacaoAtual: pontuacao.acertos,
      maiorPontuacaoCotaNumero: pontuacao.cotaNumero,
      maiorPontuacaoCotaNome: pontuacao.cotaNome,
      criadoEm: b.criadoEm.toISOString(),
      atualizadoEm: b.atualizadoEm.toISOString(),
    };
  }
}
