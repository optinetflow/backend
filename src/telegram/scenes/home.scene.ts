import { ConfigService } from '@nestjs/config';
import { Command, Ctx, On, Scene, SceneEnter, SceneLeave } from 'nestjs-telegraf';

import { Context } from '../../common/interfaces/context.interface';
import { HOME_SCENE_ID } from '../telegram.constants';
import { TelegramService } from '../telegram.service';

@Scene(HOME_SCENE_ID)
export class HomeScene {
  constructor(private readonly telegramService: TelegramService, private readonly configService: ConfigService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context): Promise<void> {
    const webPanel = this.configService.get('webPanelUrl');
    await ctx.reply('وصل کن دات کام (vaslkon.com)', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'ورود به سایت',
              url: webPanel,
            },
          ],
        ],
      },
    });
  }
}
