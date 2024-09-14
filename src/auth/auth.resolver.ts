import { BadRequestException, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import type { Request as RequestType } from 'express';

import { GqlAuthGuard, OptionalGqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { RefreshTokenInput } from './dto/refresh-token.input';
import { SendOtpAgainInput } from './dto/send-otp-again.input';
import { SignupInput } from './dto/signup.input';
import { UpdatePhoneInput } from './dto/update-phone.input';
import { VerifyPhoneInput } from './dto/verify-phone.input';
import { Auth } from './models/auth.model';
import { CheckAuth } from './models/check-auth.model';
import { Login } from './models/login.model';
import { Token } from './models/token.model';

@Resolver(() => User)
export class AuthResolver {
  constructor(private readonly auth: AuthService, private readonly userService: UsersService) {}

  @UseGuards(OptionalGqlAuthGuard)
  @Mutation(() => Boolean)
  async signup(@UserEntity() user: User, @Args('data') data: SignupInput) {
    await this.auth.createUser(user, data);

    return true;
  }

  @UseGuards(OptionalGqlAuthGuard)
  @Mutation(() => Token)
  async verifyPhone(
    @UserEntity() user: User,
    @Args('data') { domainName, phone, otp }: VerifyPhoneInput,
    @Context() context: { req: RequestType },
  ): Promise<Token> {
    if (!user) {
      if (!phone) {
        throw new UnprocessableEntityException('Phone is required');
      }

      user = await this.userService.getUserByPhoneAndDomainName(phone, domainName);

      if (!user) {
        throw new BadRequestException('User not found');
      }
    }

    return this.auth.verifyPhone(user, domainName, otp, context.req);
  }

  @UseGuards(OptionalGqlAuthGuard)
  @Mutation(() => Boolean)
  async sendOtpAgain(@UserEntity() user: User, @Args('data') { domainName, phone }: SendOtpAgainInput) {
    if (!user) {
      if (!phone) {
        throw new UnprocessableEntityException('Phone is required');
      }

      user = await this.userService.getUserByPhoneAndDomainName(phone, domainName);

      if (!user) {
        throw new BadRequestException('User not found');
      }
    }

    await this.auth.sendOtpAgain(user, domainName);

    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  async updatePhone(@UserEntity() user: User, @Args('data') { domainName, phone }: UpdatePhoneInput) {
    await this.auth.updatePhone(user, phone, domainName);

    return true;
  }

  @Mutation(() => Login)
  async login(
    @Args('data') { phone, password, domainName }: LoginInput,
    @Context() context: { req: RequestType },
  ): Promise<Login> {
    return this.auth.login(phone.toLowerCase(), password, domainName, context.req);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  logout(@Context() context: { req: RequestType }): boolean {
    this.auth.logout(context.req);

    return true;
  }

  @Mutation(() => Token)
  refreshToken(@Args() { token }: RefreshTokenInput) {
    return this.auth.refreshToken(token);
  }

  @ResolveField('user', () => User)
  async user(@Parent() auth: Auth) {
    return this.auth.getUserFromToken(auth.accessToken);
  }

  @UseGuards(OptionalGqlAuthGuard)
  @Query(() => CheckAuth)
  checkAuth(@UserEntity() user: User): CheckAuth {
    return {
      loggedIn: Boolean(user),
    };
  }
}
