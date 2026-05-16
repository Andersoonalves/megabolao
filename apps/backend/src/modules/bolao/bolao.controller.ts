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
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { ListBolaoDto } from './dto/list-bolao.dto';
import { BolaoService } from './bolao.service';
import { CreateBolaoDto } from './dto/create-bolao.dto';
import { UpdateBolaoDto } from './dto/update-bolao.dto';
import { UpdateCategoriasDto } from './dto/update-categorias.dto';
import { ConfigGruposBolaoDto } from '../whatsapp/dto/config-grupo-bolao.dto';

@ApiTags('boloes')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes')
export class BolaoController {
  constructor(private readonly bolaoService: BolaoService) {}

  @Post()
  @RequerPermissoes('bolao.criar')
  @ApiOperation({ summary: 'Criar bolão com categorias (soma=100%)' })
  create(@TenantId() tenantId: string | null, @Body() dto: CreateBolaoDto) {
    return this.bolaoService.create(tenantId, dto);
  }

  @Get()
  @RequerPermissoes('bolao.ler')
  @ApiOperation({ summary: 'Listar bolões do tenant' })
  findAll(@TenantId() tenantId: string | null, @Query() query: ListBolaoDto) {
    return this.bolaoService.findAll(tenantId, query);
  }

  @Get(':id/whatsapp')
  @RequerPermissoes('whatsapp.ler')
  @ApiOperation({ summary: 'Obter configuração de grupo WhatsApp do bolão' })
  getWhatsappConfig(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.getWhatsappConfig(tenantId, id);
  }

  @Patch(':id/whatsapp')
  @RequerPermissoes('whatsapp.ler')
  @ApiOperation({ summary: 'Configurar grupos WhatsApp do bolão (array)' })
  setWhatsappConfig(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfigGruposBolaoDto,
  ) {
    return this.bolaoService.setWhatsappConfig(tenantId, id, dto);
  }

  @Get(':id/dashboard')
  @RequerPermissoes('bolao.ler')
  @ApiOperation({ summary: 'Dados agregados do dashboard do bolão' })
  dashboard(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.dashboard(tenantId, id);
  }

  @Get(':id')
  @RequerPermissoes('bolao.ler')
  @ApiOperation({ summary: 'Buscar bolão por ID (com categorias)' })
  findById(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.findById(tenantId, id);
  }

  @Patch(':id')
  @RequerPermissoes('bolao.editar')
  @ApiOperation({ summary: 'Atualizar bolão (somente quando A_SER_INICIADO)' })
  update(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBolaoDto,
  ) {
    return this.bolaoService.update(tenantId, id, dto);
  }

  @Patch(':id/categorias')
  @RequerPermissoes('bolao.editar')
  @ApiOperation({ summary: 'Substituir todas as categorias do bolão (soma=100%)' })
  updateCategorias(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoriasDto,
  ) {
    return this.bolaoService.updateCategorias(tenantId, id, dto);
  }

  @Post(':id/clonar')
  @RequerPermissoes('bolao.criar')
  @ApiOperation({ summary: 'Clonar bolão: copia estrutura e cotas (→ PENDENTE), sem sorteios nem prêmios' })
  clonar(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.clonar(tenantId, id);
  }

  @Patch(':id/iniciar')
  @RequerPermissoes('bolao.iniciar')
  @ApiOperation({ summary: 'Iniciar bolão (A_SER_INICIADO → EM_ANDAMENTO)' })
  iniciar(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.iniciar(tenantId, id);
  }

  @Patch(':id/finalizar')
  @RequerPermissoes('bolao.finalizar')
  @ApiOperation({ summary: 'Finalizar bolão (EM_ANDAMENTO → FINALIZADO)' })
  finalizar(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.finalizar(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequerPermissoes('bolao.excluir')
  @ApiOperation({ summary: 'Excluir bolão (somente quando A_SER_INICIADO)' })
  delete(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.bolaoService.delete(tenantId, id);
  }
}
