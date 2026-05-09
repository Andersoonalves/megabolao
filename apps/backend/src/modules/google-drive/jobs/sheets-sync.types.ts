export const SHEETS_SYNC_QUEUE_NAME = 'sheets-sync';
export const SHEETS_SYNC_QUEUE      = 'SHEETS_SYNC_QUEUE';

export type SheetsSyncTrigger = 'COTA' | 'SORTEIO' | 'RANKING' | 'MANUAL';

export interface SheetsSyncJobData {
  bolaoId:  string;
  tenantId: string;
  trigger:  SheetsSyncTrigger;
}
