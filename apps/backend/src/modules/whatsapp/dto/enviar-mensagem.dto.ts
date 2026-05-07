import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class EnviarMensagemDto {
  @ApiProperty({ example: '120363000000000000@g.us', description: 'ID do grupo WhatsApp (obtido em /whatsapp/sessao/grupos)' })
  @IsString()
  @IsNotEmpty()
  grupoId!: string;

  @ApiProperty({ enum: ['RESULTADO_SORTEIO', 'RANKING_PARCIAL', 'PREMIADOS', 'AVISO_ADMIN', 'MANUAL'] })
  @IsEnum(['RESULTADO_SORTEIO', 'RANKING_PARCIAL', 'PREMIADOS', 'AVISO_ADMIN', 'MANUAL'])
  tipo!: string;

  @ApiProperty({ example: '🏆 *Resultado do Sorteio #2994*\n...', maxLength: 4096 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  conteudo!: string;

  @ApiPropertyOptional({ description: 'Bolão ao qual a mensagem se refere' })
  @IsUUID()
  @IsOptional()
  bolaoId?: string;
}
