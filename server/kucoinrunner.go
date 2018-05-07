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

package server

import (
	"github.com/crankykernel/cryptoxscanner/pkg/kucoin"
	"github.com/crankykernel/cryptoxscanner/pkg"
	"log"
	"time"
)

func KuCoinRunner(ws *TickerWebSocketHandler) {
	tickerStream := kucoin.NewTickerStream()
	trackers := pkg.NewTickerTrackerMap()

	tickerStream.ReplayCache(func(tickers []pkg.CommonTicker) {
		for _, ticker := range tickers {
			tracker := trackers.GetTracker(ticker.Symbol)
			tracker.Update(ticker)
		}
	})

	for {
		outTickers := []interface{}{}

		tickers, err := tickerStream.GetTickers()
		if err != nil {
			log.Printf("error: failed to get kucoin tickers: %v, err")
			goto TryAgain
		}

		for _, ticker := range tickers {
			if (ticker.QuoteVolume == 0) {
				continue
			}
			if (ticker.LastPrice == 0) {
				continue
			}
			tracker := trackers.GetTracker(ticker.Symbol)
			tracker.Update(ticker)
			tracker.Recalculate()
		}

		for key := range trackers.Trackers {
			tracker := trackers.GetTracker(key)
			outTicker := buildUpdateMessage(tracker)
			outTickers = append(outTickers, outTicker)
		}

		if err := ws.Broadcast(TickerStream{Tickers: outTickers}); err != nil {
			log.Printf("kucoin error: failed to broadcast: %v\n", err)
		}

	TryAgain:
		time.Sleep(1 * time.Second)
	}
}


