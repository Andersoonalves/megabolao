import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class GrupoWaDto {
  @IsString() id!: string;
  @IsString() nome!: string;

  /** Somente leitura na API de configuração ao mesclar com a sessão; ignorado ao salvar. */
  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({ description: 'Preenchido pelo servidor quando a sessão WA está conectada' })
  qtdParticipantes?: number;
}

export class ConfigGruposBolaoDto {
  @ApiProperty({ type: [GrupoWaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrupoWaDto)
  grupos!: GrupoWaDto[];
}
