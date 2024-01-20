/*  eslint-disable no-await-in-loop, @typescript-eslint/naming-convention */

import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReadStream } from 'fs';
import { createWriteStream } from 'fs';
import { mkdir, readdir, readFile } from 'fs/promises';
import Upload from 'graphql-upload/Upload.js';
import mime from 'mime-types';
import { BucketItem, Client } from 'minio';
import { PrismaService } from 'nestjs-prisma';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';

import type { MinioConfig } from '../common/configs/config.interface';
import { cutPath, getFileFromURL, objectsList, readFilesRecursively, stream2buffer } from '../common/helpers';
import { User } from '../users/models/user.model';
import type { BufferedFile } from './minio.model';

interface UploadByPath {
  filePath: string;
  toMinioDir: string;
  fileName?: string;
  bucketName?: string;
}
@Injectable()
export class MinioClientService {
  constructor(private prisma: PrismaService, private readonly configService: ConfigService) {
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
      try {
        await this.client.putObject(bucketName, file.filename, file.buffer);
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

  async uploadDir(dir: string, toMinioDir: string, bucketName: string = this.bucketName): Promise<void> {
    const files = await readFilesRecursively(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);

      await this.uploadByPath({
        filePath,
        toMinioDir: `${toMinioDir}/${cutPath(file, path.basename(file))}`,
        bucketName,
      });
    }
  }

  async uploadByPath({ filePath, toMinioDir, bucketName = this.bucketName, fileName }: UploadByPath): Promise<void> {
    const buffer = await readFile(filePath);

    const metaData = {
      'Content-Type': mime.contentType(path.extname(filePath)),
    };

    await this.client.putObject(bucketName, `${toMinioDir}/${fileName || path.basename(filePath)}`, buffer, metaData);
  }

  public async getDir(dir: string, bucketName: string = this.bucketName): Promise<BucketItem[]> {
    try {
      return await objectsList(this.client, bucketName, dir);
    } catch {
      throw new NotFoundException('Object not found in MinIo');
    }
  }

  async downloadDir(fromMinioDir, toLocalDir) {
    try {
      const objects = await objectsList(this.client, this.bucketName, fromMinioDir);

      for (const obj of objects) {
        const filePath = path.join(toLocalDir, cutPath(obj.name, fromMinioDir));
        await this.downloadByPath(obj.name, filePath);
      }
    } catch (error) {
      console.error('Error downloading directory:', error);
    }
  }

  async downloadByPath(fromMinioPath, toLocalPath): Promise<void> {
    try {
      const stream = await this.client.getObject(this.bucketName, fromMinioPath);

      const destDir = path.dirname(toLocalPath);
      await mkdir(destDir, { recursive: true });

      const fileStream = createWriteStream(toLocalPath);

      stream.pipe(fileStream);

      return new Promise((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
    } catch (error) {
      console.error('Error downloading file:', error);

      return Promise.reject(error);
    }
  }

  async uploadImageTemporary(user: User, image: Upload): Promise<string> {
    const id = uuid();
    const nonPromiseImage = await image;
    const imageStream = (await nonPromiseImage.createReadStream()) as ReadStream;
    const imageBuffer = await stream2buffer(imageStream);
    const uploadPath = `tempImage/${id}.jpg`;
    let resizedImage: Buffer;

    try {
      resizedImage = await sharp(imageBuffer).resize(500).jpeg().toBuffer();
    } catch {
      throw new BadRequestException('Image resizing failed!');
    }

    try {
      await this.upload([{ filename: uploadPath, buffer: resizedImage }]);
    } catch {
      throw new BadRequestException('Uploading image to minio got failed!');
    }

    await this.prisma.file.create({
      data: {
        id,
        name: uploadPath,
        userId: user.id,
      },
    });

    return id;
  }
}
