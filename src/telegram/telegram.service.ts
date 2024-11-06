import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { TelegramUser, User } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { Scenes, session, Telegraf } from 'telegraf';
import { Contact } from 'telegraf/typings/core/types/typegram';

import { Brand } from '../brand/models/brand.model';
import { b64UrlToJson, convertPersianCurrency, extractFileName, getFileFromURL, roundTo } from '../common/helpers';
import { Context } from '../common/interfaces/context.interface';
import { MinioClientService } from '../minio/minio.service';
import { BrandService } from './../brand/brand.service';
import { AggregatorService } from './aggregator.service';
import { CallbackData, HOME_SCENE_ID, REGISTER_SCENE_ID } from './telegram.constants';

interface StartPayload {
  uid?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard: {
    callback_data: string;
    text: string;
  }[][];
}

export interface TelegramMessage {
  brandId: string;
  chatId: number;
  caption: string;
  source?: Buffer;
  reply_markup?: TelegramReplyMarkup;
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
            await bot.telegram.sendMessage(userPack.user.brand?.reportGroupId as string, text);
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
            await this.aggregatorService.toggleUserBlock(user.id, true);
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

  async handleStartPayload(ctx: Context, payload: StartPayload, telegramUser: TelegramUser | null): Promise<void> {
    if (payload?.uid && !telegramUser) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload?.uid },
        include: { telegram: true, brand: true },
      });

      if (!user) {
        return;
      }

      // already registered by another account!
      if (user?.telegram) {
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
      const bot = this.getBot(user.brandId as string);

      if (bigPhoto) {
        await bot?.telegram.sendPhoto(user.brand?.reportGroupId as string, { source: bigPhoto }, { caption });

        return;
      }

      await bot?.telegram.sendMessage(user.brand?.reportGroupId as string, caption);
    }
  }

  async upsertTelegramUser(
    user: User,
    chatId: number,
    telegramUser?: TelegramUser,
  ): Promise<[TelegramUser, Buffer | undefined]> {
    const bot = this.getBot(user.brandId as string);
    const chat = await bot.telegram.getChat(chatId);

    let bigAvatar: string | undefined;
    let smallAvatar: string | undefined;

    let bigPhoto: Buffer | undefined;
    let smallPhoto: Buffer | undefined;

    const isPhotoAlreadySaved =
      chat.photo?.small_file_id && chat.photo.small_file_id === extractFileName(telegramUser?.smallAvatar);

    if (chat.photo && chat.photo?.small_file_id && !isPhotoAlreadySaved) {
      const bigPhotoLink = await bot.telegram.getFileLink(chat.photo.big_file_id);
      const smallPhotoLink = await bot.telegram.getFileLink(chat.photo.small_file_id);
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
    const bot = this.getBot(updatedTelegramUser.user.brandId as string);

    return bot.telegram.sendMessage(updatedTelegramUser.user.brand?.reportGroupId as string, caption);
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
      const bot = this.getBot(user.brandId as string);

      await bot.telegram.sendMessage(user.brand?.reportGroupId as string, caption);
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
          console.error(`SyncTelegramUsersInfo failed for telegramID = ${telegramUser.chatId}`, error);
        }
      }

      skip += take;
    }
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
      const bot = this.getBot(telegramMessage.brandId);
      if (telegramMessage.source) {
        bot.telegram.sendPhoto(telegramMessage.chatId, { source: telegramMessage.source }, {
          caption: telegramMessage.caption,
          ...(telegramMessage?.reply_markup && {
            reply_markup: telegramMessage.reply_markup,
          }),
        });
        continue;
      }
      bot.telegram.sendMessage(telegramMessage.chatId, telegramMessage.caption)
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
