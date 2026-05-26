import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class EnviarMensagemDto {
  @ApiPropertyOptional({ example: '120363000000000000@g.us', description: 'ID do grupo WhatsApp — obrigatório se celular ausente (Evolution API)' })
  @IsString()
  @IsNotEmpty()
  @ValidateIf(o => !o.celular)
  grupoId?: string;

  @ApiPropertyOptional({ example: '11987654321', description: 'Celular do destinatário — obrigatório se grupoId ausente (Meta Cloud API)' })
  @IsString()
  @IsNotEmpty()
  @ValidateIf(o => !o.grupoId)
  celular?: string;

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
