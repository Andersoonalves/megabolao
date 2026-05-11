import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PortalService } from './portal.service';
import { SolicitarPortalOtpDto } from './dto/solicitar-portal-otp.dto';

@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Public()
  @Post('acesso/solicitar-otp')
  @ApiOperation({ summary: 'Verificar celular antes de solicitar OTP do portal' })
  solicitarOtp(@Body() dto: SolicitarPortalOtpDto) {
    return this.portalService.solicitarOtp(dto.celular);
  }

  @Public()
  @Post('acesso/login-direto')
  @ApiOperation({ summary: 'Login temporário do portal apenas por celular (sem OTP)' })
  loginDireto(@Body() dto: SolicitarPortalOtpDto) {
    return this.portalService.solicitarOtp(dto.celular);
  }

  @Public()
  @Post('resumo-direto')
  @ApiOperation({ summary: 'Resumo temporário do portal por celular (sem OTP)' })
  resumoDireto(@Body() dto: SolicitarPortalOtpDto) {
    return this.portalService.resumoPorCelular(dto.celular);
  }

  @Get('resumo')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resumo do portal do participante autenticado por OTP' })
  resumo(@CurrentUser() user: AuthenticatedUser) {
    return this.portalService.resumo(user);
  }

  @Get('boloes/:bolaoId/ranking')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ranking público do bolão acessível pelo participante autenticado' })
  ranking(@CurrentUser() user: AuthenticatedUser, @Param('bolaoId', ParseUUIDPipe) bolaoId: string) {
    return this.portalService.ranking(user, bolaoId);
  }

  @Public()
  @Post('boloes/:bolaoId/ranking-direto')
  @ApiOperation({ summary: 'Ranking temporário do portal por celular (sem OTP)' })
  rankingDireto(@Body() dto: SolicitarPortalOtpDto, @Param('bolaoId', ParseUUIDPipe) bolaoId: string) {
    return this.portalService.rankingPorCelular(dto.celular, bolaoId);
  }
}
