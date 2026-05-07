import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListMensagensDto {
  @ApiPropertyOptional({ default: 1 })
  @IsInt() @Min(1) @IsOptional() @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsInt() @Min(1) @Max(100) @IsOptional() @Type(() => Number)
  perPage?: number = 20;

  @ApiPropertyOptional({ enum: ['PENDENTE', 'ENVIADO', 'FALHA'] })
  @IsEnum(['PENDENTE', 'ENVIADO', 'FALHA'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ enum: ['RESULTADO_SORTEIO', 'RANKING_PARCIAL', 'PREMIADOS', 'AVISO_ADMIN', 'MANUAL'] })
  @IsEnum(['RESULTADO_SORTEIO', 'RANKING_PARCIAL', 'PREMIADOS', 'AVISO_ADMIN', 'MANUAL'])
  @IsOptional()
  tipo?: string;
}
