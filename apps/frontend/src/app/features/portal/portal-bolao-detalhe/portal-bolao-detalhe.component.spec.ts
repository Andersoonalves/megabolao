import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateNoOpLoader,
} from '@ngx-translate/core';
import { PortalBolaoDetalheComponent } from './portal-bolao-detalhe.component';
import { PortalApiService } from '../portal-api.service';

describe('PortalBolaoDetalheComponent', () => {
  let portalApi: { resumo: jest.Mock; ranking: jest.Mock };
  const paramMap$ = new BehaviorSubject(convertToParamMap({ bolaoId: 'b1' }));

  beforeEach(() => {
    portalApi = {
      resumo: jest.fn().mockResolvedValue({ boloes: [] }),
      ranking: jest.fn().mockResolvedValue([]),
    };

    TestBed.configureTestingModule({
      imports: [PortalBolaoDetalheComponent],
      providers: [
        ...provideTranslateService({ fallbackLang: 'pt', lang: 'pt' }),
        provideTranslateLoader(TranslateNoOpLoader),
        { provide: PortalApiService, useValue: portalApi },
        { provide: ActivatedRoute, useValue: { paramMap: paramMap$.asObservable() } },
      ],
    });
  });

  it('deve criar', () => {
    const fixture = TestBed.createComponent(PortalBolaoDetalheComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('marca notFound quando o bolão não está no resumo', fakeAsync(() => {
    portalApi.resumo.mockResolvedValue({ boloes: [] });
    portalApi.ranking.mockResolvedValue([]);

    const fixture = TestBed.createComponent(PortalBolaoDetalheComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.notFound()).toBe(true);
  }));

  it(
    'carrega bolão e ranking quando existem no resumo',
    fakeAsync(() => {
      portalApi.resumo.mockResolvedValue({
        boloes: [
          {
            id: 'b1',
            nome: 'Bolão X',
            status: 'EM_ANDAMENTO',
            valorCota: 30,
            dataInicio: null,
            dataTermino: null,
            totalCotasAtivas: 1,
            valorBrutoArrecadado: 30,
            linkWhatsappOrganizador: null,
            cotas: [
              {
                id: 'c1',
                nomeIdentificacao: 'João',
                numeroSequencial: 1,
                palpites: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                statusPagamento: 'PAGO',
                dataConfirmacaoPagamento: null,
                totalAcertosAcumulados: 3,
                statusResultado: 'EM_ANDAMENTO',
                premios: [],
              },
            ],
            sorteios: [
              {
                id: 's1',
                numeroConcurso: 100,
                dataSorteio: '2026-01-01',
                bolasSorteadas: [1, 2, 3, 4, 5, 6],
                sequenciaNoBolao: 1,
                processado: true,
              },
            ],
          },
        ],
      });
      portalApi.ranking.mockResolvedValue([
        {
          posicao: 1,
          cotaId: 'c1',
          nomeIdentificacao: 'João',
          numeroSequencial: 1,
          totalAcertosAcumulados: 3,
          statusPagamento: 'PAGO',
        },
      ]);

      const fixture = TestBed.createComponent(PortalBolaoDetalheComponent);
      fixture.detectChanges();
      tick();

      const cmp = fixture.componentInstance;
      expect(cmp.notFound()).toBe(false);
      expect(cmp.bolao()?.nome).toBe('Bolão X');
      expect(cmp.ranking().length).toBe(1);
      expect(cmp.sorteiosProcessados().length).toBe(1);
    }),
  );
});
