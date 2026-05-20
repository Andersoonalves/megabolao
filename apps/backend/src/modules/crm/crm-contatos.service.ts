import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContatoDto } from './dto/create-contato.dto';
import { UpdateContatoDto } from './dto/update-contato.dto';
import { prismaCelularWhere } from '../../common/utils/celular-crm.util';

@Injectable()
export class CrmContatosService {
  constructor(private readonly prisma: PrismaService) {}

  async kanban(tenantId: string) {
    const [etapas, contatos] = await Promise.all([
      this.prisma.crmEtapa.findMany({
        where: { tenantId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.crmContato.findMany({
        where: { tenantId },
        include: {
          etapa: { select: { id: true, nome: true, cor: true } },
          participante: {
            select: {
              id: true, nome: true,
              cotas: {
                where: { tenantId },
                select: {
                  id: true, numeroSequencial: true, statusPagamento: true,
                  bolao: { select: { id: true, nome: true, status: true } },
                },
              },
            },
          },
        },
        orderBy: { criadoEm: 'desc' },
      }),
    ]);
    return { etapas, contatos };
  }

  async findAllWithPreview(tenantId: string, busca?: string) {
    const contatos = await this.prisma.crmContato.findMany({
      where: {
        tenantId,
        ...(busca && {
          OR: [
            { nome:    { contains: busca, mode: 'insensitive' } },
            { celular: { contains: busca } },
          ],
        }),
      },
      include: { etapa: { select: { id: true, nome: true, cor: true } } },
      orderBy: { atualizadoEm: 'desc' },
      take: 100,
    });

    if (contatos.length === 0) return [];

    const celulares = contatos.map(c => c.celular);

    const [ultimasMensagens, naoLidasRaw] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ celular: string; conteudo: string; direcao: string; tipo: string; criado_em: Date }>
      >`
        SELECT DISTINCT ON (celular) celular, conteudo, direcao, tipo, criado_em
        FROM crm_mensagens
        WHERE tenant_id = ${tenantId}::uuid AND celular = ANY(${celulares})
        ORDER BY celular, criado_em DESC
      `,
      this.prisma.$queryRaw<Array<{ celular: string; count: number }>>`
        SELECT celular, COUNT(*)::int AS count
        FROM crm_mensagens
        WHERE tenant_id = ${tenantId}::uuid AND celular = ANY(${celulares})
          AND direcao = 'IN' AND lida = false
        GROUP BY celular
      `,
    ]);

    const msgMap  = new Map(ultimasMensagens.map(m => [m.celular, m]));
    const naoMap  = new Map(naoLidasRaw.map(n => [n.celular, Number(n.count)]));

    return contatos.map(c => ({
      ...c,
      ultimaMensagem: msgMap.get(c.celular) ?? null,
      naoLidas: naoMap.get(c.celular) ?? 0,
    }));
  }

  async findAll(tenantId: string, busca?: string, etapaId?: string) {
    return this.prisma.crmContato.findMany({
      where: {
        tenantId,
        ...(etapaId && { etapaId }),
        ...(busca && {
          OR: [
            { nome:    { contains: busca, mode: 'insensitive' } },
            { celular: { contains: busca } },
          ],
        }),
      },
      include: { etapa: true },
      orderBy: { atualizadoEm: 'desc' },
      take: 100,
    });
  }

  async findOne(tenantId: string, celular: string) {
    const c = await this.prisma.crmContato.findFirst({
      where: prismaCelularWhere(tenantId, celular),
      include: {
        etapa: true,
        participante: {
          include: {
            cotas: {
              where: { tenantId },
              include: { bolao: { select: { id: true, nome: true, status: true } } },
              orderBy: { criadoEm: 'desc' },
            },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Contato não encontrado');
    return c;
  }

  async create(tenantId: string, dto: CreateContatoDto) {
    // Tenta linkar ao participante existente
    const participante = await this.prisma.participante.findFirst({
      where: { tenantId, numeroCelular: dto.celular },
    });
    return this.prisma.crmContato.create({
      data: {
        tenantId,
        celular:        dto.celular,
        nome:           dto.nome ?? participante?.nome,
        etapaId:        dto.etapaId,
        tags:           dto.tags ?? [],
        notas:          dto.notas,
        participanteId: participante?.id,
      },
      include: { etapa: true },
    });
  }

  async update(tenantId: string, celular: string, dto: UpdateContatoDto) {
    await this.findOrFail(tenantId, celular);
    return this.prisma.crmContato.update({
      where: { tenantId_celular: { tenantId, celular } },
      data: {
        ...(dto.nome    !== undefined && { nome:    dto.nome }),
        ...(dto.etapaId !== undefined && { etapaId: dto.etapaId }),
        ...(dto.tags    !== undefined && { tags:    dto.tags }),
        ...(dto.notas   !== undefined && { notas:   dto.notas }),
        atualizadoEm: new Date(),
      },
      include: { etapa: true },
    });
  }

  async importarParticipantes(tenantId: string) {
    const participantes = await this.prisma.participante.findMany({
      where: { tenantId },
      select: { id: true, nome: true, numeroCelular: true },
    });

    // Etapa padrão "Cota Pendente"
    const etapaPago = await this.prisma.crmEtapa.findFirst({
      where: { tenantId, nome: 'Cota Pendente' },
    });

    let criados = 0;
    for (const p of participantes) {
      const existing = await this.prisma.crmContato.findFirst({
        where: { tenantId, celular: p.numeroCelular },
      });
      if (!existing) {
        await this.prisma.crmContato.create({
          data: {
            tenantId,
            celular:        p.numeroCelular,
            nome:           p.nome,
            participanteId: p.id,
            etapaId:        etapaPago?.id,
          },
        });
        criados++;
      } else if (!existing.participanteId) {
        await this.prisma.crmContato.update({
          where: { tenantId_celular: { tenantId, celular: p.numeroCelular } },
          data: { participanteId: p.id, nome: existing.nome ?? p.nome },
        });
      }
    }
    return { importados: criados, total: participantes.length };
  }

  private async findOrFail(tenantId: string, celular: string) {
    const c = await this.prisma.crmContato.findFirst({ where: prismaCelularWhere(tenantId, celular) });
    if (!c) throw new NotFoundException('Contato não encontrado');
    return c;
  }
}
