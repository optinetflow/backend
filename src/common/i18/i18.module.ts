import { Module } from '@nestjs/common'
import { I18nService } from './i18.service'

@Module({
  providers: [I18nService],
  exports: [I18nService]
})
export class I18Module {}
