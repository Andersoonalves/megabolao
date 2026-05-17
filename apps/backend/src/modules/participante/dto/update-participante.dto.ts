import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateParticipanteDto {
  @ApiPropertyOptional({ example: 'JOÃO DA SILVA' })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  nome?: string;

  @ApiPropertyOptional({ example: '11987654321' })
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Celular deve ter 10 ou 11 dígitos numéricos' })
  @IsOptional()
  numeroCelular?: string;

  @ApiPropertyOptional({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Cliente VIP' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  observacoes?: string;
}
