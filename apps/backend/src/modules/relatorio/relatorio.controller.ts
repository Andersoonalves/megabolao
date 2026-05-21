import { Controller, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequerPermissoes } from '../auth/decorators/permissions.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { RelatorioService } from './relatorio.service';

@ApiTags('relatorios')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes/:bolaoId/relatorios')
export class RelatorioController {
  constructor(private readonly relatorioService: RelatorioService) {}

  @Post('xlsx')
  @RequerPermissoes('relatorio.gerar')
  @ApiOperation({ summary: 'Gerar XLSX de ranking + prêmios (upload no Supabase Storage → URL assinada 24h)' })
  gerarXlsx(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
  ) {
    return this.relatorioService.gerarXlsx(tenantId, bolaoId);
  }

  @Post('pdf')
  @RequerPermissoes('relatorio.gerar')
  @ApiOperation({ summary: 'Gerar PDF completo do bolão — stream direto (sem storage)' })
  async gerarPdf(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.relatorioService.gerarPdfBuffer(tenantId, bolaoId);

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      buffer.length,
      'Cache-Control':       'no-store',
    });
    res.end(buffer);
  }
}
