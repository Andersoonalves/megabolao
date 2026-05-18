import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum DirecaoMensagem { OUT = 'OUT', NOTE = 'NOTE' }

export class CreateMensagemDto {
  @ApiProperty({ example: 'Olá, ainda tem interesse na cota?' })
  @IsString() @IsNotEmpty()
  conteudo!: string;

  @ApiPropertyOptional({ enum: DirecaoMensagem, default: DirecaoMensagem.NOTE })
  @IsEnum(DirecaoMensagem) @IsOptional()
  direcao?: DirecaoMensagem;
}
