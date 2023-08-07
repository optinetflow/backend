/* eslint-disable sonarjs/cognitive-complexity */
import type { ReadStream } from 'fs';

export async function stream2buffer(stream: ReadStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const _buf: Uint8Array[] = [];

    stream.on('data', (chunk) => _buf.push(chunk as Uint8Array));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', (err) => reject(`error converting stream - ${err}`));
  });
}

export const isUUID = (string: string): boolean => /[\dA-Fa-f]{8}(?:-[\dA-Fa-f]{4}){3}-[\dA-Fa-f]{12}/.test(string);

export const arrayToDic = <T>(arr: T[], property?: string): Record<string, T> =>
  arr.reduce<Record<string, T>>((all, item) => ({ ...all, [item?.[property || 'id']]: item }), {});

export const isPlainObj = (o): boolean => typeof o === 'object' && o.constructor === Object;

export const getFileExtension = (filename: string): string =>
  filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2); // eslint-disable-line no-bitwise

export const textToSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/[^\w-]+/g, '');

export const uniqueBy = <T>(uniqueKey: string, objects: T[]): T[] => {
  const ids = objects.map((object) => object[uniqueKey]);

  return objects.filter((object, index) => !ids.includes(object[uniqueKey], index + 1));
};

export const midOrder = (prev: string, next: string): string => {
  let p!: number, n!: number, pos!: number, str;

  for (pos = 0; p === n; pos++) {
    // find leftmost non-matching character
    p = pos < prev.length ? prev.charCodeAt(pos) : 96;
    n = pos < next.length ? next.charCodeAt(pos) : 123;
  }

  str = prev.slice(0, pos - 1); // copy identical part of string

  if (p === 96) {
    // prev string equals beginning of next
    while (n === 97) {
      // next character is 'a'
      n = pos < next.length ? next.charCodeAt(pos++) : 123; // get char from next
      str += 'a'; // insert an 'a' to match the 'a'
    }

    if (n === 98) {
      // next character is 'b'
      str += 'a'; // insert an 'a' to match the 'b'
      n = 123; // set to end of alphabet
    }
  } else if (p + 1 === n) {
    // found consecutive characters
    str += String.fromCharCode(p); // insert character from prev
    n = 123; // set to end of alphabet

    while ((p = pos < prev.length ? prev.charCodeAt(pos++) : 96) === 122) {
      // p='z'
      str += 'z'; // insert 'z' to match 'z'
    }
  }

  return `${str}${String.fromCharCode(Math.ceil((p + n) / 2))}`; // append middle character
};

export const prefixFile = (filename: string): string => `${process.env.MINIO_PUBLIC_URL}/${filename}`;

export const groupBy = <T>(items: T[], key: string): Record<string, T[]> =>
  items.reduce(
    (result, item) => ({
      ...result,
      [item[key]]: [...(result[item[key]] || []), item],
    }),
    {},
  );

export const omit = <T>(obj: Record<string, T>, keys: string[]): Record<string, T> => {
  const output: Array<[string, T]> = [];

  for (const [key, value] of Object.entries(obj)) {
    if (!keys.includes(key)) {
      output.push([key, value]);
    }
  }

  return Object.fromEntries(output);
};

export const debounce = (callback: (...args: number[]) => void, wait: number): ((...args: number[]) => void) => {
  let timeoutId: number;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback.apply(null, args); // eslint-disable-line prefer-spread
    }, wait);
  };
};

export const excludeFromArr = (arr: string[], exclude: string[]): string[] => {
  const excludeMap = exclude.reduce<Record<string, boolean>>((all, item) => ({ ...all, [item]: true }), {});

  return arr.filter((item) => !excludeMap?.[item]);
};

export const isIsoDate = (str: string): boolean => {
  if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) {
    return false;
  }

  const d = new Date(str);

  return d instanceof Date && !Number.isNaN(d) && d.toISOString() === str; // valid date
};

export const uniqueByKeys = <T>(keyProps: string[], arr: T[]): T[] => {
  const kvArray: Array<[string, T]> = arr.map((entry) => {
    const key = keyProps.map((k) => entry[k]).join('|');

    return [key, entry];
  });
  const map = new Map(kvArray);

  return [...map.values()];
};
