import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
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
  @RequerPermissoes('whatsapp.conectar')
  @ApiOperation({ summary: 'Iniciar/retomar sessão WhatsApp do tenant (retorna status ou QR code)' })
  async iniciar(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    return this.clientManager.iniciar(tenantId);
  }

  @Post('qr/atualizar')
  @RequerPermissoes('whatsapp.conectar')
  @ApiOperation({ summary: 'Atualizar QR code sem recriar a instância (renovação automática ao expirar)' })
  async atualizarQr(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    return this.clientManager.atualizarQr(tenantId);
  }

  @Post('qr/renovar')
  @RequerPermissoes('whatsapp.conectar')
  @ApiOperation({ summary: 'Apagar e recriar instância Evolution (último recurso se o QR não atualizar)' })
  async renovarQr(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    return this.clientManager.renovarQr(tenantId);
  }

  @Get('status')
  @RequerPermissoes('whatsapp.ler')
  @ApiOperation({ summary: 'Status da sessão WhatsApp (polling para acompanhar QR → CONECTADO)' })
  async getStatus(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    return this.clientManager.refreshStatus(tenantId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequerPermissoes('whatsapp.conectar')
  @ApiOperation({ summary: 'Encerrar sessão WhatsApp do tenant' })
  async encerrar(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    await this.clientManager.encerrar(tenantId);
  }

  @Get('grupos')
  @RequerPermissoes('whatsapp.ler')
  @ApiOperation({ summary: 'Listar grupos WhatsApp (requer status CONECTADO)' })
  getGrupos(@TenantId() tenantId: string | null) {
    if (!tenantId) throw new BusinessException('TENANT_ID_OBRIGATORIO', 'tenantId obrigatório');
    return this.clientManager.getGrupos(tenantId);
  }
}
