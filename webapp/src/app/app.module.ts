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

import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {
    BinanceMonitorComponent,
    KuCoinMonitorComponent
} from './monitor/monitor.component';
import {ScannerApiService} from './scanner-api.service';
import {FormsModule} from '@angular/forms';
import {RouterModule, Routes} from '@angular/router';
import {RootComponent} from './root/root.component';
import {
    AppThSortableComponent,
    AppUpDownDirective,
    BinanceLiveComponent,
    KuCoinLiveComponent,
} from './live/live.component';
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {HomeComponent} from './home/home.component';
import {HttpClientModule} from '@angular/common/http';
import {OrderbookComponent} from './binance/symbol/orderbook/orderbook.component';
import {BinanceSymbolComponent} from './binance/symbol/symbol.component';
import {SymbolFilterPipe} from './symbol-filter.pipe';
import {BinanceApiService} from './binance-api.service';
import {DoubleScrollModule} from 'mindgaze-doublescroll/dist';
import { BaseassetPipe } from './baseasset.pipe';
import { ExchangesymbolPipe } from './exchangesymbol.pipe';

const appRoutes: Routes = [
    {
        path: "binance/monitor",
        component: BinanceMonitorComponent,
        pathMatch: "prefix",
    },
    {
        path: "binance/live",
        component: BinanceLiveComponent,
        pathMatch: "prefix",
    },
    {
        path: "binance/screener",
        pathMatch: "prefix",
        redirectTo: "binance/live",
    },
    {
        path: "kucoin/monitor",
        component: KuCoinMonitorComponent,
        pathMatch: "prefix",
    },
    {
        path: "kucoin/live",
        component: KuCoinLiveComponent,
        pathMatch: "prefix",
    },
    {
        path: "kucoin/screener",
        pathMatch: "prefix",
        redirectTo: "kucoin/live",
    },
    {
        path: "binance/chart",
        pathMatch: "prefix",
        redirectTo: "binance/symbol",
    },
    {
        path: "binance/symbol/:symbol",
        pathMatch: "prefix",
        component: BinanceSymbolComponent,
    },
    {
        path: '', component: HomeComponent, pathMatch: "prefix",
    }
];

@NgModule({
    declarations: [
        BinanceMonitorComponent,
        RootComponent,
        BinanceLiveComponent,
        AppThSortableComponent,
        AppUpDownDirective,
        HomeComponent,
        KuCoinMonitorComponent,
        KuCoinLiveComponent,
        BinanceSymbolComponent,
        OrderbookComponent,
        SymbolFilterPipe,
        BaseassetPipe,
        ExchangesymbolPipe,
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        FormsModule,
        HttpClientModule,
        RouterModule.forRoot(
                appRoutes, {useHash: false},
        ),
        DoubleScrollModule,
    ],
    providers: [
        ScannerApiService,
        BinanceApiService,
    ],
    bootstrap: [RootComponent]
})
export class AppModule {
}
