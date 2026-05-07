import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCotaDto {
  @ApiPropertyOptional({ example: 'MARIA DA SILVA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @IsOptional()
  nomeIdentificacao?: string;

  @ApiPropertyOptional({ example: '83988880000' })
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Celular deve ter 10 ou 11 dígitos' })
  @IsOptional()
  numeroCelular?: string;

  @ApiPropertyOptional({ example: [2, 8, 9, 15, 16, 24, 27, 33, 43, 56] })
  @IsArray()
  @ArrayMinSize(10, { message: 'Palpites devem conter exatamente 10 números' })
  @ArrayMaxSize(10, { message: 'Palpites devem conter exatamente 10 números' })
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(60, { each: true })
  @IsOptional()
  palpites?: number[];
}
