import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';

import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { UserEntity } from '../common/decorators/user.decorator';
import { User } from '../users/models/user.model';
import { UploadInput } from './dto/uploadFile.input';
import { MinioClientService } from './minio.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class MinioResolver {
  constructor(private minioService: MinioClientService) {}

  @Mutation(() => String)
  uploadImage(@UserEntity() user: User, @Args('input') input: UploadInput): Promise<string> {
    return this.minioService.uploadImageTemporary(user, input.image);
  }
}
