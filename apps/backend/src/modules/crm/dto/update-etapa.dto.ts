import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateEtapaDto {
  @ApiPropertyOptional() @IsString() @MaxLength(80) @IsOptional() nome?: string;
  @ApiPropertyOptional() @IsHexColor() @IsOptional() cor?: string;
  @ApiPropertyOptional() @IsInt() @Min(0) @IsOptional() ordem?: number;
}
