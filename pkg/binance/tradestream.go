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

package binance

import (
	"github.com/crankykernel/cryptotrader/binance"
	"fmt"
	"strings"
	"log"
	"time"
	"encoding/json"
	"github.com/crankykernel/cryptoxscanner/pkg"
	"sync"
)

type TradeStream struct {
	subscribers map[chan binance.AggTrade]bool
	cache       *pkg.RedisInputCache
	lock        sync.RWMutex
}

func NewTradeStream() *TradeStream {
	return &TradeStream{
		subscribers: map[chan binance.AggTrade]bool{},
		cache:       pkg.NewRedisInputCache("binance.trades"),
	}
}

func (b *TradeStream) Subscribe() chan binance.AggTrade {
	b.lock.Lock()
	defer b.lock.Unlock()
	channel := make(chan binance.AggTrade)
	b.subscribers[channel] = true
	return channel
}

func (b *TradeStream) Unsubscribe(channel chan binance.AggTrade) {
	b.lock.Lock()
	defer b.lock.Unlock()
	delete(b.subscribers, channel)
}

func (b *TradeStream) RestoreFromCache(channel chan *binance.AggTrade, count int64) {
	i := int64(0)
	start := time.Now()
	first := time.Time{}
	last := time.Time{}

	log.Printf("binance trade Cache: restoring %d Cache entries\n", count)

	for {
		next, err := b.cache.GetN(i)
		if err != nil {
			log.Printf("error: redis: %v", err)
			break
		}
		if next == nil {
			if i < count {
				log.Printf("error: only restored %d trades, requested %d\n",
					i, count)
			}
			break
		}
		i += 1

		if next.Timestamp == 0 {
			log.Printf("error: redis: Cache entry with 0 timestamp\n")
			continue
		}

		aggTrade, err := b.DecodeTrade([]byte(next.Message))
		if err != nil {
			log.Printf("error: failed to decode aggTrade from redis Cache: %v\n", err)
			continue
		}
		last = aggTrade.Timestamp

		if first.IsZero() {
			first = aggTrade.Timestamp
		}

		channel <- aggTrade

		if i == count {
			break
		}
	}

	restoreDuration := time.Now().Sub(start)
	restoreRange := last.Sub(first)
	log.Printf("binance trades: restored %d trades in %v; range=%v\n",
		i, restoreDuration, restoreRange)

	channel <- nil
}

func (b *TradeStream) Run() {

	cacheChannel := make(chan *binance.AggTrade)
	tradeChannel := make(chan *binance.AggTrade)

	cacheCount, err := b.cache.Len()
	if err != nil {
		log.Printf("error: failed to get Cache len: %v\n", err)
	}

	go b.RestoreFromCache(cacheChannel, cacheCount)

	go func() {
		for {
			// Get the streams to subscribe to.
			var streams []string
			for {
				var err error
				streams, err = b.GetStreams()
				if err != nil {
					log.Printf("binance: failed to get streams: %v\n", err)
					goto TryAgain
				}
				if len(streams) == 0 {
					log.Printf("binance: got 0 streams, trying again\n", len(streams))
					goto TryAgain
				}
				log.Printf("binance: got %d streams\n", len(streams))
				break
			TryAgain:
				time.Sleep(1 * time.Second)
			}

			tradeStream := NewStreamClient("aggTrades", streams...)
			log.Printf("binance: connecting to trade stream.")
			tradeStream.Connect()

			// Read loop.
		ReadLoop:
			for {
				body, err := tradeStream.ReadNext()
				if err != nil {
					log.Printf("binance: trade feed read error: %v\n", err)
					break ReadLoop
				}

				b.Cache(body)

				trade, err := b.DecodeTrade(body)
				if err != nil {
					log.Printf("binance: failed to decode trade feed: %v\n", err)
					goto ReadLoop
				}

				tradeChannel <- trade
			}

		}
	}()

	cacheDone := false
	tradeQueue := []*binance.AggTrade{}
	for {
		select {
		case trade := <-cacheChannel:
			if trade == nil {
				cacheDone = true
				break
			}
			if cacheDone {
				log.Printf("warning: got cached trade in state Cache done\n")
			}
			b.Publish(trade)
		case trade := <-tradeChannel:
			if !cacheDone {
				// The Cache is still being processed. Queue.
				tradeQueue = append(tradeQueue, trade)
				continue
			}

			if len(tradeQueue) > 0 {
				log.Printf("binace trade stream: submitting %d queued trades\n",
					len(tradeQueue))
				for _, trade := range tradeQueue {
					b.Publish(trade)
				}
				tradeQueue = []*binance.AggTrade{}
			}
			b.Publish(trade)
			b.PruneCache()
		}
	}

	log.Printf("binance: trade feed exiting.\n")
}

func (b *TradeStream) Cache(body []byte) {
	b.cache.RPush(body)
}

func (b *TradeStream) PruneCache() {
	for {
		next, err := b.cache.GetFirst()
		if err != nil {
			break
		}
		if time.Now().Sub(time.Unix(next.Timestamp, 0)) > time.Hour {
			b.cache.LRemove()
		} else {
			break
		}
	}
}

func (b *TradeStream) Publish(trade *binance.AggTrade) {
	b.lock.RLock()
	defer b.lock.RUnlock()
	for subscriber := range b.subscribers {
		subscriber <- *trade
	}
}

func (b *TradeStream) DecodeTrade(body []byte) (*binance.AggTrade, error) {
	var rawAggTrade binance.RawStreamAggTrade
	if err := json.Unmarshal(body, &rawAggTrade); err != nil {
		return nil, err
		log.Printf("binance: failed to decode stream agg trade: %v\n", err)
	}
	aggTrade := binance.NewAggTradeFromRaw(rawAggTrade.AggTrade)
	return &aggTrade, nil
}

func (b *TradeStream) GetStreams() ([]string, error) {
	symbols, err := binance.NewClient(nil).GetAllSymbols()
	if err != nil {
		return nil, nil
	}
	streams := []string{}
	for _, symbol := range symbols {
		streams = append(streams,
			fmt.Sprintf("%s@aggTrade", strings.ToLower(symbol)))
	}

	return streams, nil
}
