import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class PagarEmMassaDto {
  @ApiProperty({ type: [String], description: 'IDs das cotas a confirmar (máx 500 por chamada)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  cotaIds!: string[];
}
