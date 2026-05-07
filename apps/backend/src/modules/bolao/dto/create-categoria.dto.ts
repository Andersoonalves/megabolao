import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CategoriaTipo } from '@nossobolao/shared-types';

export class CreateCategoriaDto {
  @ApiProperty({ example: 'Premio Principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nome!: string;

  @ApiProperty({ enum: ['TAXA_ADMINISTRATIVA','ACERTOS_EXATOS','MAIOR_PONTUACAO_SORTEIO','MAIOR_PONTUACAO_GERAL','MENOR_PONTUACAO_GERAL'] })
  @IsEnum(['TAXA_ADMINISTRATIVA','ACERTOS_EXATOS','MAIOR_PONTUACAO_SORTEIO','MAIOR_PONTUACAO_GERAL','MENOR_PONTUACAO_GERAL'])
  tipo!: CategoriaTipo;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 10, description: 'Obrigatório quando tipo=ACERTOS_EXATOS' })
  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  acertosAlvo?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, description: 'Obrigatório quando tipo=MAIOR_PONTUACAO_SORTEIO' })
  @IsInt()
  @Min(1)
  @IsOptional()
  sorteioReferencia?: number;

  @ApiProperty({ example: 55.00, minimum: 0.01, maximum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percentual!: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  acumulaSemGanhador?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  ordem?: number;
}
