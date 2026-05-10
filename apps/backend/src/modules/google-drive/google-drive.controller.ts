import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { GoogleDriveService } from './google-drive.service';
import { ImportCotasDto } from './dto/import-cotas.dto';
import { ExportarResultadosDto } from './dto/exportar-resultados.dto';
import { VincularSheetsDto } from './dto/vincular-sheets.dto';

@ApiTags('google-drive')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes/:bolaoId/google-drive')
export class GoogleDriveController {
  constructor(private readonly googleDriveService: GoogleDriveService) {}

  @Get('status')
  @RequerPermissoes('bolao.ler')
  @ApiOperation({ summary: 'Status da integração Google Sheets do bolão' })
  status(@TenantId() tenantId: string | null, @Param('bolaoId', ParseUUIDPipe) bolaoId: string) {
    return this.googleDriveService.getSheetsStatus(tenantId, bolaoId);
  }

  @Post('vincular')
  @RequerPermissoes('bolao.editar')
  @ApiOperation({ summary: 'Vincular planilha ao bolão e ativar sync automático' })
  vincular(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: VincularSheetsDto,
  ) {
    return this.googleDriveService.vincular(tenantId, bolaoId, dto);
  }

  @Delete('vincular')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequerPermissoes('bolao.editar')
  @ApiOperation({ summary: 'Desvincular planilha e desativar sync automático' })
  desvincular(@TenantId() tenantId: string | null, @Param('bolaoId', ParseUUIDPipe) bolaoId: string) {
    return this.googleDriveService.desvincular(tenantId, bolaoId);
  }

  @Post('sincronizar')
  @RequerPermissoes('cota.editar')
  @ApiOperation({ summary: 'Forçar sincronização imediata com a planilha vinculada' })
  async sincronizar(@TenantId() tenantId: string | null, @Param('bolaoId', ParseUUIDPipe) bolaoId: string) {
    const status = await this.googleDriveService.getSheetsStatus(tenantId, bolaoId);
    if (status.vinculada && tenantId) {
      await this.googleDriveService.triggerSync(bolaoId, tenantId, 'MANUAL');
    }
    return { agendado: status.vinculada };
  }

  @Post('importar')
  @RequerPermissoes('cota.editar')
  @ApiOperation({ summary: 'Importar cotas de Google Sheets (Service Account)' })
  importarCotas(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: ImportCotasDto,
  ) {
    return this.googleDriveService.importarCotas(tenantId, bolaoId, dto);
  }

  @Post('preview')
  @RequerPermissoes('cota.ler')
  @ApiOperation({ summary: 'Pré-visualizar cotas da planilha sem importar' })
  previewImport(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: ImportCotasDto,
  ) {
    return this.googleDriveService.previewImport(tenantId, bolaoId, dto);
  }

  @Post('exportar/resultados')
  @RequerPermissoes('relatorio.exportar')
  @ApiOperation({ summary: 'Exportar ranking para Google Sheets (sobrescreve aba Ranking)' })
  exportarResultados(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: ExportarResultadosDto,
  ) {
    return this.googleDriveService.exportarResultados(tenantId, bolaoId, dto);
  }

  @Post('exportar/completo')
  @RequerPermissoes('relatorio.exportar')
  @ApiOperation({ summary: 'Exportar todos os dados do bolão para Google Sheets (5 abas)' })
  exportarCompleto(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: ExportarResultadosDto,
  ) {
    return this.googleDriveService.exportarCompleto(tenantId, bolaoId, dto);
  }
}
