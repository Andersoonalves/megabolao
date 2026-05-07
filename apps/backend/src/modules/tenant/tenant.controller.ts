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
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateOwnTenantDto } from './dto/update-own-tenant.dto';
import { TenantService } from './tenant.service';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @Roles('MASTER')
  @ApiOperation({ summary: 'Criar tenant (MASTER)' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get()
  @Roles('MASTER')
  @ApiOperation({ summary: 'Listar todos os tenants (MASTER)' })
  findAll(@Query() pagination: PaginationDto) {
    return this.tenantService.findAll(pagination);
  }

  // Rota /me deve vir ANTES de /:id para não ser capturada como UUID
  @Get('me')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Obter próprio tenant (ADMIN)' })
  findOwn(@TenantId() tenantId: string | null) {
    return this.tenantService.findById(tenantId!);
  }

  @Patch('me')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar nome e branding do próprio tenant (ADMIN)' })
  updateOwn(@TenantId() tenantId: string | null, @Body() dto: UpdateOwnTenantDto) {
    return this.tenantService.updateOwn(tenantId, dto);
  }

  @Get(':id')
  @Roles('MASTER')
  @ApiOperation({ summary: 'Buscar tenant por ID (MASTER)' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.findById(id);
  }

  @Patch(':id')
  @Roles('MASTER')
  @ApiOperation({ summary: 'Atualizar tenant (MASTER)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantService.update(id, dto);
  }

  @Delete(':id')
  @Roles('MASTER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar tenant (MASTER)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.deactivate(id);
  }
}
