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

// Bucket deve ser criado no Supabase Dashboard: Storage > New bucket "relatorios" (public=false)
const BUCKET = 'relatorios';

@Injectable()
export class RelatorioService {
  private readonly logger = new Logger(RelatorioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async gerarXlsx(tenantId: string | null, bolaoId: string): Promise<RelatorioResult> {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId: tenantId! } });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    const [cotas, premios] = await Promise.all([
      this.prisma.cota.findMany({
        where: { bolaoId, tenantId: tenantId!, statusPagamento: 'PAGO' },
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

    // Aba Ranking
    const ranking = workbook.addWorksheet('Ranking');
    ranking.columns = [
      { header: 'Posição', key: 'pos', width: 10 },
      { header: 'Nº Cota', key: 'seq', width: 12 },
      { header: 'Nome', key: 'nome', width: 45 },
      { header: 'Celular', key: 'cel', width: 16 },
      { header: 'Acertos', key: 'acertos', width: 12 },
    ];
    ranking.getRow(1).font = { bold: true };
    cotas.forEach((c, idx) =>
      ranking.addRow({ pos: idx + 1, seq: c.numeroSequencial, nome: c.nomeIdentificacao, cel: c.numeroCelular ?? '', acertos: c.totalAcertosAcumulados }),
    );

    // Aba Prêmios
    const premiosSheet = workbook.addWorksheet('Premios');
    premiosSheet.columns = [
      { header: 'Nº Cota', key: 'seq', width: 12 },
      { header: 'Nome', key: 'nome', width: 45 },
      { header: 'Categoria', key: 'cat', width: 30 },
      { header: 'Valor (R$)', key: 'valor', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
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

  async gerarPdf(tenantId: string | null, bolaoId: string): Promise<RelatorioResult> {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId: tenantId! } });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    const cotas = await this.prisma.cota.findMany({
      where: { bolaoId, tenantId: tenantId!, statusPagamento: 'PAGO' },
      orderBy: [{ totalAcertosAcumulados: 'desc' }, { numeroSequencial: 'asc' }],
      take: 200, // PDF: limita a 200 para não ficar gigante
    });

    const premios = await this.prisma.premio.findMany({
      where: { bolaoId, tenantId: tenantId! },
      include: {
        cota: { select: { nomeIdentificacao: true, numeroSequencial: true } },
        categoriaPremiacao: { select: { nome: true } },
      },
      orderBy: { categoriaPremiacao: { ordem: 'asc' } },
    });

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Cabeçalho
      doc.fontSize(18).font('Helvetica-Bold').text(bolao.nome, { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`Relatório gerado em ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });
      doc.moveDown(1.5);

      // Prêmios
      if (premios.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Prêmios', { underline: true });
        doc.moveDown(0.5);
        premios.forEach((p) => {
          const valor = (p.valorPorGanhador as unknown as Prisma.Decimal).toNumber();
          doc.fontSize(10).font('Helvetica').text(
            `Cota ${p.cota.numeroSequencial} — ${p.cota.nomeIdentificacao} | ${p.categoriaPremiacao.nome} | R$ ${valor.toFixed(2)} | ${p.statusPagamento}`,
          );
        });
        doc.moveDown(1);
      }

      // Ranking
      doc.fontSize(14).font('Helvetica-Bold').text('Ranking', { underline: true });
      doc.moveDown(0.5);
      cotas.forEach((c, idx) => {
        doc.fontSize(9).font('Helvetica').text(
          `${idx + 1}. Cota ${c.numeroSequencial} — ${c.nomeIdentificacao} — ${c.totalAcertosAcumulados} acertos`,
        );
      });

      doc.end();
    });

    return this.uploadStorage(tenantId!, bolaoId, 'relatorio', 'pdf', buffer, 'application/pdf');
  }

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
