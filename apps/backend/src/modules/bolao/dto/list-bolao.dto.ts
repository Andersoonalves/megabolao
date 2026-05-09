import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListBolaoDto {
  @ApiPropertyOptional({ default: 1 })
  @IsInt() @Min(1) @IsOptional() @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 12 })
  @IsInt() @Min(1) @Max(100) @IsOptional() @Type(() => Number)
  perPage?: number = 12;

  @ApiPropertyOptional({ description: 'Busca por nome (case-insensitive)' })
  @IsString() @IsOptional()
  busca?: string;

  @ApiPropertyOptional({ enum: ['A_SER_INICIADO', 'EM_ANDAMENTO', 'FINALIZADO', 'SUSPENSO'] })
  @IsEnum(['A_SER_INICIADO', 'EM_ANDAMENTO', 'FINALIZADO', 'SUSPENSO']) @IsOptional()
  status?: string;
}
