import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { ListCotasDto } from './dto/list-cotas.dto';
import { CreateCotaDto } from './dto/create-cota.dto';
import { UpdateCotaDto } from './dto/update-cota.dto';
import { PagarEmMassaDto } from './dto/pagar-em-massa.dto';
import { ParticipanteService } from './participante.service';

@ApiTags('cotas')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes/:bolaoId/cotas')
export class ParticipanteController {
  constructor(private readonly participanteService: ParticipanteService) {}

  @Post('importar-csv')
  @UseInterceptors(FileInterceptor('arquivo', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_, file, cb) =>
      (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv'))
        ? cb(null, true)
        : cb(new BadRequestException('Apenas arquivos .csv são aceitos'), false),
  }))
  @RequerPermissoes('cota.editar')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importar cotas via CSV (colunas: Nome, Celular, N1…N10)' })
  importarCSV(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Query('ignorarErros') ignorarErros?: string,
  ) {
    if (!arquivo?.buffer?.length) throw new BadRequestException('Arquivo CSV obrigatório');
    return this.participanteService.importarCotasCSV(
      tenantId,
      bolaoId,
      arquivo.buffer,
      ignorarErros !== 'false',
    );
  }

  @Post()
  @RequerPermissoes('cota.editar')
  @ApiOperation({ summary: 'Criar cota com palpites (10 números únicos, 1–60)' })
  create(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: CreateCotaDto,
  ) {
    return this.participanteService.create(tenantId, bolaoId, dto);
  }

  @Get()
  @RequerPermissoes('cota.ler')
  @ApiOperation({ summary: 'Listar cotas do bolão (filtro por status e busca)' })
  findAll(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Query() query: ListCotasDto,
  ) {
    return this.participanteService.findAll(tenantId, bolaoId, query);
  }

  @Get(':id')
  @RequerPermissoes('cota.ler')
  @ApiOperation({ summary: 'Buscar cota por ID' })
  findById(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participanteService.findById(tenantId, bolaoId, id);
  }

  @Patch(':id')
  @RequerPermissoes('cota.editar')
  @ApiOperation({ summary: 'Atualizar cota (só PENDENTE)' })
  update(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCotaDto,
  ) {
    return this.participanteService.update(tenantId, bolaoId, id, dto);
  }

  @Patch('pagar-em-massa')
  @RequerPermissoes('cota.confirmar_pagamento')
  @ApiOperation({ summary: 'Confirmar pagamento de múltiplas cotas por ID (PENDENTE → PAGO)' })
  pagarEmMassa(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: PagarEmMassaDto,
  ) {
    return this.participanteService.pagarEmMassa(tenantId, bolaoId, dto.cotaIds);
  }

  @Patch('pagar-todas-pendentes')
  @HttpCode(HttpStatus.OK)
  @RequerPermissoes('cota.confirmar_pagamento')
  @ApiOperation({ summary: 'Confirmar pagamento de todas as cotas PENDENTE do bolão' })
  pagarTodasPendentes(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
  ) {
    return this.participanteService.pagarTodasPendentes(tenantId, bolaoId);
  }

  @Patch(':id/pagar')
  @RequerPermissoes('cota.confirmar_pagamento')
  @ApiOperation({ summary: 'Confirmar pagamento (PENDENTE → PAGO)' })
  confirmarPagamento(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participanteService.confirmarPagamento(tenantId, bolaoId, id);
  }

  @Patch(':id/inativar')
  @RequerPermissoes('cota.editar')
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
  @RequerPermissoes('cota.editar')
  @ApiOperation({ summary: 'Excluir cota (só PENDENTE)' })
  delete(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participanteService.delete(tenantId, bolaoId, id);
  }
}
