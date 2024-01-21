/* eslint-disable max-len */
import { BadRequestException, Injectable, Logger, NotAcceptableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User as UserPrisma } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { v4 as uuid } from 'uuid';

import { convertPersianCurrency, jsonToB64Url, roundTo } from '../common/helpers';
import { Context } from '../common/interfaces/context.interface';
import { MinioClientService } from '../minio/minio.service';
import { CallbackData } from '../telegram/telegram.constants';
import { User } from '../users/models/user.model';
import { BuyRechargePackageInput } from './dto/buyRechargePackage.input';
import { PaymentRequestInput } from './dto/paymentRequest.input';
import { RechargePackage } from './models/rechargePackage.model';

interface PaymentReq {
  receiptBuffer?: Buffer;
  profitAmount?: number;
  parentProfit?: number;
}

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    @InjectBot()
    private readonly bot: Telegraf<Context>,
    private readonly minioService: MinioClientService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(PaymentService.name);

  private readonly reportGroupId = this.configService.get('telegraf')!.reportGroupId;

  async getRechargePackages(user: User): Promise<RechargePackage[]> {
    return this.prisma.rechargePackage.findMany({
      where: {
        deletedAt: null,
        discountPercent: {
          lte: user.maxRechargeDiscountPercent || 50,
        },
      },
    });
  }

  async buyRechargePackage(user: User, input: BuyRechargePackageInput): Promise<User> {
    const rechargePack = await this.prisma.rechargePackage.findUniqueOrThrow({
      where: { id: input.rechargePackageId },
    });
    const paymentId = uuid();

    let chargeAmount = rechargePack.amount / ((100 - rechargePack.discountPercent) / 100);
    const isFullProfit = !Number.isFinite(chargeAmount);

    if (isFullProfit) {
      chargeAmount = rechargePack.amount;
    }

    const profitAmount = chargeAmount - rechargePack.amount;
    const { receiptBuffer, parentProfit } = await this.paymentRequest(user, {
      amount: chargeAmount,
      profitAmount: isFullProfit ? chargeAmount : profitAmount,
      type: 'WALLET_RECHARGE',
      id: paymentId,
      receipt: input.receipt,
    });

    const approximateFullProfit = isFullProfit ? chargeAmount : profitAmount;
    const approximateProfit = parentProfit ? parentProfit - profitAmount : approximateFullProfit;
    const caption = `#شارژـحساب  -  ${convertPersianCurrency(rechargePack.amount)}\n👤 ${user.firstname} ${
      user.lastname
    }\n⚡مقدار شارژ: ${convertPersianCurrency(roundTo(chargeAmount, 0))}\n📞 موبایل: +98${
      user.phone
    }\n💵 سود تقریبی: ${convertPersianCurrency(roundTo(approximateProfit, 0))}`;

    if (user.parentId) {
      const acceptData = { A_CHARGE: paymentId } as CallbackData;
      const rejectData = { R_CHARGE: paymentId } as CallbackData;

      const telegramUser = await this.prisma.telegramUser.findUnique({ where: { userId: user.parentId } });

      if (receiptBuffer) {
        if (telegramUser) {
          await this.bot.telegram.sendPhoto(
            Number(telegramUser.id),
            { source: receiptBuffer },
            {
              caption,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      callback_data: jsonToB64Url(rejectData as Record<string, string>),
                      text: '❌ رد',
                    },
                    {
                      callback_data: jsonToB64Url(acceptData as Record<string, string>),
                      text: '✅ تایید',
                    },
                  ],
                ],
              },
            },
          );
        }

        const parent = await this.prisma.user.findUnique({ where: { id: user.parentId } });
        const reportCaption =
          caption +
          `\n\n👨 مارکتر: ${parent?.firstname} ${parent?.lastname}\n💵 شارژ حساب: ${convertPersianCurrency(
            roundTo(parent?.balance || 0, 0),
          )}`;
        await this.bot.telegram.sendPhoto(this.reportGroupId, { source: receiptBuffer }, { caption: reportCaption });
      }
    } else if (receiptBuffer) {
      await this.bot.telegram.sendPhoto(this.reportGroupId, { source: receiptBuffer }, { caption });
    }

    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  }

  async paymentRequest(user: User, input: PaymentRequestInput): Promise<PaymentReq> {
    const id = input?.id || uuid();
    let receiptBuffer: Buffer | undefined;
    let receiptImage: string | undefined;

    if (input?.receipt) {
      const receiptData = await this.prisma.file.findUniqueOrThrow({ where: { id: input.receipt } });
      receiptBuffer = await this.minioService.getObject(receiptData.name);
      const uploadPath = `receipt/${id}.jpg`;

      try {
        await this.minioService.upload([{ filename: uploadPath, buffer: receiptBuffer }]);
        await this.minioService.delete([receiptData.name]);
        await this.prisma.file.delete({ where: { id: input.receipt } });
      } catch {
        throw new BadRequestException('Uploading image to minio got failed!');
      }

      receiptImage = uploadPath;
    }

    let parentProfit: number | undefined;
    let profitAmount: number | undefined;

    if (input.receipt && user.parentId) {
      [profitAmount, parentProfit] = await this.updateParentBalanceByReceipt(user, input, receiptImage);
    }

    if (input.type === 'PACKAGE_PURCHASE' && !input.receipt) {
      profitAmount = await this.purchasePackByBalance(user, input);
    }

    if (input.type === 'WALLET_RECHARGE' && input.receipt) {
      if (!receiptImage) {
        throw new BadRequestException('Error in uploading receipt image.');
      }

      await this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          balance: {
            increment: input.amount,
          },
          profitBalance: {
            increment: input.profitAmount,
          },
        },
      });
    }

    await this.prisma.payment.create({
      data: {
        id,
        amount: input.amount,
        type: input.type,
        payerId: user.id,
        receiptImage,
        profitAmount: profitAmount || input.profitAmount,
        parentProfit,
      },
    });

    return { receiptBuffer, profitAmount, parentProfit };
  }

  async updateParentBalanceByReceipt(user: User, input: PaymentRequestInput, receiptImage: string | undefined) {
    let profitAmount: number | undefined;
    let parentProfit: number | undefined;

    if (!receiptImage) {
      throw new BadRequestException('Error in uploading receipt image, receiptImage is undefined!');
    }

    if (!user.parentId) {
      throw new BadRequestException("User doesn't have parent!");
    }

    const parent = await this.prisma.user.findUnique({ where: { id: user.parentId } });

    parentProfit = input.amount * (parent!.profitBalance / parent!.balance);
    const realProfit = parentProfit - (input?.profitAmount || 0);

    if (Number.isNaN(parentProfit)) {
      parentProfit = 0;
    }

    await this.prisma.user.update({
      where: {
        id: user.parentId,
      },
      data: {
        balance: {
          decrement: input.amount,
        },
        profitBalance: {
          decrement: parentProfit,
        },
        totalProfit: {
          increment: realProfit,
        },
      },
    });

    return [profitAmount, parentProfit];
  }

  async purchasePackByBalance(user: User, input: PaymentRequestInput) {
    let profitAmount: number | undefined;

    // pay with wallet balance
    profitAmount = input.amount * (user.profitBalance / user.balance);

    if (Number.isNaN(profitAmount)) {
      profitAmount = 0;
    }

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        balance: {
          decrement: input.amount,
        },
        profitBalance: {
          decrement: profitAmount,
        },
        totalProfit: {
          increment: profitAmount,
        },
      },
    });

    return profitAmount;
  }

  async acceptRechargePack(paymentId: string): Promise<void> {
    await this.prisma.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        status: 'APPLIED',
      },
    });
  }

  async rejectRechargePack(paymentId: string): Promise<User> {
    const payment = await this.prisma.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        status: 'REJECTED',
      },
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payment.payerId } });

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        balance: {
          decrement: payment.amount,
        },
        profitBalance: {
          decrement: payment.profitAmount,
        },
      },
    });

    const realProfit = payment.parentProfit - (payment?.profitAmount || 0);
    await this.prisma.user.update({
      where: {
        id: user.parentId!,
      },
      data: {
        balance: {
          increment: payment.amount,
        },
        profitBalance: {
          increment: payment.parentProfit,
        },
        totalProfit: {
          decrement: realProfit,
        },
      },
    });

    return user;
  }
}
