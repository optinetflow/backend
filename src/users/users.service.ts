/* eslint-disable no-return-await */
import { BadRequestException, Injectable } from '@nestjs/common';
import { ClientStat, UserPackage } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';

import { PasswordService } from '../auth/password.service';
import { isRecentlyConnected, prefixFile } from '../common/helpers';
import { TelegramUser } from '../telegram/models/telegramUser.model';
import { XuiService } from '../xui/xui.service';
import { ChangePasswordInput } from './dto/change-password.input';
import { UpdateUserInput } from './dto/update-user.input';
import { UpdateChildInput } from './dto/updateChild.input';
import { Child, User } from './models/user.model';

interface RecursiveUser extends User {
  level: number;
}

const prefixAvatar = (telegram?: TelegramUser | null): void => {
  if (telegram?.smallAvatar && telegram?.bigAvatar) {
    telegram.smallAvatar = prefixFile(telegram.smallAvatar);
    telegram.bigAvatar = prefixFile(telegram.bigAvatar);
  }
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private passwordService: PasswordService,
    private xuiService: XuiService,
  ) {}

  async getUser(user: User): Promise<User> {
    const fullUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        telegram: true,
        bankCard: true,
        userGift: { include: { giftPackage: true }, where: { isGiftUsed: false } },
        parent: { include: { telegram: true, bankCard: true } },
        brand: true,
      },
    });

    prefixAvatar(fullUser?.telegram);

    return fullUser;
  }

  async getChildren(user: User): Promise<Child[]> {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const children = await this.prisma.user.findMany({
      where: { parentId: user.id },
      include: {
        telegram: true,
        userPackage: {
          where: { deletedAt: null, OR: [{ finishedAt: null }, { finishedAt: { gte: threeDaysAgo } }] },
          include: { stat: true },
        },
        children: {
          include: {
            userPackage: {
              where: { deletedAt: null, OR: [{ finishedAt: null }, { finishedAt: { gte: threeDaysAgo } }] },
              include: { stat: true },
            },
            children: {
              include: {
                userPackage: {
                  where: { deletedAt: null, OR: [{ finishedAt: null }, { finishedAt: { gte: threeDaysAgo } }] },
                  include: { stat: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const resolvedChildren: Child[] = children.map((child) => {
      const allUserPackage = [
        ...child.userPackage,
        ...(child?.children?.reduce<Array<UserPackage & { stat: ClientStat }>>(
          (all, current) => [
            ...all,
            ...current.userPackage,
            ...(current?.children?.reduce<Array<UserPackage & { stat: ClientStat }>>(
              (allSub, currentSub) => [...allSub, ...currentSub.userPackage],
              [],
            ) || []),
          ],
          [],
        ) || []),
      ];

      return {
        ...child,
        lastConnectedAt:
          allUserPackage?.sort((a, b) => {
            const dateA = a.stat.lastConnectedAt ? a.stat.lastConnectedAt.getTime() : Number.NEGATIVE_INFINITY;
            const dateB = b.stat.lastConnectedAt ? b.stat.lastConnectedAt.getTime() : Number.NEGATIVE_INFINITY;

            return dateB - dateA;
          })?.[0]?.stat?.lastConnectedAt || undefined,
        activePackages: allUserPackage.length || 0,
        onlinePackages: allUserPackage.reduce<number>(
          (onlines, pack) =>
            pack.stat.lastConnectedAt && isRecentlyConnected(pack.stat.lastConnectedAt) ? onlines + 1 : onlines,
          0,
        ),
      };
    });

    children.forEach((child) => prefixAvatar(child?.telegram));

    return resolvedChildren;
  }

  async updateUser(userId: string, data: UpdateUserInput) {
    const { cardBandNumber, cardBandName, ...updatedData } = data;

    if (cardBandNumber && cardBandName) {
      const cardData = {
        userId,
        name: cardBandName,
        number: cardBandNumber,
      };

      const hasBankCard = await this.prisma.bankCard.findFirst({ where: { userId } });

      await (hasBankCard
        ? this.prisma.bankCard.update({
            where: {
              id: hasBankCard.id,
            },
            data: cardData,
          })
        : this.prisma.bankCard.create({
            data: cardData,
          }));
    }

    return this.prisma.user.update({
      data: updatedData,
      where: {
        id: userId,
      },
    });
  }

  async getAllParents(userId: string): Promise<RecursiveUser[]> {
    return this.prisma.$queryRaw`
      WITH RECURSIVE parents AS (
        SELECT u.*, 0 AS level
        FROM "public"."User" u
        WHERE u.id = ${userId}::uuid
        UNION ALL
        SELECT u.*, p.level + 1
        FROM "public"."User" u
        INNER JOIN parents p ON u.id = p."parentId"
      )
      SELECT * FROM parents
      WHERE parents.id != ${userId}::uuid
      ORDER BY level;
    `;
  }

  async getAllChildren(userId: string): Promise<RecursiveUser> {
    return this.prisma.$queryRaw`
      WITH RECURSIVE children AS (
        SELECT u.*, 0 AS level
        FROM "public"."User" u
        WHERE u.id = ${userId}::uuid
        UNION ALL
        SELECT u.*, c.level + 1
        FROM "public"."User" u
        INNER JOIN children c ON c.id = u."parentId"
      )
      SELECT * FROM children
      WHERE children.id != ${userId}::uuid
      ORDER BY level;
    `;
  }

  async updateChild(user: User, input: UpdateChildInput) {
    const { childId, ...data } = input;
    let appliedDiscountPercent: number | undefined;

    const child = await this.prisma.user.findUniqueOrThrow({ where: { id: childId } });

    if (child.parentId !== user.id) {
      throw new BadRequestException('Access denied! You should be parent of this child.');
    }

    if (input.role && user.maxRechargeDiscountPercent !== 100) {
      throw new BadRequestException('Access denied!');
    }

    if (typeof input.isDisabled === 'boolean') {
      await this.xuiService.toggleUserBlock(childId, input.isDisabled);
    }

    if (input?.initialDiscountPercent) {
      const parentDiscount = (user.appliedDiscountPercent || 0) / 100;
      const parentProfit = user.profitPercent / 100;
      const childDiscount = input?.initialDiscountPercent / 100;

      appliedDiscountPercent =
        ((childDiscount + parentDiscount - parentDiscount * childDiscount - parentProfit) * 100) / (1 - parentProfit);
    }

    return this.prisma.user.update({
      data: {
        ...data,
        ...(data?.password && { password: await this.passwordService.hashPassword(data.password) }),
        ...(appliedDiscountPercent && { appliedDiscountPercent }),
      },
      where: {
        parentId: user.id,
        id: childId,
      },
    });
  }

  async changePassword(userId: string, userPassword: string, changePassword: ChangePasswordInput) {
    const isPasswordValid = await this.passwordService.validatePassword(changePassword.oldPassword, userPassword);

    if (!isPasswordValid) {
      throw new BadRequestException('رمز عبور اشتباه است');
    }

    const hashedPassword = await this.passwordService.hashPassword(changePassword.newPassword);

    return this.prisma.user.update({
      data: {
        password: hashedPassword,
      },
      where: { id: userId },
    });
  }

  async getUserByPhoneAndDomainName(phone: string, domainName: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        phone,
        brand: {
          domainName,
        },
      },
      include: {
        brand: true,
      },
    });

    if (!user) {
      throw new BadRequestException('کاربر یافت نشد');
    }

    return user;
  }
}
