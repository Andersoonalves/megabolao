import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListCotasDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  @Type(() => Number)
  perPage?: number = 50;

  @ApiPropertyOptional({ enum: ['PENDENTE', 'PAGO', 'INATIVO'] })
  @IsEnum(['PENDENTE', 'PAGO', 'INATIVO'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'SILVA', description: 'Busca por nome ou celular' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  busca?: string;
}
