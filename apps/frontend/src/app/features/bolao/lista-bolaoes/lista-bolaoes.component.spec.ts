import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateNoOpLoader,
} from '@ngx-translate/core';
import { ListaBolaoesComponent } from './lista-bolaoes.component';
import { ApiService } from '../../../core/services/api.service';

describe('ListaBolaoesComponent', () => {
  let apiMock: { get: jest.Mock };

  beforeEach(() => {
    apiMock = {
      get: jest.fn().mockReturnValue(
        of({
          data: [
            {
              id: 'b1',
              nome: 'Beta Pool',
              status: 'FINALIZADO',
              valorCota: 10,
              dataInicio: '2026-01-02',
              dataTermino: '2026-02-02',
              totalCotasAtivas: 2,
              valorBrutoArrecadado: 100,
              criadoEm: '2026-01-08T12:00:00.000Z',
              categorias: [{ id: 'c1', nome: 'Taxa', tipo: 'TAXA_ADMINISTRATIVA' }],
              sorteiosRegistrados: 1,
              bolasJaSorteadas: [4, 7, 12],
            },
            {
              id: 'b2',
              nome: 'Alpha Pool',
              status: 'EM_ANDAMENTO',
              valorCota: 15,
              dataInicio: '2026-01-03',
              dataTermino: null,
              totalCotasAtivas: 5,
              valorBrutoArrecadado: 500,
              criadoEm: '2026-01-06T12:00:00.000Z',
              categorias: [],
              sorteiosRegistrados: 0,
              bolasJaSorteadas: [],
            },
          ],
          total: 2,
          page: 1,
          totalPages: 1,
        }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [ListaBolaoesComponent],
      providers: [
        provideRouter([]),
        ...provideTranslateService({ fallbackLang: 'pt', lang: 'pt' }),
        provideTranslateLoader(TranslateNoOpLoader),
        { provide: ApiService, useValue: apiMock },
      ],
    });
  });

  it('deve criar', () => {
    const fixture = TestBed.createComponent(ListaBolaoesComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('inicia na aba Em andamento e envia status na API', async () => {
    const fixture = TestBed.createComponent(ListaBolaoesComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(cmp.statusFiltro()).toBe('EM_ANDAMENTO');
    expect(apiMock.get).toHaveBeenCalledWith(
      expect.stringMatching(/status=EM_ANDAMENTO/),
    );
  });

  it('após load, ordenação por nome reorganiza pela ordem lexicográfica', async () => {
    const fixture = TestBed.createComponent(ListaBolaoesComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(apiMock.get).toHaveBeenCalled();
    expect(cmp.bolaoes().length).toBe(2);
    cmp.mudarOrdenacao('nome');
    expect(cmp.boloesOrdenados()[0].nome).toBe('Alpha Pool');
    expect(cmp.boloesOrdenados()[1].nome).toBe('Beta Pool');
  });

  it('definirVisualizacao atualiza modo de visualização', () => {
    const fixture = TestBed.createComponent(ListaBolaoesComponent);
    const cmp = fixture.componentInstance;
    cmp.definirVisualizacao('compact');
    expect(cmp.visualizacao()).toBe('compact');
  });
});
