import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VincularSheetsDto {
  @ApiProperty({ example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms' })
  @IsString()
  @IsNotEmpty()
  spreadsheetId!: string;
}
