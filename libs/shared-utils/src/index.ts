// ── Validação de palpites ─────────────────────────────────────────────────────

export function validarPalpites(palpites: number[]): boolean {
  if (palpites.length !== 10) return false;
  const unicos = new Set(palpites);
  if (unicos.size !== 10) return false;
  return palpites.every((n) => Number.isInteger(n) && n >= 1 && n <= 60);
}

// ── Cálculo de acertos ────────────────────────────────────────────────────────

export function calcularAcertos(palpites: number[], bolas: number[]): number {
  const bolasSet = new Set(bolas);
  return palpites.filter((p) => bolasSet.has(p)).length;
}

// ── Arredondamento monetário (2 casas, sem floating-point drift) ──────────────

export function arredondarMonetario(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// ── Validação de soma de percentuais = 100% ───────────────────────────────────

export function validarSomaPercentuais(percentuais: number[]): boolean {
  const soma = percentuais.reduce((acc, p) => arredondarMonetario(acc + p), 0);
  return soma === 100;
}

// ── Slug ──────────────────────────────────────────────────────────────────────

export function gerarSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
