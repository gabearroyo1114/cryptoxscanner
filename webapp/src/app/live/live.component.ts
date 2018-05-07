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

import {
    Component,
    Directive,
    ElementRef,
    Input,
    OnDestroy,
    OnInit
} from '@angular/core';
import {Subscription} from 'rxjs/Subscription';
import {
    BinanceBaseCoins,
    KuCoinBaseCoins,
    SymbolUpdate,
    ScannerApiService
} from '../scanner-api.service';
import {animate, state, style, transition, trigger} from "@angular/animations";
import {Observable} from 'rxjs/Observable';

declare var localStorage: any;

interface Banner {
    show: boolean;
    className: string;
    message: string;
}

@Component({
    selector: "[app-th-sortable]",
    template: `
      <!-- @formatter:off -->
      <span style="cursor: pointer;"><ng-content></ng-content><span *ngIf="sortBy===name">
          <span *ngIf="sortOrder==='desc'"><i class="fas fa-caret-down"></i></span>
          <span *ngIf="sortOrder==='asc'"><i class="fas fa-caret-up"></i></span>
        </span>
      </span>
    `,
})
export class AppThSortableComponent {
    @Input() name;
    @Input() sortBy;
    @Input() sortOrder;
}

interface ColumnConfig {
    title: string;
    name: string;
    display: boolean;
    type: string;
    format?: string;
    routerLink?: string;
    fn?: any;
}


@Component({
    templateUrl: './live.component.html',
    styleUrls: ['./live.component.scss'],
    animations: [
        trigger('bannerState', [
            state('void', style({
                opacity: 0,
            })),
            state('*', style({
                opacity: 1,
            })),
            transition('* => void', animate('500ms ease-out')),
            transition('void => *', animate('500ms ease-out')),
        ])
    ],
})
export class BinanceLiveComponent implements OnInit, OnDestroy {

    public exchange: string = "binance";

    public baseTokens: string[] = BinanceBaseCoins;

    private configKey: string = "binance.live.config";

    hasCharts: boolean = true;

    config: any = {
        base: "BTC",
        sortBy: "price_change_pct15",
        sortOrder: "desc",
        maxPrice: null,
        minPrice: null,
        max24Change: null,
        min24Change: null,
        filter: null,
        count: 25,
        visibleColumns: {},
        watching: {},
    };

    private stream: Subscription = null;

    public stream$: Observable<any>;

    // A map of all the tickers keyed by symbol. The update message includes
    // a list of tickers, and not all may be present (for example, no update
    // for a symbol). So we want to save the previous tickers to prevent
    // symbols from disappearing from the display.
    private tickerMap: any = {};

    // The sorted and filtered tickers to be displayed on the screen.
    tickers: SymbolUpdate[] = [];

    banner: Banner = {
        show: true,
        className: "alert-info",
        message: "Connecting to API.",
    };

    private lastUpdate: number = 0;

    private idleInterval: any = null;

    idleTime: number = 0;

    headers: ColumnConfig[] = [];

    // The index of the row the user is currently hovering over.
    private activeRow: number = null;

    constructor(public tokenFxApi: ScannerApiService) {
    }

