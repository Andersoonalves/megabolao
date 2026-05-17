/** Terça, quinta e sábado — sorteios da Mega-Sena (horário de Brasília). */
export const MEGA_SENA_DIAS_SORTEIO = new Set([2, 4, 6]);

/** Horário usual de exibição/sorteio (20h BRT). */
export const MEGA_SENA_HORA_SORTEIO_BRT = 20;

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

const MESES_PT_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

export interface ResolverProximoSorteioMegaOpts {
  referencia?: Date;
  /** dd/mm/yyyy vindo da API Caixa (quando disponível). */
  dataOficialBr?: string | null;
  /** yyyy-mm-dd — bolão só participa a partir desta data. */
  naoAntesIso?: string | null;
}

/** Converte instante UTC para partes de calendário em BRT (UTC−3 fixo). */
function partesBrt(instante: Date): { ano: number; mes: number; dia: number; diaSemana: number; hora: number; minuto: number } {
  const brt = new Date(instante.getTime() - BRT_OFFSET_MS);
  return {
    ano: brt.getUTCFullYear(),
    mes: brt.getUTCMonth() + 1,
    dia: brt.getUTCDate(),
    diaSemana: brt.getUTCDay(),
    hora: brt.getUTCHours(),
    minuto: brt.getUTCMinutes(),
  };
}

/** Instante UTC do sorteio às 20h BRT na data informada (mes 1–12). */
export function instanteSorteioMegaBrt(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, MEGA_SENA_HORA_SORTEIO_BRT + 3, 0, 0, 0));
}

/** Parse dd/mm/yyyy → instante do sorteio (20h BRT). */
export function parseDataMegaBr(dataBr: string): Date | null {
  const m = dataBr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return instanteSorteioMegaBrt(ano, mes, dia);
}

/** Parse yyyy-mm-dd → início do dia em BRT (00:00). */
export function parseIsoDataInicio(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 3, 0, 0, 0));
}

function ymd(ano: number, mes: number, dia: number): number {
  return ano * 10_000 + mes * 100 + dia;
}

/** Próximo sorteio a partir de `referencia`, respeitando dias ter/qui/sáb e 20h BRT. */
export function inferirProximoSorteioMega(referencia = new Date(), naoAntes?: Date): Date {
  const cursor = naoAntes && naoAntes.getTime() > referencia.getTime() ? naoAntes : referencia;
  const inicioYmd = naoAntes ? (() => {
    const nb = partesBrt(naoAntes);
    return ymd(nb.ano, nb.mes, nb.dia);
  })() : null;

  for (let offset = 0; offset < 14; offset += 1) {
    const probe = new Date(cursor.getTime() + offset * 86_400_000);
    const { ano, mes, dia, diaSemana } = partesBrt(probe);
    if (!MEGA_SENA_DIAS_SORTEIO.has(diaSemana)) continue;

    const sorteioEm = instanteSorteioMegaBrt(ano, mes, dia);
    if (sorteioEm.getTime() <= referencia.getTime()) continue;
    if (inicioYmd !== null && ymd(ano, mes, dia) < inicioYmd) continue;

    return sorteioEm;
  }

  const fallback = partesBrt(new Date(referencia.getTime() + 3 * 86_400_000));
  return instanteSorteioMegaBrt(fallback.ano, fallback.mes, fallback.dia);
}

/** Usa data oficial da Caixa se ainda for futura; senão infere pelo calendário fixo. */
export function resolverProximoSorteioMega(opts: ResolverProximoSorteioMegaOpts = {}): Date {
  const referencia = opts.referencia ?? new Date();
  const naoAntes = opts.naoAntesIso ? parseIsoDataInicio(opts.naoAntesIso) ?? undefined : undefined;

  if (opts.dataOficialBr) {
    const oficial = parseDataMegaBr(opts.dataOficialBr);
    if (oficial && oficial.getTime() > referencia.getTime()) {
      if (!naoAntes || oficial.getTime() >= naoAntes.getTime()) return oficial;
    }
  }

  return inferirProximoSorteioMega(referencia, naoAntes);
}

function diaSemanaCurto(instante: Date, locale: string): string {
  const loc = locale.startsWith('en') ? 'en-US' : 'pt-BR';
  return instante
    .toLocaleDateString(loc, { weekday: 'short', timeZone: 'America/Sao_Paulo' })
    .replace(/\./g, '')
    .trim()
    .slice(0, 3);
}

/** Formato do protótipo: `17/mai · sáb · 20h` */
export function formatarProximoSorteioCompacto(instante: Date, locale = 'pt-BR'): string {
  const loc = locale.startsWith('en') ? 'en' : 'pt';
  const p = partesBrt(instante);
  const dd = String(p.dia).padStart(2, '0');
  const wd = diaSemanaCurto(instante, locale);
  const hora = loc === 'en' ? '8 PM' : '20h';

  if (loc === 'en') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[p.mes - 1]} ${dd} · ${wd} · ${hora}`;
  }

  const mon = MESES_PT_CURTO[p.mes - 1] ?? '';
  return `${dd}/${mon} · ${wd} · ${hora}`;
}

/** Data curta para KPI (ex.: 17 de mai.). */
export function formatarProximoSorteioDataCurta(instante: Date, locale = 'pt-BR'): string {
  const loc = locale.startsWith('en') ? 'en-US' : 'pt-BR';
  return instante.toLocaleDateString(loc, {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  });
}

/** Linha secundária (ex.: sábado · 20h00). */
export function formatarProximoSorteioDiaHora(instante: Date, locale = 'pt-BR'): string {
  const loc = locale.startsWith('en') ? 'en-US' : 'pt-BR';
  const wd = instante.toLocaleDateString(loc, { weekday: 'long', timeZone: 'America/Sao_Paulo' });
  const hora = locale.startsWith('en') ? '8:00 PM' : '20h00';
  return `${wd} · ${hora}`;
}
