import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { BrandService } from '../brand/brand.service';
import { UserEntity } from '../common/decorators/user.decorator';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramErrorHandler } from '../telegram/telegram-error-handler';
import { ChangePasswordInput } from './dto/change-password.input';
import { GetChildrenBySegmentOutput } from './dto/get-children-by-segment.output';
import { GetOptinetflowCustomerInfoInput } from './dto/get-optinetflow-customer-info.input';
import { UpdateUserInput } from './dto/update-user.input';
import { UpdateChildInput } from './dto/updateChild.input';
import { Child, User } from './models/user.model';
import { UsersService } from './users.service';

@Resolver(() => User)
export class UsersResolver {
  constructor(
    private usersService: UsersService,
    private telegramService: TelegramService,
    private readonly brandService: BrandService,
  ) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => User)
  me(@UserEntity() user: User) {
    return this.usersService.getUser(user);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => GetChildrenBySegmentOutput)
  async getChildrenBySegment(@UserEntity() user: Child) {
    return this.usersService.getChildren(user);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => User)
  async updateUser(@UserEntity() user: User, @Args('input') newUserData: UpdateUserInput) {
    return this.usersService.updateUser(user, newUserData);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => User)
  async updateChild(@UserEntity() user: User, @Args('input') input: UpdateChildInput) {
    return this.usersService.updateChild(user, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => User)
  async changePassword(@UserEntity() user: User, @Args('data') changePassword: ChangePasswordInput) {
    return this.usersService.changePassword(user.id, user.password, changePassword);
  }

  @Mutation(() => Boolean)
  async notifOptinetflowCustomerInfoToUs(@Args('data') data: GetOptinetflowCustomerInfoInput) {
    const brand = await this.brandService.getBrandByDomainName('vaslshim.com');
    const bot = this.telegramService.getBot(brand.id);
    const caption = `#درخواست_سازمانی\n👤 نام: ${data.fullname}\n📱 موبایل: ${data.phone}\n📧 ایمیل: ${data.email}\n🏢 شرکت: ${data.companyName}\n📝 توضیحات: ${data.description}`;
    const chatIds = ['406607551', '118763170'];

    for await (const chatId of chatIds) {
      await TelegramErrorHandler.safeTelegramCall(
        () =>
          bot.telegram.sendSticker(chatId, 'CAACAgIAAxkBAAOEZvAlfoRyhpaikie54VgNity1Ae4AAn89AAItySlKdrcmTxVTXBc2BA'),
        'Send new customer sticker notification',
        chatId,
      );
      await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.sendMessage(chatId, 'یه مشتری جدید پیدا کردیم 😁'),
        'Send new customer message',
        chatId,
      );
      await TelegramErrorHandler.safeTelegramCall(
        () => bot.telegram.sendMessage(chatId, caption),
        'Send new customer details',
        chatId,
      );
    }

    return true;
  }
}
