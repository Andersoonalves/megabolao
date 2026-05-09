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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { BancoParticipanteService } from './banco-participante.service';
import { CreateParticipanteDto } from './dto/create-participante.dto';
import { UpdateParticipanteDto } from './dto/update-participante.dto';
import { ListParticipantesDto } from './dto/list-participantes.dto';

@ApiTags('participantes')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('participantes')
export class BancoParticipanteController {
  constructor(private readonly service: BancoParticipanteService) {}

  @Post()
  @ApiOperation({ summary: 'Criar participante no banco do tenant' })
  create(@TenantId() tenantId: string | null, @Body() dto: CreateParticipanteDto) {
    return this.service.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar participantes do tenant' })
  findAll(@TenantId() tenantId: string | null, @Query() query: ListParticipantesDto) {
    return this.service.findAll(tenantId, query);
  }

  @Get('buscar-celular')
  @ApiOperation({ summary: 'Buscar participante por celular (usado no cadastro de cota)' })
  @ApiQuery({ name: 'celular', required: true })
  findByCelular(@TenantId() tenantId: string | null, @Query('celular') celular: string) {
    return this.service.findByCelular(tenantId, celular);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar participante por ID' })
  findById(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar participante (nome, e-mail, observações)' })
  update(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParticipanteDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir participante (só sem cotas ativas)' })
  delete(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(tenantId, id);
  }
}
