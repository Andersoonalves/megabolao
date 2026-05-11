import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class SolicitarPortalOtpDto {
  @ApiProperty({ example: '83999990000' })
  @IsString()
  @Matches(/^\D*(?:55)?\D*\d{2}\D*\d{8,9}\D*$/, {
    message: 'Celular deve conter DDD e número',
  })
  celular!: string;
}
