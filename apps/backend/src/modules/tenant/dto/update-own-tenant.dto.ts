import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { TenantBrandingDto } from './branding.dto';

export class UpdateOwnTenantDto {
  @ApiPropertyOptional({ example: 'Meu Bolão Atualizado' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  nome?: string;

  @ApiPropertyOptional({ type: TenantBrandingDto })
  @IsObject()
  @ValidateNested()
  @Type(() => TenantBrandingDto)
  @IsOptional()
  branding?: TenantBrandingDto;
}
