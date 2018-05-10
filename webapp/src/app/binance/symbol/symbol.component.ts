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

import {AfterViewInit, Component, OnDestroy, OnInit} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {ActivatedRoute, Router} from '@angular/router';
import {ScannerApiService, SymbolUpdate} from '../../scanner-api.service';
import {Subscription} from 'rxjs/Subscription';

import {
    BinanceApiService,
    Kline,
    KlineInterval,
    StreamKline
} from '../../binance-api.service';

import * as Mousetrap from "mousetrap";
import * as $ from "jquery";

declare var TradingView: any;
declare var Highcharts: any;

interface Trade {
    price: number;
    quantity: number;
    timestamp: Date;
    buyerMaker: boolean;
}

interface Ticker {
    timestamp: Date;
    lastPrice: number;
    bid: number;
    ask: number;
}

function rawTickerToTicker(raw): Ticker {
    return {
        timestamp: new Date(raw.E),
        lastPrice: +raw.c,
        bid: +raw.b,
        ask: +raw.a,
    };
}

class CandleStickChart {

    private chart: any = null;

    private lastKline: Kline = null;

    constructor(elementId: string) {
        this.chart = Highcharts.stockChart(elementId, {
            yAxis: [
                {
                    labels: {
                        align: 'right',
                        x: -3
                    },
                    title: {
                        text: 'OHLC'
                    },
                    height: '60%',
                    lineWidth: 2,
                    resize: {
                        enabled: true
                    }
                },
                {
                    labels: {
                        align: 'right',
                        x: -3
                    },
                    title: {
                        text: 'Volume'
                    },
                    top: '65%',
                    height: '35%',
                    offset: 0,
                    lineWidth: 2
                }],
            series: [
                {
                    name: "OHLC",
                    type: "candlestick",
                    data: [],
                },
                {
                    name: "Volume",
                    type: "column",
                    yAxis: 1,
                    data: [],
                },
            ],
            rangeSelector: {
                enabled: false,
            },
            navigator: {
                enabled: false,
            },
            scrollbar: {
                enabled: false,
            },
            time: {
                useUTC: false,
            },
            plotOptions: {
                candlestick: {
                    color: "red",
                    upColor: "green",
                }
            },
            credits: {
                enabled: false,
            }
        });
    }

    public update(kline: Kline, draw = true) {
        console.log("Updating candlestick chart.");

        const candlesticks: any = this.chart.series[0];
        const volumes: any = this.chart.series[1];
        const numPoints = candlesticks.yData.length;
        let doShift = false;

        if (this.lastKline && numPoints > 0 && this.lastKline.openTime == kline.openTime) {
            candlesticks.removePoint(numPoints - 1, false);
            volumes.removePoint(numPoints - 1, false);
            doShift = false;
        } else {
            doShift = numPoints >= 60 ? true : false;
        }

        candlesticks.addPoint([
            kline.openTime,
            kline.open,
            kline.high,
            kline.low,
            kline.close,
        ], false, doShift);

        volumes.addPoint([
            kline.openTime,
            kline.volume,
        ], false, doShift);

        this.lastKline = kline;

        if (draw) {
            this.redraw();
        }

        if (candlesticks.yData.length != volumes.yData.length) {
            console.log("error: candlestick and volume lengths differ.");
        }
    }

    public redraw() {
        if (document.hidden) {
            return;
        }
        this.chart.redraw(false);
    }

    public destroy() {
        this.chart.destroy();
        this.chart = null;
    }

    public clear(redraw: boolean) {
        this.chart.series[0].setData([], false);
        this.chart.series[1].setData([], false);
        if (redraw) {
            this.redraw();
        }
    }
}

class PriceChart {

    public maxPoints: number = 60;

    private elementId: string = null;

    private chart: any = null;

    private data: any = [];

    constructor(elementId: string) {
        this.elementId = elementId;
        this.createChart();
    }

