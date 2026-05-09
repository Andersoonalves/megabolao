import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { validarBolasSorteadas } from '@nossobolao/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateSorteioDto } from './dto/create-sorteio.dto';
import { CALC_ACERTOS_QUEUE, CALC_ACERTOS_QUEUE_NAME, CalcAcertosJobData } from './jobs/calc-acertos.types';

export interface SorteioResponse {
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

@Injectable()
export class SorteioService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CALC_ACERTOS_QUEUE) private readonly queue: Queue,
  ) {}

  async create(tenantId: string | null, bolaoId: string, dto: CreateSorteioDto): Promise<SorteioResponse> {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) {
      throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });
    }

    if (bolao.status !== 'EM_ANDAMENTO') {
      throw new BusinessException(
        'BOLAO_NAO_EM_ANDAMENTO',
        `Sorteios só podem ser registrados em bolões EM_ANDAMENTO. Status: ${bolao.status}`,
      );
    }

    if (!validarBolasSorteadas(dto.bolasSorteadas)) {
      throw new BusinessException(
        'BOLAS_INVALIDAS',
        'bolasSorteadas deve conter 6 números únicos entre 1 e 60',
        [{ field: 'bolasSorteadas', code: 'BOLAS_INVALIDAS', message: '6 únicos, 1–60' }],
      );
    }

    const sorteio = await this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.sorteio.aggregate({
        where: { bolaoId, tenantId },
        _max: { sequenciaNoBolao: true },
      });
      const nextSeq = (_max.sequenciaNoBolao ?? 0) + 1;

      return tx.sorteio.create({
        data: {
          tenantId,
          bolaoId,
          numeroConcurso: dto.numeroConcurso,
          dataSorteio: new Date(dto.dataSorteio),
          bolasSorteadas: dto.bolasSorteadas,
          sequenciaNoBolao: nextSeq,
          ehPrimeiro: nextSeq === 1,
        },
      });
    }).catch((err: { code?: string }) => {
      if (err.code === 'P2002') {
        throw new BusinessException(
          'CONCURSO_DUPLICADO',
          `Concurso ${dto.numeroConcurso} já registrado neste bolão`,
          [{ field: 'numeroConcurso', code: 'CONCURSO_DUPLICADO', message: 'Número de concurso já existe' }],
        );
      }
      throw err;
    });

    await this.queue.add(
      CALC_ACERTOS_QUEUE_NAME,
      { sorteioId: sorteio.id, tenantId, bolaoId } satisfies CalcAcertosJobData,
      {
        jobId: sorteio.id, // deduplicação: mesmo sorteio não gera jobs duplicados
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 60 * 60 * 24 }, // 24h
        removeOnFail: { age: 60 * 60 * 24 * 7 }, // 7d
      },
    );

    return this.toResponse(sorteio);
  }

  async registrarGlobal(tenantId: string | null, dto: CreateSorteioDto): Promise<{ bolaoesProcessados: number; sorteios: SorteioResponse[] }> {
    this.assertTenantId(tenantId);

    if (!validarBolasSorteadas(dto.bolasSorteadas)) {
      throw new BusinessException(
        'BOLAS_INVALIDAS',
        'bolasSorteadas deve conter 6 números únicos entre 1 e 60',
        [{ field: 'bolasSorteadas', code: 'BOLAS_INVALIDAS', message: '6 únicos, 1–60' }],
      );
    }

    const boloes = await this.prisma.bolao.findMany({
      where: { tenantId, status: 'EM_ANDAMENTO' },
    });

    if (boloes.length === 0) {
      throw new BusinessException(
        'SEM_BOLOES_ATIVOS',
        'Nenhum bolão EM_ANDAMENTO encontrado. Inicie um bolão antes de registrar sorteios.',
        [],
      );
    }

    const sorteios: SorteioResponse[] = [];

    for (const bolao of boloes) {
      const sorteio = await this.prisma.$transaction(async (tx) => {
        const { _max } = await tx.sorteio.aggregate({
          where: { bolaoId: bolao.id, tenantId },
          _max: { sequenciaNoBolao: true },
        });
        const nextSeq = (_max.sequenciaNoBolao ?? 0) + 1;

        return tx.sorteio.create({
          data: {
            tenantId,
            bolaoId: bolao.id,
            numeroConcurso: dto.numeroConcurso,
            dataSorteio: new Date(dto.dataSorteio),
            bolasSorteadas: dto.bolasSorteadas,
            sequenciaNoBolao: nextSeq,
            ehPrimeiro: nextSeq === 1,
          },
        });
      }).catch((err: { code?: string }) => {
        if (err.code === 'P2002') {
          throw new BusinessException(
            'CONCURSO_DUPLICADO',
            `Concurso ${dto.numeroConcurso} já registrado no bolão "${bolao.nome}"`,
            [{ field: 'numeroConcurso', code: 'CONCURSO_DUPLICADO', message: 'Concurso já registrado' }],
          );
        }
        throw err;
      });

      await this.queue.add(
        CALC_ACERTOS_QUEUE_NAME,
        { sorteioId: sorteio.id, tenantId, bolaoId: bolao.id } satisfies CalcAcertosJobData,
        {
          jobId: sorteio.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 60 * 60 * 24 },
          removeOnFail: { age: 60 * 60 * 24 * 7 },
        },
      );

      sorteios.push(this.toResponse(sorteio));
    }

    return { bolaoesProcessados: boloes.length, sorteios };
  }

  async findRecentes(tenantId: string | null, limit = 10): Promise<SorteioResponse[]> {
    this.assertTenantId(tenantId);

    const sorteios = await this.prisma.sorteio.findMany({
      where: { tenantId },
      distinct: ['numeroConcurso'],
      orderBy: { numeroConcurso: 'desc' },
      take: limit,
    });

    return sorteios.map((s) => this.toResponse(s));
  }

  async findAll(tenantId: string | null, bolaoId: string): Promise<SorteioResponse[]> {
    this.assertTenantId(tenantId);

    const sorteios = await this.prisma.sorteio.findMany({
      where: { bolaoId, tenantId },
      orderBy: { sequenciaNoBolao: 'asc' },
    });

    return sorteios.map((s) => this.toResponse(s));
  }

  async findById(tenantId: string | null, bolaoId: string, id: string): Promise<SorteioResponse> {
    this.assertTenantId(tenantId);
    return this.toResponse(await this.findOrFail(tenantId, bolaoId, id));
  }

  async reprocessar(tenantId: string | null, bolaoId: string, id: string): Promise<SorteioResponse> {
    this.assertTenantId(tenantId);
    const sorteio = await this.findOrFail(tenantId, bolaoId, id);

    await this.prisma.sorteio.update({
      where: { id },
      data: { processado: false },
    });

    // JobId único para reprocessamento — permite re-enfileirar
    await this.queue.add(
      CALC_ACERTOS_QUEUE_NAME,
      { sorteioId: id, tenantId, bolaoId } satisfies CalcAcertosJobData,
      {
        jobId: `retry-${id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return this.toResponse({ ...sorteio, processado: false });
  }

  private async findOrFail(tenantId: string, bolaoId: string, id: string) {
    const sorteio = await this.prisma.sorteio.findFirst({ where: { id, bolaoId, tenantId } });
    if (!sorteio) {
      throw new NotFoundException({ statusCode: 404, error: 'SORTEIO_NAO_ENCONTRADO', message: `Sorteio ${id} não encontrado`, details: [] });
    }
    return sorteio;
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }

  private toResponse(s: {
    id: string; tenantId: string; bolaoId: string; numeroConcurso: number;
    dataSorteio: Date; bolasSorteadas: number[]; sequenciaNoBolao: number;
    ehPrimeiro: boolean; processado: boolean; criadoEm: Date;
  }): SorteioResponse {
    return {
      id: s.id,
      tenantId: s.tenantId,
      bolaoId: s.bolaoId,
      numeroConcurso: s.numeroConcurso,
      dataSorteio: s.dataSorteio.toISOString().split('T')[0],
      bolasSorteadas: s.bolasSorteadas,
      sequenciaNoBolao: s.sequenciaNoBolao,
      ehPrimeiro: s.ehPrimeiro,
      processado: s.processado,
      criadoEm: s.criadoEm.toISOString(),
    };
  }
}
