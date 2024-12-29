/* eslint-disable max-len */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Package, Prisma, Role, TelegramUser } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { v4 as uuid } from 'uuid';

import { arrayToDic, ceilIfNeeded, convertPersianCurrency, jsonToB64Url, pctToDec, roundTo } from '../common/helpers';
import { I18nService } from '../common/i18/i18.service';
import { MinioClientService } from '../minio/minio.service';
import { CallbackData } from '../telegram/telegram.constants';
import { TelegramMessage, TelegramReplyMarkup, TelegramService } from '../telegram/telegram.service';
import { User } from '../users/models/user.model';
import { UsersService } from '../users/users.service';
import { BuyRechargePackageInput } from './dto/buyRechargePackage.input';
import { EnterCostInput } from './dto/enterCost.input';
import { PurchasePaymentRequestInput } from './dto/purchasePaymentRequest.input';
import { RechargePaymentRequestInput } from './dto/rechargePaymentRequest.input';
import { RechargePackage } from './models/rechargePackage.model';

interface RecursiveUser extends User {
  level: number;
}

interface PaymentReq {
  receiptBuffer?: Buffer;
  profitAmount?: number;
  parentProfit?: number;
}

interface PackagePaymentInput {
  package: Package;
  receipt?: string;
  isFree?: boolean;
  isGift?: boolean;
  inRenew: boolean;
  userPackageId: string;
  userPackageName: string;
}

export interface SendBuyPackMessage {
  userId: string;
  user: User;
  receiptBuffer?: Buffer;
  userPackageName: string;
  pack: Package;
  price: number;
  discountedPrice: number;
  sellPrice?: number;
  isFree?: boolean;
  isGift?: boolean;
  profitAmount: number;
  inRenew: boolean;
}

