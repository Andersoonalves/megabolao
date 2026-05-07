import { Injectable } from '@nestjs/common';
import { TenantBranding } from '@nossobolao/shared-types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PwaService {
  constructor(private readonly prisma: PrismaService) {}

  async getManifest(tenantId?: string | null): Promise<Record<string, unknown>> {
    let branding: TenantBranding = {};
    let nome = 'NossoBolão';

    if (tenantId) {
      const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
      if (tenant) {
        branding = (tenant.branding ?? {}) as TenantBranding;
        nome = branding.nomeCustomizado ?? tenant.nome;
      }
    }

    const corPrimaria = branding.corPrimaria ?? '#1F4E79';

    return {
      name: nome,
      short_name: nome.split(' ')[0].slice(0, 12),
      description: 'Gestão de bolões da Mega-Sena',
      theme_color: corPrimaria,
      background_color: '#F2F7FB',
      display: 'standalone',
      orientation: 'portrait-primary',
      start_url: '/',
      scope: '/',
      lang: 'pt-BR',
      icons: [
        {
          src: branding.logoUrl ?? '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: branding.logoUrl ?? '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };
  }

  async getTenantConfig(tenantId?: string | null): Promise<Record<string, unknown>> {
    if (!tenantId) return { corPrimaria: '#1F4E79', nome: 'NossoBolão' };

    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) return { corPrimaria: '#1F4E79', nome: 'NossoBolão' };

    const branding = (tenant.branding ?? {}) as TenantBranding;
    return {
      tenantId: tenant.id,
      nome: branding.nomeCustomizado ?? tenant.nome,
      slug: tenant.slug,
      corPrimaria: branding.corPrimaria ?? '#1F4E79',
      logoUrl: branding.logoUrl ?? null,
    };
  }
}