    createChart() {
        this.chart = Highcharts.chart(this.elementId, {
            title: {
                text: null,
            },
            yAxis: {
                labels: {
                    enabled: true,
                },
                title: null,
            },
            series: [
                {
                    name: "Price",
                    decimals: 8,
                    data: [],
                },
            ],
            rangeSelector: {
                enabled: false,
            },
            navigator: {
                enabled: false,
            },
            scrollbar: {
                enabled: false,
            },
            xAxis: {
                type: "datetime",
            },
            legend: {
                enabled: false,
            },
            time: {
                useUTC: false,
            },
            credits: {
                enabled: false,
            }
        });
    }

    public update(ticker: Ticker) {
        this.data.push([
            ticker.timestamp.getTime(),
            ticker.lastPrice,
        ]);
        while (this.data.length > this.maxPoints) {
            this.data.shift();
        }

        const series = this.chart.series[0];

        // Sometimes setData fails...
        try {
            series.setData(this.data.map((e) => {
                return e;
            }), false);
            this.redraw();
        } catch (err) {
            console.log("price chart: error setting data; recreating");
            console.log(err);
            this.createChart();
        }
    }

    public redraw() {
        if (document.hidden) {
            return;
        }
        this.chart.redraw();
    }

    public destroy() {
        try {
            this.chart.destroy();
            this.chart = null;
        } catch (err) {
        }
    }
}

class DepthChart {

    private chart: any = null;

    constructor(elementId: string) {
        this.chart = Highcharts.chart(elementId, {
            chart: {
                type: "area",
            },
            title: {
                text: null,
            },
            yAxis: {
                labels: {
                    enabled: false,
                },
                title: null,
            },
            xAxis: {
                labels: {
                    enabled: false,
                },
                title: null,
            },
            series: [
                {
                    name: "Asks",
                    data: this.askData,
                    color: "red",
                },
                {
                    name: "Bids",
                    data: this.bidData,
                    color: "green",
                }
            ],
            legend: {
                enabled: false,
            },
            credits: {
                enabled: false,
            }
        });
    }

    private askData = [];
    private bidData = [];

    public update(asks: any[], bids: any[]) {

        if (document.hidden) {
            return;
        }

        this.askData = [];

        let askTotal: number = 0;
        for (let i = 0, n = asks.length; i < n; i++) {
            const price: number = +asks[i][0];
            const amount: number = +asks[i][1];
            askTotal += amount;
            this.askData.push([price, askTotal]);
        }

        this.askData = this.askData.sort((a, b) => {
            return a[0] - b[0];
        });

        this.bidData = [];
        for (let i = 0, n = bids.length; i < n; i++) {
            const price: number = +bids[i][0];
            const amount: number = +bids[i][1];
            this.bidData.push([price, amount]);
        }

        this.bidData = this.bidData.sort((a, b) => {
            return a[0] - b[0];
        });

        let bidTotal: number = 0;
        for (let i = this.bidData.length - 1; i >= 0; i--) {
            bidTotal += this.bidData[i][1];
            this.bidData[i][1] = bidTotal;
        }

        this.chart.series[0].setData(this.askData, false, false);
        this.chart.series[1].setData(this.bidData, false, false);

        this.redraw();
    }

    public redraw() {
        this.chart.redraw(false);
    }
}

@Component({
    templateUrl: './symbol.component.html',
    styleUrls: ['./symbol.component.scss']
})
export class BinanceSymbolComponent implements OnInit, OnDestroy, AfterViewInit {

    /** The symbol with quote asset. */
    symbol: string = "BNBBTC";

    /** The base asset. */
    baseAsset: string = null;

    exchangeSymbol: string = "";

    private binanceStream: any = null;

    symbols: string[] = [];

    trades: Trade[] = [];

    lastKline: Kline = null;

    lastPrice: number = null;

    private priceChart: PriceChart = null;

