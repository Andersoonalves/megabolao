import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { AuditoriaService, ListarAuditoriaQuery } from './auditoria.service';

@ApiTags('auditoria')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @RequerPermissoes('auditoria.ler')
  @ApiOperation({ summary: 'Listar eventos de auditoria do tenant (paginado)' })
  async listar(
    @TenantId() tenantId: string | null,
    @Query() query: ListarAuditoriaQuery,
  ) {
    return this.auditoria.listar(tenantId, query);
  }
}
