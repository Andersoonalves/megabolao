import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TenantBrandingDto } from './branding.dto';

export class CreateTenantDto {
  @ApiProperty({ example: 'Bolão do João' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nome!: string;

  @ApiProperty({ example: 'bolao-do-joao' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
    message: 'Slug deve conter apenas letras minúsculas, números e hífens',
  })
  slug!: string;

  @ApiPropertyOptional({ example: 15, minimum: 0, maximum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  taxaAdministrativaPct?: number;

  @ApiPropertyOptional({ type: TenantBrandingDto })
  @IsObject()
  @ValidateNested()
  @Type(() => TenantBrandingDto)
  @IsOptional()
  branding?: TenantBrandingDto;
}
