import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateParticipanteDto {
  @ApiProperty({ example: 'JOÃO DA SILVA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nome!: string;

  @ApiProperty({ example: '83999990000' })
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Celular deve ter 10 ou 11 dígitos' })
  numeroCelular!: string;

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
