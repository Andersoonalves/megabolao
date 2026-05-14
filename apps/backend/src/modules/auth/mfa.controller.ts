import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { MfaService } from './mfa.service';

class SyncMfaDto {
  @IsBoolean()
  enrolled!: boolean;
}

@ApiTags('mfa')
@ApiBearerAuth()
@Roles('ADMIN', 'MASTER')
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Get('status')
  @ApiOperation({ summary: 'Status 2FA do usuário autenticado (fatores TOTP)' })
  async status(@CurrentUser() user: AuthenticatedUser) {
    const fatores = await this.mfaService.listarFatores(user.id);
    const totp = fatores.filter(f => f.factor_type === 'totp');
    return {
      enrolled: totp.length > 0,
      fatores: totp.map(f => ({ id: f.id, criadoEm: f.created_at })),
    };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sincroniza flag mfa_enrolled no user_metadata após enroll/unenroll via Supabase SDK' })
  sync(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncMfaDto) {
    return this.mfaService.setMfaEnrolled(user.id, dto.enrolled);
  }

  @Delete('self')
  @ApiOperation({ summary: 'Remove todos os fatores TOTP do próprio usuário (inclusive pendentes/não verificados)' })
  async removerProprios(@CurrentUser() user: AuthenticatedUser) {
    await this.mfaService.limparFatoresPropriosAdmin(user.id);
    return { ok: true };
  }

  @Delete('usuarios/:id')
  @ApiOperation({ summary: 'Admin/Master reseta 2FA de um usuário' })
  resetarMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.mfaService.resetarMfa(targetId, user.id, user.papel);
  }
}
