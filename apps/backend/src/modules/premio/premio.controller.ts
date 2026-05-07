import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PremioService } from './premio.service';

@ApiTags('premios')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes/:bolaoId/premios')
export class PremioController {
  constructor(private readonly premioService: PremioService) {}

  @Post('calcular')
  @ApiOperation({ summary: 'Calcular e distribuir prêmios (idempotente — bolão deve ser FINALIZADO)' })
  calcular(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
  ) {
    return this.premioService.calcular(tenantId, bolaoId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar prêmios do bolão' })
  findAll(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
  ) {
    return this.premioService.findAll(tenantId, bolaoId);
  }

  // /ranking antes de /:id para evitar conflito de rota
  @Get('ranking')
  @ApiOperation({ summary: 'Ranking de participantes por total de acertos (cotas PAGO)' })
  getRanking(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.premioService.getRanking(tenantId, bolaoId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar prêmio por ID' })
  findById(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.premioService.findById(tenantId, bolaoId, id);
  }

  @Patch(':id/pagar')
  @ApiOperation({ summary: 'Marcar prêmio como pago (PENDENTE → PAGO)' })
  pagar(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.premioService.pagar(tenantId, bolaoId, id);
  }
}
