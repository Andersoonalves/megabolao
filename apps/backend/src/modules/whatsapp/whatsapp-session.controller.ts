import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { WhatsAppClientManager } from './whatsapp-client-manager.service';
import { BusinessException } from '../../common/exceptions/business.exception';

@ApiTags('whatsapp-sessao')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('whatsapp/sessao')
export class WhatsAppSessionController {
  constructor(private readonly clientManager: WhatsAppClientManager) {}

  @Post('iniciar')
  @ApiOperation({ summary: 'Iniciar/retomar sessão WhatsApp do tenant (retorna status ou QR code)' })
  async iniciar(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    return this.clientManager.iniciar(tenantId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Status da sessão WhatsApp (polling para acompanhar QR → CONECTADO)' })
  getStatus(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    return this.clientManager.getStatus(tenantId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerrar sessão WhatsApp do tenant' })
  async encerrar(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    await this.clientManager.encerrar(tenantId);
  }

  @Get('grupos')
  @ApiOperation({ summary: 'Listar grupos WhatsApp (requer status CONECTADO)' })
  getGrupos(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    return this.clientManager.getGrupos(tenantId);
  }
}
