import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const TIPOS = ['MANUAL', 'RESULTADO_SORTEIO', 'RANKING_PARCIAL', 'PREMIADOS', 'AVISO_ADMIN'] as const;

export class CreateTemplateDto {
  @ApiProperty({ example: 'Resultado do sorteio' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  nome!: string;

  @ApiProperty({ example: '🏆 *{{nomeBolao}}*\n\nSorteio {{numeroConcurso}} realizado!\nBolas: {{bolas}}' })
  @IsString() @IsNotEmpty() @MaxLength(4096)
  conteudo!: string;

  @ApiPropertyOptional({ enum: TIPOS, default: 'MANUAL' })
  @IsEnum(TIPOS) @IsOptional()
  tipo?: string;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsString() @MaxLength(100) @IsOptional() nome?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(4096) @IsOptional() conteudo?: string;
  @ApiPropertyOptional({ enum: TIPOS }) @IsEnum(TIPOS) @IsOptional() tipo?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() ativo?: boolean;
}
