import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { SorteioService } from './sorteio.service';
import { CreateSorteioDto } from './dto/create-sorteio.dto';

@ApiTags('sorteios')
@ApiBearerAuth()
@Roles('ADMIN', 'MASTER')
@Controller('sorteios')
export class SorteioGlobalController {
  constructor(private readonly sorteioService: SorteioService) {}

  @Post()
  @RequerPermissoes('sorteio.criar')
  @ApiOperation({ summary: 'Registrar resultado Mega-Sena em todos os bolões EM_ANDAMENTO do tenant' })
  registrarGlobal(
    @TenantId() tenantId: string | null,
    @Body() dto: CreateSorteioDto,
  ) {
    return this.sorteioService.registrarGlobal(tenantId, dto);
  }

  @Get('recentes')
  @RequerPermissoes('sorteio.ler')
  @ApiOperation({ summary: 'Últimos concursos registrados no tenant (um por numeroConcurso)' })
  recentes(@TenantId() tenantId: string | null, @Query('limit') limit = 10) {
    return this.sorteioService.findRecentes(tenantId, +limit);
  }

  @Get('mega-sena')
  @RequerPermissoes('sorteio.ler')
  @ApiOperation({ summary: 'Busca resultado(s) Mega-Sena direto da Caixa (proxy)' })
  @ApiQuery({ name: 'concurso', required: false, type: Number })
  @ApiQuery({ name: 'ultimos', required: false, type: Number, description: 'Retorna array com os últimos N concursos (máx 20)' })
  buscarMegaSena(@Query('concurso') concurso?: string, @Query('ultimos') ultimos?: string) {
    return this.sorteioService.buscarMegaSena(
      concurso ? +concurso : undefined,
      ultimos ? +ultimos : undefined,
    );
  }
}
