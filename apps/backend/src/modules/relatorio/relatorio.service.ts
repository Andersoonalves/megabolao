import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
// pdfkit usa module.exports — não tem default export com moduleResolution:node
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface RelatorioResult {
  url: string;
  caminho: string;
  geradoEm: string;
}

const BUCKET = 'relatorios';

// ── Helpers de layout ────────────────────────────────────────────────────────

const COLOR_PRIMARY  = '#1A6B3C';
const COLOR_HEADER   = '#1e293b';   // slate-800
const COLOR_SUBHEAD  = '#475569';   // slate-600
const COLOR_MUTED    = '#94a3b8';   // slate-400
const COLOR_ROW_ALT  = '#f8fafc';   // slate-50
const COLOR_WHITE    = '#ffffff';
const COLOR_GOLD     = '#d97706';   // amber-600

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateBr(d: Date | string | null): string {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('pt-BR');
}

interface ColDef { label: string; width: number; align?: 'left' | 'center' | 'right' }

// ── Ball helpers ─────────────────────────────────────────────────────────────

/**
 * Desenha bolinha com número centralizado (pdfkit).
 * cy = centro vertical da bolinha.
 * Texto centralizado: y_text = cy - fontSize/2 * 0.85 (cap-height correction).
 */
function drawBall(
  doc: InstanceType<typeof PDFDocument>,
  cx: number,
  cy: number,
  r: number,
  num: number,
  filled: boolean,
): void {
  const label = String(num).padStart(2, '0');
  const fs    = Math.round(r * 0.78);
  // Centraliza: pdfkit baseline ≈ fontSize * 0.72 abaixo do topo
  const ty    = cy - (fs * 0.72) / 2;

  if (filled) {
    doc.circle(cx, cy, r).fill(COLOR_PRIMARY);
    doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(fs)
      .text(label, cx - r, ty, { width: r * 2, align: 'center', lineBreak: false });
  } else {
    doc.circle(cx, cy, r).lineWidth(0.8).strokeColor('#d1d5db').fillAndStroke('#ffffff', '#d1d5db');
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(fs)
      .text(label, cx - r, ty, { width: r * 2, align: 'center', lineBreak: false });
  }
}

/** Grid 10×6 de todas as 60 bolas. Retorna y final. */
function drawBolasGrid(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  maxW: number,
  sorteadas: Set<number>,
  totalBolas = 60,
): number {
  const COLS   = 10;
  const ROWS   = Math.ceil(totalBolas / COLS);
  const BALL_R = 11;
  const GAP    = 5;
  const STEP   = BALL_R * 2 + GAP;
  const gridW  = COLS * STEP - GAP;
  const startX = x + (maxW - gridW) / 2;
  const total  = sorteadas.size;
  const CARD_H = 16 + ROWS * STEP + 4 + 16; // header + grid + legend pad

  doc.roundedRect(x, y, maxW, CARD_H + 8, 8).fill(COLOR_WHITE).stroke('#e2e8f0');

  // Header
  doc.fillColor(COLOR_HEADER).font('Helvetica-Bold').fontSize(11)
    .text('Bolas sorteadas', x + 12, y + 7, { width: maxW * 0.6, lineBreak: false });
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(10)
    .text(`${total}/${totalBolas}`, x, y + 8, { width: maxW - 12, align: 'right', lineBreak: false });

  const gridY = y + 24;
  for (let i = 0; i < totalBolas; i++) {
    const n   = i + 1;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = startX + col * STEP + BALL_R;
    const cy  = gridY + row * STEP + BALL_R;
    drawBall(doc, cx, cy, BALL_R, n, sorteadas.has(n));
  }

  // Legend
  const legY = gridY + ROWS * STEP + 6;
  doc.circle(x + 18, legY + 5, 5).fill(COLOR_PRIMARY);
  doc.fillColor(COLOR_HEADER).font('Helvetica').fontSize(8)
    .text(`sorteada (${total})`, x + 27, legY + 1, { lineBreak: false });
  doc.circle(x + 115, legY + 5, 5).lineWidth(0.8).strokeColor('#d1d5db').fillAndStroke('#ffffff', '#d1d5db');
  doc.fillColor(COLOR_HEADER).font('Helvetica').fontSize(8)
    .text(`não sorteada (${totalBolas - total})`, x + 124, legY + 1, { lineBreak: false });

  return y + CARD_H + 16;
}

