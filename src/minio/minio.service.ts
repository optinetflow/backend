/*  eslint-disable no-await-in-loop */

import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReadStream } from 'fs';
import { Client } from 'minio';

import type { MinioConfig } from '../common/configs/config.interface';
import { stream2buffer } from '../common/helpers';
import type { BufferedFile } from './minio.model';

@Injectable()
export class MinioClientService {
  constructor(private readonly configService: ConfigService) {
    this.logger = new Logger('MinioService');
    this.bucketName = this.configService.get<MinioConfig>('minio')!.bucket;
    this.region = this.configService.get<MinioConfig>('minio')!.region;
  }

  private readonly logger: Logger;

  private readonly bucketName: string;

  private readonly region: string;

  public get client(): Client {
    return new Client({
      endPoint: this.configService.get<MinioConfig>('minio')!.endpoint,
      port: this.configService.get<MinioConfig>('minio')!.port,
      useSSL: false,
      accessKey: this.configService.get<MinioConfig>('minio')!.rootUser,
      secretKey: this.configService.get<MinioConfig>('minio')!.rootPassword,
    });
  }

  async init(): Promise<void> {
    const isBucketExist = await this.client.bucketExists(this.bucketName);

    if (!isBucketExist) {
      await this.client.makeBucket(this.bucketName, this.region);
    }
  }

  public async upload(files: BufferedFile[], bucketName: string = this.bucketName): Promise<string[]> {
    for (const file of files) {
      if (
        !(file.mimetype.includes('png') || file.mimetype.includes('webp') || file.mimetype.includes('officedocument'))
      ) {
        throw new HttpException('File type not supported', HttpStatus.BAD_REQUEST);
      }

      const metaData = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'Content-Type': file.mimetype,
      };

      try {
        await this.client.putObject(bucketName, file.filename, file.buffer, metaData);
      } catch {
        throw new HttpException('Error uploading file', HttpStatus.BAD_REQUEST);
      }
    }

    return files.map((file) => file.filename);
  }

  public async getObject(objectName: string, bucketName: string = this.bucketName): Promise<Buffer> {
    try {
      await this.client.statObject(bucketName, objectName);
    } catch {
      throw new NotFoundException('Object not found in MinIo');
    }

    const objectStream = await this.client.getObject(bucketName, objectName);

    return stream2buffer(objectStream as ReadStream);
  }

  async delete(objetNames: string[], bucketName: string = this.bucketName): Promise<void> {
    try {
      await this.client.removeObjects(bucketName, objetNames);
    } catch {
      throw new HttpException('An error occured when deleting!', HttpStatus.BAD_REQUEST);
    }
  }
}
