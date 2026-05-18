import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateEtapaDto {
  @ApiProperty({ example: 'Interessado' })
  @IsString() @IsNotEmpty() @MaxLength(80)
  nome!: string;

  @ApiPropertyOptional({ example: '#f59e0b' })
  @IsHexColor() @IsOptional()
  cor?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsInt() @Min(0) @IsOptional()
  ordem?: number;
}