    protected initHeaders() {
        this.headers = [
            {
                title: "Symbol",
                name: "symbol",
                display: true,
                type: "function",
                routerLink: this.hasCharts ? "/binance/symbol" : null,
            },
            {
                title: "Last",
                name: "close",
                type: "number",
                format: ".8",
                display: true,
            },
            {
                title: "Bid",
                name: "bid",
                type: "number",
                format: ".8",
                display: false,
            },
            {
                title: "Ask",
                name: "ask",
                type: "number",
                format: ".8",
                display: false,
            },
            {
                title: "24h High",
                name: "high",
                type: "number",
                format: ".8",
                display: false,
            },
            {
                title: "24h Low",
                name: "low",
                type: "number",
                format: ".8",
                display: false,
            },
            {
                title: "24h %",
                name: "price_change_pct_24h",
                type: "percent-number",
                display: true,
            },
            {
                title: "24h Vol",
                name: "volume",
                type: "number",
                format: ".2-2",
                display: true,
            },
            {
                title: "1m %",
                name: "price_change_pct_1m",
                type: "percent-number",
                display: true,
            },
            {
                title: "5m %",
                name: "price_change_pct_5m",
                type: "percent-number",
                display: true,
            },
            {
                title: "10m %",
                name: "price_change_pct_10m",
                type: "percent-number",
                display: true,
            },
            {
                title: "15m %",
                name: "price_change_pct_15m",
                type: "percent-number",
                display: true,
            },
            {
                title: "60m %",
                name: "price_change_pct_1h",
                type: "percent-number",
                display: true,
            },
            {
                title: "1m Vol %",
                name: "volume_change_pct_1m",
                type: "percent-number",
                display: true,
            },
            {
                title: "2m Vol %",
                name: "volume_change_pct_2m",
                type: "percent-number",
                display: true,
            },
            {
                title: "3m Vol %",
                name: "volume_change_pct_3m",
                type: "percent-number",
                display: true,
            },
            {
                title: "5m Vol %",
                name: "volume_change_pct_5m",
                type: "percent-number",
                display: true,
            },
            {
                title: "10m Vol %",
                name: "volume_change_pct_10m",
                type: "percent-number",
                display: true,
            },
            {
                title: "15m Vol %",
                name: "volume_change_pct_15m",
                type: "percent-number",
                display: true,
            },
            {
                title: "60m Vol %",
                name: "volume_change_pct_1h",
                type: "percent-number",
                display: true,
            },
        ];

        for (const i of [1, 2, 3, 5, 10, 15, 60]) {
            this.headers.push({
                title: `${i}mL`,
                name: `l_${i}`,
                type: "number",
                format: ".8-8",
                display: false,
            });
            this.headers.push({
                title: `${i}mH`,
                name: `h_${i}`,
                type: "number",
                format: ".8-8",
                display: false,
            });
            this.headers.push({
                title: `${i}mR%`,
                name: `rp_${i}`,
                type: "percent-number",
                display: true,
            });
        }

        const extendedVolumeHeaders = [
            {
                title: "1mNV",
                name: "nv_1",
                type: "number",
                format: ".2-2",
                display: true,
                updown: true,
            },
            {
                title: "2mNV",
                name: "nv_2",
                type: "number",
                format: ".2-2",
                display: true,
                updown: true,
            },
            {
                title: "3mNV",
                name: "nv_3",
                type: "number",
                format: ".2-2",
                display: true,
                updown: true,
            },
            {
                title: "4mNV",
                name: "nv_4",
                type: "number",
                format: ".2-2",
                display: true,
                updown: true,
            },
            {
                title: "5mNV",
                name: "nv_5",
                type: "number",
                format: ".2-2",
                display: true,
                updown: true,
            },
            {
                title: "10mNV",
                name: "nv_10",
                type: "number",
                format: ".2-2",
                display: true,
                updown: true,
            },
            {
                title: "15mNV",
                name: "nv_15",
                type: "number",
                format: ".2-2",
                display: true,
                updown: true,
            },
            {
                title: "60mNV",
                name: "nv_60",
                type: "number",
                format: ".2-2",
                display: true,
                updown: true,
            },
            {
                title: "1m Vol",
                name: "total_volume_1",
                type: "number",
                format: ".2-2",
                display: true,
            },
            {
                title: "5m Vol",
                name: "total_volume_5",
                type: "number",
                format: ".2-2",
                display: true,
            },
            {
                title: "10m Vol",
                name: "total_volume_10",
                type: "number",
                format: ".2-2",
                display: true,
            },
            {
                title: "15m Vol",
                name: "total_volume_15",
                type: "number",
                format: ".2-2",
                display: true,
            },
            {
                title: "60m Vol",
                name: "total_volume_60",
                type: "number",
                format: ".2-2",
                display: true,
            },
        ];

        if (this.exchange == "binance") {
            this.headers.push.apply(this.headers, extendedVolumeHeaders);
        }

        this.restoreConfig();
    }

