import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateBolaoDto {
  @ApiPropertyOptional({ example: 'Bolão Maio 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @IsOptional()
  nome?: string;

  @ApiPropertyOptional({ example: 35.00 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  valorCota?: number;

  @ApiPropertyOptional({ example: 10, minimum: 6, description: 'Quantidade de números por cota (mínimo 6, padrão 10)' })
  @IsInt()
  @Min(6)
  @IsOptional()
  qtdNumerosCota?: number;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  dataInicio?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  dataTermino?: string;
}
