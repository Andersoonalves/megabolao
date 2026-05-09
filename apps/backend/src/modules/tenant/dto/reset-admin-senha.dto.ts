import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetAdminSenhaDto {
  @ApiProperty({ example: 'NovaSenha@123', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  novaSenha!: string;
}
