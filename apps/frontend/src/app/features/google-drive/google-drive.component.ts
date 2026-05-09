import {
  Component, signal, input, OnInit, ChangeDetectionStrategy, inject, effect,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BolaoInfo { id: string; nome: string; status: string; }

interface SheetsStatus {
  vinculada: boolean;
  spreadsheetId: string | null;
  ativo: boolean;
  ultimaSyncAt: string | null;
  ultimoErro: string | null;
}

interface PreviewRow {
  linha: number;
  nome: string;
  celular: string | null;
  palpites: number[];
  valida: boolean;
  erro: string | null;
}

interface PreviewResult { total: number; validas: number; invalidas: number; preview: PreviewRow[]; }
interface ImportResult  { total: number; criadas: number; erros: { linha: number; erro: string }[]; }
interface ExportResult  { abas: string[]; linhasExportadas: number; }

// ── Helper: extrai spreadsheetId de URL ou ID direto ─────────────────────────

function extractSheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-google-drive',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, FormsModule],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <a routerLink="/boloes" class="text-slate-400 hover:text-slate-600 transition-colors">Bolões</a>
        @if (bolao()) {
          <span class="text-slate-300">›</span>
          <span class="text-slate-500 truncate max-w-[160px]">{{ bolao()!.nome }}</span>
        }
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Google Sheets</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Google Sheets</span>
    </div>

    <div class="p-4 lg:p-7 max-w-4xl">

      <!-- Título -->
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-1">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center text-xl" style="background:#e8f5e9">📊</div>
          <h1 class="font-display text-[24px] font-semibold tracking-tight">Google Sheets</h1>
        </div>
        <p class="text-slate-500 text-[13.5px]">
          Sincronização automática e importação/exportação de dados do bolão.
          @if (bolao()) { Bolão: <strong>{{ bolao()!.nome }}</strong> }
        </p>
      </div>

      <!-- ── Card: Status da Conexão ─────────────────────────────────────── -->
      <div class="bg-white border rounded-xl mb-6 overflow-hidden"
           [class]="sheetsStatus()?.vinculada ? 'border-green-200' : 'border-slate-200'">
        <div class="px-5 py-4 border-b flex items-center justify-between gap-4"
             [class]="sheetsStatus()?.vinculada ? 'border-green-100 bg-green-50' : 'border-slate-200'">
          <div class="flex items-center gap-3">
            <div class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                 [class]="sheetsStatus()?.vinculada && sheetsStatus()?.ativo ? 'bg-green-500 animate-pulse' : 'bg-slate-300'"></div>
            <div>
              <p class="font-semibold text-[14px]">
                @if (sheetsStatus()?.vinculada) { Planilha vinculada }
                @else { Sem planilha vinculada }
              </p>
              @if (sheetsStatus()?.spreadsheetId) {
                <div class="flex items-center gap-1.5 mt-0.5">
                  <p class="text-[11.5px] text-slate-500 font-mono truncate max-w-[220px]">{{ sheetsStatus()!.spreadsheetId }}</p>
                  <a [href]="sheetUrl()" target="_blank" rel="noopener"
                     title="Abrir planilha no Google Sheets"
                     class="flex-shrink-0 text-slate-400 hover:text-green-700 transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                </div>
              } @else {
                <p class="text-[11.5px] text-slate-400">Sincronização automática inativa</p>
              }
            </div>
          </div>
          @if (sheetsStatus()?.vinculada) {
            <div class="flex items-center gap-2 flex-shrink-0">
              <button (click)="sincronizarAgora()" [disabled]="sincronizando()"
                      class="px-3 py-1.5 text-[12px] font-semibold border rounded-lg transition-all disabled:cursor-not-allowed flex items-center gap-1.5"
                      [class]="syncSucesso()
                        ? 'border-green-500 bg-green-500 text-white'
                        : sincronizando()
                          ? 'border-green-300 bg-green-50 text-green-700 opacity-70'
                          : 'border-green-300 text-green-700 hover:bg-green-100'">
                @if (sincronizando()) {
                  <svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Sincronizando...
                } @else if (syncSucesso()) {
                  ✓ Sincronizado
                } @else {
                  ↺ Sincronizar agora
                }
              </button>
              <button (click)="desvincular()" [disabled]="desvinculando()"
                      class="px-3 py-1.5 text-[12px] font-semibold border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                {{ desvinculando() ? '...' : 'Desvincular' }}
              </button>
            </div>
          }
        </div>

        @if (sheetsStatus()?.vinculada) {
          <!-- Status da última sync -->
          <div class="px-5 py-3 flex flex-wrap gap-4 text-[12.5px] transition-colors"
               [class]="syncSucesso() ? 'bg-green-50' : ''">
            <div>
              <span class="text-slate-400">Última sync:</span>
              <span class="ml-1 font-semibold" [class]="syncSucesso() ? 'text-green-700' : ''">
                {{ sheetsStatus()?.ultimaSyncAt ? fmtDateTime(sheetsStatus()!.ultimaSyncAt!) : 'Nunca' }}
              </span>
            </div>
            <div>
              <span class="text-slate-400">Triggers:</span>
              <span class="ml-1 font-semibold text-green-700">Nova cota · Pagamento · Sorteio · Ranking</span>
            </div>
            @if (sincronizando()) {
              <div class="flex items-center gap-1.5 text-blue-600">
                <svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <span>Aguardando conclusão...</span>
              </div>
            }
          </div>
          @if (sheetsStatus()?.ultimoErro) {
            <div class="mx-5 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
              ⚠ Último erro: {{ sheetsStatus()!.ultimoErro }}
            </div>
          }
        } @else {
          <!-- Form para vincular -->
          <div class="p-5">
            <p class="text-[13px] text-slate-600 mb-3">
              Vincule uma planilha para ativar a sincronização automática. Toda nova cota, pagamento confirmado e sorteio registrado será refletido na planilha automaticamente.
            </p>
            <div class="flex gap-2">
              <input [ngModel]="vincularUrl()" (ngModelChange)="vincularUrl.set($event)"
                     class="flex-1 px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                     placeholder="URL ou ID da planilha Google Sheets" />
              <button (click)="vincular()" [disabled]="!vincularUrl().trim() || vinculando()"
                      class="px-4 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-semibold text-sm rounded-[10px] transition-colors shadow-sm whitespace-nowrap">
                {{ vinculando() ? '⏳ Vinculando...' : '🔗 Vincular' }}
              </button>
            </div>
            @if (vincularError()) {
              <p class="mt-2 text-[12px] text-red-600">⚠ {{ vincularError() }}</p>
            }
            <p class="text-[11.5px] text-slate-400 mt-2">
              A Service Account deve ter permissão de <strong>Editor</strong> na planilha.
            </p>
          </div>
        }
      </div>

      <!-- Card instrução formato -->
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <div class="flex items-start gap-3">
          <span class="text-blue-500 text-lg flex-shrink-0 mt-0.5">ℹ</span>
          <div>
            <p class="font-semibold text-blue-900 text-[13.5px] mb-2">Formato da planilha de importação</p>
            <div class="overflow-x-auto">
              <table class="text-[12px] border-collapse">
                <thead>
                  <tr class="bg-blue-100">
                    <th class="px-3 py-1.5 border border-blue-200 text-blue-800 font-semibold">Col A</th>
                    <th class="px-3 py-1.5 border border-blue-200 text-blue-800 font-semibold">Col B</th>
                    <th class="px-3 py-1.5 border border-blue-200 text-blue-800 font-semibold">Col C</th>
                    <th class="px-3 py-1.5 border border-blue-200 text-blue-800 font-semibold">Col D</th>
                    <th class="px-3 py-1.5 border border-blue-200 text-blue-800 font-semibold">…</th>
                    <th class="px-3 py-1.5 border border-blue-200 text-blue-800 font-semibold">Col L</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="bg-white">
                    <td class="px-3 py-1.5 border border-blue-200 text-blue-700 font-semibold">Nome</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-blue-700">Celular</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-blue-700">Palpite 1</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-blue-700">Palpite 2</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-blue-700 text-center">…</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-blue-700">Palpite 10</td>
                  </tr>
                  <tr class="bg-blue-50">
                    <td class="px-3 py-1.5 border border-blue-200 text-slate-600 text-[11px]">JOÃO SILVA</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-slate-600 text-[11px]">83999990000</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-slate-600 text-[11px]">7</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-slate-600 text-[11px]">14</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-slate-500 text-[11px] text-center">…</td>
                    <td class="px-3 py-1.5 border border-blue-200 text-slate-600 text-[11px]">55</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-[11.5px] text-blue-700 mt-2">
              • Linha 1 pode ser cabeçalho (ignorada se range iniciar em A<strong>2</strong>)
              · Celular opcional · 10 números únicos entre 1 e 60
            </p>
          </div>
        </div>
      </div>

      <!-- Grid Import / Export -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <!-- ── IMPORTAR ── -->
        <div class="bg-white border border-slate-200 rounded-xl flex flex-col">
          <div class="px-5 py-4 border-b border-slate-200">
            <h2 class="font-display font-semibold text-[15px] flex items-center gap-2">
              <span>⬇</span> Importar cotas
            </h2>
            <p class="text-slate-400 text-[12px] mt-0.5">Lê a planilha e cria as cotas no bolão</p>
          </div>

          <div class="p-5 flex flex-col gap-4 flex-1">

            <!-- URL/ID da planilha -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">URL ou ID da planilha *</label>
              <input [ngModel]="iUrl()" (ngModelChange)="iUrl.set($event)"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                     placeholder="https://docs.google.com/spreadsheets/d/... ou ID" />
            </div>

            <!-- Range -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Range <span class="font-normal text-slate-400">(opcional)</span></label>
              <input [ngModel]="iRange()" (ngModelChange)="iRange.set($event)"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                     placeholder="Plan1!A2:L1000" />
            </div>

            <!-- Ignorar erros -->
            <label class="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" [ngModel]="iIgnorarErros()" (ngModelChange)="iIgnorarErros.set($event)"
                     class="w-4 h-4 accent-green-700 cursor-pointer" />
              <span class="text-[13px] text-slate-600">Ignorar linhas inválidas e continuar</span>
            </label>

            <!-- Botões -->
            <div class="flex gap-2">
              <button (click)="preview()" [disabled]="!iUrl().trim() || iPreviewing()"
                      class="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-semibold text-sm rounded-[10px] transition-colors">
                {{ iPreviewing() ? '⏳ Carregando...' : '🔍 Pré-visualizar' }}
              </button>
              <button (click)="importar()" [disabled]="!iUrl().trim() || iLoading()"
                      class="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-semibold text-sm rounded-[10px] transition-colors shadow-sm">
                {{ iLoading() ? '⏳ Importando...' : '⬇ Importar' }}
              </button>
            </div>

            <!-- Erro import -->
            @if (iError()) {
              <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {{ iError() }}</div>
            }
          </div>

          <!-- Preview results -->
          @if (previewResult()) {
            <div class="border-t border-slate-200 p-5">
              <div class="flex items-center justify-between mb-3">
                <p class="font-semibold text-[13.5px]">Pré-visualização</p>
                <div class="flex gap-2 text-[12px]">
                  <span class="px-2 py-0.5 bg-green-100 text-green-800 rounded-full font-semibold">✓ {{ previewResult()!.validas }} válidas</span>
                  @if (previewResult()!.invalidas > 0) {
                    <span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">✗ {{ previewResult()!.invalidas }} inválidas</span>
                  }
                </div>
              </div>
              <div class="overflow-y-auto max-h-64 rounded-lg border border-slate-200">
                <table class="w-full text-[11.5px]">
                  <thead class="bg-slate-50 sticky top-0">
                    <tr>
                      <th class="text-left px-3 py-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Linha</th>
                      <th class="text-left px-3 py-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Nome</th>
                      <th class="text-left px-3 py-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Palpites</th>
                      <th class="text-left px-3 py-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of previewResult()!.preview; track row.linha) {
                      <tr class="border-t border-slate-100" [class]="row.valida ? '' : 'bg-red-50'">
                        <td class="px-3 py-2 font-mono text-slate-400">{{ row.linha }}</td>
                        <td class="px-3 py-2 font-semibold truncate max-w-[100px]">{{ row.nome }}</td>
                        <td class="px-3 py-2 font-mono text-slate-500">{{ row.palpites.join(', ') }}</td>
                        <td class="px-3 py-2">
                          @if (row.valida) {
                            <span class="text-green-700 font-semibold">✓</span>
                          } @else {
                            <span class="text-red-600 font-semibold" [title]="row.erro ?? ''">✗</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          <!-- Import result -->
          @if (importResult()) {
            <div class="border-t border-slate-200 p-5">
              <div class="p-3.5 bg-green-50 border border-green-200 rounded-xl mb-3">
                <p class="font-semibold text-green-800 text-[13.5px]">✓ Importação concluída</p>
                <p class="text-green-700 text-[12.5px] mt-0.5">
                  {{ importResult()!.criadas }} cotas criadas de {{ importResult()!.total }} linhas lidas
                </p>
              </div>
              @if (importResult()!.erros.length > 0) {
                <div class="rounded-lg border border-red-200 overflow-hidden">
                  <div class="bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{{ importResult()!.erros.length }} erro(s)</div>
                  @for (e of importResult()!.erros; track e.linha) {
                    <div class="px-3 py-2 border-t border-red-100 text-[11.5px] text-red-600">
                      <span class="font-mono font-semibold">Linha {{ e.linha }}:</span> {{ e.erro }}
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- ── EXPORTAR ── -->
        <div class="bg-white border border-slate-200 rounded-xl flex flex-col">
          <div class="px-5 py-4 border-b border-slate-200">
            <h2 class="font-display font-semibold text-[15px] flex items-center gap-2">
              <span>⬆</span> Exportar dados
            </h2>
            <p class="text-slate-400 text-[12px] mt-0.5">Escreve os dados do bolão numa planilha</p>
          </div>

          <div class="p-5 flex flex-col gap-4 flex-1">

            <!-- URL/ID -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">URL ou ID da planilha *</label>
              <input [ngModel]="eUrl()" (ngModelChange)="eUrl.set($event)"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                     placeholder="https://docs.google.com/spreadsheets/d/... ou ID" />
            </div>

            <!-- Aba (só para exportação de ranking) -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Aba do ranking <span class="font-normal text-slate-400">(opcional)</span></label>
              <input [ngModel]="eAba()" (ngModelChange)="eAba.set($event)"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                     placeholder="Ranking" />
            </div>

            <!-- Opções de exportação -->
            <div class="flex flex-col gap-2.5">
              <!-- Exportar completo -->
              <button (click)="exportarCompleto()" [disabled]="!eUrl().trim() || eLoading()"
                      class="w-full py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-semibold text-sm rounded-[10px] transition-colors shadow-sm flex items-center justify-center gap-2">
                @if (eLoading() === 'completo') { <span class="animate-spin">⏳</span> Exportando... }
                @else { <span>📊</span> Exportar completo (5 abas) }
              </button>

              <!-- Separador -->
              <div class="relative">
                <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200"></div></div>
                <div class="relative flex justify-center"><span class="px-2 bg-white text-[11px] text-slate-400">ou só o ranking</span></div>
              </div>

              <!-- Exportar só ranking -->
              <button (click)="exportarRanking()" [disabled]="!eUrl().trim() || eLoading()"
                      class="w-full py-2.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-semibold text-sm rounded-[10px] transition-colors flex items-center justify-center gap-2">
                @if (eLoading() === 'ranking') { <span class="animate-spin">⏳</span> Exportando... }
                @else { <span>🏆</span> Exportar ranking }
              </button>
            </div>

            <!-- O que o exportar completo inclui -->
            <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
              <p class="text-[12px] font-semibold text-slate-600 mb-2">Exportação completa inclui 5 abas:</p>
              <ul class="text-[11.5px] text-slate-500 space-y-1">
                <li>📋 <strong>Resumo</strong> — nome, status, arrecadação, totais</li>
                <li>🎫 <strong>Cotas</strong> — todas as cotas com palpites</li>
                <li>✦ <strong>Sorteios</strong> — concursos e bolas sorteadas</li>
                <li>🏆 <strong>Ranking</strong> — ordenado por acertos</li>
                <li>💰 <strong>Categorias</strong> — premiação configurada</li>
              </ul>
            </div>

            <!-- Erro export -->
            @if (eError()) {
              <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {{ eError() }}</div>
            }
          </div>

          <!-- Export result -->
          @if (exportResult()) {
            <div class="border-t border-slate-200 p-5">
              <div class="p-3.5 bg-green-50 border border-green-200 rounded-xl">
                <p class="font-semibold text-green-800 text-[13.5px]">✓ Exportação concluída</p>
                <p class="text-green-700 text-[12.5px] mt-0.5">
                  {{ exportResult()!.linhasExportadas }} linha(s) exportadas
                </p>
                @if (exportResult()!.abas.length > 0) {
                  <div class="flex flex-wrap gap-1 mt-2">
                    @for (aba of exportResult()!.abas; track aba) {
                      <span class="px-2 py-0.5 bg-green-100 text-green-800 rounded text-[11px] font-semibold">{{ aba }}</span>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class GoogleDriveComponent implements OnInit {
  readonly id = input<string>('');
  private readonly api = inject(ApiService);

  bolao        = signal<BolaoInfo | null>(null);
  sheetsStatus = signal<SheetsStatus | null>(null);

  // Vincular state
  vincularUrl   = signal('');
  vinculando    = signal(false);
  desvinculando = signal(false);
  sincronizando = signal(false);
  syncSucesso   = signal(false);
  vincularError = signal('');

  // Import state
  iUrl          = signal('');
  iRange        = signal('');
  iIgnorarErros = signal(true);
  iPreviewing   = signal(false);
  iLoading      = signal(false);
  iError        = signal('');
  previewResult = signal<PreviewResult | null>(null);
  importResult  = signal<ImportResult | null>(null);

  // Export state
  eUrl         = signal('');
  eAba         = signal('');
  eLoading     = signal<'completo' | 'ranking' | false>(false);
  eError       = signal('');
  exportResult = signal<ExportResult | null>(null);

  constructor() {
    effect(() => { if (this.id()) this.loadBolao(); });
  }

  ngOnInit(): void {}

  private async loadBolao(): Promise<void> {
    try {
      const [b, status] = await Promise.all([
        firstValueFrom(this.api.get<BolaoInfo>(`/boloes/${this.id()}`)),
        firstValueFrom(this.api.get<SheetsStatus>(`/boloes/${this.id()}/google-drive/status`)),
      ]);
      this.bolao.set(b);
      this.sheetsStatus.set(status);
    } catch { /* silencioso */ }
  }

  async vincular(): Promise<void> {
    const id = extractSheetId(this.vincularUrl());
    if (!id) return;
    this.vinculando.set(true);
    this.vincularError.set('');
    try {
      const status = await firstValueFrom(
        this.api.post<SheetsStatus>(`/boloes/${this.id()}/google-drive/vincular`, { spreadsheetId: id }),
      );
      this.sheetsStatus.set(status);
      this.vincularUrl.set('');
    } catch (err: unknown) {
      this.vincularError.set((err as { error?: { message?: string } })?.error?.message ?? 'Erro ao vincular planilha.');
    } finally {
      this.vinculando.set(false);
    }
  }

  async desvincular(): Promise<void> {
    this.desvinculando.set(true);
    try {
      await firstValueFrom(this.api.delete(`/boloes/${this.id()}/google-drive/vincular`));
      this.sheetsStatus.set({ vinculada: false, spreadsheetId: null, ativo: false, ultimaSyncAt: null, ultimoErro: null });
    } catch { /* silencioso */ } finally {
      this.desvinculando.set(false);
    }
  }

  async sincronizarAgora(): Promise<void> {
    this.sincronizando.set(true);
    this.syncSucesso.set(false);
    const syncAtAntes = this.sheetsStatus()?.ultimaSyncAt ?? null;

    try {
      await firstValueFrom(this.api.post(`/boloes/${this.id()}/google-drive/sincronizar`, {}));

      // Poll status até ultimaSyncAt mudar (job assíncrono — aguarda até 30s)
      let tentativas = 0;
      const maxTentativas = 15;
      while (tentativas < maxTentativas) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const status = await firstValueFrom(
            this.api.get<SheetsStatus>(`/boloes/${this.id()}/google-drive/status`),
          );
          this.sheetsStatus.set(status);
          if (status.ultimaSyncAt !== syncAtAntes) {
            this.syncSucesso.set(true);
            setTimeout(() => this.syncSucesso.set(false), 4000);
            break;
          }
          if (status.ultimoErro) break; // falhou — para de esperar
        } catch { break; }
        tentativas++;
      }
    } catch { /* silencioso */ } finally {
      this.sincronizando.set(false);
    }
  }

  sheetUrl(): string {
    const id = this.sheetsStatus()?.spreadsheetId ?? '';
    return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  }

  fmtDateTime(iso: string): string {
    try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  }

  // ── Import ────────────────────────────────────────────────────────────────────

  async preview(): Promise<void> {
    const id = extractSheetId(this.iUrl());
    if (!id) return;
    this.iPreviewing.set(true);
    this.iError.set('');
    this.previewResult.set(null);
    this.importResult.set(null);
    try {
      const res = await firstValueFrom(
        this.api.post<PreviewResult>(`/boloes/${this.id()}/google-drive/preview`, {
          spreadsheetId: id,
          ...(this.iRange() && { range: this.iRange() }),
          ignorarErros: this.iIgnorarErros(),
        }),
      );
      this.previewResult.set(res);
    } catch (err: unknown) {
      this.iError.set((err as { error?: { message?: string } })?.error?.message ?? 'Erro ao ler planilha.');
    } finally {
      this.iPreviewing.set(false);
    }
  }

  async importar(): Promise<void> {
    const id = extractSheetId(this.iUrl());
    if (!id) return;
    this.iLoading.set(true);
    this.iError.set('');
    this.importResult.set(null);
    this.previewResult.set(null);
    try {
      const res = await firstValueFrom(
        this.api.post<ImportResult>(`/boloes/${this.id()}/google-drive/importar`, {
          spreadsheetId: id,
          ...(this.iRange() && { range: this.iRange() }),
          ignorarErros: this.iIgnorarErros(),
        }),
      );
      this.importResult.set(res);
    } catch (err: unknown) {
      this.iError.set((err as { error?: { message?: string } })?.error?.message ?? 'Erro ao importar.');
    } finally {
      this.iLoading.set(false);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  async exportarCompleto(): Promise<void> {
    const id = extractSheetId(this.eUrl());
    if (!id || this.eLoading()) return;
    this.eLoading.set('completo');
    this.eError.set('');
    this.exportResult.set(null);
    try {
      const res = await firstValueFrom(
        this.api.post<ExportResult>(`/boloes/${this.id()}/google-drive/exportar/completo`, {
          spreadsheetId: id,
        }),
      );
      this.exportResult.set(res);
    } catch (err: unknown) {
      this.eError.set((err as { error?: { message?: string } })?.error?.message ?? 'Erro ao exportar.');
    } finally {
      this.eLoading.set(false);
    }
  }

  async exportarRanking(): Promise<void> {
    const id = extractSheetId(this.eUrl());
    if (!id || this.eLoading()) return;
    this.eLoading.set('ranking');
    this.eError.set('');
    this.exportResult.set(null);
    try {
      await firstValueFrom(
        this.api.post<void>(`/boloes/${this.id()}/google-drive/exportar/resultados`, {
          spreadsheetId: id,
          ...(this.eAba() && { aba: this.eAba() }),
        }),
      );
      this.exportResult.set({ abas: [this.eAba() || 'Ranking'], linhasExportadas: 0 });
    } catch (err: unknown) {
      this.eError.set((err as { error?: { message?: string } })?.error?.message ?? 'Erro ao exportar.');
    } finally {
      this.eLoading.set(false);
    }
  }
}
