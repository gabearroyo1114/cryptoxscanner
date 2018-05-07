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
import {Observable} from 'rxjs/Observable';
import {Observer} from "rxjs/Observer";
import 'rxjs/add/operator/map';
import {HttpClient} from '@angular/common/http';
import {environment} from '../environments/environment';

declare var window: Window;

export const BinanceBaseCoins: string[] = [
    "BTC",
    "ETH",
    "BNB",
    "USDT",
];

export const KuCoinBaseCoins: string[] = [
    "BTC",
    "ETH",
    "USDT",
    "KCS",
    "NEO",
];

@Injectable()
export class ScannerApiService {

    public PROTO_VERSION = environment.protoVersion;

    private protocol: string = "wss";

    private baseUrl: string;

    constructor(private http: HttpClient) {
        const location = window.location;
        switch (location.protocol) {
            case "https:":
                this.protocol = "wss";
                break;
            default:
                this.protocol = "ws";
        }

        this.baseUrl = `${this.protocol}://${location.host}`;

        console.log(`TokenFxApiService: PROTO_VERSION: ${this.PROTO_VERSION}`);
    }

    public ping(): Observable<any> {
        return this.http.get("/api/1/ping");
    }

    public connect(url): Observable<SymbolUpdate[] | SymbolUpdate> {
        return new Observable(
                (obs: Observer<SymbolUpdate[]>) => {

                    const ws = new WebSocket(url);

                    // On connect send a null as a signal.
                    ws.onopen = () => {
                        obs.next(null);
                    };

                    const onmessage = (event) => {
                        obs.next(JSON.parse(event.data));
                    };

                    const onerror = (event) => {
                        obs.error(event);
                    };

                    const onclose = () => {
                        obs.complete();
                    };

                    ws.onmessage = onmessage;
                    ws.onerror = onerror;
                    ws.onclose = onclose;

                    return () => {
                        ws.close();
                    };
                });
    }

    public connectBinanceMonitor(): Observable<SymbolUpdate[] | SymbolUpdate> {
        const url = `${this.baseUrl}/ws/binance/monitor`;
        return this.connect(url);
    }

    public connectBinanceLive(): Observable<SymbolUpdate[] | SymbolUpdate> {
        const url = `${this.baseUrl}/ws/binance/live`;
        return this.connect(url);
    }

    public connectBinanceSymbol(symbol: string): Observable<SymbolUpdate[] | SymbolUpdate> {
        const url = `${this.baseUrl}/ws/binance/symbol?symbol=${symbol}`;
        return this.connect(url);
    }

    public connectKuCoinMonitor(): Observable<SymbolUpdate[] | SymbolUpdate> {
        const url = `${this.baseUrl}/ws/kucoin/monitor`;
        return this.connect(url);
    }

    public connectKuCoinLive(): Observable<SymbolUpdate[] | SymbolUpdate> {
        const url = `${this.baseUrl}/ws/kucoin/live`;
        return this.connect(url);
    }

}

export interface SymbolUpdate {
    symbol: string;

    price_change_pct: {
        [key: string]: number;
    };

    volume_change_pct: {
        [key: string]: number;
    };

    net_volume_1?: number;
    net_volume_5?: number;
    net_volume_10?: number;
    net_volume_15?: number;
    net_volume_60?: number;

    total_volume_1?: number;
    total_volume_5?: number;
    total_volume_10?: number;
    total_volume_15?: number;
    total_volume_60?: number;

    vwap_1m?: number;
    vwap_2m?: number;
    vwap_3m?: number;
    vwap_4m?: number;
    vwap_5m?: number;
    vwap_10m?: number;
    vwap_15m?: number;
    vwap_60m?: number;

    bid: number;
    ask: number;
    close: number;
    timestamp: string;
    volume: number;
}
