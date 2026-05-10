import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

export class GrupoWaDto {
  @IsString() id!: string;
  @IsString() nome!: string;
}

export class ConfigGruposBolaoDto {
  @ApiProperty({ type: [GrupoWaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrupoWaDto)
  grupos!: GrupoWaDto[];
}
