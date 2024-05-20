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
import { EnterCostInput } from './dto/enterCost.input';
import { PurchasePaymentRequestInput } from './dto/purchasePaymentRequest.input';
import { RechargePaymentRequestInput } from './dto/rechargePaymentRequest.input';
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

  private readonly reportGroupId = this.configService.get('telGroup')!.report;

  async getRechargePackages(user: User): Promise<RechargePackage[]> {
    return this.prisma.rechargePackage.findMany({
      where: {
        deletedAt: null,
        discountPercent: {
          lte: user.maxRechargeDiscountPercent || 50,
        },
      },
      orderBy: {
        discountPercent: 'asc',
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
    const { receiptBuffer, parentProfit } = await this.rechargePaymentRequest(user, {
      amount: chargeAmount,
      profitAmount: isFullProfit ? chargeAmount : profitAmount,
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

  async uploadReceiptPermanently(paymentId: string, receiptId: string): Promise<[Buffer, string]> {
    const receiptData = await this.prisma.file.findUniqueOrThrow({ where: { id: receiptId } });
    const receiptBuffer = await this.minioService.getObject(receiptData.name);
    const uploadPath = `receipt/${paymentId}.jpg`;

    try {
      await this.minioService.upload([{ filename: uploadPath, buffer: receiptBuffer }]);
      await this.minioService.delete([receiptData.name]);
      await this.prisma.file.delete({ where: { id: receiptId } });
    } catch {
      throw new BadRequestException('Uploading image to minio got failed!');
    }

    return [receiptBuffer, uploadPath];
  }

  async purchasePaymentRequest(user: User, input: PurchasePaymentRequestInput): Promise<PaymentReq> {
    const id = input?.id || uuid();
    let receiptBuffer: Buffer | undefined;
    let receiptImage: string | undefined;
    let parentProfit: number | undefined;
    let profitAmount: number | undefined;

    if (input?.receipt) {
      [receiptBuffer, receiptImage] = await this.uploadReceiptPermanently(id, input.receipt);
    }

    if (!input.receipt) {
      profitAmount = await (user.appliedDiscountPercent
        ? this.purchasePackByBalance(user, input)
        : this.purchasePackByBalanceOld(user, input));
    }

    if (receiptImage && user.parentId) {
      const parent = await this.prisma.user.findUniqueOrThrow({ where: { id: user.parentId } })!;

      parentProfit = await (parent?.appliedDiscountPercent
        ? this.updateParentBalanceByReceipt(user, parent, input)
        : this.updateParentBalanceByReceiptOld(user, parent, input));
    }

    await this.prisma.payment.create({
      data: {
        id,
        amount: input.amount,
        type: 'PACKAGE_PURCHASE',
        payerId: user.id,
        receiptImage,
        profitAmount,
        parentProfit,
      },
    });

    return { receiptBuffer, profitAmount, parentProfit };
  }

  async rechargePaymentRequest(user: User, input: RechargePaymentRequestInput): Promise<PaymentReq> {
    const id = input?.id || uuid();
    let receiptBuffer: Buffer | undefined;
    let receiptImage: string | undefined;
    let parentProfit: number | undefined;
    let profitAmount: number | undefined;

    if (input?.receipt) {
      [receiptBuffer, receiptImage] = await this.uploadReceiptPermanently(id, input.receipt);
    }

    if (receiptImage && user.parentId) {
      const parent = await this.prisma.user.findUniqueOrThrow({ where: { id: user.parentId } })!;

      parentProfit = await (user.appliedDiscountPercent
        ? this.updateParentBalanceByReceipt(user, parent, input)
        : this.updateParentBalanceByReceiptOld(user, parent, input));
    }

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

    await this.prisma.payment.create({
      data: {
        id,
        amount: input.amount,
        type: 'WALLET_RECHARGE',
        payerId: user.id,
        receiptImage,
        profitAmount: profitAmount || input.profitAmount,
        parentProfit,
      },
    });

    return { receiptBuffer, profitAmount, parentProfit };
  }

  async updateParentBalanceByReceiptOld(user: User, parent: User, input: RechargePaymentRequestInput): Promise<number> {
    let parentProfit: number;

    if (!user.parentId) {
      throw new BadRequestException("User doesn't have parent!");
    }

    parentProfit = input.amount * (parent.profitBalance / parent.balance);
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

    return parentProfit;
  }

  async updateParentBalanceByReceipt(user: User, parent: User, input: PurchasePaymentRequestInput): Promise<number> {
    let parentProfit: number;

    if (!parent?.appliedDiscountPercent) {
      throw new BadRequestException("Parent doesn't have appliedDiscountPercent!");
    }

    parentProfit = input.amount * (parent.appliedDiscountPercent - (user?.appliedDiscountPercent || 0));

    if (Number.isNaN(parentProfit)) {
      parentProfit = 0;
    }

    await this.prisma.user.update({
      where: {
        id: user.parentId!,
      },
      data: {
        balance: {
          decrement: input.amount,
        },
        profitBalance: {
          decrement: parentProfit,
        },
        totalProfit: {
          increment: parentProfit,
        },
      },
    });

    return parentProfit;
  }

  async purchasePackByBalanceOld(user: User, input: PurchasePaymentRequestInput) {
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

  async purchasePackByBalance(user: User, input: PurchasePaymentRequestInput) {
    // pay with wallet balance
    const profitAmount = input.amount * user.appliedDiscountPercent!;

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

  async enterCost(user: User, input: EnterCostInput): Promise<User> {
    if (user.maxRechargeDiscountPercent !== 100) {
      throw new BadRequestException('Access denied!');
    }

    if (input.amount <= 0) {
      throw new BadRequestException('Invalid amount!');
    }

    if (!['EXTERNAL_SERVER_COST', 'IRAN_SERVER_COST'].includes(input.type)) {
      throw new BadRequestException('Invalid type!');
    }

    const [userModel] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          profitBalance: {
            decrement: input.amount,
          },
          totalProfit: {
            decrement: input.amount,
          },
        },
      }),
      this.prisma.payment.create({
        data: {
          amount: -input.amount,
          type: input.type,
          payerId: user.id,
          description: input.description,
          status: 'APPLIED',
          profitAmount: -input.amount,
        },
      }),
    ]);

    return userModel;
  }
}