    private depthChart: DepthChart = null;

    maxTradeHistory: number = 20;

    private candleStickChart: CandleStickChart = null;

    private tokenfxFeed: Subscription = null;

    lastUpdate: SymbolUpdate = null;

    binanceState: string = "connecting";

    tokenFxState: string = "connecting";

    klineInterval: KlineInterval = KlineInterval.M1;

    private klinesReady: boolean = false;

    availableKlineIntervals: string[] = Object.keys(KlineInterval).map((key) => {
        return KlineInterval[key];
    });

    orderBook = {
        bids: [],
        asks: [],
    };

    ATR: any = {};

    showTradingViewCharts: boolean = true;

    useHighStocksCandleChart: boolean = false;

    constructor(private http: HttpClient,
                private route: ActivatedRoute,
                private router: Router,
                private tokenfx: ScannerApiService,
                private binanceApi: BinanceApiService) {
    }

    ngOnDestroy() {
        document.removeEventListener("visibilitychange", this);
        this.reset();

        $("#symbolSelectMenu").off("show.bs.dropdown");

        Mousetrap.unbind("/");
    }

    ngAfterViewInit() {
        (<any>$("[data-toggle='tooltip']")).tooltip();
        (<any>$("th")).tooltip();
    }

    private reset() {

        if (this.binanceStream) {
            console.log("Closing Binance stream.");
            this.binanceStream.close();
            this.binanceStream.closeRequested = true;
            this.binanceStream = null;
        }

        if (this.priceChart) {
            console.log("Destroying price chart.");
            this.priceChart.destroy();
            this.priceChart = null;
        }

        if (this.candleStickChart) {
            console.log("Destroying candlestick chart.");
            this.candleStickChart.destroy();
            this.candleStickChart = null;
        }

        if (this.tokenfxFeed) {
            console.log("Unsubscribing from TokenFX feed.");
            this.tokenfxFeed.unsubscribe();
        }

        this.ATR = {};
    }

    toggleSymbolDropdown() {
        if ($("#symbolSelectDropdownMenu").hasClass("show")) {
            $("#symbolSelectDropdownMenu").removeClass("show");
        } else {
            $("#symbolSelectDropdownMenu").addClass("show");
            setTimeout(() => {
                $("#symbolFilterInput").focus();
            }, 0);
        }
    }

    ngOnInit() {

        Mousetrap.bind("/", () => {
            this.toggleSymbolDropdown();
        });

        document.addEventListener("visibilitychange", this);

        // Get all symbols.
        this.http.get("/api/1/binance/proxy/api/v3/ticker/price").subscribe((response: any[]) => {
            this.symbols = response.map((ticker) => {
                return ticker.symbol;
            }).filter((item) => {
                if (item == "123456") {
                    return false;
                }
                return true;
            }).sort();
        });

        this.route.params.subscribe((params) => {
            this.symbol = params.symbol.toUpperCase();
            this.exchangeSymbol = this.symbol.replace(/BTC$/, "_BTC")
                    .replace(/ETH$/, "_ETC")
                    .replace(/BNB$/, "_BNB")
                    .replace(/USDT$/, "_USDT");
            document.title = this.symbol.toUpperCase();
            this.reset();
            this.init();
        });
    }

    handleEvent(event: Event) {
        switch (event.type) {
            case "visibilitychange":
                this.priceChart.redraw();
                if (this.useHighStocksCandleChart) {
                    this.candleStickChart.redraw();
                }
                this.depthChart.redraw();
                break;
            default:
                break;
        }
    }

    changeSymbol() {
        this.router.navigate(['/binance/chart', this.symbol]);
    }

