import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from 'nestjs-prisma';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { UploadInput } from './dto/uploadFile.input';
import { MinioClientService } from './minio.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class MinioResolver {
  constructor(private minioService: MinioClientService, private prisma: PrismaService) {}

  @Mutation(() => String)
  uploadImage(@UserEntity() user: User, @Args('input') input: UploadInput) {
    return this.minioService.uploadImageTemporary(user, input.image);
  }

  // @Query(() => User)
  // me(@UserEntity() user: User): User {
  //   return user;
  // }

  // @UseGuards(GqlAuthGuard)
  // @Mutation(() => User)
  // async updateUser(@UserEntity() user: User, @Args('data') newUserData: UpdateUserInput) {
  //   return this.usersService.updateUser(user.id, newUserData);
  // }

  // @Mutation(() => User)
  // async changePassword(@UserEntity() user: User, @Args('data') changePassword: ChangePasswordInput) {
  //   return this.usersService.changePassword(user.id, user.password, changePassword);
  // }
}
