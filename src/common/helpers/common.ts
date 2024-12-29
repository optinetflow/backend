/* eslint-disable sonarjs/cognitive-complexity */
import * as Cookie from 'cookie';
import type { ReadStream } from 'fs';
import fs from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

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

export function randomStr(length: number): string {
  let result = '';
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  const charactersLength = characters.length;
  let counter = 0;

  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }

  return result;
}

export const isEqual = (a, b) => JSON.stringify(a.sort()) === JSON.stringify(b.sort());

export const getNestedDir = (dir: string): string => {
  const parts = dir.split('/');

  return parts.slice(-2).join('/');
};

export function cutPath(fullPath: string, catPath: string): string {
  const resolvedPath = path.normalize(fullPath.replace(catPath, ''));

  return ['.', '/'].includes(resolvedPath) ? '' : resolvedPath;
}

export function isSessionExpired(setCookieHeader: string): boolean {
  const cookies = Cookie.parse(setCookieHeader);

  if (cookies.Expires) {
    const expiresDateString = cookies.Expires;
    const expiresDate = new Date(expiresDateString);
    const currentDate = new Date();

    return expiresDate <= currentDate ? true : false;
  }

  return true;
}

export async function readFilesRecursively(dir: string): Promise<string[]> {
  const files: string[] = [];
  const dirsAndFiles = await readdir(dir, { recursive: true });

  return dirsAndFiles.filter((dirOrFile) => fs.statSync(path.join(dir, dirOrFile)).isFile());
}

export function jsonObjectToQueryString(jsonObject) {
  // Create a new query string.
  const queryString = new URLSearchParams();

  // Iterate over the key-value pairs in the JSON object and add them to the query string.
  for (const [key, value] of Object.entries(jsonObject)) {
    if (typeof value === 'object') {
      // If the value is an object, stringify it and append to the query string
      queryString.append(key, JSON.stringify(value));
    } else {
      // Append key-value pair to the query string
      queryString.append(key, String(value));
    }
  }

  // Return the query string.
  return queryString.toString();
}

export function removePort(url: string): string {
  return url.split(':')[0];
}

export const getFileFromURL = async (url: string) => {
  const response = await fetch(url);

  const arrayOfBuffer = await response.arrayBuffer();

  return Buffer.from(arrayOfBuffer);
};

export function b64UrlToJson(b64url: string): Record<string, unknown> {
  try {
    const base64Decoded = atob(b64url);

    return Object.fromEntries(new URLSearchParams(base64Decoded).entries());
  } catch {
    console.error('Error parsing b64url to JSON.');

    return {};
  }
}

export function jsonToB64Url(json: Record<string, string>): string {
  try {
    const jsonEncoded = new URLSearchParams(json).toString();
    const base64URLEncoded = btoa(jsonEncoded);

    return base64URLEncoded.replace(/=+$/, '');
  } catch {
    console.error('Error converting JSON to b64url.');

    return '';
  }
}

export const extractFileName = (pathStr?: string | null) => pathStr && path.basename(pathStr, path.extname(pathStr));

export function bytesToGB(bytes: number): number {
  const gigabyte = 1024 * 1024 * 1024; // 1 gigabyte = 1024 megabytes * 1024 kilobytes * 1024 bytes

  return bytes / gigabyte;
}

export function bytesToMB(bytes: number): number {
  const megabyte = 1024 * 1024; // 1 gigabyte = 1024 megabytes * 1024 kilobytes * 1024 bytes

  return bytes / megabyte;
}

/* eslint-disable sonarjs/no-nested-template-literals */
export function convertPersianCurrency(number: number): string {
  const numberAbs = Math.abs(number);

  if (numberAbs >= 1 && numberAbs < 1000) {
    return `${number > 0 ? number : `${-number}-`} هزار تومان`;
  }

  if (numberAbs >= 1000 && numberAbs < 1_000_000) {
    return `${number > 0 ? number / 1000 : `${-number / 1000}-`} میلیون تومان`;
  }

  return number.toString();
}

export const getVlessLink = (id: string, tunnelDomain: string, name: string, port: number) =>
  `vless://${id}@${removePort(
    tunnelDomain,
  )}:${port}?type=ws&path=%2Fws&security=tls&fp=chrome&alpn=http%2F1.1%2Ch2&allowInsecure=1#${encodeURIComponent(
    name,
  )}`;

export function floorTo(number: number, decimalPlaces: number) {
  const factor = Math.pow(10, decimalPlaces);

  return Math.floor(number * factor) / factor;
}

export function roundTo(number: number, decimalPlaces: number) {
  const factor = Math.pow(10, decimalPlaces);

  return Math.round(number * factor) / factor;
}

export function ceilTo(number: number, decimalPlaces: number) {
  const factor = Math.pow(10, decimalPlaces);

  return Math.ceil(number * factor) / factor;
}

export function getRemainingDays(expiryTime: number): number {
  const remainingTime = expiryTime - Date.now();
  const millisecondsInDay = 24 * 60 * 60 * 1000;

  return roundTo(remainingTime / millisecondsInDay, 0);
}

export function getDateTimeString() {
  // Get the current date and time
  const now = new Date();

  // Format the year, month, day, hour, and minute with zero-padding
  const year = now.getFullYear().toString().padStart(4, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-indexed
  const day = now.getDate().toString().padStart(2, '0');
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');

  // Combine them into a string with separators
  return `${year}-${month}-${day}_${hour}-${minute}`;
}

// Percent from 100
export const pctToDec = (number?: number | null): number => (typeof number === 'number' ? number / 100 : 0);

export const ceilIfNeeded = (value: number, decimals: number) => (value >= 5 ? ceilTo(value, decimals) : value);
