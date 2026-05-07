export const ENVIAR_MENSAGEM_WA_QUEUE_NAME = 'enviar-mensagem-wa';
export const ENVIAR_MENSAGEM_WA_QUEUE = 'ENVIAR_MENSAGEM_WA_QUEUE';

export interface EnviarMensagemJobData {
  mensagemId: string;
  tenantId: string;
}
