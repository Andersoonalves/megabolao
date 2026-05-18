import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientManager } from '../whatsapp/whatsapp-client-manager.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateMensagemDto, DirecaoMensagem } from './dto/create-mensagem.dto';

@Injectable()
export class CrmMensagensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waClient: WhatsAppClientManager,
  ) {}

  async findAll(tenantId: string, celular: string, limit = 50) {
    return this.prisma.crmMensagem.findMany({
      where: { tenantId, celular },
      orderBy: { criadoEm: 'asc' },
      take: limit,
    });
  }

  async marcarLidas(tenantId: string, celular: string) {
    await this.prisma.crmMensagem.updateMany({
      where: { tenantId, celular, direcao: 'IN', lida: false },
      data: { lida: true },
    });
  }

  async create(tenantId: string, celular: string, dto: CreateMensagemDto, userId: string) {
    const direcao = dto.direcao ?? DirecaoMensagem.NOTE;

    if (direcao === DirecaoMensagem.OUT) {
      try {
        await this.waClient.enviarParaNumero(tenantId, celular, dto.conteudo);
      } catch {
        throw new BusinessException('WA_ERRO', 'WhatsApp não conectado ou erro ao enviar mensagem');
      }
    }

    return this.prisma.crmMensagem.create({
      data: {
        tenantId,
        celular,
        direcao,
        conteudo:   dto.conteudo,
        tipo:       direcao === DirecaoMensagem.NOTE ? 'note' : 'text',
        lida:       true,
        enviadaPor: userId,
      },
    });
  }

  async pagarCota(tenantId: string, cotaId: string) {
    const cota = await this.prisma.cota.findFirst({ where: { id: cotaId, tenantId } });
    if (!cota) throw new BusinessException('COTA_NAO_ENCONTRADA', 'Cota não encontrada');
    if (cota.statusPagamento !== 'PENDENTE') {
      throw new BusinessException('STATUS_INVALIDO', `Cota já está ${cota.statusPagamento}`);
    }
    return this.prisma.cota.update({
      where: { id: cotaId },
      data: {
        statusPagamento: 'PAGO',
        dataConfirmacaoPagamento: new Date(),
      },
      select: { id: true, numeroSequencial: true, statusPagamento: true, dataConfirmacaoPagamento: true },
    });
  }
}
