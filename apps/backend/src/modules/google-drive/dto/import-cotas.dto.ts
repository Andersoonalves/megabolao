import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ImportCotasDto {
  @ApiProperty({ example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms' })
  @IsString()
  @IsNotEmpty()
  spreadsheetId!: string;

  @ApiPropertyOptional({
    example: 'Plan1!A2:L1000',
    description: 'Range do Google Sheets. Formato esperado: Col A=Nome, B=Celular, C-L=10 Palpites',
  })
  @IsString()
  @IsOptional()
  range?: string;

  @ApiPropertyOptional({ default: true, description: 'Se true, pula linhas inválidas; se false, aborta na primeira' })
  @IsBoolean()
  @IsOptional()
  ignorarErros?: boolean;
}
