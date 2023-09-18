import { BucketItem, Client } from 'minio';

export const objectsList = (minioClient: Client, bucketName: string, dir: string): Promise<BucketItem[]> =>
  new Promise((resolve, reject) => {
    const objectsListTemp: BucketItem[] = [];
    const stream = minioClient.listObjectsV2(bucketName, dir, true, '');

    stream.on('data', (obj) => objectsListTemp.push(obj));
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(objectsListTemp);
    });
  });
