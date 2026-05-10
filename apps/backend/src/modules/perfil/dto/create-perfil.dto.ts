import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreatePerfilDto {
  @ApiProperty({ example: 'Financeiro', minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  nome!: string;

  @ApiProperty({ required: false, example: 'Gerencia premiações e relatórios' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  descricao?: string;

  @ApiProperty({ required: false, default: 0, minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  prioridade?: number;

  @ApiProperty({
    type: [String],
    description: 'Códigos de permissão (catálogo). Ex.: bolao.criar',
    example: ['bolao.ler', 'relatorio.gerar'],
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z][a-z0-9_]+\.[a-z][a-z0-9_]+$/, {
    each: true,
    message: 'Permissão deve seguir o formato modulo.acao (snake_case)',
  })
  permissoes!: string[];

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
