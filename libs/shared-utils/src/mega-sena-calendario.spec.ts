import {
  formatarProximoSorteioCompacto,
  inferirProximoSorteioMega,
  instanteSorteioMegaBrt,
  parseDataMegaBr,
  resolverProximoSorteioMega,
} from './mega-sena-calendario';

describe('mega-sena-calendario', () => {
  it('inferirProximoSorteioMega retorna terça 20h BRT quando referência é segunda antes do sorteio', () => {
    // Segunda 11/mai/2026 10:00 BRT → 13:00 UTC
    const ref = new Date(Date.UTC(2026, 4, 11, 13, 0, 0, 0));
    const prox = inferirProximoSorteioMega(ref);
    const esperado = instanteSorteioMegaBrt(2026, 5, 12);
    expect(prox.getTime()).toBe(esperado.getTime());
  });

  it('formatarProximoSorteioCompacto segue padrão do protótipo em pt-BR', () => {
    const inst = instanteSorteioMegaBrt(2026, 5, 13);
    const txt = formatarProximoSorteioCompacto(inst, 'pt-BR');
    expect(txt).toMatch(/^13\/mai · \w{3} · 20h$/);
  });

  it('resolverProximoSorteioMega prioriza data oficial da Caixa quando futura', () => {
    const ref = new Date(Date.UTC(2026, 4, 10, 15, 0, 0, 0));
    const prox = resolverProximoSorteioMega({ referencia: ref, dataOficialBr: '17/05/2026' });
    expect(prox.getTime()).toBe(instanteSorteioMegaBrt(2026, 5, 17).getTime());
  });

  it('parseDataMegaBr interpreta dd/mm/yyyy', () => {
    const d = parseDataMegaBr('01/05/2026');
    expect(d?.getTime()).toBe(instanteSorteioMegaBrt(2026, 5, 1).getTime());
  });
});