interface GetBuyPackMessages {
  telegramUsers: TelegramUser[];
  buyPackMessages: SendBuyPackMessage[];
  receiptBuffer?: Buffer;
  userPackageId: string;
}

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly minioService: MinioClientService,
    private readonly usersService: UsersService,
    private readonly i18: I18nService,
  ) {}

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

  nestedParentsChargeTxt(firstParentId: string, parentsDic: Record<string, User>): string {
    let txt = '';

    const firstParent = parentsDic?.[firstParentId];

    if (firstParent) {
      txt += `\n\n👨 فروشنده: ${firstParent.fullname}\n💵 شارژ حساب: ${convertPersianCurrency(
        roundTo(firstParent.balance || 0, 0),
      )}`;
    }

    if (firstParent && firstParent?.parentId) {
      txt += this.nestedParentsChargeTxt(firstParent.parentId, parentsDic);
    }

    return txt;
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  nestedBuyPackageTxt(
    firstUserId: string,
    buyPackMessagesDic: Record<string, SendBuyPackMessage>,
    isNested = false,
  ): string {
    let txt = '';

    const buyPackMessage = buyPackMessagesDic?.[firstUserId];

    if (!buyPackMessage) {
      return '';
    }

    if (!isNested) {
      // Set header
      if (buyPackMessage.isFree) {
        txt = `#فعالسازی_بسته_رایگان_روزانه\n📦 ${buyPackMessage.pack.traffic} گیگ - ${buyPackMessage.pack.expirationDays} روزه`;
      } else if (buyPackMessage.isGift) {
        txt = `#فعالسازی_هدیه 🎁\n📦 ${buyPackMessage.pack.traffic} گیگ - ${buyPackMessage.pack.expirationDays} روزه`;
      } else {
        txt = `${buyPackMessage.inRenew ? '#تمدیدـبسته' : '#خریدـبسته'}\n📦 ${buyPackMessage.pack.traffic} گیگ - ${
          buyPackMessage.pack.expirationDays
        } روزه`;
      }

      txt += `\n🔤 نام بسته: ${buyPackMessage.userPackageName}`;
      const packCategory = this.i18.__(`package.category.${buyPackMessage.pack.category}`);
      txt += `\n🧩 نوع بسته: ${packCategory}`;
    }

    const child =
      buyPackMessagesDic?.[
        Object.keys(buyPackMessagesDic).find((userId) => buyPackMessagesDic[userId].user.parentId === firstUserId) || ''
      ];

    if (child && child?.user?.id) {
      txt += `${this.nestedBuyPackageTxt(child?.user?.id, buyPackMessagesDic, true)}`;
    }

    txt += `\n\n👤 ${buyPackMessage.user.fullname}`;

    if (buyPackMessage.user.role === 'ADMIN') {
      txt += `\n💵 شارژ حساب: ${convertPersianCurrency(
        roundTo(buyPackMessage.user.balance - buyPackMessage.discountedPrice, 0),
      )}`;
    }

    txt += `\n📱 موبایل: +98${buyPackMessage.user.phone}`;

    if (!child) {
      const profitPercent = (1 - buyPackMessage.discountedPrice / buyPackMessage.price) * 100;

      if (buyPackMessage.profitAmount) {
        txt += `\n💰 قیمت واقعی: ${convertPersianCurrency(buyPackMessage.price)}`;
        txt += `\n🏷️ قیمت پس از تخفیف: ${convertPersianCurrency(buyPackMessage.discountedPrice)}`;
        txt += `\n📈 سود: ${convertPersianCurrency(buyPackMessage.profitAmount)} (%${roundTo(profitPercent, 1)})`;
      } else {
        txt += `\n💰 قیمت خرید: ${convertPersianCurrency(buyPackMessage.price)}`;
      }
    }

    if (child) {
      const profitPercent = (buyPackMessage.profitAmount / buyPackMessage.discountedPrice) * 100;
      txt += `\n💰 قیمت خرید: ${convertPersianCurrency(buyPackMessage.discountedPrice)}`;
      txt += `\n💸 قیمت فروش: ${convertPersianCurrency(buyPackMessage.sellPrice!)}`;
      txt += `\n📈 سود: ${convertPersianCurrency(buyPackMessage.profitAmount)} (%${roundTo(profitPercent, 1)})`;
    }

    return txt;
  }

  async buyRechargePackage(user: User, input: BuyRechargePackageInput): Promise<User> {
    const rechargePack = await this.prisma.rechargePackage.findUniqueOrThrow({
      where: { id: input.rechargePackageId },
    });
    const paymentId = uuid();

    const { receiptBuffer } = await this.rechargePaymentRequest(user, {
      amount: rechargePack.amount,
      id: paymentId,
      receipt: input.receipt,
    });

    const caption = `#شارژـحساب  -  ${convertPersianCurrency(rechargePack.amount)}\n👤 ${
      user.fullname
    }\n📞 موبایل: +98${user.phone}\n💵 شارژ حساب: ${convertPersianCurrency(
      roundTo(user.balance + rechargePack.amount || 0, 0),
    )}`;

    const telegramUser =
      user?.parentId && (await this.prisma.telegramUser.findUnique({ where: { userId: user.parentId } }));
    const acceptData = { A_CHARGE: paymentId } as CallbackData;
    const rejectData = { R_CHARGE: paymentId } as CallbackData;

    const bot = this.telegramService.getBot(user.brandId);
    const parents = await this.usersService.getAllParents(user.id);
    const parentsDic = arrayToDic(parents);
    const reportCaption = caption + (user?.parentId ? this.nestedParentsChargeTxt(user.parentId, parentsDic) : '');

    if (telegramUser && receiptBuffer) {
      try {
        await bot.telegram.sendPhoto(
          Number(telegramUser.chatId),
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
      } catch (error) {
        console.error(
          `Couldn't send photo to parent (${parentsDic[user.parentId!].phone}) of user for buyRechargePackage\n\n`,
          error,
        );
      }

      await bot.telegram.sendPhoto(user.brand!.reportGroupId!, { source: receiptBuffer }, { caption: reportCaption });
    } else if (receiptBuffer) {
      await bot.telegram.sendPhoto(user.brand!.reportGroupId!, { source: receiptBuffer }, { caption: reportCaption });
    }

    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  }

  async uploadReceiptPermanently(paymentKey: string, receiptId: string): Promise<[Buffer, string]> {
    const receiptData = await this.prisma.file.findUniqueOrThrow({ where: { id: receiptId } });
    const receiptBuffer = await this.minioService.getObject(receiptData.name);
    const uploadPath = `receipt/${paymentKey}.jpg`;

    try {
      await this.minioService.upload([{ filename: uploadPath, buffer: receiptBuffer }]);
      await this.minioService.delete([receiptData.name]);
      await this.prisma.file.delete({ where: { id: receiptId } });
    } catch {
      throw new BadRequestException('Uploading image to minio got failed!');
    }

    return [receiptBuffer, uploadPath];
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

  // eslint-disable-next-line sonarjs/cognitive-complexity
  async purchasePackagePayment(
    user: User,
    input: PackagePaymentInput,
  ): Promise<[Array<Prisma.PrismaPromise<unknown>>, TelegramMessage[]]> {
    const users = [...(await this.getAllParents(user.id)), user];
    const usersDic = arrayToDic(users);
    const buyPackMessages: SendBuyPackMessage[] = [];

    const [receiptBuffer, receiptImage] = input.receipt
      ? await this.uploadReceiptPermanently(input.userPackageId, input.receipt)
      : [];

    const financeTransactions: Array<Prisma.PrismaPromise<unknown>> = [];
    const usersLength = users.length;

    for (let i = 0; i < usersLength; i++) {
      const currentUser = users[i];
      const parent = usersDic?.[currentUser?.parentId || ''];
      const child = users.find((u) => u?.parentId === currentUser.id);

      // const price = ceilTo(
      //   input.package.price * (1 - pctToDec(parent?.appliedDiscountPercent)) * (1 + pctToDec(parent?.profitPercent)),
      //   0,
      // );
      // const notRoundedDiscountedPrice = input.package.price * (1 - pctToDec(currentUser.appliedDiscountPercent));
      // const discountedPrice =
      //   notRoundedDiscountedPrice <= 10 ? notRoundedDiscountedPrice : ceilTo(notRoundedDiscountedPrice, 0);
      // const discountAmount = price - discountedPrice;
      // const sellPrice = child
      //   ? ceilTo(input.package.price * (1 - pctToDec(child.appliedDiscountPercent)), 0)
      //   : undefined;
      // const sellProfit = sellPrice ? sellPrice - discountedPrice : undefined;

      // const finalProfit = sellPrice ? sellProfit : discountAmount;
      // const profitAmount = (parent ? finalProfit : (sellPrice || 0) - discountedPrice) as number;

      const rawPrice =
        input.package.price * (1 - pctToDec(parent?.appliedDiscountPercent)) * (1 + pctToDec(parent?.profitPercent));

      const price = ceilIfNeeded(rawPrice, 0);

      const notRoundedDiscountedPrice = input.package.price * (1 - pctToDec(currentUser.appliedDiscountPercent));

      const discountedPrice = ceilIfNeeded(notRoundedDiscountedPrice, 0);

      const discountAmount = price - discountedPrice;

      const rawSellPrice = child ? input.package.price * (1 - pctToDec(child.appliedDiscountPercent)) : undefined;

      const sellPrice = rawSellPrice !== undefined ? ceilIfNeeded(rawSellPrice, 0) : undefined;

      const sellProfit = sellPrice !== undefined ? sellPrice - discountedPrice : undefined;

      const finalProfit = sellPrice !== undefined ? sellProfit : discountAmount;

      const profitAmount = (parent ? finalProfit : (sellPrice || 0) - discountedPrice) as number;

      const isUserWhoUseThePackage = i === usersLength - 1;
      const shouldSkipTransaction = (input.isFree || input.isGift) && isUserWhoUseThePackage;

      if (!shouldSkipTransaction) {
        financeTransactions.push(
          this.prisma.payment.create({
            data: {
              amount: discountedPrice,
              type: 'PACKAGE_PURCHASE',
              payerId: currentUser.id,
              receiptImage,
              userPackageId: input.userPackageId,
              profitAmount,
            },
          }),
        );
      }

      if (currentUser.role === Role.ADMIN && !shouldSkipTransaction) {
        financeTransactions.push(
          this.prisma.user.update({
            where: {
              id: currentUser.id,
            },
            data: {
              balance: {
                decrement: discountedPrice,
              },
            },
          }),
        );
      }

      buyPackMessages.push({
        discountedPrice,
        profitAmount,
        receiptBuffer,
        sellPrice,
        inRenew: input.inRenew,
        pack: input.package,
        price,
        isFree: input.isFree || false,
        isGift: input.isGift || false,
        user: currentUser,
        userId: currentUser.id,
        userPackageName: input.userPackageName,
      });
    }

    const telegramUsers = await this.prisma.telegramUser.findMany({
      where: {
        userId: {
          in: buyPackMessages.map((b) => b.userId),
        },
      },
    });

    const telegramMessages = await this.getBuyPackMessages({
      buyPackMessages,
      telegramUsers,
      userPackageId: input.userPackageId,
      receiptBuffer,
    });

    return [financeTransactions, telegramMessages];
  }

  // async purchasePaymentRequest(user: User, input: PurchasePaymentRequestInput): Promise<PaymentReq> {
  //   const id = input?.id || uuid();
  //   let receiptBuffer: Buffer | undefined;
  //   let receiptImage: string | undefined;
  //   let parentProfit: number | undefined;
  //   let profitAmount: number | undefined;

  //   if (input?.receipt) {
  //     [receiptBuffer, receiptImage] = await this.uploadReceiptPermanently(id, input.receipt);
  //   }

  //   if (!input.receipt) {
  //     profitAmount = await this.purchasePackByBalance(user, input);
  //   }

  //   if (receiptImage && user.parentId) {
  //     parentProfit = await this.updateParentBalanceByReceipt(user, input);
  //   }

  //   await this.prisma.payment.create({
  //     data: {
  //       id,
  //       amount: input.amount,
  //       type: 'PACKAGE_PURCHASE',
  //       payerId: user.id,
  //       receiptImage,
  //       profitAmount,
  //       parentProfit,
  //     },
  //   });

  //   return { receiptBuffer, profitAmount, parentProfit };
  // }

  async rechargePaymentRequest(user: User, input: RechargePaymentRequestInput): Promise<PaymentReq> {
    const id = input?.id || uuid();
    let receiptBuffer: Buffer | undefined;
    let receiptImage: string | undefined;

    if (input?.receipt) {
      [receiptBuffer, receiptImage] = await this.uploadReceiptPermanently(id, input.receipt);
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
      },
    });

    await this.prisma.payment.create({
      data: {
        id,
        amount: input.amount,
        type: 'WALLET_RECHARGE',
        payerId: user.id,
        receiptImage,
      },
    });

    return { receiptBuffer };
  }

  // async updateParentBalanceByReceiptOld(user: User, parent: User, input: RechargePaymentRequestInput): Promise<number> {
  //   let parentProfit: number;

  //   if (!user.parentId) {
  //     throw new BadRequestException("User doesn't have parent!");
  //   }

  //   parentProfit = input.amount * (parent.profitBalance / parent.balance);
  //   const realProfit = parentProfit - (input?.profitAmount || 0);

  //   if (Number.isNaN(parentProfit)) {
  //     parentProfit = 0;
  //   }

  //   await this.prisma.user.update({
  //     where: {
  //       id: user.parentId,
  //     },
  //     data: {
  //       balance: {
  //         decrement: input.amount,
  //       },
  //       profitBalance: {
  //         decrement: parentProfit,
  //       },
  //       totalProfit: {
  //         increment: realProfit,
  //       },
  //     },
  //   });

  //   return parentProfit;
  // }

  async updateParentBalanceByReceipt(user: User, input: PurchasePaymentRequestInput): Promise<number> {
    const parentProfit = (input?.discountedAmount || input.amount) - input.parentPurchaseAmount!;

    await this.prisma.user.update({
      where: {
        id: user.parentId!,
      },
      data: {
        balance: {
          decrement: input.parentPurchaseAmount!,
        },
        totalProfit: {
          increment: parentProfit,
        },
      },
    });

    return parentProfit;
  }

  // async purchasePackByBalanceOld(user: User, input: PurchasePaymentRequestInput) {
  //   let profitAmount: number | undefined;

  //   // pay with wallet balance
  //   profitAmount = input.amount * (user.profitBalance / user.balance);

  //   if (Number.isNaN(profitAmount)) {
  //     profitAmount = 0;
  //   }

  //   await this.prisma.user.update({
  //     where: {
  //       id: user.id,
  //     },
  //     data: {
  //       balance: {
  //         decrement: input.amount,
  //       },
  //       profitBalance: {
  //         decrement: profitAmount,
  //       },
  //       totalProfit: {
  //         increment: profitAmount,
  //       },
  //     },
  //   });

  //   return profitAmount;
  // }

  async purchasePackByBalance(user: User, input: PurchasePaymentRequestInput) {
    // pay with wallet balance
    const profitAmount = input?.discountedAmount ? input.amount - input.discountedAmount : undefined;

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        balance: {
          decrement: input.discountedAmount || input.amount,
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

  async getBuyPackMessages(input: GetBuyPackMessages): Promise<TelegramMessage[]> {
    const telegramMessages: TelegramMessage[] = [];
    const telegramUsersDic = arrayToDic(input.telegramUsers, 'userId');
    const buyPackMessagesDic = arrayToDic(input.buyPackMessages, 'userId');

    for (const buyPackMessage of input.buyPackMessages) {
      if (buyPackMessage.user.role !== 'ADMIN') {
        continue;
      }

      const caption = this.nestedBuyPackageTxt(buyPackMessage.userId, buyPackMessagesDic);
      const chatId = Number(telegramUsersDic?.[buyPackMessage.userId]?.chatId);
      let source: Buffer | undefined;
      let replyMarkup: TelegramReplyMarkup | undefined;

      if (!chatId) {
        continue;
      }

      if (input.receiptBuffer) {
        source = input.receiptBuffer;
        const rejectData = { R_PACK: input.userPackageId } as CallbackData;
        const acceptData = { A_PACK: input.userPackageId } as CallbackData;

        const child =
          buyPackMessagesDic?.[
            Object.keys(buyPackMessagesDic).find(
              (userId) => buyPackMessagesDic[userId].user.parentId === buyPackMessage.userId,
            ) || ''
          ];

        if (child?.user?.role !== 'ADMIN') {
          replyMarkup = {
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
          };
        }
      }

      if (!buyPackMessage.user.parentId) {
        const brand = await this.prisma.brand.findUniqueOrThrow({ where: { id: buyPackMessage.user.brandId } });
        telegramMessages.push({
          caption,
          chatId: Number(brand.reportGroupId),
          source,
          brandId: buyPackMessage.user.brandId,
        });
      }

      telegramMessages.push({
        caption,
        chatId,
        source,
        reply_markup: replyMarkup,
        brandId: buyPackMessage.user.brandId,
      });
    }

    return telegramMessages;
  }
}
