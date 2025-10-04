import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Brand as PrismaBrand, Role, User } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import PQueue from 'p-queue';
import { Parent } from 'src/users/models/user.model';
import { Scenes, session, Telegraf } from 'telegraf';

import { Brand } from '../brand/models/brand.model';
import { b64UrlToJson, convertPersianCurrency, extractFileName, getFileFromURL, roundTo } from '../common/helpers';
import { Context } from '../common/interfaces/context.interface';
import { ClientManagementService } from '../common/services/client-management.service';
import { MinioClientService } from '../minio/minio.service';
import { BrandService } from './../brand/brand.service';
import { AggregatorService } from './aggregator.service';
import { TelegramUser } from './models/telegramUser.model';
import { CallbackData, HOME_SCENE_ID, REGISTER_SCENE_ID } from './telegram.constants';
import { TelegramErrorHandler } from './telegram-error-handler';

interface StartPayload {
  uid?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard: Array<
    Array<{
      callback_data: string;
      text: string;
    }>
  >;
}

export interface TelegramMessage {
  brandId: string;
  chatId: number;
  caption: string;
  source?: Buffer;
  reply_markup?: TelegramReplyMarkup;
  isOwner?: boolean;
}

@Injectable()
export class TelegramService {
  private bots: Map<string, Telegraf> = new Map<string, Telegraf>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioClientService,
    private readonly brandService: BrandService,
    private readonly aggregatorService: AggregatorService,
    private readonly configService: ConfigService,
    private readonly clientManagementService: ClientManagementService,
  ) {
    void this.initiateBots();
  }

  private async initiateBots() {
    const logger = new Logger(TelegramService.name);

    try {
      const brands = await this.brandService.getBrands();

      for (const brand of brands) {
        const bot = new Telegraf(brand.botToken);
        const stage = new Scenes.Stage([this.createHomeScene(brand)]);

        bot.use(session());
        bot.use(stage.middleware() as never);
        bot.start(async (ctx) => {
          await this.handleStart(ctx as never, ctx.message.text.slice(6));
        });

        bot.on('callback_query', async (ctx) => {
          const callbackData = (ctx.callbackQuery as { data: string })?.data;
          const parsed = b64UrlToJson(callbackData) as CallbackData;

          if (parsed?.A_PACK) {
            const caption = (ctx.callbackQuery?.message as { caption: string })?.caption + '\n\n✅ تایید شد';
            await ctx.editMessageCaption(caption);
            await this.aggregatorService.acceptPurchasePack(parsed.A_PACK);
          }

          if (parsed?.R_PACK) {
            const caption = (ctx.callbackQuery?.message as { caption: string })?.caption + '\n\n❌ رد شد';
            await ctx.editMessageCaption(caption);

            const userPack = await this.aggregatorService.rejectPurchasePack(parsed.R_PACK);
            const parent = await this.prisma.user.findUniqueOrThrow({ where: { id: userPack.user.parentId! } });
            const text = `#ریجکتـبسته\n📦 ${userPack.package.traffic} گیگ - ${convertPersianCurrency(
              userPack.package.price,
            )} - ${userPack.package.expirationDays} روزه\n🔤 نام بسته: ${userPack.name}\n👤 خریدار: ${
              userPack.user.fullname
            }\n👨 مارکتر: ${parent?.fullname}`;
            await TelegramErrorHandler.safeTelegramCall(
              () => bot.telegram.sendMessage(userPack.user.brand?.reportGroupId as string, text),
              'Send reject pack notification to report group',
              userPack.user.brand?.reportGroupId,
            );
          }

          if (parsed?.A_CHARGE) {
            const caption = (ctx.callbackQuery?.message as { caption: string })?.caption + '\n\n✅ تایید شد';
            await ctx.editMessageCaption(caption);
            await this.aggregatorService.acceptRechargePack(parsed.A_CHARGE);
          }

          if (parsed?.R_CHARGE) {
            const caption = (ctx.callbackQuery?.message as { caption: string })?.caption + '\n\n❌ رد شد';
            await ctx.editMessageCaption(caption);
            const user = await this.aggregatorService.rejectRechargePack(parsed.R_CHARGE);
            await this.clientManagementService.toggleUserBlock(user.id, true);
          }
        });
        void bot.launch();
        this.bots.set(brand.id, bot);
      }
    } catch (error) {
      logger.error('Failed to initialize Telegram bots', error);

      throw error;
    }
  }

  getBot(brandId: string | null): Telegraf {
    const bot = this.bots.get(brandId as string);

    if (!bot) {
      throw new BadRequestException('Bot is not found.');
    }

    return bot;
  }

  private readonly logger = new Logger(TelegramService.name);

  echo(text: string): string {
    return `Echo: ${text}`;
  }

  async handleStart(ctx: Context, payload: string) {
    const params = b64UrlToJson(payload);
    const telegramUser = await this.prisma.telegramUser.findFirst({
      where: { chatId: ctx.from!.id, userId: params?.uid as string },
    });
    // if (telegramUser?.phone) {
    //   await ctx.scene.enter(HOME_SCENE_ID);

    //   return;
    // }
    if (payload.length > 0) {
      await this.handleStartPayload(ctx, params, telegramUser);
    }

    if (telegramUser) {
      await ctx.scene.enter(REGISTER_SCENE_ID);
    }
  }

  private async isThisAccountAlreadyAssigned(
    ctx: Context,
    user: User & { parent?: (User & { telegram?: TelegramUser | null }) | null } & { brand?: PrismaBrand | null },
  ) {
    const telegramAccounts = await this.prisma.telegramUser.findMany({
      where: { chatId: ctx.from!.id },
      include: { user: true },
    });

    for (const telegramAccount of telegramAccounts) {
      if (telegramAccount.user.brandId === user.brandId) {
        const parentButton =
          user.parentId && user.parent?.telegram && user.parent?.telegram.username
            ? {
                text: 'ارتباط با پشتیبانی',
                url: `https://t.me/${user.parent?.telegram.username}`,
              }
            : null;
        const inlineKeyboard = parentButton ? [[parentButton]] : [];
        await ctx.reply(`این حساب تلگرام قبلا با این شماره ${telegramAccount.user.phone} عضو شده است ❌`, {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        });

        return true;
      }
    }

    return false;
  }

  async handleStartPayload(ctx: Context, payload: StartPayload, telegramUser: TelegramUser | null): Promise<void> {
    if (payload?.uid && !telegramUser) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload?.uid },
        include: { telegram: true, brand: true, parent: { include: { telegram: true } } },
      });

      if (!user) {
        return;
      }

      // already registered by another account!
      if (user?.telegram) {
        return;
      }

      const isAlreadyAssigned = await this.isThisAccountAlreadyAssigned(ctx, user);

      if (isAlreadyAssigned) {
        return;
      }

      const [updatedTelegramUser, bigPhoto] = await this.upsertTelegramUser(user, ctx.from!.id);
      // await ctx.scene.enter(REGISTER_SCENE_ID);

      let parent: User | null = null;

      if (user.parentId) {
        parent = await this.prisma.user.findUnique({ where: { id: user.parentId } });
      }

      await ctx.reply('تبریک. شما الان عضو ربات هستید', {
        reply_markup: {
          remove_keyboard: true,
        },
      });

      await ctx.scene.enter(HOME_SCENE_ID);

      const caption = `#ثبـنامـتلگرام\n👤 ${user.fullname} (@${updatedTelegramUser?.username})\n👨 نام تلگرام: ${updatedTelegramUser.firstname} ${updatedTelegramUser.lastname}\n\n👨 مارکتر: ${parent?.fullname}`;
      const bot = this.getBot(user.brandId);

      if (bigPhoto) {
        await TelegramErrorHandler.safeTelegramCall(
          () => bot?.telegram.sendPhoto(user.brand?.reportGroupId as string, { source: bigPhoto }, { caption }),
          'Send telegram registration photo to report group',
          user.brand?.reportGroupId,
        );

        return;
      }

      await TelegramErrorHandler.safeTelegramCall(
        () => bot?.telegram.sendMessage(user.brand?.reportGroupId as string, caption),
        'Send telegram registration message to report group',
        user.brand?.reportGroupId,
      );
    }
  }

  async upsertTelegramUser(
    user: User,
    chatId: number,
    telegramUser?: TelegramUser,
  ): Promise<[TelegramUser, Buffer | undefined]> {
    const bot = this.getBot(user.brandId);
    const chat = await TelegramErrorHandler.safeTelegramCall(
      () => bot.telegram.getChat(chatId),
      'Get chat information',
      chatId,
    );

    if (!chat) {
      // If we can't get chat info, create a basic telegram user record without photo
      const updatedTelegramUser = await this.prisma.telegramUser.upsert({
        where: {
          chatId,
          userId: user.id,
        },
        create: {
          chatId,
          userId: user.id,
          firstname: 'Unknown',
          lastname: '',
          username: null,
        },
        update: {
          chatId,
          userId: user.id,
        },
      });

      return [updatedTelegramUser, undefined];
    }

    let bigAvatar: string | undefined;
    let smallAvatar: string | undefined;

    let bigPhoto: Buffer | undefined;
    let smallPhoto: Buffer | undefined;

    const isPhotoAlreadySaved =
      chat.photo?.small_file_id && chat.photo.small_file_id === extractFileName(telegramUser?.smallAvatar);

    if (chat.photo && chat.photo?.small_file_id && !isPhotoAlreadySaved) {
      const bigPhotoLink = await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.getFileLink(chat.photo!.big_file_id),
        'Get big photo file link',
        chatId,
      );
      const smallPhotoLink = await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.getFileLink(chat.photo!.small_file_id),
        'Get small photo file link',
        chatId,
      );

      if (!bigPhotoLink || !smallPhotoLink) {
        this.logger.warn(`Failed to get photo links for user ${user.id}, chatId: ${chatId}`);
      } else {
        bigPhoto = await getFileFromURL(bigPhotoLink.href);
        smallPhoto = await getFileFromURL(smallPhotoLink.href);
        bigAvatar = `userPhotoBig/${chat.photo.big_file_id}.jpg`;
        smallAvatar = `userPhotoSmall/${chat.photo.small_file_id}.jpg`;

        if (telegramUser?.smallAvatar && telegramUser?.bigAvatar) {
          await this.minioService.delete([telegramUser.smallAvatar, telegramUser.bigAvatar]);
        }

        await this.minioService.upload([
          {
            buffer: bigPhoto,
            filename: bigAvatar,
          },
          {
            buffer: smallPhoto,
            filename: smallAvatar,
          },
        ]);
      }
    }

    const extendedChat = chat as typeof chat & {
      id: number;
      first_name: string;
      last_name: string;
      username: string;
    };

    const updatedData = {
      chatId: extendedChat.id,
      userId: user.id,
      firstname: extendedChat.first_name,
      lastname: extendedChat.last_name,
      username: extendedChat.username || null,
      bigAvatar,
      smallAvatar,
    };

    const updatedTelegramUser = await this.prisma.telegramUser.upsert({
      where: {
        chatId,
        userId: user.id,
      },
      create: updatedData,
      update: updatedData,
    });

    return [updatedTelegramUser, bigPhoto];
  }

  async addPhone(ctx: Context, phone: string) {
    const brand = await this.prisma.brand.findUniqueOrThrow({ where: { botUsername: ctx.botInfo.username } });
    // const telegramUserCount = await this.prisma.telegramUser.count({
    //   where: {
    //     chatId: ctx.from!.id,
    //   },
    // });

    // if (telegramUserCount === 0) {
    //   throw new Error('TelegramUsers not found');
    // }

    await this.prisma.telegramUser.updateMany({
      where: {
        chatId: ctx.from!.id,
        user: {
          brandId: brand.id,
        },
      },
      data: {
        phone,
      },
    });
    const updatedTelegramUser = await this.prisma.telegramUser.findFirstOrThrow({
      where: {
        chatId: ctx.from!.id,
        user: {
          brandId: brand.id,
        },
      },
      include: {
        user: {
          include: {
            parent: true,
            brand: true,
          },
        },
      },
    });
    await this.prisma.user.update({ where: { id: updatedTelegramUser.userId }, data: { isVerified: true } });
    const caption = `#تکمیلـثبتـنامـتلگرام\n👤 ${updatedTelegramUser.user.fullname}  (@${updatedTelegramUser?.username})\n📞 موبایل: +98${updatedTelegramUser.user.phone}\n📱 موبایل تلگرام: +${updatedTelegramUser.phone}\n👨 نام تلگرام: ${updatedTelegramUser.firstname} ${updatedTelegramUser.lastname}\n\n👨 مارکتر: ${updatedTelegramUser.user?.parent?.fullname}`;
    const bot = this.getBot(updatedTelegramUser.user.brandId);

    return TelegramErrorHandler.safeTelegramCall(
      () => bot.telegram.sendMessage(updatedTelegramUser.user.brand?.reportGroupId as string, caption),
      'Send phone registration completion to report group',
      updatedTelegramUser.user.brand?.reportGroupId,
    );
  }

  async enableGift(userId: string) {
    const user = await this.prisma.user.findFirstOrThrow({
      where: {
        id: userId,
      },
      include: { brand: true, userGift: { include: { giftPackage: true }, where: { isGiftUsed: false } } },
    });

    const userGift = user?.userGift?.[0];

    if (userGift) {
      const { package: pack, userPack } = await this.aggregatorService.enableGift(user, userGift.id);
      const caption = `#فعالسازیـهدیه 🎁\n📦 ${pack.traffic} گیگ - ${convertPersianCurrency(pack.price)} - ${
        pack.expirationDays
      } روزه\n🔤 نام بسته: ${userPack.name}\n👤 ${user.fullname}\n📞 موبایل: +98${
        user.phone
      }\n💵 شارژ حساب: ${convertPersianCurrency(roundTo(user?.balance || 0, 0))}`;
      const bot = this.getBot(user.brandId);

      await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.sendMessage(user.brand?.reportGroupId as string, caption),
        'Send gift activation to report group',
        user.brand?.reportGroupId,
      );
    }
  }

  @Interval('syncTelegramUsersInfo', 24 * 60 * 60 * 1000)
  async updateUsersInfo() {
    this.logger.debug('SyncTelegramUsersInfo called every 24 hours');

    let skip = 0;
    const take = 1000; // chunk size

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const telegramUsers = await this.prisma.telegramUser.findMany({
        skip,
        take,
        include: {
          user: true,
        },
      });

      if (telegramUsers.length === 0) {
        break;
      }

      for (const telegramUser of telegramUsers) {
        try {
          await this.upsertTelegramUser(telegramUser.user, Number(telegramUser.chatId), telegramUser);
        } catch (error) {
          this.logger.error(`SyncTelegramUsersInfo failed for telegramID = ${telegramUser.chatId}`, error);
        }
      }

      skip += take;
    }
  }

  private async sendNotificationForNegetiveAdminBalance(
    admin: User & {
      brand: Brand | null;
      telegram: TelegramUser | null;
      parent: (Parent & { telegram: TelegramUser | null }) | null;
    },
  ) {
    const bot = this.getBot(admin.brandId);
    const message = `سلام ${admin.fullname} عزیز! 🌟\n\nشارژ حساب شما منفی شده! ❌\nاگه زود شارژش نکنی، ممکنه حساب مشتریا و بسته‌هاشون بسته بشه. 🚫\n\nمنتظرتیم تا زودتر درستش کنی! 💳✨\nاگه سوالی داشتی، ما اینجاییم. 🙌\n\nتیم پشتیبانی ${admin.brand?.domainName} ❤️`;

    const parentMessage = `\nشارژ حساب ${admin.fullname} منفی شده! ❌\n📞: +98${admin.phone}\n💰 موجودی فعلی: ${admin.balance} تومان\nلطفاً پیگیری کنید که زودتر شارژ بشه؛ چون ممکنه حساب مشتریا بسته بشه. 🚫\n\nاگه کمک خواستید، ما همیشه در دسترسیم! 🙌\n\nتیم پشتیبانی ${admin.brand?.domainName} ❤️`;

    if (admin.telegram?.chatId) {
      const adminChatId = admin.telegram.chatId.toString();
      await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.sendMessage(adminChatId, message),
        'Send negative balance notification to admin',
        adminChatId,
      );
    }

    if (admin.parent?.telegram?.chatId) {
      const parentChatId = admin.parent.telegram.chatId.toString();
      await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.sendMessage(parentChatId, parentMessage),
        'Send negative balance notification to parent',
        parentChatId,
      );
    }
  }

  @Interval('negetiveAdminBalanceNotification', 12 * 60 * 60 * 1000) // 12 hours in milliseconds
  async negetiveAdminBalanceNotification() {
    this.logger.debug('negetiveAdminBalanceNotification called every 12 hours');

    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, balance: { lt: 0 } },
      include: { brand: true, telegram: true, parent: { include: { telegram: true } } },
    });

    if (admins.length === 0) {
      return;
    }

    const queue = new PQueue({ concurrency: 5, interval: 1000, intervalCap: 5 });

    for await (const admin of admins) {
      await queue.add(() =>
        this.sendNotificationForNegetiveAdminBalance(admin).catch((error) => {
          this.logger.error(`Failed to send notification to admin ${admin.fullname}:`, error);
        }),
      );
    }

    return queue.onIdle(); // Ensure all tasks are completed before function ends
  }

  private createHomeScene(brand: Brand) {
    const homeScene = new Scenes.BaseScene<Scenes.SceneContext>(HOME_SCENE_ID);
    const isDev = this.configService.get('env') === 'development';

    homeScene.enter(async (ctx) => {
      await ctx.reply('👌');
      await ctx.reply(brand.title, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'ورود به سایت',
                url: isDev ? 'https://google.com' : `https://${brand.domainName}`,
              },
            ],
          ],
        },
      });
    });

    return homeScene;
  }

  async sendBulkMessage(telegramMessages: TelegramMessage[]) {
    for (const telegramMessage of telegramMessages) {
      try {
        const bot = this.getBot(telegramMessage.brandId);

        // For isOwner = true, only send when message has reply_markup
        if (telegramMessage.isOwner && !telegramMessage.reply_markup) {
          continue;
        }

        if (telegramMessage.source) {
          await TelegramErrorHandler.safeTelegramCall(
            () =>
              bot.telegram.sendPhoto(
                telegramMessage.chatId,
                { source: telegramMessage.source! },
                {
                  caption: telegramMessage.caption,
                  ...(telegramMessage?.reply_markup && {
                    reply_markup: telegramMessage.reply_markup,
                  }),
                },
              ),
            'Send bulk photo message',
            telegramMessage.chatId,
          );
          continue;
        }

        await TelegramErrorHandler.safeTelegramCall(
          () => bot.telegram.sendMessage(telegramMessage.chatId, telegramMessage.caption),
          'Send bulk text message',
          telegramMessage.chatId,
        );
      } catch (error) {
        this.logger.error(
          `Unexpected error in sendBulkMessage for chatId: ${telegramMessage.chatId}, brandId: ${telegramMessage.brandId}`,
          error,
        );
        // Continue processing remaining messages
        continue;
      }
    }
  }

  // private createRegisterScene() {
  //   const registerScene = new Scenes.BaseScene<Scenes.SceneContext>(REGISTER_SCENE_ID);

  //   registerScene.enter(async (ctx) => {
  //     await ctx.reply('برای ثبت‌نام دکمه «می‌خواهم عضو بشوم» را در پایین صفحه بزنید.\n👇👇👇👇👇👇', {
  //       reply_markup: {
  //         keyboard: [
  //           [
  //             {
  //               text: 'می‌خواهم عضو بشوم',
  //               request_contact: true,
  //             },
  //           ],
  //         ],
  //         resize_keyboard: true,
  //       },
  //     });
  //   });

  //   registerScene.on('contact', async (ctx) => {
  //     const contact = (ctx?.message as unknown as { contact: Contact }).contact;

  //     if (ctx.message?.from.id === contact.user_id) {
  //       await this.addPhone(ctx, contact.phone_number);
  //       await ctx.reply('ثبت نام شما با موفقیت انجام شد.', {
  //         reply_markup: {
  //           remove_keyboard: true,
  //         },
  //       });

  //       await this.enableGift(ctx);

  //       await ctx.scene.enter(HOME_SCENE_ID);
  //     } else {
  //       await ctx.reply('فقط باید از طریق دکمه‌ی زیر اقدام به ارسال شماره موبایل کنید.');
  //     }
  //   });

  //   return registerScene;
  // }
}
