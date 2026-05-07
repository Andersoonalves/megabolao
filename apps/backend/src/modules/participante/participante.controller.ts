import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { ListCotasDto } from './dto/list-cotas.dto';
import { CreateCotaDto } from './dto/create-cota.dto';
import { UpdateCotaDto } from './dto/update-cota.dto';
import { ParticipanteService } from './participante.service';

@ApiTags('cotas')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes/:bolaoId/cotas')
export class ParticipanteController {
  constructor(private readonly participanteService: ParticipanteService) {}

  @Post()
  @ApiOperation({ summary: 'Criar cota com palpites (10 números únicos, 1–60)' })
  create(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: CreateCotaDto,
  ) {
    return this.participanteService.create(tenantId, bolaoId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cotas do bolão (filtro por status e busca)' })
  findAll(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Query() query: ListCotasDto,
  ) {
    return this.participanteService.findAll(tenantId, bolaoId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar cota por ID' })
  findById(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participanteService.findById(tenantId, bolaoId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar cota (só PENDENTE)' })
  update(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCotaDto,
  ) {
    return this.participanteService.update(tenantId, bolaoId, id, dto);
  }

  @Patch(':id/pagar')
  @ApiOperation({ summary: 'Confirmar pagamento (PENDENTE → PAGO)' })
  confirmarPagamento(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participanteService.confirmarPagamento(tenantId, bolaoId, id);
  }

  @Patch(':id/inativar')
  @ApiOperation({ summary: 'Inativar cota (PENDENTE ou PAGO → INATIVO)' })
  inativar(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participanteService.inativar(tenantId, bolaoId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir cota (só PENDENTE)' })
  delete(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participanteService.delete(tenantId, bolaoId, id);
  }
}
