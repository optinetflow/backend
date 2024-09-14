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
import { v4 as uuid } from 'uuid';

import { Brand } from '../brand/models/brand.model';
import { SecurityConfig } from '../common/configs/config.interface';
import { User } from '../users/models/user.model';
import { UsersService } from '../users/users.service';
import { TelegramService } from './../telegram/telegram.service';
import { TokenCookie } from './dto/jwt.dto';
import { SignupInput } from './dto/signup.input';
import { Login } from './models/login.model';
import { Token } from './models/token.model';
import { PasswordService } from './password.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
    private readonly userService: UsersService,
  ) {}

  async createUser(user: User | null, payload: SignupInput): Promise<User> {
    const brand = await this.getBrandByDomain(payload.domainName);
    let parentId = user?.id;
    const promo = await this.getPromotion(payload, brand);

    if (!parentId && !promo) {
      throw new BadRequestException('The promoCode is required!');
    }

    parentId = parentId || promo?.parentUserId;

    const hashedPassword = await this.passwordService.hashPassword(payload.password);
    const otpDetails = this.generateOtp();

    let newUser = await this.findExistingUser(payload.phone, brand.id);

    try {
      newUser = await (newUser && !newUser.isVerified
        ? this.updateExistingUser(newUser, payload, hashedPassword, parentId, otpDetails)
        : this.createNewUser(payload, hashedPassword, parentId, brand.id, otpDetails));

      await this.sendRegistrationReport(newUser, promo, brand, parentId);

      if (promo) {
        await this.assignGiftToUser(newUser.id, promo);
      }

      return newUser;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Phone ${payload.phone} already used.`);
      }

      throw new Error(error as string);
    }
  }

  private async getBrandByDomain(domainName: string): Promise<Brand> {
    return this.prisma.brand.findUniqueOrThrow({ where: { domainName } });
  }

  private async getPromotion(payload: SignupInput, brand: Brand): Promise<Promotion | null> {
    if (!payload.promoCode) {
      return null;
    }

    const promo = await this.prisma.promotion.findFirstOrThrow({
      where: { code: payload.promoCode },
      include: { parentUser: true },
    });

    if (promo?.parentUser.brandId !== brand.id) {
      throw new BadRequestException('The promoCode is wrong!');
    }

    return promo;
  }

  private async findExistingUser(phone: string, brandId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { UserPhoneBrandIdUnique: { phone, brandId } },
    });
  }

  private async updateExistingUser(
    user: User,
    payload: SignupInput,
    hashedPassword: string,
    parentId: string | undefined,
    otpDetails: { otp: string; otpExpiration: Date },
  ): Promise<User> {
    return this.prisma.user.update({
      where: { UserPhoneBrandIdUnique: { phone: payload.phone, brandId: user.brandId as string } },
      data: {
        otp: otpDetails.otp,
        otpExpiration: otpDetails.otpExpiration,
        fullname: payload.fullname.trim(),
        password: hashedPassword,
        parentId,
      },
    });
  }

  private async createNewUser(
    payload: SignupInput,
    hashedPassword: string,
    parentId: string | undefined,
    brandId: string,
    otpDetails: { otp: string; otpExpiration: Date },
  ): Promise<User> {
    return this.prisma.user.create({
      data: {
        phone: payload.phone,
        fullname: payload.fullname.trim(),
        password: hashedPassword,
        parentId,
        brandId,
        otp: otpDetails.otp,
        otpExpiration: otpDetails.otpExpiration,
      },
    });
  }

  private async sendRegistrationReport(
    newUser: User,
    promo: Promotion | null,
    brand: Brand,
    parentId: string | undefined,
  ) {
    const reseller = parentId ? await this.prisma.user.findUnique({ where: { id: parentId } }) : null;
    const promoCaption = promo ? `\n🎟️ کد معرف: ${promo.code}` : '';
    const reportCaption = `#ثبتـنام\n👤 ${newUser.fullname}\n📞 موبایل: +98${newUser.phone}\n\n👨 مارکتر: ${reseller?.fullname}${promoCaption}\n\n 🏷️ برند: ${brand.domainName}`;
    const bot = this.telegramService.getBot(brand.id);

    await bot.telegram.sendMessage(brand.reportGroupId as string, reportCaption);
  }

  private async assignGiftToUser(userId: string, promo: Promotion) {
    await this.prisma.userGift.create({
      data: {
        userId,
        giftPackageId: promo.giftPackageId,
        promotionId: promo.id,
      },
    });
  }

  private generateOtp() {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const securityConfig = this.configService.get<SecurityConfig>('security');
    const otpExpiration: Date = new Date(Date.now() + securityConfig!.otpExpiration * 60 * 1000);

    return { otp, otpExpiration };
  }

  async verifyPhone(user: User, domainName: string, otp: string, req: RequestType): Promise<Token> {
    const userDomainName = user.brand?.domainName;

    if (user.isVerified === true) {
      throw new BadRequestException('User is already verified!');
    }

    if (userDomainName !== domainName) {
      throw new BadRequestException('Wrong brand!');
    }

    const now = new Date();

    if (user.otpExpiration && user.otpExpiration < now) {
      throw new BadRequestException('Otp is expired');
    }

    if (user.otp !== otp) {
      throw new BadRequestException('Otp is wrong');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { otp: null, otpExpiration: null, isVerified: true },
    });
    const reportCaption = `#تایید_موبایل\n👤 ${user.fullname}\n📞 موبایل: +98${user.phone}\n\n🏷️ برند: ${user?.brand?.domainName}`;
    const bot = this.telegramService.getBot(user.brandId as string);

    await bot.telegram.sendMessage(user?.brand?.reportGroupId as string, reportCaption);

    const tokens = this.generateTokens({ userId: user.id });
    this.setAuthCookie({
      req,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    return tokens;
  }

  async updatePhone(user: User, phone: string, domainName: string) {
    const userDomainName = user.brand?.domainName;

    if (user.isVerified === true) {
      throw new BadRequestException('User is already verified!');
    }

    if (userDomainName !== domainName) {
      throw new BadRequestException('Wrong brand!');
    }

    const userAlreadyVerifiedWithThisPhone = await this.prisma.user.count({
      where: { phone, isVerified: true, brandId: user.brandId },
    });

    if (userAlreadyVerifiedWithThisPhone) {
      throw new ConflictException(`Phone ${phone} already used.`);
    }

    // Start transaction
    return this.prisma.$transaction(async (prisma) => {
      // Delete unverified users with the same phone and brand within the transaction
      await prisma.user.deleteMany({
        where: {
          phone,
          brandId: user.brandId as string,
          isVerified: false, // Only delete unverified users
        },
      });

      const { otp, otpExpiration } = this.generateOtp();

      // Update the current user's phone, OTP, and expiration
      return prisma.user.update({
        where: { id: user.id },
        data: { phone, otp, otpExpiration },
      });
    });
  }

  async sendOtpAgain(user: User, domainName: string) {
    const userDomainName = user.brand?.domainName;

    if (user.isVerified === true) {
      throw new BadRequestException('User is already verified!');
    }

    if (userDomainName !== domainName) {
      throw new BadRequestException('Wrong brand!');
    }

    const { otp, otpExpiration } = this.generateOtp();

    return this.prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiration } });
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

  async login(phone: string, password: string, domainName: string, req: RequestType): Promise<Login> {
    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: {
        domainName,
        deletedAt: null,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: {
        UserPhoneBrandIdUnique: {
          phone,
          brandId: brand.id,
        },
      },
    });

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
    return this.prisma.user.findUnique({ where: { id: userId }, include: { brand: true } });
  }

  getUserFromToken(token: string): Promise<User | null> {
    const decodedToken = this.jwtService.decode(token);
    const id = typeof decodedToken === 'object' && decodedToken !== null ? decodedToken?.userId : null;

    return this.prisma.user.findUnique({ where: { id }, include: { brand: true } });
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
