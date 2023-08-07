import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';

import { User } from '../users/models/user.model';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { RefreshTokenInput } from './dto/refresh-token.input';
import { SignupInput } from './dto/signup.input';
import { Auth } from './models/auth.model';
import { Token } from './models/token.model';

@Resolver(() => Auth)
export class AuthResolver {
  constructor(private readonly auth: AuthService) {}

  @Mutation(() => Auth)
  async signup(@Args('data') data: SignupInput) {
    data.phone = data.phone.toLowerCase();
    const { accessToken, refreshToken } = await this.auth.createUser(data);

    return {
      accessToken,
      refreshToken,
    };
  }

  @Mutation(() => Auth)
  async login(@Args('data') { phone, password }: LoginInput) {
    const { accessToken, refreshToken } = await this.auth.login(phone.toLowerCase(), password);

    return {
      accessToken,
      refreshToken,
    };
  }

  @Mutation(() => Token)
  refreshToken(@Args() { token }: RefreshTokenInput) {
    return this.auth.refreshToken(token);
  }

  @ResolveField('user', () => User)
  async user(@Parent() auth: Auth) {
    return this.auth.getUserFromToken(auth.accessToken);
  }
}
