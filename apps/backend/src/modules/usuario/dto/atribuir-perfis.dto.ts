import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AtribuirPerfisDto {
  @ApiProperty({
    type: [String],
    description: 'Conjunto FINAL de perfis do usuário (substitui o atual)',
    example: ['11111111-1111-1111-1111-111111111111'],
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  perfilIds!: string[];
}
