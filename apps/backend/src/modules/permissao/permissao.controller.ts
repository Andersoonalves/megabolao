import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissaoService } from './permissao.service';

@ApiTags('permissoes')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('permissoes')
export class PermissaoController {
  constructor(private readonly permissoes: PermissaoService) {}

  @Get('catalogo')
  @ApiOperation({ summary: 'Listar catálogo global de módulos e permissões' })
  catalogo(@CurrentUser() user: AuthenticatedUser) {
    // MASTER vê tudo (inclusive módulos apenas_master)
    return this.permissoes.listarCatalogo(user.papel === 'MASTER');
  }
}