    showDefaultColumns() {
        for (const col of this.headers) {
            this.config.visibleColumns[col.name] = col.display;
        }
    }

    restoreConfig() {
        if (localStorage[this.configKey]) {
            try {
                const config = JSON.parse(localStorage[this.configKey]);
                if (!config.visibleColumns) {
                    this.showDefaultColumns();
                } else {
                    console.log(config.visibleColumns);
                    for (const col of this.headers) {
                        if (!(col.name in config.visibleColumns)) {
                            config.visibleColumns[col.name] = col.display;
                        }
                    }
                }
                this.config = config;
                return;
            } catch (err) {
            }
        }
        this.showDefaultColumns();
    }

    saveConfig() {
        localStorage[this.configKey] = JSON.stringify(this.config);
    }

    ngOnInit() {
        this.initHeaders();
        this.startUpdates();
        this.idleInterval = setInterval(() => {
            if (this.lastUpdate === 0) {
                return;
            }
            this.idleTime = (new Date().getTime() - this.lastUpdate) / 1000;
        }, 1000);
    }

    ngOnDestroy() {
        if (this.stream) {
            this.stream.unsubscribe();
        }
        clearInterval(this.idleInterval);
    }

    protected connect() {
        return this.tokenFxApi.connectBinanceLive();
    }

    private startUpdates() {
        if (this.stream) {
            this.stream.unsubscribe();
        }

        this.stream = this.connect().subscribe(
                (update: any) => {
                    if (this.banner.show) {
                        console.log("Updating banner.");
                        this.banner = {
                            show: true,
                            className: "alert-success",
                            message: "Connected!",
                        };
                        setTimeout(() => {
                            this.banner.show = false;
                        }, 1000);
                    }

                    if (update == null) {
                        // Connect signal.
                        return;
                    }

                    const tickers: SymbolUpdate[] = update.tickers || update;

                    // Put the tickers into a map.
                    for (let i = 0, n = tickers.length; i < n; i++) {
                        this.flattenTicker(tickers[i]);
                        this.tickerMap[tickers[i].symbol] = tickers[i];
                    }

                    this.render();
                },
                (error) => {
                    this.banner = {
                        show: true,
                        className: "alert-warning",
                        message: "WebSocket error! Reconnecting.",
                    };
                    console.log("websocket error:");
                    console.log(error);
                    setTimeout(() => {
                        this.startUpdates();
                    }, 1000);
                },
                () => {
                    this.banner = {
                        show: true,
                        className: "alert-warning",
                        message: "WebSocket closed!",
                    };
                    console.log("websocket closed. Reconnecting.");
                    setTimeout(() => {
                        this.startUpdates();
                    });
                });
    }

    /**
     * Convert the string v into a number. Null is returned if the string
     * is not a number.
     */
    private asNumber(input: string): number {
        if (input == null || input === "") {
            return null;
        }
        const value: number = +input;
        if (!isNaN(value)) {
            return value;
        }
        return null;
    }

