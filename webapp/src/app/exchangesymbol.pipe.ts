import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
    name: 'exchangesymbol'
})
export class ExchangesymbolPipe implements PipeTransform {

    transform(value: string, exchange: string): string {
        switch (exchange.toLowerCase()) {
            case "binance":
                const exchangeSymbol = value.toUpperCase()
                        .replace("-", "")
                        .replace("_", "")
                        .replace(/BTC$/, "_BTC")
                        .replace(/ETH$/, "_ETH")
                        .replace(/USDT$/, "_USDT")
                        .replace(/BNB$/, "_BNB");
                return exchangeSymbol;
            default:
                return value;
        }
    }

}
