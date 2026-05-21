import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateCategoriaDto } from './create-categoria.dto';

export class CreateBolaoDto {
  @ApiProperty({ example: 'Bolão Mega-Sena Abril 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nome!: string;

  @ApiProperty({ example: 30.00, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  valorCota!: number;

  @ApiPropertyOptional({ example: 10, minimum: 6, description: 'Quantidade de números por cota (mínimo 6, padrão 10)' })
  @IsInt()
  @Min(6)
  @IsOptional()
  qtdNumerosCota?: number;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsDateString()
  @IsOptional()
  dataInicio?: string;

  @ApiPropertyOptional({ example: '2026-04-23' })
  @IsDateString()
  @IsOptional()
  dataTermino?: string;

  @ApiProperty({ type: [CreateCategoriaDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCategoriaDto)
  categorias!: CreateCategoriaDto[];
}
