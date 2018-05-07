// Copyright (C) 2018 Cranky Kernel
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import {Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs/Observable';
import {map} from 'rxjs/operators';

export enum KlineInterval {
    M1 = "1m",
    M3 = "3m",
    M5 = "5m",
    M15 = "15m",
    M30 = "30m",
    H1 = "1h",
    H2 = "2h",
    H4 = "4h",
    H6 = "6h",
    H8 = "8h",
    H12 = "12h",
    D1 = "1d",
}

export interface KlineOptions {
    symbol: string;
    interval: KlineInterval;
    limit?: number;
}

export interface Kline {
    openTime: number;
    open: number;
    close: number;
    high: number;
    low: number;
    volume: number;
}

const RAW_KLINE_OPENTIME_INDEX = 0;
const RAW_KLINE_OPEN_INDEX = 1;
const RAW_KLINE_HIGH_INDEX = 2;
const RAW_KLINE_LOW_INDEX = 3;
const RAW_KLINE_CLOSE_INDEX = 4;
const RAW_KLINE_VOLUME_INDEX = 5;
const RAW_KLINE_CLOSETIME_INDEX = 6;
const RAW_KLINE_QUOTE_VOLUME_INDEX = 7;
const RAW_KLINE_TRADE_COUNT_INDEX = 8;
const RAW_KLINE_TAKER_BUY_VOLUME_INDEX = 9;
const RAW_KLINE_TAKER_BUY_QUOTE_VOLUME_INDEX = 10;

// REST Kline response:
// [
//     [
//         1499040000000,      // Open time
//         "0.01634790",       // Open
//         "0.80000000",       // High
//         "0.01575800",       // Low
//         "0.01577100",       // Close
//         "148976.11427815",  // Volume
//         1499644799999,      // Close time
//         "2434.19055334",    // Quote asset volume
//         308,                // Number of trades
//         "1756.87402397",    // Taker buy base asset volume
//         "28.46694368",      // Taker buy quote asset volume
//         "17928899.62484339" // Ignore
//     ]
// ]
export class RestKline implements Kline {

    private rawKline: any[] = null;

    constructor(rawKline: any[]) {
        this.rawKline = rawKline;
    }

    get openTime(): number {
        return this.rawKline[RAW_KLINE_OPENTIME_INDEX];
    }

    get open(): number {
        return +this.rawKline[RAW_KLINE_OPEN_INDEX];
    }

    get close(): number {
        return +this.rawKline[RAW_KLINE_CLOSE_INDEX];
    }

    get high(): number {
        return +this.rawKline[RAW_KLINE_HIGH_INDEX];
    }

    get low(): number {
        return +this.rawKline[RAW_KLINE_LOW_INDEX];
    }

    get volume(): number {
        return +this.rawKline[RAW_KLINE_VOLUME_INDEX];
    }

}

export class StreamKline implements Kline {

    private kline: any = null;

    constructor(kline: any) {
        if (kline.k) {
            this.kline = kline.k;
        } else {
            this.kline = kline;
        }
    }

    get openTime(): number {
        return this.kline.t;
    }

    get open(): number {
        return +this.kline.o;
    }

    get close(): number {
        return +this.kline.c;
    }

    get high(): number {
        return +this.kline.h;
    }

    get low(): number {
        return +this.kline.l;
    }

    get volume(): number {
        return +this.kline.v;
    }
}

@Injectable()
export class BinanceApiService {

    private baseUrl: string;

    constructor(private http: HttpClient) {
        this.baseUrl = `/api/1/binance/proxy`;
    }

    public getRawKlines(options: KlineOptions): Observable<any[]> {
        let params = new HttpParams();
        params = params.append("symbol", options.symbol);
        params = params.append("interval", options.interval);
        if (options.limit) {
            params = params.append("limit", `${options.limit}`);
        }
        return this.http.get<any[]>(`${this.baseUrl}/api/v1/klines`, {
            params: params,
        });
    }

    public getKlines(options: KlineOptions): Observable<Kline[]> {
        return this.getRawKlines(options).pipe(
                map((klines: any[]) => {
                    return klines.map((kline: any) => {
                        return new RestKline(kline);
                    });
                })
        );
    }
}
