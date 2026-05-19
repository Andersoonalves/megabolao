/** Formato canônico do CRM: só dígitos, sem código 55 (ex.: 83999990000). */
export function normalizarCelularCrm(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

/** Variantes para busca (histórico pode ter sido salvo com ou sem 55). */
export function variantesCelularCrm(raw: string): string[] {
  const base = normalizarCelularCrm(raw);
  const onlyDigits = raw.replace(/\D/g, '');
  return [...new Set([base, `55${base}`, onlyDigits].filter(Boolean))];
}

export function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

/** Últimos 8 dígitos — une cadastro com typo (ex. 83996550382) e WA (8396550382). */
export function sufixoCelularCrm(raw: string): string {
  return normalizarCelularCrm(raw).slice(-8);
}

/** Filtro Prisma: tenant + celular (variantes 55 + mesmo sufixo local). */
export function prismaCelularWhere(tenantId: string, celular: string): {
  tenantId: string;
  OR: Array<{ celular: string | { in: string[] } | { endsWith: string } }>;
} {
  const variants = variantesCelularCrm(celular);
  const exact =
    variants.length === 1
      ? { celular: variants[0]! }
      : { celular: { in: variants } as { in: string[] } };
  const suffix = sufixoCelularCrm(celular);
  if (suffix.length < 8) {
    return { tenantId, OR: [exact] };
  }
  return {
    tenantId,
    OR: [exact, { celular: { endsWith: suffix } }],
  };
}
