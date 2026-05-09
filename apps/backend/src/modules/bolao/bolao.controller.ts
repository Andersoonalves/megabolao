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
import { ListBolaoDto } from './dto/list-bolao.dto';
import { BolaoService } from './bolao.service';
import { CreateBolaoDto } from './dto/create-bolao.dto';
import { UpdateBolaoDto } from './dto/update-bolao.dto';
import { UpdateCategoriasDto } from './dto/update-categorias.dto';

@ApiTags('boloes')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes')
export class BolaoController {
  constructor(private readonly bolaoService: BolaoService) {}

  @Post()
  @ApiOperation({ summary: 'Criar bolão com categorias (soma=100%)' })
  create(@TenantId() tenantId: string | null, @Body() dto: CreateBolaoDto) {
    return this.bolaoService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar bolões do tenant' })
  findAll(@TenantId() tenantId: string | null, @Query() query: ListBolaoDto) {
    return this.bolaoService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar bolão por ID (com categorias)' })
  findById(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.findById(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar bolão (somente quando A_SER_INICIADO)' })
  update(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBolaoDto,
  ) {
    return this.bolaoService.update(tenantId, id, dto);
  }

  @Patch(':id/categorias')
  @ApiOperation({ summary: 'Substituir todas as categorias do bolão (soma=100%)' })
  updateCategorias(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoriasDto,
  ) {
    return this.bolaoService.updateCategorias(tenantId, id, dto);
  }

  @Patch(':id/iniciar')
  @ApiOperation({ summary: 'Iniciar bolão (A_SER_INICIADO → EM_ANDAMENTO)' })
  iniciar(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.iniciar(tenantId, id);
  }

  @Patch(':id/finalizar')
  @ApiOperation({ summary: 'Finalizar bolão (EM_ANDAMENTO → FINALIZADO)' })
  finalizar(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.finalizar(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir bolão (somente quando A_SER_INICIADO)' })
  delete(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.delete(tenantId, id);
  }
}
