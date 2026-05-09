import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateParticipanteDto {
  @ApiPropertyOptional({ example: 'JOÃO DA SILVA' })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  nome?: string;

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
