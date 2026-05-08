import { Controller, Get, Header, Headers } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PwaService } from './pwa.service';

@ApiTags('pwa')
@Controller('pwa')
export class PwaController {
  constructor(private readonly pwaService: PwaService) {}

  // Servido em /api/v1/pwa/manifest.webmanifest — frontend Angular serve o próprio /manifest.webmanifest
  @Get('manifest.webmanifest')
  @Public()
  @Header('Content-Type', 'application/manifest+json')
  @ApiOperation({ summary: 'Web App Manifest dinâmico por tenant (X-Tenant-Id header)' })
  getManifest(@Headers('x-tenant-id') tenantId?: string) {
    return this.pwaService.getManifest(tenantId);
  }

  @Get('config')
  @Public()
  @ApiOperation({ summary: 'Branding do tenant para bootstrap do frontend' })
  getTenantConfig(@Headers('x-tenant-id') tenantId?: string) {
    return this.pwaService.getTenantConfig(tenantId);
  }
}
