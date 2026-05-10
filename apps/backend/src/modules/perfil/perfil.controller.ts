import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreatePerfilDto } from './dto/create-perfil.dto';
import { UpdatePerfilDto } from './dto/update-perfil.dto';
import { PerfilService } from './perfil.service';

@ApiTags('perfis')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('perfis')
export class PerfilController {
  constructor(private readonly perfis: PerfilService) {}

  @Get()
  @RequerPermissoes('perfil.ler')
  @ApiOperation({ summary: 'Listar perfis do tenant' })
  findAll(@TenantId() tenantId: string | null) {
    return this.perfis.findAll(tenantId);
  }

  @Get(':id')
  @RequerPermissoes('perfil.ler')
  @ApiOperation({ summary: 'Buscar perfil por ID' })
  findById(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.perfis.findById(tenantId, id);
  }

  @Post()
  @RequerPermissoes('perfil.criar')
  @ApiOperation({ summary: 'Criar novo perfil' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string | null,
    @Body() dto: CreatePerfilDto,
  ) {
    return this.perfis.create(user, tenantId, dto);
  }

  @Patch(':id')
  @RequerPermissoes('perfil.editar')
  @ApiOperation({ summary: 'Atualizar perfil' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePerfilDto,
  ) {
    return this.perfis.update(user, tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequerPermissoes('perfil.excluir')
  @ApiOperation({ summary: 'Excluir perfil' })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.perfis.delete(user, tenantId, id);
  }
}
