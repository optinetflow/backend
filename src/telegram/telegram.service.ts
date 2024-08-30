import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { TelegramUser, User } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

import { b64UrlToJson, extractFileName, getFileFromURL } from '../common/helpers';
import { Context } from '../common/interfaces/context.interface';
import { MinioClientService } from '../minio/minio.service';
import { PackageService } from '../package/package.service';
import { HOME_SCENE_ID, REGISTER_SCENE_ID } from './telegram.constants';

interface StartPayload {
  uid?: string;
}

@Injectable()
export class TelegramService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectBot()
    private readonly bot: Telegraf<Context>,
    private readonly minioService: MinioClientService,
    private readonly configService: ConfigService,
    private readonly packageService: PackageService,
  ) {}

  private readonly logger = new Logger(TelegramService.name);

  private readonly reportGroupId = this.configService.get('telGroup')!.report;

  echo(text: string): string {
    return `Echo: ${text}`;
  }

  async handleStart(ctx: Context, payload: string) {
    const telegramUser = await this.prisma.telegramUser.findUnique({ where: { id: ctx.from!.id } });

    if (telegramUser?.phone) {
      await ctx.scene.enter(HOME_SCENE_ID);

      return;
    }

    if (payload.length > 0) {
      const params = b64UrlToJson(payload);
      await this.handleStartPayload(ctx, params, telegramUser);
    }

    if (telegramUser) {
      await ctx.scene.enter(REGISTER_SCENE_ID);
    }
  }

  async handleStartPayload(ctx: Context, payload: StartPayload, telegramUser: TelegramUser | null): Promise<void> {
    if (payload?.uid && !telegramUser) {
      const user = await this.prisma.user.findUnique({ where: { id: payload?.uid }, include: { telegram: true } });

      if (!user) {
        return;
      }

      // already registered by another account!
      if (user?.telegram) {
        return;
      }

      const [updatedTelegramUser, bigPhoto] = await this.upsertTelegramUser(user, ctx.from!.id);
      await ctx.scene.enter(REGISTER_SCENE_ID);

      let parent: User | null = null;

      if (user.parentId) {
        parent = await this.prisma.user.findUnique({ where: { id: user.parentId } });
      }

      const caption = `#ثبـنامـتلگرام\n👤 ${user.fullname} (@${updatedTelegramUser?.username})\n👨 نام تلگرام: ${updatedTelegramUser.firstname} ${updatedTelegramUser.lastname}\n\n👨 مارکتر: ${parent?.fullname}`;

      if (bigPhoto) {
        void this.bot.telegram.sendPhoto(this.reportGroupId, { source: bigPhoto }, { caption });

        return;
      }

      void this.bot.telegram.sendMessage(this.reportGroupId, caption);
    }
  }

  async upsertTelegramUser(
    user: User,
    telegramId: number,
    telegramUser?: TelegramUser,
  ): Promise<[TelegramUser, Buffer | undefined]> {
    const chat = await this.bot.telegram.getChat(telegramId);

    let bigAvatar: string | undefined;
    let smallAvatar: string | undefined;

    let bigPhoto: Buffer | undefined;
    let smallPhoto: Buffer | undefined;

    const isPhotoAlreadySaved =
      chat.photo?.small_file_id && chat.photo.small_file_id === extractFileName(telegramUser?.smallAvatar);

    if (chat.photo && chat.photo?.small_file_id && !isPhotoAlreadySaved) {
      const bigPhotoLink = await this.bot.telegram.getFileLink(chat.photo.big_file_id);
      const smallPhotoLink = await this.bot.telegram.getFileLink(chat.photo.small_file_id);
      bigPhoto = await getFileFromURL(bigPhotoLink.href);
      smallPhoto = await getFileFromURL(smallPhotoLink.href);
      bigAvatar = `userPhotoBig/${chat.photo.big_file_id}.jpg`;
      smallAvatar = `userPhotoSmall/${chat.photo.small_file_id}.jpg`;

      if (telegramUser?.smallAvatar && telegramUser?.bigAvatar) {
        void this.minioService.delete([telegramUser.smallAvatar, telegramUser.bigAvatar]);
      }

      void this.minioService.upload([
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
      id: extendedChat.id,
      userId: user.id,
      firstname: extendedChat.first_name,
      lastname: extendedChat.last_name,
      username: extendedChat.username || null,
      bigAvatar,
      smallAvatar,
    };

    const updatedTelegramUser = await this.prisma.telegramUser.upsert({
      where: {
        id: telegramId,
      },
      create: updatedData,
      update: updatedData,
    });

    return [updatedTelegramUser, bigPhoto];
  }

  async addPhone(ctx: Context, phone: string): Promise<void> {
    const telegramUser = await this.prisma.telegramUser.update({
      where: {
        id: ctx.from!.id,
      },
      data: {
        phone,
      },
      include: {
        user: {
          include: {
            parent: true,
          },
        },
      },
    });

    await this.prisma.user.update({ where: { id: telegramUser.userId }, data: { isVerified: true } });
    const caption = `#تکمیلـثبتـنامـتلگرام\n👤 ${telegramUser.user.fullname}  (@${telegramUser?.username})\n📞 موبایل: +98${telegramUser.user.phone}\n📱 موبایل تلگرام: +${telegramUser.phone}\n👨 نام تلگرام: ${telegramUser.firstname} ${telegramUser.lastname}\n\n👨 مارکتر: ${telegramUser.user?.parent?.fullname}`;
    void this.bot.telegram.sendMessage(this.reportGroupId, caption);
  }

  async enableGift(ctx: Context) {
    const telegramUser = await this.prisma.telegramUser.findUniqueOrThrow({ where: { id: ctx.from!.id } });
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: telegramUser?.userId },
      include: { userGift: { include: { giftPackage: true }, where: { isGiftUsed: false } } },
    });

    const userGift = user?.userGift?.[0];

    if (userGift) {
      const traffic = userGift.giftPackage!.traffic;
      await this.packageService.enableGift(user, userGift.id);
      await ctx.reply(`${traffic} گیگ هدیه برای شما در سایت فعال شد.`);
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
}
