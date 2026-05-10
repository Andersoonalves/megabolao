import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Perfil as PerfilDTO } from '@nossobolao/shared-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PermissaoService } from '../permissao/permissao.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreatePerfilDto } from './dto/create-perfil.dto';
import { UpdatePerfilDto } from './dto/update-perfil.dto';

type PerfilComPermissoes = Prisma.PerfilGetPayload<{
  include: {
    permissoes: true;
    _count: { select: { usuarios: true } };
  };
}>;

@Injectable()
export class PerfilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly auditoria: AuditoriaService,
    private readonly permissoes: PermissaoService,
  ) {}

  // ── Read ─────────────────────────────────────────────────────────────────

  async findAll(tenantId: string | null): Promise<PerfilDTO[]> {
    this.assertTenantId(tenantId);

    const rows = await this.prisma.perfil.findMany({
      where: { tenantId },
      include: {
        permissoes: true,
        _count: { select: { usuarios: true } },
      },
      orderBy: [{ prioridade: 'desc' }, { nome: 'asc' }],
    });

    return rows.map((r) => this.toResponse(r));
  }

  async findById(tenantId: string | null, id: string): Promise<PerfilDTO> {
    this.assertTenantId(tenantId);
    return this.toResponse(await this.findOrFail(tenantId, id));
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async create(
    user: AuthenticatedUser,
    tenantId: string | null,
    dto: CreatePerfilDto,
  ): Promise<PerfilDTO> {
    this.assertTenantId(tenantId);
    await this.validarPermissoes(user, dto.permissoes);

    const created = await this.prisma.$transaction(async (tx) => {
      const perfil = await tx.perfil.create({
        data: {
          tenantId,
          nome: dto.nome,
          descricao: dto.descricao,
          prioridade: dto.prioridade ?? 0,
          ativo: dto.ativo ?? true,
          sistema: false,
        },
      });

      if (dto.permissoes.length) {
        await tx.perfilPermissao.createMany({
          data: dto.permissoes.map((codigo) => ({
            perfilId: perfil.id,
            permissaoCodigo: codigo,
          })),
        });
      }

      return tx.perfil.findFirstOrThrow({
        where: { id: perfil.id },
        include: {
          permissoes: true,
          _count: { select: { usuarios: true } },
        },
      });
    });

    await this.auditoria.registrar({
      tenantId,
      userId: user.id,
      userEmail: user.email,
      acao: 'PERFIL_CRIADO',
      recurso: 'PERFIL',
      recursoId: created.id,
      detalhes: { nome: created.nome, permissoes: dto.permissoes },
    });

    return this.toResponse(created as PerfilComPermissoes);
  }

  async update(
    user: AuthenticatedUser,
    tenantId: string | null,
    id: string,
    dto: UpdatePerfilDto,
  ): Promise<PerfilDTO> {
    this.assertTenantId(tenantId);
    const existing = await this.findOrFail(tenantId, id);

    if (existing.sistema && (dto.nome !== undefined || dto.permissoes !== undefined)) {
      // Permitimos alterar descricao/prioridade/ativo, mas não nome ou permissões
      // de perfis-sistema (Administrador). Quem tem `*` é blindado.
      if (dto.nome !== undefined && dto.nome !== existing.nome) {
        throw new BusinessException(
          'PERFIL_SISTEMA_PROTEGIDO',
          'Perfis do sistema não podem ter o nome alterado',
        );
      }
      if (dto.permissoes !== undefined) {
        throw new BusinessException(
          'PERFIL_SISTEMA_PROTEGIDO',
          'Perfis do sistema não podem ter as permissões alteradas',
        );
      }
    }

    if (dto.permissoes !== undefined) {
      await this.validarPermissoes(user, dto.permissoes);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.perfil.update({
        where: { id },
        data: {
          ...(dto.nome        !== undefined && { nome: dto.nome }),
          ...(dto.descricao   !== undefined && { descricao: dto.descricao }),
          ...(dto.prioridade  !== undefined && { prioridade: dto.prioridade }),
          ...(dto.ativo       !== undefined && { ativo: dto.ativo }),
        },
      });

      if (dto.permissoes !== undefined) {
        await tx.perfilPermissao.deleteMany({ where: { perfilId: id } });
        if (dto.permissoes.length) {
          await tx.perfilPermissao.createMany({
            data: dto.permissoes.map((codigo) => ({
              perfilId: id,
              permissaoCodigo: codigo,
            })),
          });
        }
      }

      return tx.perfil.findFirstOrThrow({
        where: { id },
        include: {
          permissoes: true,
          _count: { select: { usuarios: true } },
        },
      });
    });

    // Permissões mudaram → propaga aos usuários atribuídos
    if (dto.permissoes !== undefined) {
      await this.auth.syncPerfilPermissions(id);
    }

    await this.auditoria.registrar({
      tenantId,
      userId: user.id,
      userEmail: user.email,
      acao: 'PERFIL_EDITADO',
      recurso: 'PERFIL',
      recursoId: id,
      detalhes: this.detalhesDiff(existing, dto),
    });

    return this.toResponse(updated as PerfilComPermissoes);
  }

  async delete(
    user: AuthenticatedUser,
    tenantId: string | null,
    id: string,
  ): Promise<void> {
    this.assertTenantId(tenantId);
    const existing = await this.findOrFail(tenantId, id);

    if (existing.sistema) {
      throw new BusinessException(
        'PERFIL_SISTEMA_PROTEGIDO',
        'Perfis do sistema não podem ser excluídos',
      );
    }

    if (existing._count.usuarios > 0) {
      throw new BusinessException(
        'PERFIL_EM_USO',
        `Perfil possui ${existing._count.usuarios} usuário(s) atribuído(s). Remova as atribuições antes de excluir.`,
      );
    }

    await this.prisma.perfil.delete({ where: { id } });

    await this.auditoria.registrar({
      tenantId,
      userId: user.id,
      userEmail: user.email,
      acao: 'PERFIL_EXCLUIDO',
      recurso: 'PERFIL',
      recursoId: id,
      severidade: 'AVISO',
      detalhes: { nome: existing.nome },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findOrFail(tenantId: string, id: string): Promise<PerfilComPermissoes> {
    const perfil = await this.prisma.perfil.findFirst({
      where: { id, tenantId },
      include: {
        permissoes: true,
        _count: { select: { usuarios: true } },
      },
    });
    if (!perfil) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'PERFIL_NAO_ENCONTRADO',
        message: `Perfil ${id} não encontrado`,
        details: [],
      });
    }
    return perfil as PerfilComPermissoes;
  }

  /**
   * Garante que todas as permissões pedidas existem no catálogo e que o
   * usuário atual NÃO está tentando atribuir permissões que ele próprio
   * não possui (privilege escalation). MASTER pode atribuir qualquer coisa.
   */
  private async validarPermissoes(
    user: AuthenticatedUser,
    codigos: string[],
  ): Promise<void> {
    if (!codigos.length) return;

    const incluirMaster = user.papel === 'MASTER';
    const validos = new Set(await this.permissoes.listarCodigosValidos(incluirMaster));

    const desconhecidas = codigos.filter((c) => !validos.has(c));
    if (desconhecidas.length) {
      throw new BusinessException(
        'PERMISSAO_DESCONHECIDA',
        `Permissões inexistentes: ${desconhecidas.join(', ')}`,
        desconhecidas.map((c) => ({
          field: 'permissoes',
          code: 'PERMISSAO_DESCONHECIDA',
          message: c,
        })),
      );
    }

    // Anti-escalada: ADMIN não pode dar permissões que ele mesmo não tem.
    if (user.papel !== 'MASTER' && !user.permissoes.includes('*')) {
      const propriasPermissoes = new Set(user.permissoes);
      const naoAutorizadas = codigos.filter((c) => !propriasPermissoes.has(c));
      if (naoAutorizadas.length) {
        throw new ForbiddenException(
          `PERMISSAO_NAO_AUTORIZADA: você não pode delegar [${naoAutorizadas.join(', ')}]`,
        );
      }
    }
  }

  private toResponse(p: PerfilComPermissoes): PerfilDTO {
    return {
      id: p.id,
      tenantId: p.tenantId,
      nome: p.nome,
      descricao: p.descricao ?? undefined,
      prioridade: p.prioridade,
      ativo: p.ativo,
      sistema: p.sistema,
      permissoes: p.permissoes.map((pp) => pp.permissaoCodigo).sort(),
      totalUsuarios: p._count.usuarios,
      criadoEm: p.criadoEm.toISOString(),
      atualizadoEm: p.atualizadoEm.toISOString(),
    };
  }

  private detalhesDiff(
    before: PerfilComPermissoes,
    dto: UpdatePerfilDto,
  ): Record<string, unknown> {
    const diff: Record<string, unknown> = {};
    if (dto.nome        !== undefined && dto.nome        !== before.nome)        diff.nome        = { de: before.nome, para: dto.nome };
    if (dto.descricao   !== undefined && dto.descricao   !== before.descricao)   diff.descricao   = { de: before.descricao, para: dto.descricao };
    if (dto.prioridade  !== undefined && dto.prioridade  !== before.prioridade)  diff.prioridade  = { de: before.prioridade, para: dto.prioridade };
    if (dto.ativo       !== undefined && dto.ativo       !== before.ativo)       diff.ativo       = { de: before.ativo, para: dto.ativo };
    if (dto.permissoes  !== undefined) diff.permissoes = { para: dto.permissoes };
    return diff;
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }
}
