import { Controller, Get, Header, Headers } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PwaService } from './pwa.service';

@ApiTags('pwa')
@Controller()
export class PwaController {
  constructor(private readonly pwaService: PwaService) {}

  @Get('manifest.webmanifest')
  @Public()
  @Header('Content-Type', 'application/manifest+json')
  @ApiOperation({ summary: 'Web App Manifest dinâmico por tenant (X-Tenant-Id header)' })
  getManifest(@Headers('x-tenant-id') tenantId?: string) {
    return this.pwaService.getManifest(tenantId);
  }

  @Get('api/v1/pwa/config')
  @Public()
  @ApiOperation({ summary: 'Configuração de branding do tenant para o frontend' })
  getTenantConfig(@Headers('x-tenant-id') tenantId?: string) {
    return this.pwaService.getTenantConfig(tenantId);
  }
}
