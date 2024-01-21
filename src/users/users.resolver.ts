import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { ChangePasswordInput } from './dto/change-password.input';
import { UpdateUserInput } from './dto/update-user.input';
import { UpdateChildInput } from './dto/updateChild.input';
import { User } from './models/user.model';
import { UsersService } from './users.service';

@Resolver(() => User)
@UseGuards(GqlAuthGuard)
export class UsersResolver {
  constructor(private usersService: UsersService, private prisma: PrismaService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => User)
  me(@UserEntity() user: User) {
    return this.usersService.getUser(user);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [User])
  children(@UserEntity() user: User) {
    return this.usersService.getChildren(user);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => User)
  async updateUser(@UserEntity() user: User, @Args('input') newUserData: UpdateUserInput) {
    return this.usersService.updateUser(user.id, newUserData);
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
}
