import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateContatoDto {
  @ApiProperty({ example: '83999990000' })
  @IsString() @IsNotEmpty() @MaxLength(20)
  celular!: string;

  @ApiPropertyOptional({ example: 'João Silva' })
  @IsString() @MaxLength(150) @IsOptional()
  nome?: string;

  @ApiPropertyOptional()
  @IsUUID() @IsOptional()
  etapaId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  notas?: string;
}
