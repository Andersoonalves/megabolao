import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class CreateCotaDto {
  @ApiProperty({ example: 'JOÃO DA SILVA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nomeIdentificacao!: string;

  @ApiPropertyOptional({ example: '83999990000' })
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Celular deve ter 10 ou 11 dígitos' })
  @IsOptional()
  numeroCelular?: string;

  @ApiProperty({
    example: [1, 7, 8, 14, 15, 23, 26, 32, 42, 55],
    description: 'Números únicos entre 1 e 60. A quantidade exata é definida pelo qtdNumerosCota do bolão.',
  })
  @IsArray()
  @IsInt({ each: true, message: 'Cada palpite deve ser um número inteiro' })
  @Min(1, { each: true, message: 'Palpites devem ser entre 1 e 60' })
  @Max(60, { each: true, message: 'Palpites devem ser entre 1 e 60' })
  palpites!: number[];
}