    init() {
        this.baseAsset = this.symbol
                .replace(/BTC$/, "")
                .replace(/USDT$/, "")
                .replace(/BNB$/, "")
                .replace(/ETH$/, "");
        this.trades = [];

        this.priceChart = new PriceChart("priceChart");

        this.depthChart = new DepthChart("depthChart");

        if (this.useHighStocksCandleChart) {
            this.candleStickChart = new CandleStickChart("candleStickChart");
        }

        setInterval(() => {
            const depthUrl = "/api/1/binance/proxy/api/v1/depth";
            this.http.get(depthUrl, {
                params: new HttpParams()
                        .append("symbol", this.symbol.toUpperCase())
                        .append("limit", "100")
            }).subscribe((response: any) => {
                this.depthChart.update(response.asks, response.bids);
                this.orderBook.asks = response.asks.slice(0, 20);
                this.orderBook.bids = response.bids.slice(0, 20);
            });
        }, 1000);

        this.start();

        this.initKlines();

        for (const interval of [KlineInterval.H1, KlineInterval.D1]) {
            this.binanceApi.getKlines({
                symbol: this.symbol,
                interval: interval,
                limit: 100,
            }).subscribe((klines) => {
                const atr = this.calculateATR(klines);
                this.ATR[interval] = atr[0];
            });
        }

        this.showTradingViewCharts = false;
        setTimeout(() => {
            this.showTradingViewCharts = true;
            setTimeout(() => {
                const tv_1m = new TradingView.widget(
                        {
                            "autosize": true,
                            "symbol": "BINANCE:" + this.symbol,
                            "interval": "1",
                            "timezone": "Etc/UTC",
                            "theme": "Dark",
                            "style": "1",
                            "locale": "en",
                            "toolbar_bg": "#f1f3f6",
                            "enable_publishing": false,
                            "withdateranges": true,
                            "show_popup_button": true,
                            "popup_width": "1000",
                            "popup_height": "650",
                            "container_id": "tradingview-1m",
                        }
                );
                const tv_5m = new TradingView.widget(
                        {
                            "autosize": true,
                            "symbol": "BINANCE:" + this.symbol,
                            "interval": "5",
                            "timezone": "Etc/UTC",
                            "theme": "Dark",
                            "style": "1",
                            "locale": "en",
                            "toolbar_bg": "#f1f3f6",
                            "enable_publishing": false,
                            "withdateranges": true,
                            "show_popup_button": true,
                            "popup_width": "1000",
                            "popup_height": "650",
                            "container_id": "tradingview-5m",
                        }
                );
            }, 0);
        }, 0);

    }

    // Calculate the ATR (Average True Range). A list of ATRs is returned,
    // with the first element being the most recent ATR.
    private calculateATR(klines: Kline[], period: number = 14): number[] {
        let atr = 0;
        const atrs: number[] = [];
        const n = klines.length;
        let prev = klines[0];
        for (let i = 0; i < n; i++) {
            const kline = klines[i];
            const tr0 = kline.high - kline.low;
            const tr1 = Math.abs(kline.high - prev.close);
            const tr2 = Math.abs(kline.low - prev.close);
            const tr = Math.max(tr0, tr1, tr2);
            atr = ((atr * (period - 1) + tr)) / (period);
            prev = kline;
            atrs.push(atr);
        }
        return atrs.reverse();
    }

    private initKlines() {
        if (!this.useHighStocksCandleChart) {
            return;
        }
        this.binanceApi.getKlines({
            symbol: this.symbol.toUpperCase(),
            interval: this.klineInterval,
            limit: 60,
        }).subscribe((klines) => {
            for (let i = 0, n = klines.length; i < n; i++) {
                this.candleStickChart.update(klines[i], false);
            }
            this.candleStickChart.redraw();
            this.klinesReady = true;
        });
    }

    changeInterval(interval: KlineInterval) {
        this.klinesReady = false;
        this.klineInterval = interval;
        this.candleStickChart.clear(true);
        this.initKlines();
    }

    rawToTrade(raw): Trade {
        return {
            timestamp: new Date(raw.E),
            price: +raw.p,
            quantity: +raw.q,
            buyerMaker: raw.m,
        };
    }

