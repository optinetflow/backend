import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ReverseTextPipe implements PipeTransform {
  transform(value: string): string {
    return [...value].reverse().join('');
  }
}
