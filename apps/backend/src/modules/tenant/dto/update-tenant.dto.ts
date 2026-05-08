import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiPropertyOptional({ enum: ['ATIVO', 'INATIVO', 'SUSPENSO'] })
  @IsEnum(['ATIVO', 'INATIVO', 'SUSPENSO'])
  @IsOptional()
  status?: 'ATIVO' | 'INATIVO' | 'SUSPENSO';

  @ApiPropertyOptional({ description: 'Nova senha do admin do tenant', minLength: 8 })
  @IsString()
  @MinLength(8)
  @IsOptional()
  novaAdminSenha?: string;
}
