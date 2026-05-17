import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAdminInfoDto {
  @ApiPropertyOptional({ example: 'João Silva' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  adminNome?: string;

  @ApiPropertyOptional({ example: 'admin@bolao.com' })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @ApiPropertyOptional({ example: '(67) 99999-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  adminCelular?: string;
}
