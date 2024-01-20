import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { TelegrafException, TelegrafExecutionContext } from 'nestjs-telegraf';

import { Context } from '../interfaces/context.interface';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  private readonly adminIds: string[] = [];

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // console.log('Before', context.switchToHttp().getRequest());
    const ctx = TelegrafExecutionContext.create(context);
    // console.log('After', ctx.getContext<Context>().update);
    const { from } = ctx.getContext<Context>();
    // console.log('{ from }', from);

    const bot = ctx.getContext<Context>();

    const chat = await bot.getChat();
    // console.log('{ chat }', chat);

    const file = await bot.telegram.getFileLink(chat.photo!.big_file_id);
    // console.log('file', file, await bot.telegram.getFileLink(chat.photo!.small_file_id));

    const isAdmin = this.adminIds.includes(from!.id.toString());

    if (!isAdmin) {
      throw new TelegrafException('You are not admin 😡');
    }

    return true;
  }
}