    private addTrade(trade: Trade) {
        this.trades.unshift(trade);
        while (this.trades.length > this.maxTradeHistory) {
            this.trades.pop();
        }
        this.lastPrice = this.trades[0].price;
    }

    private start() {
        this.runTokenFxSocket();
        this.runBinanceSocket();
    }

    private runTokenFxSocket() {

        const reconnect = () => {
            setTimeout(() => {
                this.runTokenFxSocket();
            }, 1000);
        };

        this.tokenfxFeed = this.tokenfx.connectBinanceSymbol(this.symbol)
                .subscribe((message: SymbolUpdate) => {
                    if (message === null) {
                        // Connected.
                        this.tokenFxState = "connected";
                        return;
                    }
                    if (message.symbol) {
                        this.lastUpdate = message;
                    }
                }, (error) => {
                    // Error.
                    console.log("tokenfx socket error: ");
                    console.log(error);
                    this.tokenFxState = "errored";
                    reconnect();
                }, () => {
                    // Closed.
                    console.log("tokenfx socket closed.");
                    this.tokenFxState = "closed";
                    reconnect();
                });
    }

    private runBinanceSocket() {

        const reconnect = () => {
            setTimeout(() => {
                this.runBinanceSocket();
            }, 1000);
        };

        console.log("chart: connecting to binance stream.");

        const symbolLower = this.symbol.toLowerCase();
        const streams = [
            `${symbolLower}@aggTrade`,
            `${symbolLower}@ticker`,
        ];

        if (this.useHighStocksCandleChart) {
            const klineStreams = [
                `${symbolLower}@kline_1m/`,
                `${symbolLower}@kline_3m/`,
                `${symbolLower}@kline_5m/`,
                `${symbolLower}@kline_15m/`,
                `${symbolLower}@kline_30m/`,
                `${symbolLower}@kline_1h/`,
                `${symbolLower}@kline_2h/`,
                `${symbolLower}@kline_4h/`,
                `${symbolLower}@kline_6h/`,
                `${symbolLower}@kline_8h/`,
                `${symbolLower}@kline_12h/`,
                `${symbolLower}@kline_1d/`,
            ];
            streams.push(...klineStreams);
        }

        const url = `wss://stream.binance.com:9443/stream?streams=` +
                streams.join("/");

        const ws = new WebSocket(url);

        this.binanceStream = ws;

        this.binanceStream.onopen = (event) => {
            console.log("stream opened:");
            console.log(event);
            this.binanceState = "connected";
        };

        this.binanceStream.onclose = (event) => {
            console.log("stream closed:");
            console.log(event);
            this.binanceState = "closed";
            if (!(<any>ws).closeRequested) {
                reconnect();
            }
        };

        this.binanceStream.onerror = (event) => {
            console.log("stream error:");
            console.log(event);
            this.binanceState = "error";
            if (!(<any>ws).closeRequested) {
                reconnect();
            }
        };

        this.binanceStream.onmessage = (message) => {
            const data = JSON.parse(message.data);
            if (data.stream.indexOf(`@kline_${this.klineInterval}`) > -1) {
                if (this.klinesReady) {
                    const kline = new StreamKline(data.data.k);
                    if (this.useHighStocksCandleChart) {
                        this.candleStickChart.update(kline);
                    }
                    this.lastKline = kline;
                }
            } else if (data.stream.indexOf("@trade") > -1) {
                const trade = this.rawToTrade(data.data);
                this.addTrade(trade);
            } else if (data.stream.indexOf("@aggTrade") > -1) {
                const trade = this.rawToTrade(data.data);
                this.addTrade(trade);
            } else if (data.stream.indexOf("@ticker") > -1) {
                const ticker = rawTickerToTicker(data.data);
                this.priceChart.update(ticker);
                this.lastPrice = ticker.lastPrice;
            }

        };
    }
}
