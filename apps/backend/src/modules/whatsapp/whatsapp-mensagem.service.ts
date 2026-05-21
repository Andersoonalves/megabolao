import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResponse } from '@nossobolao/shared-types';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { EnviarMensagemDto } from './dto/enviar-mensagem.dto';
import { ListMensagensDto } from './dto/list-mensagens.dto';
import { ENVIAR_MENSAGEM_WA_QUEUE, ENVIAR_MENSAGEM_WA_QUEUE_NAME, EnviarMensagemJobData } from './jobs/enviar-mensagem.types';

export interface MensagemResponse {
  id: string;
  tenantId: string;
  bolaoId: string | null;
  tipo: string;
  conteudo: string;
  grupoId: string | null;
  status: string;
  tentativas: number;
  erro: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

@Injectable()
export class WhatsAppMensagemService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENVIAR_MENSAGEM_WA_QUEUE) private readonly queue: Queue,
  ) {}

  async enfileirar(tenantId: string | null, dto: EnviarMensagemDto): Promise<MensagemResponse> {
    this.assertTenantId(tenantId);

    const mensagem = await this.prisma.mensagemWhatsapp.create({
      data: {
        tenantId,
        bolaoId: dto.bolaoId ?? null,
        tipo: dto.tipo as Prisma.MensagemWhatsappCreateInput['tipo'],
        conteudo: dto.conteudo,
        grupoId: dto.grupoId,
        status: 'PENDENTE',
      },
    });

    await this.queue.add(
      ENVIAR_MENSAGEM_WA_QUEUE_NAME,
      { mensagemId: mensagem.id, tenantId } satisfies EnviarMensagemJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 }, // 30s→60s→120s — ver docs/runbooks/whatsapp-anti-ban.md
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 * 7 },
      },
    );

    return this.toResponse(mensagem);
  }

  async findAll(
    tenantId: string | null,
    { page = 1, perPage = 20, status, tipo }: ListMensagensDto,
  ): Promise<PaginatedResponse<MensagemResponse>> {
    this.assertTenantId(tenantId);
    const skip = (page - 1) * perPage;

    const where: Prisma.MensagemWhatsappWhereInput = {
      tenantId,
      ...(status && { status: status as Prisma.MensagemWhatsappWhereInput['status'] }),
      ...(tipo && { tipo: tipo as Prisma.MensagemWhatsappWhereInput['tipo'] }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.mensagemWhatsapp.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { criadoEm: 'desc' },
      }),
      this.prisma.mensagemWhatsapp.count({ where }),
    ]);

    return {
      data: data.map((m) => this.toResponse(m)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async retry(tenantId: string | null, id: string): Promise<MensagemResponse> {
    this.assertTenantId(tenantId);

    const mensagem = await this.prisma.mensagemWhatsapp.findFirst({
      where: { id, tenantId },
    });

    if (!mensagem) {
      throw new NotFoundException({ statusCode: 404, error: 'MENSAGEM_NAO_ENCONTRADA', message: `Mensagem ${id} não encontrada`, details: [] });
    }

    if (mensagem.status !== 'FALHA') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        `Apenas mensagens FALHA podem ser reenviadas. Status: ${mensagem.status}`,
      );
    }

    const updated = await this.prisma.mensagemWhatsapp.update({
      where: { id },
      data: { status: 'PENDENTE', erro: null },
    });

    await this.queue.add(
      ENVIAR_MENSAGEM_WA_QUEUE_NAME,
      { mensagemId: id, tenantId } satisfies EnviarMensagemJobData,
      {
        jobId: `retry-${id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 }, // 30s→60s→120s — ver docs/runbooks/whatsapp-anti-ban.md
      },
    );

    return this.toResponse(updated);
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }

  private toResponse(m: {
    id: string; tenantId: string; bolaoId: string | null; tipo: string; conteudo: string;
    grupoId: string | null; status: string; tentativas: number; erro: string | null;
    criadoEm: Date; atualizadoEm: Date;
  }): MensagemResponse {
    return {
      id: m.id,
      tenantId: m.tenantId,
      bolaoId: m.bolaoId,
      tipo: m.tipo,
      conteudo: m.conteudo,
      grupoId: m.grupoId,
      status: m.status,
      tentativas: m.tentativas,
      erro: m.erro,
      criadoEm: m.criadoEm.toISOString(),
      atualizadoEm: m.atualizadoEm.toISOString(),
    };
  }
}
