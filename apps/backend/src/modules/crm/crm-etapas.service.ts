import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateEtapaDto } from './dto/create-etapa.dto';
import { UpdateEtapaDto } from './dto/update-etapa.dto';

@Injectable()
export class CrmEtapasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.crmEtapa.findMany({
      where: { tenantId },
      orderBy: { ordem: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateEtapaDto) {
    const maxOrdem = await this.prisma.crmEtapa.aggregate({
      where: { tenantId },
      _max: { ordem: true },
    });
    return this.prisma.crmEtapa.create({
      data: {
        tenantId,
        nome: dto.nome,
        cor:  dto.cor  ?? '#64748b',
        ordem: dto.ordem ?? (maxOrdem._max.ordem ?? -1) + 1,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateEtapaDto) {
    await this.findOrFail(tenantId, id);
    return this.prisma.crmEtapa.update({
      where: { id },
      data: {
        ...(dto.nome  !== undefined && { nome:  dto.nome }),
        ...(dto.cor   !== undefined && { cor:   dto.cor }),
        ...(dto.ordem !== undefined && { ordem: dto.ordem }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const etapa = await this.findOrFail(tenantId, id);
    if (etapa.isSistema) {
      throw new BusinessException('ETAPA_SISTEMA', 'Etapas do sistema não podem ser excluídas');
    }
    // Mover contatos para null antes de deletar
    await this.prisma.crmContato.updateMany({
      where: { tenantId, etapaId: id },
      data: { etapaId: null },
    });
    await this.prisma.crmEtapa.delete({ where: { id } });
  }

  async reorder(tenantId: string, ids: string[]) {
    await Promise.all(
      ids.map((id, ordem) =>
        this.prisma.crmEtapa.updateMany({ where: { id, tenantId }, data: { ordem } }),
      ),
    );
    return this.findAll(tenantId);
  }

  private async findOrFail(tenantId: string, id: string) {
    const e = await this.prisma.crmEtapa.findFirst({ where: { id, tenantId } });
    if (!e) throw new NotFoundException('Etapa não encontrada');
    return e;
  }
}