/** Card de um sorteio. Retorna altura consumida (não y absoluto). */
function drawSorteioCard(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  maxW: number,
  concurso: number,
  data: string,
  bolas: number[],
  sequencia: number,
): void {
  const BALL_R = 12;
  const GAP    = 5;
  const CARD_H = BALL_R * 2 + 42;

  doc.roundedRect(x, y, maxW, CARD_H, 6).fill(COLOR_WHITE).stroke('#e2e8f0');

  // Header
  doc.fillColor(COLOR_HEADER).font('Helvetica-Bold').fontSize(10)
    .text(`Concurso ${concurso}`, x + 12, y + 8, { width: maxW * 0.55, lineBreak: false });
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9)
    .text(`· ${data}`, x + 12 + maxW * 0.36, y + 9, { lineBreak: false });
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8)
    .text(`${sequencia}º`, x, y + 9, { width: maxW - 12, align: 'right', lineBreak: false });

  // Bolinhas
  let bx = x + 12;
  const by = y + 26 + BALL_R;
  bolas.forEach(n => {
    drawBall(doc, bx + BALL_R, by, BALL_R, n, true);
    bx += BALL_R * 2 + GAP;
  });
}

function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  maxW: number,
  cols: ColDef[],
  rows: string[][],
  opts: { rowH?: number; fontSize?: number; headerBg?: string } = {},
): number {
  const rowH     = opts.rowH    ?? 16;
  const fontSize = opts.fontSize ?? 8;
  const headerBg = opts.headerBg ?? COLOR_HEADER;
  const PAGE_BOTTOM = (doc.page.height as number) - (doc.page.margins as { bottom: number }).bottom - 10;

  // Header
  doc.rect(x, y, maxW, rowH).fill(headerBg);
  let cx = x;
  cols.forEach(col => {
    doc.fillColor(COLOR_WHITE).fontSize(fontSize).font('Helvetica-Bold');
    doc.text(col.label, cx + 3, y + (rowH - fontSize) / 2, {
      width: col.width - 6,
      align: col.align ?? 'left',
      lineBreak: false,
    });
    cx += col.width;
  });
  y += rowH;

  rows.forEach((row, ri) => {
    // Quebra de página
    if (y + rowH > PAGE_BOTTOM) {
      doc.addPage();
      y = (doc.page.margins as { top: number }).top;
      // Re-desenha header
      doc.rect(x, y, maxW, rowH).fill(headerBg);
      cx = x;
      cols.forEach(col => {
        doc.fillColor(COLOR_WHITE).fontSize(fontSize).font('Helvetica-Bold');
        doc.text(col.label, cx + 3, y + (rowH - fontSize) / 2, {
          width: col.width - 6, align: col.align ?? 'left', lineBreak: false,
        });
        cx += col.width;
      });
      y += rowH;
    }

    // Row background
    if (ri % 2 === 1) doc.rect(x, y, maxW, rowH).fill(COLOR_ROW_ALT);
    else doc.rect(x, y, maxW, rowH).fill(COLOR_WHITE);

    cx = x;
    row.forEach((cell, ci) => {
      const col = cols[ci];
      doc.fillColor(COLOR_HEADER).fontSize(fontSize).font('Helvetica');
      doc.text(cell ?? '', cx + 3, y + (rowH - fontSize) / 2, {
        width: col.width - 6,
        align: col.align ?? 'left',
        lineBreak: false,
        ellipsis: true,
      });
      cx += col.width;
    });

    // Bottom border
    doc.moveTo(x, y + rowH).lineTo(x + maxW, y + rowH).stroke('#e2e8f0');
    y += rowH;
  });

  return y; // retorna y final
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class RelatorioService {
  private readonly logger = new Logger(RelatorioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  // ── XLSX ───────────────────────────────────────────────────────────────────

  async gerarXlsx(tenantId: string | null, bolaoId: string): Promise<RelatorioResult> {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId: tenantId! } });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    const [cotas, premios] = await Promise.all([
      this.prisma.cota.findMany({
        where: { bolaoId, tenantId: tenantId! },
        orderBy: [{ totalAcertosAcumulados: 'desc' }, { numeroSequencial: 'asc' }],
      }),
      this.prisma.premio.findMany({
        where: { bolaoId, tenantId: tenantId! },
        include: {
          cota: { select: { nomeIdentificacao: true, numeroSequencial: true } },
          categoriaPremiacao: { select: { nome: true } },
        },
        orderBy: { categoriaPremiacao: { ordem: 'asc' } },
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NossoBolão';
    workbook.created = new Date();

    const ranking = workbook.addWorksheet('Ranking');
    ranking.columns = [
      { header: 'Posição', key: 'pos',      width: 10 },
      { header: 'Nº Cota', key: 'seq',      width: 12 },
      { header: 'Nome',    key: 'nome',     width: 45 },
      { header: 'Celular', key: 'cel',      width: 16 },
      { header: 'Acertos', key: 'acertos',  width: 12 },
      { header: 'Status',  key: 'status',   width: 14 },
    ];
    ranking.getRow(1).font = { bold: true };
    cotas.forEach((c, idx) =>
      ranking.addRow({
        pos: idx + 1,
        seq: c.numeroSequencial,
        nome: c.nomeIdentificacao,
        cel: c.numeroCelular ?? '',
        acertos: c.totalAcertosAcumulados,
        status: c.statusPagamento,
      }),
    );

    const premiosSheet = workbook.addWorksheet('Premios');
    premiosSheet.columns = [
      { header: 'Nº Cota',   key: 'seq',    width: 12 },
      { header: 'Nome',      key: 'nome',   width: 45 },
      { header: 'Categoria', key: 'cat',    width: 30 },
      { header: 'Valor (R$)',key: 'valor',  width: 15 },
      { header: 'Status',    key: 'status', width: 12 },
    ];
    premiosSheet.getRow(1).font = { bold: true };
    premios.forEach((p) =>
      premiosSheet.addRow({
        seq: p.cota.numeroSequencial,
        nome: p.cota.nomeIdentificacao,
        cat: p.categoriaPremiacao.nome,
        valor: (p.valorPorGanhador as unknown as Prisma.Decimal).toNumber(),
        status: p.statusPagamento,
      }),
    );

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return this.uploadStorage(tenantId!, bolaoId, 'ranking', 'xlsx', buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  // ── PDF COMPLETO ──────────────────────────────────────────────────────────

  async gerarPdfBuffer(tenantId: string | null, bolaoId: string): Promise<{ buffer: Buffer; filename: string }> {
    return this.gerarPdf(tenantId, bolaoId);
  }

  private async gerarPdf(tenantId: string | null, bolaoId: string): Promise<{ buffer: Buffer; filename: string }> {
    this.assertTenantId(tenantId);

    // ── Carrega todos os dados ──────────────────────────────────────────────
    const [bolao, categorias, sorteios, cotas, premios, acertosPorCota] = await Promise.all([
      this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId: tenantId! } }),
      this.prisma.categoriaPremiacao.findMany({
        where: { bolaoId, tenantId: tenantId! },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.sorteio.findMany({
        where: { bolaoId, tenantId: tenantId! },
        orderBy: { sequenciaNoBolao: 'asc' },
      }),
      this.prisma.cota.findMany({
        where: { bolaoId, tenantId: tenantId! },
        orderBy: [{ statusPagamento: 'asc' }, { numeroSequencial: 'asc' }],
      }),
      this.prisma.premio.findMany({
        where: { bolaoId, tenantId: tenantId! },
        include: {
          cota: { select: { nomeIdentificacao: true, numeroSequencial: true } },
          categoriaPremiacao: { select: { nome: true, tipo: true } },
        },
        orderBy: [{ categoriaPremiacao: { ordem: 'asc' } }, { valorPorGanhador: 'desc' }],
      }),
      this.prisma.acertoSorteio.groupBy({
        by: ['cotaId'],
        where: { bolaoId, tenantId: tenantId! },
        _sum: { acertos: true },
      }),
    ]);

    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    // Mapa acertos reais (calculados de acertos_sorteio)
    const acertosMap = new Map(acertosPorCota.map(a => [a.cotaId, a._sum.acertos ?? 0]));

    // Estatísticas
    const totalPago     = cotas.filter(c => c.statusPagamento === 'PAGO').length;
    const totalPendente = cotas.filter(c => c.statusPagamento === 'PENDENTE').length;
    const valorCota     = Number(bolao.valorCota);
    const valorBruto    = valorCota * totalPago;
    const taxaCateg     = categorias.find(c => c.tipo === 'TAXA_ADMINISTRATIVA');
    const taxaPct       = taxaCateg ? Number(taxaCateg.percentual) : 0;
    const taxaValor     = (taxaPct / 100) * valorBruto;
    const poolLiquido   = valorBruto - taxaValor;

    const geradoEm = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: {
          Title: `Relatório — ${bolao.nome}`,
          Author: 'NossoBolão',
          CreationDate: new Date(),
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = doc.page.margins.left;
      const PW = (doc.page.width as number) - ML - (doc.page.margins as { right: number }).right;

      // ── Helper: header de seção ──────────────────────────────────────────
      const section = (title: string) => {
        const y = (doc as unknown as { y: number }).y + 6;
        doc.rect(ML, y, PW, 22).fill(COLOR_PRIMARY);
        doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(10)
          .text(title, ML + 8, y + 6, { width: PW - 16 });
        (doc as unknown as { y: number }).y = y + 28;
      };

      // ── Helper: KPI card ────────────────────────────────────────────────
      const kpiBox = (x: number, y: number, w: number, label: string, value: string, accent = false) => {
        doc.rect(x, y, w, 38).fill(COLOR_WHITE).stroke('#e2e8f0');
        doc.fillColor(accent ? COLOR_GOLD : COLOR_PRIMARY).font('Helvetica-Bold').fontSize(13)
          .text(value, x + 8, y + 7, { width: w - 16, align: 'left', lineBreak: false });
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7)
          .text(label, x + 8, y + 24, { width: w - 16 });
      };

      // ──────────────────────────────────────────────────────────────────────
      // CAPA
      // ──────────────────────────────────────────────────────────────────────
      const topY = (doc.page.margins as { top: number }).top;

      // Faixa verde topo
      doc.rect(0, 0, doc.page.width as number, 70).fill(COLOR_PRIMARY);
      doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(22)
        .text('NossoBolão', ML, 18, { lineBreak: false });
      doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica').fontSize(10)
        .text('Relatório Completo do Bolão', ML, 42);

      (doc as unknown as { y: number }).y = 90;

      // Nome do bolão
      doc.fillColor(COLOR_HEADER).font('Helvetica-Bold').fontSize(18)
        .text(bolao.nome, ML, 90);
      doc.fillColor(COLOR_SUBHEAD).font('Helvetica').fontSize(10)
        .text(
          `Status: ${bolao.status.replace(/_/g, ' ')}  ·  ${dateBr(bolao.dataInicio)} → ${dateBr(bolao.dataTermino)}  ·  Gerado em: ${geradoEm}`,
          ML, 112,
        );

      // KPIs
      const kpiY = 135;
      const kW   = (PW - 12) / 4;
      kpiBox(ML,              kpiY, kW, 'COTAS PAGAS',        `${totalPago.toLocaleString('pt-BR')}`);
      kpiBox(ML + kW + 4,     kpiY, kW, 'COTAS PENDENTES',   `${totalPendente.toLocaleString('pt-BR')}`);
      kpiBox(ML + (kW + 4)*2, kpiY, kW, 'ARRECADAÇÃO BRUTA', brl(valorBruto), true);
      kpiBox(ML + (kW + 4)*3, kpiY, kW, 'POOL LÍQUIDO',      brl(poolLiquido), true);

      (doc as unknown as { y: number }).y = kpiY + 55;

      // ──────────────────────────────────────────────────────────────────────
      // REGRAS DO BOLÃO
      // ──────────────────────────────────────────────────────────────────────
      section('REGRAS DO BOLÃO');

      // Info básica
      const infoY = (doc as unknown as { y: number }).y;
      const halfW = PW / 2 - 6;
      doc.rect(ML, infoY, halfW, 22).fill('#f8fafc');
      doc.fillColor(COLOR_SUBHEAD).font('Helvetica').fontSize(8)
        .text('Valor por cota', ML + 6, infoY + 4);
      doc.fillColor(COLOR_HEADER).font('Helvetica-Bold').fontSize(10)
        .text(brl(valorCota), ML + 6, infoY + 12);

      doc.rect(ML + halfW + 12, infoY, halfW, 22).fill('#f8fafc');
      doc.fillColor(COLOR_SUBHEAD).font('Helvetica').fontSize(8)
        .text('Números por cota', ML + halfW + 18, infoY + 4);
      doc.fillColor(COLOR_HEADER).font('Helvetica-Bold').fontSize(10)
        .text(`${bolao.qtdNumerosCota} números`, ML + halfW + 18, infoY + 12);
      (doc as unknown as { y: number }).y = infoY + 30;

      // Categorias de premiação
      const catCols: ColDef[] = [
        { label: '#',             width: 24,            align: 'center' },
        { label: 'Categoria',     width: PW * 0.30 },
        { label: 'Tipo',          width: PW * 0.22 },
        { label: 'Acertos Alvo',  width: PW * 0.12, align: 'center' },
        { label: '%',             width: PW * 0.10, align: 'center' },
        { label: 'Valor Est.',    width: PW - 24 - PW * 0.74, align: 'right' },
      ];
      const catRows = categorias.map((c, i) => {
        const valorCat = ((Number(c.percentual) / 100) * valorBruto);
        return [
          String(i + 1),
          c.nome,
          c.tipo.replace(/_/g, ' '),
          c.acertosAlvo ? `${c.acertosAlvo} ac.` : '—',
          `${Number(c.percentual).toFixed(1)}%`,
          brl(valorCat),
        ];
      });
      const afterCats = drawTable(doc, ML, (doc as unknown as { y: number }).y, PW, catCols, catRows);
      (doc as unknown as { y: number }).y = afterCats + 10;

      // ──────────────────────────────────────────────────────────────────────
      // BOLAS SORTEADAS — grid 10×6 estilo frontend
      // ──────────────────────────────────────────────────────────────────────
      if (sorteios.length > 0) {
        const todasSorteadas = new Set(sorteios.flatMap(s => s.bolasSorteadas));
        const PAGE_BOT = (doc.page.height as number) - (doc.page.margins as { bottom: number }).bottom - 10;
        const gridH_est = Math.ceil(60 / 10) * (13 * 2 + 5) - 5 + 20 + 18 + 8 + 16;
        if ((doc as unknown as { y: number }).y + gridH_est > PAGE_BOT) doc.addPage();

        const afterGrid = drawBolasGrid(
          doc, ML, (doc as unknown as { y: number }).y, PW, todasSorteadas, 60,
        );
        (doc as unknown as { y: number }).y = afterGrid;
      }

      // ──────────────────────────────────────────────────────────────────────
      // SORTEIOS REALIZADOS — 2 colunas lado a lado
      // ──────────────────────────────────────────────────────────────────────
      if (sorteios.length > 0) {
        section(`SORTEIOS REALIZADOS (${sorteios.length})`);
        const PAGE_BOT   = (doc.page.height as number) - (doc.page.margins as { bottom: number }).bottom - 10;
        const COL_GAP    = 10;
        const CARD_W     = (PW - COL_GAP) / 2;
        const BALL_R_C   = 12;
        const CARD_H     = BALL_R_C * 2 + 42;

        for (let i = 0; i < sorteios.length; i += 2) {
          // Quebra de página se não couber o próximo par
          if ((doc as unknown as { y: number }).y + CARD_H > PAGE_BOT) {
            doc.addPage();
            (doc as unknown as { y: number }).y = (doc.page.margins as { top: number }).top;
          }
          const rowY = (doc as unknown as { y: number }).y;

          // Card esquerdo
          const s0 = sorteios[i];
          drawSorteioCard(doc, ML, rowY, CARD_W, s0.numeroConcurso, dateBr(s0.dataSorteio), s0.bolasSorteadas, s0.sequenciaNoBolao);

          // Card direito (se existir)
          if (i + 1 < sorteios.length) {
            const s1 = sorteios[i + 1];
            drawSorteioCard(doc, ML + CARD_W + COL_GAP, rowY, CARD_W, s1.numeroConcurso, dateBr(s1.dataSorteio), s1.bolasSorteadas, s1.sequenciaNoBolao);
          }

          (doc as unknown as { y: number }).y = rowY + CARD_H + 8;
        }
      }

      // ──────────────────────────────────────────────────────────────────────
      // PREMIADOS
      // ──────────────────────────────────────────────────────────────────────
      if (premios.length > 0) {
        section(`PREMIADOS (${premios.length})`);

        const premCols: ColDef[] = [
          { label: 'Nº Cota',    width: 56,       align: 'center' },
          { label: 'Nome',       width: PW * 0.30 },
          { label: 'Categoria',  width: PW * 0.22 },
          { label: 'Valor',      width: PW * 0.14, align: 'right' },
          { label: 'Status',     width: PW - 56 - PW * 0.66 },
        ];
        const premRows = premios.map(p => [
          `#${p.cota.numeroSequencial}`,
          p.cota.nomeIdentificacao,
          p.categoriaPremiacao.nome,
          brl((p.valorPorGanhador as unknown as Prisma.Decimal).toNumber()),
          p.statusPagamento,
        ]);
        const afterPrem = drawTable(doc, ML, (doc as unknown as { y: number }).y, PW, premCols, premRows, { headerBg: COLOR_GOLD });
        (doc as unknown as { y: number }).y = afterPrem + 10;
      }

      // ──────────────────────────────────────────────────────────────────────
      // TODAS AS COTAS
      // ──────────────────────────────────────────────────────────────────────
      doc.addPage();
      (doc as unknown as { y: number }).y = topY;

      section(`COTAS REGISTRADAS — ${cotas.length.toLocaleString('pt-BR')} cotas`);

      // Ordena por acertos desc
      const cotasOrdenadas = [...cotas].sort((a, b) => {
        const acA = acertosMap.get(b.id) ?? 0;
        const acB = acertosMap.get(a.id) ?? 0;
        return acA - acB || a.numeroSequencial - b.numeroSequencial;
      });

      // Configuração da tabela de cotas com bolinhas
      const BALL_D   = 13;   // diâmetro da bolinha
      const BALL_GAP = 2;    // espaço entre bolinhas
      const ROW_H    = BALL_D + 9;  // altura da linha
      const FS       = 7.5;

      // Larguras das colunas (sem celular)
      const COL_NUM     = 36;
      const COL_NOME    = PW * 0.28;
      const COL_ACERTOS = 52;
      const COL_PGTO    = 52;
      const COL_PALPITES = PW - COL_NUM - COL_NOME - COL_ACERTOS - COL_PGTO;

      const PAGE_BOTTOM = (doc.page.height as number) - (doc.page.margins as { bottom: number }).bottom - 10;

      // Header
      const drawCotasHeader = (yy: number): void => {
        doc.rect(ML, yy, PW, ROW_H - 2).fill(COLOR_HEADER);
        const headers = [
          { label: 'Nº',       w: COL_NUM,     align: 'center' as const },
          { label: 'Nome',     w: COL_NOME,    align: 'left'   as const },
          { label: 'Palpites', w: COL_PALPITES,align: 'left'   as const },
          { label: 'Acertos',  w: COL_ACERTOS, align: 'center' as const },
          { label: 'Pgto',     w: COL_PGTO,    align: 'center' as const },
        ];
        let hx = ML;
        headers.forEach(h => {
          doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(FS)
            .text(h.label, hx + 3, yy + (ROW_H - 2 - FS) / 2, { width: h.w - 6, align: h.align, lineBreak: false });
          hx += h.w;
        });
      };

      let yy = (doc as unknown as { y: number }).y;
      drawCotasHeader(yy);
      yy += ROW_H - 2;

      cotasOrdenadas.forEach((c, ri) => {
        if (yy + ROW_H > PAGE_BOTTOM) {
          doc.addPage();
          yy = (doc.page.margins as { top: number }).top;
          drawCotasHeader(yy);
          yy += ROW_H - 2;
        }

        // Row background
        doc.rect(ML, yy, PW, ROW_H).fill(ri % 2 === 1 ? COLOR_ROW_ALT : COLOR_WHITE);

        const acertos = acertosMap.get(c.id) ?? 0;
        const pago    = c.statusPagamento === 'PAGO';

        // Nº cota
        doc.fillColor(COLOR_HEADER).font('Helvetica').fontSize(FS)
          .text(`#${c.numeroSequencial}`, ML + 3, yy + (ROW_H - FS) / 2,
            { width: COL_NUM - 6, align: 'center', lineBreak: false });

        // Nome
        doc.fillColor(COLOR_HEADER).font('Helvetica').fontSize(FS)
          .text(c.nomeIdentificacao, ML + COL_NUM + 3, yy + (ROW_H - FS) / 2,
            { width: COL_NOME - 6, lineBreak: false, ellipsis: true });

        // Palpites — bolinhas
        const palpX0 = ML + COL_NUM + COL_NOME + 3;
        const palpY  = yy + (ROW_H - BALL_D) / 2;
        c.palpites.forEach((n, pi) => {
          const bx = palpX0 + pi * (BALL_D + BALL_GAP);
          const r  = BALL_D / 2;
          doc.circle(bx + r, palpY + r, r).fill(COLOR_PRIMARY);
          doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(6)
            .text(String(n).padStart(2, '0'), bx, palpY + r - 3,
              { width: BALL_D, align: 'center', lineBreak: false });
        });

        // Acertos
        doc.fillColor(acertos > 0 ? COLOR_PRIMARY : COLOR_MUTED).font('Helvetica-Bold').fontSize(FS)
          .text(String(acertos), ML + COL_NUM + COL_NOME + COL_PALPITES + 3, yy + (ROW_H - FS) / 2,
            { width: COL_ACERTOS - 6, align: 'center', lineBreak: false });

        // Pgto
        doc.fillColor(pago ? COLOR_PRIMARY : COLOR_GOLD).font('Helvetica').fontSize(FS)
          .text(pago ? 'Pago' : 'Pendente', ML + COL_NUM + COL_NOME + COL_PALPITES + COL_ACERTOS + 3, yy + (ROW_H - FS) / 2,
            { width: COL_PGTO - 6, align: 'center', lineBreak: false });

        // Linha divisória
        doc.moveTo(ML, yy + ROW_H).lineTo(ML + PW, yy + ROW_H).stroke('#e2e8f0');

        yy += ROW_H;
      });

      (doc as unknown as { y: number }).y = yy + 6;

      // ── Rodapé em todas as páginas ────────────────────────────────────────
      const range = (doc as unknown as { bufferedPageRange(): { start: number; count: number } }).bufferedPageRange();
      const totalPages = range.count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(range.start + i);
        const fY = (doc.page.height as number) - 28;
        doc.moveTo(ML, fY).lineTo(ML + PW, fY).stroke('#e2e8f0');
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7)
          .text(`NossoBolão · ${bolao.nome} · Gerado em ${geradoEm}`, ML, fY + 5, { width: PW * 0.7, align: 'left' });
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7)
          .text(`Página ${i + 1} de ${totalPages}`, ML, fY + 5, { width: PW, align: 'right' });
      }

      doc.end();
    });

    const safeName = bolao.nome.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
    const filename = `relatorio-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return { buffer, filename };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async uploadStorage(
    tenantId: string,
    bolaoId: string,
    prefixo: string,
    ext: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<RelatorioResult> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const caminho = `${tenantId}/${bolaoId}/${prefixo}-${ts}.${ext}`;

    const { error } = await this.supabase.admin.storage.from(BUCKET).upload(caminho, buffer, { contentType });
    if (error) {
      this.logger.error(`Erro ao fazer upload: ${error.message}`);
      throw new Error(`Upload falhou: ${error.message}`);
    }

    const { data: urlData } = await this.supabase.admin.storage.from(BUCKET).createSignedUrl(caminho, 60 * 60 * 24);

    this.logger.log(`Relatório gerado: ${caminho}`);
    return { url: urlData?.signedUrl ?? '', caminho, geradoEm: new Date().toISOString() };
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }
}
