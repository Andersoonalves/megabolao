import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { EnviarMensagemDto } from './dto/enviar-mensagem.dto';
import { ListMensagensDto } from './dto/list-mensagens.dto';
import { WhatsAppMensagemService } from './whatsapp-mensagem.service';

@ApiTags('whatsapp-mensagens')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('whatsapp/mensagens')
export class WhatsAppMensagemController {
  constructor(private readonly mensagemService: WhatsAppMensagemService) {}

  @Post()
  @RequerPermissoes('whatsapp.enviar')
  @ApiOperation({ summary: 'Enfileirar mensagem WhatsApp (enviada via BullMQ)' })
  enfileirar(@TenantId() tenantId: string | null, @Body() dto: EnviarMensagemDto) {
    return this.mensagemService.enfileirar(tenantId, dto);
  }

  @Get()
  @RequerPermissoes('whatsapp.ler')
  @ApiOperation({ summary: 'Histórico de mensagens WhatsApp' })
  findAll(@TenantId() tenantId: string | null, @Query() query: ListMensagensDto) {
    return this.mensagemService.findAll(tenantId, query);
  }

  @Post(':id/retry')
  @RequerPermissoes('whatsapp.enviar')
  @ApiOperation({ summary: 'Reenviar mensagem FALHA' })
  retry(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.mensagemService.retry(tenantId, id);
  }
}
