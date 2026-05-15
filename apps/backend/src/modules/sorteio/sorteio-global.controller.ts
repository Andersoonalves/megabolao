import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { SorteioService } from './sorteio.service';
import { CreateSorteioDto } from './dto/create-sorteio.dto';

class SorteioAutoApplyDto {
  @IsBoolean()
  autoApply!: boolean;
}

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
  @ApiOperation({
    summary: 'Busca resultado(s) Mega-Sena na Caixa. Com painel=1 retorna metadados (prêmio, próximo concurso) e aplicações no tenant.',
  })
  @ApiQuery({ name: 'concurso', required: false, type: Number })
  @ApiQuery({ name: 'ultimos', required: false, type: Number })
  @ApiQuery({ name: 'painel', required: false, description: '1 = resposta enriquecida para tela admin', enum: ['0', '1'] })
  buscarMegaSena(
    @TenantId() tenantId: string | null,
    @Query('concurso') concurso?: string,
    @Query('ultimos') ultimos?: string,
    @Query('painel') painel?: string,
  ) {
    const u = ultimos ? +ultimos : undefined;
    const c = concurso ? +concurso : undefined;
    if (painel === '1' || painel === 'true') {
      return this.sorteioService.buscarMegaSenaPainel(tenantId, u ?? 20);
    }
    return this.sorteioService.buscarMegaSena(c, u);
  }

  @Get('mega-sena/pendente')
  @RequerPermissoes('sorteio.ler')
  @ApiOperation({ summary: 'Verifica se há resultado novo da Mega-Sena não aplicado neste tenant' })
  pendente(@TenantId() tenantId: string | null) {
    return this.sorteioService.verificarPendente(tenantId);
  }

  @Post('mega-sena/aplicar')
  @RequerPermissoes('sorteio.criar')
  @ApiOperation({ summary: 'Aplica o resultado pendente da Mega-Sena a todos os bolões EM_ANDAMENTO' })
  aplicarPendente(@TenantId() tenantId: string | null) {
    return this.sorteioService.aplicarPendente(tenantId);
  }

  @Post('mega-sena/ignorar')
  @RequerPermissoes('sorteio.ler')
  @ApiOperation({ summary: 'Dispensa a notificação do resultado pendente para este tenant' })
  ignorarPendente(@TenantId() tenantId: string | null) {
    return this.sorteioService.ignorarPendente(tenantId);
  }

  @Patch('mega-sena/config')
  @RequerPermissoes('sorteio.criar')
  @ApiOperation({ summary: 'Configura auto-apply de resultados Mega-Sena para este tenant' })
  configurarAutoApply(@TenantId() tenantId: string | null, @Body() dto: SorteioAutoApplyDto) {
    return this.sorteioService.configurarAutoApply(tenantId, dto.autoApply);
  }
}
