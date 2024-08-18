import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Promotion } from '@prisma/client';
import type { Request as RequestType } from 'express';
import { PrismaService } from 'nestjs-prisma';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { v4 as uuid } from 'uuid';

import { SecurityConfig } from '../common/configs/config.interface';
import { omit } from '../common/helpers';
import { Context } from '../common/interfaces/context.interface';
import { User } from '../users/models/user.model';
import { UsersService } from '../users/users.service';
import { TokenCookie } from './dto/jwt.dto';
import { SignupInput } from './dto/signup.input';
import { Login } from './models/login.model';
import { Token } from './models/token.model';
import { PasswordService } from './password.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectBot()
    private readonly bot: Telegraf<Context>,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
    private readonly userService: UsersService,
  ) {}

  private readonly reportGroupId = this.configService.get('telGroup')!.report;

  async createUser(user: User | null | null, payload: SignupInput, req: RequestType): Promise<Token> {
    let reseller = user;
    const id = uuid();
    let parentId = user?.id;
    let promo: Promotion | undefined;

    if (!parentId) {
      if (!payload?.promoCode) {
        throw new BadRequestException('The promoCode is require!');
      }

      promo = await this.prisma.promotion.findFirstOrThrow({ where: { code: payload.promoCode } });

      parentId = promo.parentUserId;
    }

    const hashedPassword = await this.passwordService.hashPassword(payload.password);

    try {
      const newUser = await this.prisma.user.create({
        data: {
          fullname: payload.fullname.trim(),
          phone: payload.phone,
          id,
          password: hashedPassword,
          parentId,
          ...(promo && { isVerified: false }),
        },
      });

      if (!user) {
        reseller = await this.prisma.user.findUnique({
          where: {
            id: parentId,
          },
        });
      }

      const promoCaption = promo ? `\n🎟️ کد معرف: ${promo.code}` : '';
      const reportCaption = `#ثبتـنام\n👤 ${newUser.fullname}\n📞 موبایل: +98${newUser.phone}\n\n👨 مارکتر: ${reseller?.fullname} ${promoCaption}`;
      void this.bot.telegram.sendMessage(this.reportGroupId, reportCaption);

      const token = this.generateTokens({
        userId: newUser.id,
      });

      if (payload?.promoCode && promo) {
        await this.prisma.userGift.create({
          data: {
            userId: id,
            giftPackageId: promo.giftPackageId,
            promotionId: promo.id,
          },
        });
        this.setAuthCookie({
          req,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
        });
      }

      return token;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Phone ${payload.phone} already used.`);
      }

      throw new Error(error as string);
    }
  }

  async createPromotion(user: User, code: string, giftPackageId?: string) {
    try {
      await this.prisma.promotion.create({
        data: {
          parentUserId: user.id,
          code,
          giftPackageId,
        },
      });
    } catch {
      throw new BadRequestException('Code is already exist!');
    }
  }

  async login(phone: string, password: string, req: RequestType): Promise<Login> {
    const user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      const promo = await this.prisma.promotion.findUnique({ where: { code: password.toLowerCase() } });

      if (promo) {
        return { isPromoCodeValid: true };
      }

      throw new NotFoundException(`No user found for phone: ${phone}`);
    }

    const isPasswordValid = await this.passwordService.validatePassword(password, user.password, user);

    if (!isPasswordValid) {
      throw new BadRequestException('Invalid password');
    }

    const token = this.generateTokens({
      userId: user.id,
    });

    this.setAuthCookie({
      req,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
    });
    const fullUser = await this.userService.getUser(user);

    return { loggedIn: { tokens: token, user: fullUser } };
  }

  logout(req: RequestType): void {
    req?.res?.clearCookie('token');
  }

  validateUser(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  getUserFromToken(token: string): Promise<User | null> {
    const decodedToken = this.jwtService.decode(token);
    const id = typeof decodedToken === 'object' && decodedToken !== null ? decodedToken?.userId : null;

    return this.prisma.user.findUnique({ where: { id } });
  }

  generateTokens(payload: { userId: string }): Token {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  private generateAccessToken(payload: { userId: string }): string {
    return this.jwtService.sign(payload);
  }

  private generateRefreshToken(payload: { userId: string }): string {
    const securityConfig = this.configService.get<SecurityConfig>('security');

    return this.jwtService.sign(payload, {
      secret: this.configService.get<SecurityConfig>('security')?.jwtRefreshSecret,
      expiresIn: securityConfig?.refreshIn,
    });
  }

  refreshToken(token: string) {
    try {
      const { userId } = this.jwtService.verify(token, {
        secret: this.configService.get<SecurityConfig>('security')?.jwtRefreshSecret,
      });

      return this.generateTokens({
        userId,
      });
    } catch {
      throw new UnauthorizedException();
    }
  }

  setAuthCookie({
    accessToken,
    refreshToken,
    req,
  }: {
    accessToken?: string;
    refreshToken?: string;
    req: RequestType;
  }): void {
    if (accessToken && refreshToken) {
      const env = this.configService.get('env');
      const token: TokenCookie = { accessT: accessToken, refreshT: refreshToken };
      req?.res?.cookie('token', JSON.stringify(token), {
        sameSite: 'strict',
        secure: env === 'production',
        httpOnly: true,
        expires: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
      });
    }
  }
}
