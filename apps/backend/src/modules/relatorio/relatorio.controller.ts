import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { RelatorioService } from './relatorio.service';

@ApiTags('relatorios')
@ApiBearerAuth()
@Roles('MASTER', 'ADMIN')
@Controller('boloes/:bolaoId/relatorios')
export class RelatorioController {
  constructor(private readonly relatorioService: RelatorioService) {}

  @Post('xlsx')
  @ApiOperation({ summary: 'Gerar XLSX de ranking + prêmios (upload no Supabase Storage → URL assinada 24h)' })
  gerarXlsx(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
  ) {
    return this.relatorioService.gerarXlsx(tenantId, bolaoId);
  }

  @Post('pdf')
  @ApiOperation({ summary: 'Gerar PDF completo (prêmios + ranking até 200 cotas → URL assinada 24h)' })
  gerarPdf(
    @TenantId() tenantId: string | null,
    @Param('bolaoId', ParseUUIDPipe) bolaoId: string,
  ) {
    return this.relatorioService.gerarPdf(tenantId, bolaoId);
  }
}
