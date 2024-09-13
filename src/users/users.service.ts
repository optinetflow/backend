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

  async updateChild(user: User, input: UpdateChildInput) {
    const { childId, ...data } = input;

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

    return this.prisma.user.update({
      data: {
        ...data,
        ...(data?.password && { password: await this.passwordService.hashPassword(data.password) }),
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
      throw new BadRequestException('Invalid password');
    }

    const hashedPassword = await this.passwordService.hashPassword(changePassword.newPassword);

    return this.prisma.user.update({
      data: {
        password: hashedPassword,
      },
      where: { id: userId },
    });
  }

  async getUserByPhoneAndDomainName(phone: string, domainName: string): Promise<User | null> {
    return this.prisma.user.findFirst({
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
  }
}
