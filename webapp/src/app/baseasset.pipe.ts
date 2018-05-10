import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
    name: 'baseasset'
})
export class BaseassetPipe implements PipeTransform {
    transform(value: string, args?: any): string {
        return value
                .replace(/BTC$/, "")
                .replace(/USDT$/, "")
                .replace(/BNB$/, "")
                .replace(/ETH$/, "")
                .replace(/\-$/, "");
    }
}
