import {
  normalizarCelularCrm,
  prismaCelularWhere,
  sufixoCelularCrm,
  variantesCelularCrm,
} from './celular-crm.util';

describe('celular-crm.util', () => {
  it('normalizarCelularCrm remove 55', () => {
    expect(normalizarCelularCrm('5583999990000')).toBe('83999990000');
    expect(normalizarCelularCrm('83999990000')).toBe('83999990000');
  });

  it('variantesCelularCrm inclui com e sem 55', () => {
    const v = variantesCelularCrm('5583999990000');
    expect(v).toContain('83999990000');
    expect(v).toContain('5583999990000');
  });

  it('sufixoCelularCrm une typo no 9º dígito com número do WhatsApp', () => {
    expect(sufixoCelularCrm('83996550382')).toBe('96550382');
    expect(sufixoCelularCrm('8396550382')).toBe('96550382');
    expect(sufixoCelularCrm('558396550382')).toBe('96550382');
  });

  it('prismaCelularWhere inclui endsWith do sufixo', () => {
    const w = prismaCelularWhere('tenant-1', '83996550382');
    expect(w.OR).toHaveLength(2);
    expect(w.OR[1]).toEqual({ celular: { endsWith: '96550382' } });
  });
});
