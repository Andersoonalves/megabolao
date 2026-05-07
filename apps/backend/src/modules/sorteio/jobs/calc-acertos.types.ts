export const CALC_ACERTOS_QUEUE_NAME = 'calc-acertos';
export const CALC_ACERTOS_QUEUE = 'CALC_ACERTOS_QUEUE';

export interface CalcAcertosJobData {
  sorteioId: string;
  tenantId: string;
  bolaoId: string;
}
