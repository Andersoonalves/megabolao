import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExportarResultadosDto {
  @ApiProperty({ example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms' })
  @IsString()
  @IsNotEmpty()
  spreadsheetId!: string;

  @ApiPropertyOptional({ example: 'Ranking', description: 'Nome da aba a ser sobrescrita' })
  @IsString()
  @IsOptional()
  aba?: string;
}
