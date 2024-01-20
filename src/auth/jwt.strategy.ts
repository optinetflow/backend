import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request as RequestType } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { SecurityConfig } from '../common/configs/config.interface';
import type { User } from '../users/models/user.model';
import { AuthService } from './auth.service';
import type { JwtDto, TokenCookie } from './dto/jwt.dto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService, readonly configService: ConfigService) {
    super({
      // eslint-disable-next-line @typescript-eslint/unbound-method
      jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), JwtStrategy.extractJWT]),
      ignoreExpiration: false,
      secretOrKey: configService.get<SecurityConfig>('security')!.jwtAccessSecret,
    });
  }

  async validate(payload: JwtDto): Promise<User> {
    const user = await this.authService.validateUser(payload.userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }

  private static extractJWT(req: RequestType): string | null {
    if (req.cookies && 'token' in req.cookies && req.cookies.token.length > 0) {
      const tokens: TokenCookie = JSON.parse(req.cookies.token);

      return tokens.accessT;
    }

    return null;
  }
}
