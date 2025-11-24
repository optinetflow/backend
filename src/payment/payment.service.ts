/* eslint-disable max-len */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Country, Package, Prisma, Role, Server, TelegramUser } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { v4 as uuid } from 'uuid';

import {
  arrayToDic,
  ceilIfNeeded,
  convertPersianCurrency,
  countryCodeToFlag,
  extractSubdomain,
  floorTo,
  jsonToB64Url,
  pctToDec,
  roundTo,
} from '../common/helpers';
import { I18nService } from '../common/i18/i18.service';
import { MinioClientService } from '../minio/minio.service';
import { bundleGroupSizes, longTermPackages } from '../package/package.constant';
import { CallbackData } from '../telegram/telegram.constants';
import { TelegramMessage, TelegramReplyMarkup, TelegramService } from '../telegram/telegram.service';
import { TelegramErrorHandler } from '../telegram/telegram-error-handler';
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
  server: Server;
  bundleGroupSize?: number;
  durationMonths?: number;
  country: Country;
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
  bundleGroupSize?: number;
  durationMonths?: number;
  country: Country;
}

interface GetBuyPackMessages {
  telegramUsers: TelegramUser[];
  buyPackMessages: SendBuyPackMessage[];
  receiptBuffer?: Buffer;
  userPackageId: string;
  server: Server;
  bundleGroupSize?: number;
}

interface CalculateUserPricingInput {
  packagePrice: number;
  currentUser: User;
  parentUser?: User;
  childUser?: User;
  bundleGroupSize?: number;
  isChildEndUser: boolean;
  durationMonths?: number;
}

interface CalculateLongTermPricingInput {
  packagePrice: number;
  parentUser: User;
  durationMonths: number;
}

interface CalculateGroupPricingInput {
  packagePrice: number;
  parentUser: User;
  bundleGroupSize: number;
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
  nestedBuyPackageTxt({
    firstUserId,
    buyPackMessagesDic,
    isNested = false,
    server,
  }: {
    firstUserId: string;
    buyPackMessagesDic: Record<string, SendBuyPackMessage>;
    isNested?: boolean;
    server: Server;
  }): string {
    let txt = '';

    const buyPackMessage = buyPackMessagesDic?.[firstUserId];
    const isBundleGroup = Boolean(buyPackMessage?.bundleGroupSize);
    const isLongTerm = Boolean(buyPackMessage?.durationMonths);
    const paidByBalance =
      buyPackMessage.user.balance - buyPackMessage.price > 0 ? buyPackMessage.price : buyPackMessage.user.balance;

    const newBalance =
      buyPackMessage.user.role === 'ADMIN'
        ? buyPackMessage.user.balance - buyPackMessage.discountedPrice
        : buyPackMessage.user.balance - paidByBalance;

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
        txt = `${buyPackMessage.inRenew ? '#تمدیدـبسته' : '#خریدـبسته'}${isBundleGroup ? ' #خریدـگروهی' : ''}${
          isLongTerm ? ' #خریدـطولانیـمدت' : ''
        }\n📦 ${isBundleGroup ? `${buyPackMessage.bundleGroupSize} تا ` : ''}${buyPackMessage.pack.traffic} گیگ - ${
          buyPackMessage.pack.expirationDays
        } روزه`;
      }

