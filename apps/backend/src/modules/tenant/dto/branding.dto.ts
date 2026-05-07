import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class TenantBrandingDto {
  @ApiPropertyOptional({ example: 'https://cdn.exemplo.com/logo.png' })
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: '#1F4E79' })
  @IsHexColor()
  @IsOptional()
  corPrimaria?: string;

  @ApiPropertyOptional({ example: 'Meu Bolão' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  nomeCustomizado?: string;
}
