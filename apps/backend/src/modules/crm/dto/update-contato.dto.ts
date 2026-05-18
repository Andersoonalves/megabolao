import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateContatoDto {
  @ApiPropertyOptional() @IsString() @MaxLength(150) @IsOptional() nome?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() etapaId?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @IsOptional() tags?: string[];
  @ApiPropertyOptional() @IsString() @IsOptional() notas?: string;
}