      txt += `\n🔤 نام بسته: ${buyPackMessage.userPackageName}`;
      const packCategory = this.i18.__(`package.category.${buyPackMessage.pack.category}`);
      txt += `\n🧩 نوع بسته: ${packCategory} | ${countryCodeToFlag(buyPackMessage.country)} | ${extractSubdomain(
        server.domain,
      )}`;
    }

    const child =
      buyPackMessagesDic?.[
        Object.keys(buyPackMessagesDic).find((userId) => buyPackMessagesDic[userId].user.parentId === firstUserId) || ''
      ];

    if (child && child?.user?.id) {
      txt += `${this.nestedBuyPackageTxt({
        firstUserId: child?.user?.id,
        buyPackMessagesDic,
        isNested: true,
        server,
      })}`;
    }

    txt += `\n\n👤 ${buyPackMessage.user.fullname}`;

    if (buyPackMessage.user.role === 'ADMIN' || buyPackMessage.user.balance > 0) {
      txt += `\n💵 شارژ حساب: ${convertPersianCurrency(floorTo(newBalance, 0))}`;
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

      if (buyPackMessage.user.balance > 0 && buyPackMessage.user.role === Role.USER) {
        txt += `\n💰 مبلغ کسر شده از کیف پول: ${convertPersianCurrency(floorTo(paidByBalance, 0))}`;
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
      await TelegramErrorHandler.safeTelegramCall(
        () =>
          bot.telegram.sendPhoto(
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
          ),
        'Send recharge package receipt to parent',
        telegramUser.chatId?.toString() || 'unknown',
      );

      await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.sendPhoto(user.brand!.reportGroupId!, { source: receiptBuffer }, { caption: reportCaption }),
        'Send recharge package receipt to report group',
        user.brand!.reportGroupId,
      );
    } else if (receiptBuffer) {
      await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.sendPhoto(user.brand!.reportGroupId!, { source: receiptBuffer }, { caption: reportCaption }),
        'Send recharge package receipt to report group (no parent)',
        user.brand!.reportGroupId,
      );
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

  private calculateGroupPricing(input: CalculateGroupPricingInput) {
    const { packagePrice, parentUser, bundleGroupSize } = input;
    const maxUserDiscount = (parentUser?.profitPercent / (100 + parentUser?.profitPercent)) * 100;
    const maxGroupDiscount = parentUser?.maxGroupDiscount || maxUserDiscount;
    const discount = bundleGroupSizes.find((size) => size.bundleGroupSize === bundleGroupSize)?.discount;

    if (!discount) {
      throw new BadRequestException('Discount not found!');
    }

    const rawPrice =
      packagePrice * (1 - pctToDec(parentUser?.appliedDiscountPercent)) * (1 + pctToDec(parentUser?.profitPercent));
    const price = ceilIfNeeded(rawPrice, 0) * bundleGroupSize;

    // Calculate discounted price for current user
    const rawDiscountedPrice = price * (1 - discount * pctToDec(maxGroupDiscount));
    const discountedPrice = ceilIfNeeded(rawDiscountedPrice, 0);

    // Calculate discount amount
    const discountAmount = price - discountedPrice;

    // Calculate profit amounts
    const finalProfit = discountAmount;
    const profitAmount = ceilIfNeeded(parentUser ? finalProfit : (discountAmount || 0) - discountedPrice, 0);

    return {
      price,
      discountedPrice,
      discountAmount,
      sellPrice: undefined,
      profitAmount,
    };
  }

  private calculateLongTermPricing(input: CalculateLongTermPricingInput) {
    const { packagePrice, parentUser, durationMonths } = input;
    const maxUserDiscount = (parentUser?.profitPercent / (100 + parentUser?.profitPercent)) * 100;
    const maxBundleDiscount = parentUser?.maxGroupDiscount || maxUserDiscount;
    const discount = longTermPackages.find((pack) => pack.durationMonths === durationMonths)?.discount;

    if (!discount) {
      throw new BadRequestException('Discount not found!');
    }

    const rawPrice =
      packagePrice * (1 - pctToDec(parentUser?.appliedDiscountPercent)) * (1 + pctToDec(parentUser?.profitPercent));
    const price = ceilIfNeeded(rawPrice, 0) * durationMonths;

    // Calculate discounted price for current user
    const rawDiscountedPrice = price * (1 - discount * pctToDec(maxBundleDiscount));
    const discountedPrice = ceilIfNeeded(rawDiscountedPrice, 0);

    // Calculate discount amount
    const discountAmount = price - discountedPrice;

    // Calculate profit amounts
    const finalProfit = discountAmount;
    const profitAmount = ceilIfNeeded(parentUser ? finalProfit : (discountAmount || 0) - discountedPrice, 0);

    return {
      price,
      discountedPrice,
      discountAmount,
      sellPrice: undefined,
      profitAmount,
    };
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  private calculateUserPricing(input: CalculateUserPricingInput) {
    const { packagePrice, currentUser, parentUser, childUser, bundleGroupSize, isChildEndUser, durationMonths } = input;

    if (bundleGroupSize && parentUser && !childUser) {
      return this.calculateGroupPricing({ ...input, bundleGroupSize, parentUser });
    }

    if (durationMonths && parentUser && !childUser) {
      return this.calculateLongTermPricing({ ...input, durationMonths, parentUser });
    }

    // Calculate the base price including parent's discount and profit margin
    const rawPrice =
      packagePrice * (1 - pctToDec(parentUser?.appliedDiscountPercent)) * (1 + pctToDec(parentUser?.profitPercent));
    const price = ceilIfNeeded(rawPrice, 0) * (bundleGroupSize || 1) * (durationMonths || 1);

    // Calculate discounted price for current user
    const rawDiscountedPrice = packagePrice * (1 - pctToDec(currentUser.appliedDiscountPercent));
    const discountedPrice = ceilIfNeeded(rawDiscountedPrice, 0) * (bundleGroupSize || 1) * (durationMonths || 1);

    // Calculate discount amount
    const discountAmount = price - discountedPrice;

    // Calculate sell price if user has children
    const rawSellPrice = childUser ? packagePrice * (1 - pctToDec(childUser.appliedDiscountPercent)) : undefined;
    const groupSellPrice =
      bundleGroupSize && isChildEndUser
        ? this.calculateGroupPricing({
            bundleGroupSize,
            packagePrice,
            parentUser: currentUser,
          }).discountedPrice
        : undefined;
    const longTermSellPrice =
      durationMonths && isChildEndUser
        ? this.calculateLongTermPricing({
            durationMonths,
            packagePrice,
            parentUser: currentUser,
          }).discountedPrice
        : undefined;
    const sellPrice = childUser
      ? groupSellPrice ||
        longTermSellPrice ||
        ceilIfNeeded(rawSellPrice!, 0) * (bundleGroupSize || 1) * (durationMonths || 1)
      : undefined;

    // Calculate profit amounts
    const sellProfit = sellPrice !== undefined ? sellPrice - discountedPrice : undefined;
    const finalProfit = sellPrice !== undefined ? sellProfit : discountAmount;
    const profitAmount = ceilIfNeeded((parentUser ? finalProfit : (sellPrice || 0) - discountedPrice) as number, 0);

    return {
      price,
      discountedPrice,
      discountAmount,
      sellPrice,
      profitAmount,
    };
  }

  private createUserTransactions(
    currentUser: User,
    discountedPrice: number,
    profitAmount: number,
    userPackageId: string,
    receiptImage?: string,
  ): Array<Prisma.PrismaPromise<unknown>> {
    const transactions: Array<Prisma.PrismaPromise<unknown>> = [];

    // Create payment record
    transactions.push(
      this.prisma.payment.create({
        data: {
          amount: discountedPrice,
          type: 'PACKAGE_PURCHASE',
          payerId: currentUser.id,
          receiptImage,
          userPackageId,
          profitAmount,
        },
      }),
    );

    // Update user balance if they're an admin
    if (currentUser.role === Role.ADMIN || (currentUser.role === Role.USER && currentUser.balance > 0)) {
      const paidByBalance =
        currentUser.role === Role.USER && currentUser.balance - discountedPrice > 0
          ? discountedPrice
          : currentUser.balance;
      const decrementAmount = currentUser.role === Role.ADMIN ? discountedPrice : paidByBalance;
      transactions.push(
        this.prisma.user.update({
          where: { id: currentUser.id },
          data: {
            balance: {
              decrement: decrementAmount,
            },
          },
        }),
      );
    }

    return transactions;
  }

  private createBuyPackMessage({
    currentUser,
    packageData,
    userPackageName,
    pricingDetails,
    input,
    receiptBuffer,
    bundleGroupSize,
    durationMonths,
    country,
  }: {
    currentUser: User;
    packageData: Package;
    userPackageName: string;
    pricingDetails: ReturnType<PaymentService['calculateUserPricing']>;
    input: PackagePaymentInput;
    receiptBuffer?: Buffer;
    bundleGroupSize?: number;
    durationMonths?: number;
    country: Country;
  }): SendBuyPackMessage {
    return {
      discountedPrice: pricingDetails.discountedPrice,
      profitAmount: pricingDetails.profitAmount,
      receiptBuffer,
      sellPrice: pricingDetails.sellPrice,
      inRenew: input.inRenew,
      pack: packageData,
      price: pricingDetails.price,
      isFree: input.isFree || false,
      isGift: input.isGift || false,
      user: currentUser,
      userId: currentUser.id,
      userPackageName,
      bundleGroupSize,
      durationMonths,
      country,
    };
  }

  async purchasePackagePayment(
    user: User,
    input: PackagePaymentInput,
  ): Promise<[Array<Prisma.PrismaPromise<unknown>>, TelegramMessage[]]> {
    // Get all users in the hierarchy (parents + current user)
    const usersInHierarchy = [...(await this.getAllParents(user.id)), user];
    const usersDictionary = arrayToDic(usersInHierarchy);
    const buyPackMessages: SendBuyPackMessage[] = [];
    const allFinanceTransactions: Array<Prisma.PrismaPromise<unknown>> = [];

    // Handle receipt upload if provided
    const [receiptBuffer, receiptImage] = input.receipt
      ? await this.uploadReceiptPermanently(input.userPackageId, input.receipt)
      : [];

    // Process each user in the hierarchy
    for (let userIndex = 0; userIndex < usersInHierarchy.length; userIndex++) {
      const currentUser = usersInHierarchy[userIndex];
      const isEndUser = userIndex === usersInHierarchy.length - 1;
      const shouldSkipTransaction = (input.isFree || input.isGift) && isEndUser;

      // Get related users in hierarchy
      const parentUser = usersDictionary[currentUser?.parentId || ''];
      const childUser = usersInHierarchy.find((u) => u?.parentId === currentUser.id);
      const isChildEndUser = childUser ? childUser.id === usersInHierarchy[usersInHierarchy.length - 1].id : false;

      // Calculate pricing for this user
      const pricingDetails = this.calculateUserPricing({
        packagePrice: input.package.price,
        currentUser,
        parentUser,
        childUser,
        bundleGroupSize: input.bundleGroupSize,
        isChildEndUser,
        durationMonths: input.durationMonths,
      });

      // Create financial transactions if not skipped
      if (!shouldSkipTransaction) {
        const userTransactions = this.createUserTransactions(
          currentUser,
          pricingDetails.discountedPrice,
          pricingDetails.profitAmount,
          input.userPackageId,
          receiptImage,
        );
        allFinanceTransactions.push(...userTransactions);
      }

      // Create buy pack message for notifications
      const buyPackMessage = this.createBuyPackMessage({
        currentUser,
        packageData: input.package,
        userPackageName: input.userPackageName,
        pricingDetails,
        input,
        receiptBuffer,
        bundleGroupSize: input.bundleGroupSize,
        durationMonths: input.durationMonths,
        country: input.country,
      });
      buyPackMessages.push(buyPackMessage);
    }

    // Get telegram users for notifications
    const telegramUsers = await this.prisma.telegramUser.findMany({
      where: {
        userId: {
          in: buyPackMessages.map((message) => message.userId),
        },
      },
    });

    // Generate telegram messages
    const telegramMessages = await this.getBuyPackMessages({
      buyPackMessages,
      telegramUsers,
      userPackageId: input.userPackageId,
      receiptBuffer,
      server: input.server,
    });

    return [allFinanceTransactions, telegramMessages];
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
        // Reset notification count for admins with positive balance when they charge account
        ...(user.balance + input.amount >= 0 && {
          negativeBalanceNotificationCount: 0,
          lastNegativeBalanceNotificationAt: null,
        }),
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

  // eslint-disable-next-line sonarjs/cognitive-complexity
  async getBuyPackMessages(input: GetBuyPackMessages): Promise<TelegramMessage[]> {
    const telegramMessages: TelegramMessage[] = [];
    const telegramUsersDic = arrayToDic(input.telegramUsers, 'userId');
    const buyPackMessagesDic = arrayToDic(input.buyPackMessages, 'userId');

    for (const buyPackMessage of input.buyPackMessages) {
      if (buyPackMessage.user.role !== 'ADMIN') {
        continue;
      }

      const caption = this.nestedBuyPackageTxt({
        firstUserId: buyPackMessage.userId,
        buyPackMessagesDic,
        server: input.server,
      });
      const chatId = Number(telegramUsersDic?.[buyPackMessage.userId]?.chatId);
      let source: Buffer | undefined;
      let replyMarkup: TelegramReplyMarkup | undefined;

      if (!chatId && buyPackMessage.user.parentId) {
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
          isOwner: false,
        });
      }

      // Only push user message if chatId is valid
      if (chatId) {
        telegramMessages.push({
          caption,
          chatId,
          source,
          reply_markup: replyMarkup,
          brandId: buyPackMessage.user.brandId,
          isOwner: buyPackMessage.user.isOwner,
        });
      }
    }

    return telegramMessages;
  }
}
