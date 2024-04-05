import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Command, Ctx, InjectBot, InlineQuery, Message, On, Start, Update } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

import { TelegrafExceptionFilter } from '../common/filters/telegraf-exception.filter';
import { AdminGuard } from '../common/guards/admin.guard';
import { b64UrlToJson } from '../common/helpers';
import { ResponseTimeInterceptor } from '../common/interceptors/response-time.interceptor';
import { Context } from '../common/interfaces/context.interface';
import { PackageService } from '../package/package.service';
import { PaymentService } from '../payment/payment.service';
import { XuiService } from '../xui/xui.service';
import { CallbackData } from './telegram.constants';
import { TelegramService } from './telegram.service';

@Update()
@UseInterceptors(ResponseTimeInterceptor)
@UseFilters(TelegrafExceptionFilter)
export class TelegramUpdate {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly xuiService: XuiService,
    private readonly packageService: PackageService,
    private readonly payment: PaymentService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context, @Message('text') msg: string): Promise<void> {
    const payload = msg.slice(6);

    await this.telegramService.handleStart(ctx, payload);
  }

  @On('callback_query')
  async onCallbackQuery(@Ctx() ctx: Context): Promise<void> {
    const callbackData = (ctx.callbackQuery as { data: string })?.data;
    const parsed = b64UrlToJson(callbackData) as CallbackData;

    if (parsed?.A_PACK) {
      const caption = (ctx.callbackQuery?.message as { caption: string })?.caption + '\n\n✅ تایید شد';
      void ctx.editMessageCaption(caption);
      await this.packageService.acceptPurchasePack(parsed.A_PACK);
    }

    if (parsed?.R_PACK) {
      const caption = (ctx.callbackQuery?.message as { caption: string })?.caption + '\n\n❌ رد شد';
      void ctx.editMessageCaption(caption);
      await this.packageService.rejectPurchasePack(parsed.R_PACK);
    }

    if (parsed?.A_CHARGE) {
      const caption = (ctx.callbackQuery?.message as { caption: string })?.caption + '\n\n✅ تایید شد';
      void ctx.editMessageCaption(caption);
      await this.payment.acceptRechargePack(parsed.A_CHARGE);
    }

    if (parsed?.R_CHARGE) {
      const caption = (ctx.callbackQuery?.message as { caption: string })?.caption + '\n\n❌ رد شد';
      void ctx.editMessageCaption(caption);
      const user = await this.payment.rejectRechargePack(parsed.R_CHARGE);
      await this.xuiService.toggleUserBlock(user.id, true);
    }
  }

  @Command('admin')
  @UseGuards(AdminGuard)
  onAdminCommand(): string {
    return 'Welcome judge';
  }
}
