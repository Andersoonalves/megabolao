import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { GoogleDriveService } from './google-drive.service';
import { ImportCotasDto } from './dto/import-cotas.dto';
import { ExportarResultadosDto } from './dto/exportar-resultados.dto';

@ApiTags('google-drive')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes/:bolaoId/google-drive')
export class GoogleDriveController {
  constructor(private readonly googleDriveService: GoogleDriveService) {}

  @Post('importar')
  @ApiOperation({ summary: 'Importar cotas de Google Sheets (Service Account)' })
  importarCotas(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: ImportCotasDto,
  ) {
    return this.googleDriveService.importarCotas(tenantId, bolaoId, dto);
  }

  @Post('exportar/resultados')
  @ApiOperation({ summary: 'Exportar ranking para Google Sheets (sobrescreve aba)' })
  exportarResultados(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Body() dto: ExportarResultadosDto,
  ) {
    return this.googleDriveService.exportarResultados(tenantId, bolaoId, dto);
  }
}
