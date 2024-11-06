import { Injectable } from '@nestjs/common';
import * as i18n from 'i18n';

import TranslateOptions = i18n.TranslateOptions;

declare const _: unknown;

@Injectable()
export class I18nService {
  constructor() {
    i18n.configure({
      locales: ['en', 'fa'],
      defaultLocale: 'fa',
      directory: 'locales',
      objectNotation: true,
    });
  }

  __(phraseOrOptions: string | TranslateOptions, ...replace: string[]) {
    return i18n.__(phraseOrOptions, ...replace);
  }
}
