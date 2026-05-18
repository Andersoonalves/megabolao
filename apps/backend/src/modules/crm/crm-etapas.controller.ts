import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { CrmEtapasService } from './crm-etapas.service';
import { CreateEtapaDto } from './dto/create-etapa.dto';
import { UpdateEtapaDto } from './dto/update-etapa.dto';

@ApiTags('crm-etapas')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('crm/etapas')
export class CrmEtapasController {
  constructor(private readonly service: CrmEtapasService) {}

  @Get()
  @RequerPermissoes('crm.ler')
  @ApiOperation({ summary: 'Listar etapas do funil' })
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Post()
  @RequerPermissoes('crm.editar')
  @ApiOperation({ summary: 'Criar nova etapa' })
  create(@TenantId() tenantId: string, @Body() dto: CreateEtapaDto) {
    return this.service.create(tenantId, dto);
  }

  @Patch(':id')
  @RequerPermissoes('crm.editar')
  @ApiOperation({ summary: 'Atualizar etapa' })
  update(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEtapaDto) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequerPermissoes('crm.editar')
  @ApiOperation({ summary: 'Excluir etapa (move contatos para sem etapa)' })
  remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(tenantId, id);
  }

  @Put('reorder')
  @RequerPermissoes('crm.editar')
  @ApiOperation({ summary: 'Reordenar etapas' })
  reorder(@TenantId() tenantId: string, @Body() body: { ids: string[] }) {
    return this.service.reorder(tenantId, body.ids);
  }
}
