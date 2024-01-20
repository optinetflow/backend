import { Command, Ctx, On, Scene, SceneEnter, SceneLeave } from 'nestjs-telegraf';

import { Context } from '../../common/interfaces/context.interface';
import { HOME_SCENE_ID, REGISTER_SCENE_ID } from '../telegram.constants';
import { TelegramService } from '../telegram.service';

interface Contact {
  phone_number: string;
  first_name: string;
  last_name: string;
  user_id: number;
}

@Scene(REGISTER_SCENE_ID)
export class RegisterScene {
  constructor(private readonly telegramService: TelegramService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context): Promise<void> {
    await ctx.reply('برای ثبت نام لطفا از طریق دکمه‌ی زیر شماره تماس خود را بفرستید.', {
      reply_markup: {
        keyboard: [
          [
            {
              text: 'ارسال شماره موبایل',
              request_contact: true,
            },
          ],
        ],
      },
    });
  }

  @On('contact')
  async saveContact(@Ctx() ctx: Context): Promise<void> {
    const contact = (ctx?.message as unknown as { contact: Contact }).contact;

    if (ctx.message?.from.id === contact.user_id) {
      await this.telegramService.addPhone(ctx, contact.phone_number);
      await ctx.reply('ثبت نام شما با موفقیت انجام شد.', {
        reply_markup: {
          remove_keyboard: true,
        },
      });
      await ctx.scene.enter(HOME_SCENE_ID);
    } else {
      await ctx.reply('فقط باید از طریق دکمه‌ی زیر اقدام به ارسال شماره موبایل کنید.');
    }
  }
}