    render() {
        this.lastUpdate = new Date().getTime();

        // If active row is non-null the user is hovering on a row. Record
        // the index and the symbol.
        let activeSymbol: string = null;
        const activeRow = this.activeRow;
        if (activeRow != null) {
            activeSymbol = this.tickers[this.activeRow].symbol;
        }
        let activeTicker: SymbolUpdate = null;

        let tickers: SymbolUpdate[] = Object.keys(this.tickerMap).map(key => {
            return this.tickerMap[key];
        });

        const maxPrice = this.asNumber(this.config.maxPrice);
        const minPrice = this.asNumber(this.config.minPrice);
        const max24Change = this.asNumber(this.config.max24Change);
        const min24Change = this.asNumber(this.config.min24Change);

        tickers = tickers.filter((ticker) => {

            if (!this.filterBase(ticker)) {
                return false;
            }

            // If this is the symbol that is being hovered, pluck it out. It
            // will be insert back in at the same position later.
            if (activeSymbol != null && ticker.symbol == activeSymbol) {
                activeTicker = ticker;
                return false;
            }

            if (max24Change != null) {
                if (ticker.price_change_pct["24h"] > max24Change) {
                    return false;
                }
            }

            if (min24Change != null) {
                if (ticker.price_change_pct["24h"] < min24Change) {
                    return false;
                }
            }

            if (maxPrice) {
                if (ticker.close > maxPrice) {
                    return false;
                }
            }

            if (minPrice) {
                if (ticker.close < minPrice) {
                    return false;
                }
            }

            if (this.config.filter != null && this.config.filter != "") {
                if (ticker.symbol.indexOf(this.config.filter.toUpperCase()) < 0) {
                    return false;
                }
            }

            return true;
        });

        tickers = tickers.sort((a, b) => this.sortTickers(a, b));

        for (let i = 0, n = tickers.length; i < n; i++) {
            if (this.config.watching[tickers[i].symbol]) {
                const ticker = tickers[i];
                tickers.splice(i, 1);
                tickers.unshift(ticker);
            }
        }

        tickers = tickers.slice(0, this.config.count);

        // If we plucked out a ticker, re-insert it here.
        if (activeRow != null && activeTicker) {
            tickers.splice(activeRow, 0, activeTicker);
        }

        this.tickers = tickers;
    }

    private flattenTicker(ticker: SymbolUpdate) {
        for (const key of Object.keys(ticker.price_change_pct)) {
            ticker[`price_change_pct_${key}`] =
                    ticker.price_change_pct[key];
        }
        for (const key of Object.keys(ticker.volume_change_pct)) {
            ticker[`volume_change_pct_${key}`] =
                    ticker.volume_change_pct[key];
        }
    }

    /**
     * Base coin filter. Returns true if the symbol ends in the base coin.
     */
    filterBase(ticker: SymbolUpdate): boolean {
        return ticker.symbol.endsWith(this.config.base);
    }

    sortTickers(a, b: SymbolUpdate): number {
        switch (this.config.sortBy) {
            case "symbol":
                switch (this.config.sortOrder) {
                    case "desc":
                        return b.symbol.localeCompare(a.symbol);
                    default:
                        return a.symbol.localeCompare(b.symbol);
                }
            default:
                // By default sort as numbers.
                if (this.config.sortOrder == "asc") {
                    return a[this.config.sortBy] - b[this.config.sortBy];
                }
                return b[this.config.sortBy] - a[this.config.sortBy];
        }
    }

    sortBy(column: string) {
        if (this.config.sortBy == column) {
            this.toggleSortOrder();
        } else {
            this.config.sortBy = column;
        }
        console.log("Calling render...");
        this.render();
        console.log("Render done.");
    }

    private toggleSortOrder() {
        if (this.config.sortOrder == "asc") {
            this.config.sortOrder = "desc";
        } else {
            this.config.sortOrder = "asc";
        }
    }

    trackBy(index, item) {
        return item.symbol;
    }

    mouseEnter(index: number) {
        this.activeRow = index;
    }
}

@Directive({
    selector: "[appUpDown]",
})
export class AppUpDownDirective {

    constructor(el: ElementRef) {
        el.nativeElement.style.color = "green";
    }

}

@Component({
    templateUrl: './live.component.html',
    styleUrls: ['./live.component.scss'],
    animations: [
        trigger('bannerState', [
            state('void', style({
                opacity: 0,
            })),
            state('*', style({
                opacity: 1,
            })),
            transition('* => void', animate('500ms ease-out')),
            transition('void => *', animate('500ms ease-out')),
        ])
    ]
})
export class KuCoinLiveComponent extends BinanceLiveComponent {

    public exchange: string = "kucoin";
    public baseTokens: string[] = KuCoinBaseCoins;
    public hasCharts: boolean = false;

    protected connect() {
        return this.tokenFxApi.connectKuCoinLive();
    }
}
