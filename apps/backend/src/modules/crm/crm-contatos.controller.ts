import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { CrmContatosService } from './crm-contatos.service';
import { CreateContatoDto } from './dto/create-contato.dto';
import { UpdateContatoDto } from './dto/update-contato.dto';

@ApiTags('crm-contatos')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('crm/contatos')
export class CrmContatosController {
  constructor(private readonly service: CrmContatosService) {}

  @Get('kanban')
  @RequerPermissoes('crm.ler')
  @ApiOperation({ summary: 'Dados do Kanban: etapas + contatos agrupados' })
  kanban(@TenantId() tenantId: string) {
    return this.service.kanban(tenantId);
  }

  @Get()
  @RequerPermissoes('crm.ler')
  @ApiOperation({ summary: 'Listar contatos com filtros' })
  findAll(
    @TenantId() tenantId: string,
    @Query('busca') busca?: string,
    @Query('etapaId') etapaId?: string,
  ) {
    return this.service.findAll(tenantId, busca, etapaId);
  }

  @Get(':celular')
  @RequerPermissoes('crm.ler')
  @ApiOperation({ summary: 'Detalhes do contato com cotas e bolões' })
  findOne(@TenantId() tenantId: string, @Param('celular') celular: string) {
    return this.service.findOne(tenantId, celular);
  }

  @Post()
  @RequerPermissoes('crm.editar')
  @ApiOperation({ summary: 'Criar contato manualmente' })
  create(@TenantId() tenantId: string, @Body() dto: CreateContatoDto) {
    return this.service.create(tenantId, dto);
  }

  @Patch(':celular')
  @RequerPermissoes('crm.editar')
  @ApiOperation({ summary: 'Atualizar contato (nome, etapa, tags, notas)' })
  update(@TenantId() tenantId: string, @Param('celular') celular: string, @Body() dto: UpdateContatoDto) {
    return this.service.update(tenantId, celular, dto);
  }

  @Post('importar-participantes')
  @RequerPermissoes('crm.editar')
  @ApiOperation({ summary: 'Importar participantes existentes como contatos CRM' })
  importar(@TenantId() tenantId: string) {
    return this.service.importarParticipantes(tenantId);
  }
}
