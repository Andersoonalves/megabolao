import { Injectable } from '@nestjs/common';
import { ModuloComPermissoes, Permissao } from '@nossobolao/shared-types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Catálogo read-only de módulos e permissões.
 *
 * Fonte da verdade: tabelas `modulos` e `permissoes` populadas via
 * migration. Não há CRUD por usuário — é catálogo do sistema.
 */
@Injectable()
export class PermissaoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista todos os módulos com suas permissões aninhadas.
   *
   * @param incluirMaster Se true, inclui módulos `apenas_master = true`.
   *                       Default: false (uso pelo ADMIN).
   */
  async listarCatalogo(incluirMaster = false): Promise<ModuloComPermissoes[]> {
    const modulos = await this.prisma.modulo.findMany({
      where: { ativo: true, ...(incluirMaster ? {} : { apenasMaster: false }) },
      orderBy: { ordem: 'asc' },
      include: {
        permissoes: {
          where: incluirMaster ? {} : { apenasMaster: false },
          orderBy: { codigo: 'asc' },
        },
      },
    });

    return modulos.map((m) => ({
      codigo: m.codigo,
      nome: m.nome,
      descricao: m.descricao ?? undefined,
      ordem: m.ordem,
      apenasMaster: m.apenasMaster,
      ativo: m.ativo,
      permissoes: m.permissoes.map(
        (p): Permissao => ({
          codigo: p.codigo,
          moduloCodigo: p.moduloCodigo,
          nome: p.nome,
          descricao: p.descricao ?? undefined,
          apenasMaster: p.apenasMaster,
        }),
      ),
    }));
  }

  /**
   * Lista os códigos de todas as permissões válidas (filtrável por master).
   * Usado para validar inputs antes de associar a perfis.
   */
  async listarCodigosValidos(incluirMaster = false): Promise<string[]> {
    const rows = await this.prisma.permissao.findMany({
      where: incluirMaster ? {} : { apenasMaster: false },
      select: { codigo: true },
    });
    return rows.map((r) => r.codigo);
  }
}
