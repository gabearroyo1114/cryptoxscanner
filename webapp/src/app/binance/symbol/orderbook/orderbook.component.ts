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

import {Component, Input, OnChanges, OnInit} from '@angular/core';

@Component({
    selector: 'app-orderbook',
    templateUrl: './orderbook.component.html',
    styleUrls: ['./orderbook.component.scss']
})
export class OrderbookComponent implements OnInit, OnChanges {

    @Input() bids: any[] = [];
    @Input() asks: any[] = [];

    averageBidAmount: number = 0;
    averageAskAmount: number = 0;

    constructor() {
    }

    ngOnInit() {
    }

    ngOnChanges() {
        let totalBids = 0;
        for (let i = 0, n = this.bids.length - 1; i < n; i++) {
            totalBids += +this.bids[i][1];
        }
        this.averageBidAmount = totalBids / this.bids.length;

        let totalAsks = 0;
        for (let i = 0, n = this.asks.length - 1; i < n; i++) {
            totalAsks += +this.asks[i][1];
        }
        this.averageAskAmount = totalAsks / this.asks.length;
    }

}
