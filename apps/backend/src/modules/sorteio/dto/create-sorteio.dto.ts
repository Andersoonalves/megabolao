import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsPositive,
  Max,
  Min,
} from 'class-validator';

export class CreateSorteioDto {
  @ApiProperty({ example: 2994, description: 'Número do concurso da Mega-Sena' })
  @IsInt()
  @IsPositive()
  numeroConcurso!: number;

  @ApiProperty({ example: '2026-04-09' })
  @IsDateString()
  dataSorteio!: string;

  @ApiProperty({
    example: [1, 10, 23, 31, 40, 55],
    description: '6 números únicos entre 1 e 60',
    minItems: 6,
    maxItems: 6,
  })
  @IsArray()
  @ArrayMinSize(6, { message: 'bolasSorteadas deve conter exatamente 6 números' })
  @ArrayMaxSize(6, { message: 'bolasSorteadas deve conter exatamente 6 números' })
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(60, { each: true })
  bolasSorteadas!: number[];
}
