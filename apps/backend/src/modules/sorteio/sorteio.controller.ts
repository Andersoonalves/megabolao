import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { SorteioService } from './sorteio.service';
import { CreateSorteioDto } from './dto/create-sorteio.dto';

@ApiTags('sorteios')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes/:bolaoId/sorteios')
export class SorteioController {
  constructor(private readonly sorteioService: SorteioService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar sorteio e disparar cálculo de acertos (BullMQ)' })
  create(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: CreateSorteioDto,
  ) {
    return this.sorteioService.create(tenantId, bolaoId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar sorteios do bolão (ordem sequencial)' })
  findAll(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
  ) {
    return this.sorteioService.findAll(tenantId, bolaoId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar sorteio por ID' })
  findById(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sorteioService.findById(tenantId, bolaoId, id);
  }

  @Post(':id/reprocessar')
  @Roles('MASTER')
  @ApiOperation({ summary: 'Reprocessar acertos de um sorteio (MASTER)' })
  reprocessar(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sorteioService.reprocessar(tenantId, bolaoId, id);
  }
}
