import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

@ApiTags('whatsapp-templates')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('whatsapp/templates')
export class WhatsAppTemplateController {
  constructor(private readonly service: WhatsAppTemplateService) {}

  @Get()
  @RequerPermissoes('whatsapp.ler')
  @ApiOperation({ summary: 'Listar templates WhatsApp do tenant' })
  findAll(@TenantId() tenantId: string | null) {
    return this.service.findAll(tenantId);
  }

  @Post()
  @RequerPermissoes('whatsapp.enviar')
  @ApiOperation({ summary: 'Criar template WhatsApp' })
  create(@TenantId() tenantId: string | null, @Body() dto: CreateTemplateDto) {
    return this.service.create(tenantId, dto);
  }

  @Patch(':id')
  @RequerPermissoes('whatsapp.enviar')
  @ApiOperation({ summary: 'Atualizar template' })
  update(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequerPermissoes('whatsapp.enviar')
  @ApiOperation({ summary: 'Excluir template' })
  delete(@TenantId() tenantId: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(tenantId, id);
  }
}
