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
	"github.com/crankykernel/cryptoxscanner/pkg"
	"github.com/crankykernel/cryptoxscanner/pkg/binance"
	"time"
	"fmt"
	"log"
)

type BinanceRunner struct {
	trackers  *pkg.TickerTrackerMap
	websocket *TickerWebSocketHandler
	subscribers map[string]map[chan interface{}]bool
	tickerStream *binance.TickerStream
}

func NewBinanceRunner() *BinanceRunner {
	feed := BinanceRunner{
		trackers: pkg.NewTickerTrackerMap(),
	}
	return &feed
}

func (b *BinanceRunner) Subscribe(symbol string) chan interface{} {
	channel := make(chan interface{})
	if b.subscribers == nil {
		b.subscribers = map[string]map[chan interface{}]bool{}
	}
	if b.subscribers[symbol] == nil {
		b.subscribers[symbol] = map[chan interface{}]bool{}
	}
	b.subscribers[symbol][channel] = true
	return channel
}

func (b *BinanceRunner) Unsubscribe(symbol string, channel chan interface{}) {
	if b.subscribers[symbol] != nil {
		if _, exists := b.subscribers[symbol][channel]; exists {
			delete(b.subscribers[symbol], channel)
		}
	}
}

func (b *BinanceRunner) Run() {
	lastUpdate := time.Now()

	binanceTradeStream := binance.NewTradeStream()
	go binanceTradeStream.Run()

	tickerChannel := make(chan []pkg.CommonTicker)
	b.tickerStream = binance.NewTickerStream()
	go b.tickerStream.Run(tickerChannel)

	tradeChannel := binanceTradeStream.Subscribe()

	b.reloadStateFromRedis(b.trackers)

	go func() {
		tradeCount := 0
		lastTradeTime := time.Time{}
		for {
		ReadLoop:
			loopStartTime := time.Now()
			select {

			case trade := <-tradeChannel:
				ticker := b.trackers.GetTracker(trade.Symbol)
				ticker.AddTrade(trade)

				if trade.Timestamp.After(lastTradeTime) {
					lastTradeTime = trade.Timestamp
				}

				tradeCount++

			case tickers := <-tickerChannel:

				waitTime := time.Now().Sub(loopStartTime)
				if len(tickers) == 0 {
					goto ReadLoop
				}

				lastServerTickerTimestamp := time.Time{}
				for _, ticker := range tickers {
					if ticker.Timestamp.After(lastServerTickerTimestamp) {
						lastServerTickerTimestamp = ticker.Timestamp
					}
				}

				b.updateTrackers(b.trackers, tickers, true)

				// Create enhanced feed.
				message := []interface{}{}
				for key := range b.trackers.Trackers {
					tracker := b.trackers.Trackers[key]
					if tracker.LastUpdate.Before(lastUpdate) {
						continue
					}
					update := buildUpdateMessage(tracker)

					if tracker.HaveVwap {
						for i, k := range tracker.Metrics {
							update[fmt.Sprintf("vwap_%dm", i)] = pkg.Round8(k.Vwap)
						}
					}

					if tracker.HaveTotalVolume {
						for i, k := range tracker.Metrics {
							update[fmt.Sprintf("total_volume_%d", i)] = pkg.Round8(k.TotalVolume)
						}
					}

					if tracker.HaveNetVolume {
						for i, k := range tracker.Metrics {
							update[fmt.Sprintf("nv_%d", i)] = pkg.Round8(k.NetVolume);
						}
					}

					message = append(message, update)

					for subscriber := range b.subscribers[key] {
						select {
						case subscriber <- update:
						default:
							log.Printf("warning: feed subscriber is blocked\n")
						}
					}
				}
				if err := b.websocket.Broadcast(TickerStream{Tickers: message,}); err != nil {
					log.Printf("error: broadcasting message: %v", err)
				}

				now := time.Now()
				lastUpdate = now;
				processingTime := now.Sub(loopStartTime) - waitTime
				lagTime := now.Sub(lastServerTickerTimestamp)
				tradeLag := now.Sub(lastTradeTime)

				log.Printf("binance: wait: %v; processing: %v; lag: %v; trades: %d; trade lag: %v",
					waitTime, processingTime, lagTime, tradeCount, tradeLag)
				tradeCount = 0
			}
		}
	}()
}

func (b *BinanceRunner) updateTrackers(trackers *pkg.TickerTrackerMap, tickers []pkg.CommonTicker, recalculate bool) {
	for _, ticker := range tickers {
		tracker := trackers.GetTracker(ticker.Symbol)
		tracker.Update(ticker)
		if recalculate {
			tracker.Recalculate()
		}
	}
}

func (b *BinanceRunner) reloadStateFromRedis(trackers *pkg.TickerTrackerMap) {
	log.Printf("binance: cache replay start\n")
	startTime := time.Now()
	restoreCount := 0

	skipCount := 0

	for i := int64(0); ; i++ {
		entry, err := b.tickerStream.Cache.GetN(i)
		if err != nil {
			log.Printf("error: failed to load ticker cache entry %d: %v",
				i, err)
			break
		}
		if entry == nil {
			break
		}

		// Skip if over an hour old.
		if time.Now().Sub(time.Unix(entry.Timestamp, 0)) > time.Hour*1 {
			skipCount++
			continue
		}

		tickers, err := b.tickerStream.DecodeTickers([]byte(entry.Message))
		if err != nil {
			log.Printf("error: failed to decode cached tickers: %v\n", err)
			continue
		}
		if len(tickers) == 0 {
			log.Printf("warning: decoded 0 length tickers\n")
			continue
		}

		b.updateTrackers(trackers, tickers, false)

		restoreCount++
	}

	duration := time.Now().Sub(startTime)
	log.Printf("binance: cache replay done: %d records: duration: %v; skipped: %d\n",
		restoreCount, duration, skipCount)
}
