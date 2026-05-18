import { Body, Controller, Get, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { CrmMensagensService } from './crm-mensagens.service';
import { CreateMensagemDto } from './dto/create-mensagem.dto';

@ApiTags('crm-mensagens')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('crm/contatos/:celular/mensagens')
export class CrmMensagensController {
  constructor(private readonly service: CrmMensagensService) {}

  @Get()
  @RequerPermissoes('crm.ler')
  @ApiOperation({ summary: 'Histórico de mensagens do contato' })
  findAll(
    @TenantId() tenantId: string,
    @Param('celular') celular: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(tenantId, celular, limit ? +limit : 50);
  }

  @Post()
  @RequerPermissoes('crm.enviar')
  @ApiOperation({ summary: 'Enviar mensagem WA ou adicionar nota interna' })
  create(
    @TenantId() tenantId: string,
    @Param('celular') celular: string,
    @Body() dto: CreateMensagemDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.service.create(tenantId, celular, dto, req.user.sub);
  }

  @Patch('marcar-lidas')
  @RequerPermissoes('crm.ler')
  @ApiOperation({ summary: 'Marcar mensagens recebidas como lidas' })
  marcarLidas(@TenantId() tenantId: string, @Param('celular') celular: string) {
    return this.service.marcarLidas(tenantId, celular);
  }

  @Patch('cotas/:cotaId/pagar')
  @RequerPermissoes('crm.editar')
  @ApiOperation({ summary: 'Confirmar pagamento de cota diretamente da conversa' })
  pagarCota(@TenantId() tenantId: string, @Param('cotaId') cotaId: string) {
    return this.service.pagarCota(tenantId, cotaId);
  }
}
