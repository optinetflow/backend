import { Field, InputType } from '@nestjs/graphql';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.js';
import Upload from 'graphql-upload/Upload.js';

@InputType()
export class UploadInput {
  @Field(() => GraphQLUpload)
  image: Upload;
}
