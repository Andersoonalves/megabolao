import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

@Injectable()
export class WhatsAppTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string | null) {
    this.assertTenantId(tenantId);
    return this.prisma.whatsappTemplate.findMany({
      where: { tenantId },
      orderBy: [{ ativo: 'desc' }, { criadoEm: 'desc' }],
    });
  }

  async create(tenantId: string | null, dto: CreateTemplateDto) {
    this.assertTenantId(tenantId);
    return this.prisma.whatsappTemplate.create({
      data: { tenantId, nome: dto.nome, conteudo: dto.conteudo, tipo: dto.tipo ?? 'MANUAL' },
    });
  }

  async update(tenantId: string | null, id: string, dto: UpdateTemplateDto) {
    this.assertTenantId(tenantId);
    await this.findOrFail(tenantId, id);
    return this.prisma.whatsappTemplate.update({
      where: { id },
      data: {
        ...(dto.nome      !== undefined && { nome: dto.nome }),
        ...(dto.conteudo  !== undefined && { conteudo: dto.conteudo }),
        ...(dto.tipo      !== undefined && { tipo: dto.tipo }),
        ...(dto.ativo     !== undefined && { ativo: dto.ativo }),
      },
    });
  }

  async delete(tenantId: string | null, id: string): Promise<void> {
    this.assertTenantId(tenantId);
    await this.findOrFail(tenantId, id);
    await this.prisma.whatsappTemplate.delete({ where: { id } });
  }

  private async findOrFail(tenantId: string, id: string) {
    const t = await this.prisma.whatsappTemplate.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException({ statusCode: 404, error: 'TEMPLATE_NAO_ENCONTRADO', message: `Template ${id} não encontrado`, details: [] });
    return t;
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }
}
