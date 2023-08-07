import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

export interface BufferedFile {
  filename: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer | string;
}

export interface BufferedMedia extends BufferedFile {
  max_width?: number | null;
}

@ObjectType()
export class Media {
  @Field(() => ID)
  id: string;

  @Field()
  url: string;

  @Field()
  file_path: string;

  @Field()
  file_format: string;

  @Field(() => Int)
  max_width?: number | null;

  @Field(() => ID)
  created_by: string;

  @Field(() => ID)
  upd_by: string;

  @Field()
  creation: Date;

  @Field()
  last_upd: Date;
}

@ObjectType()
export class File {
  @Field(() => ID)
  id: string;

  @Field()
  url: string;

  @Field()
  file_path: string;

  @Field()
  file_format: string;

  @Field()
  file_name: string;

  @Field(() => ID)
  created_by: string;

  @Field(() => ID)
  upd_by: string;

  @Field()
  creation: Date;

  @Field()
  last_upd: Date;
}
