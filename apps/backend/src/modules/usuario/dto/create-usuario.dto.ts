import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique, IsArray, IsEmail, IsOptional, IsString, IsUUID, Length,
} from 'class-validator';

export class CreateUsuarioDto {
  @ApiProperty({ example: 'usuario@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, description: 'Nome para exibição', example: 'João Silva' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  nome?: string;

  @ApiProperty({ required: false, example: '83999998888' })
  @IsOptional()
  @IsString()
  @Length(8, 20)
  celular?: string;

  @ApiProperty({
    type: [String],
    description: 'Perfis a atribuir ao novo usuário',
    example: ['11111111-1111-1111-1111-111111111111'],
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  perfilIds!: string[];
}
