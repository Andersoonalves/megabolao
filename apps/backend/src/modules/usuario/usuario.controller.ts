import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AtribuirPerfisDto } from './dto/atribuir-perfis.dto';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UsuarioService } from './usuario.service';

@ApiTags('usuarios')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('usuarios')
export class UsuarioController {
  constructor(private readonly usuarios: UsuarioService) {}

  @Get()
  @RequerPermissoes('usuario.ler')
  @ApiOperation({ summary: 'Listar usuários do tenant com seus perfis' })
  findAll(@TenantId() tenantId: string | null) {
    return this.usuarios.findAll(tenantId);
  }

  @Get(':id')
  @RequerPermissoes('usuario.ler')
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  findById(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usuarios.findById(tenantId, id);
  }

  @Post()
  @RequerPermissoes('usuario.criar')
  @ApiOperation({ summary: 'Convidar novo usuário (envia e-mail) e atribuir perfis' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string | null,
    @Body() dto: CreateUsuarioDto,
  ) {
    return this.usuarios.create(user, tenantId, dto);
  }

  @Patch(':id/perfis')
  @RequerPermissoes('usuario.atribuir_perfil')
  @ApiOperation({ summary: 'Substituir o conjunto de perfis do usuário' })
  atribuirPerfis(
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtribuirPerfisDto,
  ) {
    return this.usuarios.atribuirPerfis(user, tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequerPermissoes('usuario.excluir')
  @ApiOperation({ summary: 'Excluir usuário (Supabase Auth + cascata)' })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usuarios.delete(user, tenantId, id);
  }
}
