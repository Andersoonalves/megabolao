/** Metadados extras retornados pela API da Caixa (campos opcionais / não documentados). */
export interface MegaSenaCaixaMetaDto {
  ganhadoresSena: number;
  acumulado: boolean;
  valorArrecadado: number | null;
  estimativaProximoConcurso: number | null;
  dataProximoConcurso: string | null;
  numeroConcursoProximo: number | null;
}

export interface MegaSenaResultadoCaixaDto {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

export interface MegaSenaAplicacaoBolaoDto {
  sorteioId: string;
  bolaoId: string;
  bolaoNome: string;
  sequenciaNoBolao: number;
}

export interface MegaSenaPainelItemDto extends MegaSenaResultadoCaixaDto, MegaSenaCaixaMetaDto {
  aplicacoes: MegaSenaAplicacaoBolaoDto[];
}

export interface MegaSenaPainelResponseDto {
  /** Momento em que a Caixa foi consultada nesta requisição. */
  consultadoEm: string;
  /** Primeiro bolão EM_ANDAMENTO (nome), para rótulos de ação — pode ser null. */
  bolaoAtivoNome: string | null;
  resumo: {
    aplicadosNoPeriodo: number;
    totalNoPeriodo: number;
  };
  proximo: {
    numero: number | null;
    /** DD/MM/YYYY como retornado pela Caixa. */
    data: string | null;
  };
  itens: MegaSenaPainelItemDto[];
}
