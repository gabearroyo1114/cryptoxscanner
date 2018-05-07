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

package kucoin

import (
	"github.com/crankykernel/cryptotrader/kucoin"
	"github.com/crankykernel/cryptoxscanner/pkg"
	"log"
	"time"
	"encoding/json"
)

type TickerStream struct {
	client *kucoin.Client
	cache  *pkg.RedisInputCache
}

func NewTickerStream() (*TickerStream) {
	return &TickerStream{
		client: kucoin.NewAnonymousClient(),
		cache:  pkg.NewRedisInputCache("kucoin.tickers.list"),
	}
}

func (t *TickerStream) GetTickers() ([]pkg.CommonTicker, error) {
	response, err := t.client.GetTick()
	if err != nil {
		return nil, err
	}
	t.Cache(response)
	return t.toCommonTicker(response), nil
}

func (t *TickerStream) toCommonTicker(tickers *kucoin.TickResponse) []pkg.CommonTicker {
	common := []pkg.CommonTicker{}
	for _, entry := range tickers.Entries {
		ticker := pkg.CommonTickerFromKuCoinTicker(entry)
		common = append(common, ticker)
	}
	return common
}

func (t *TickerStream) Cache(tickers *kucoin.TickResponse) {
	t.cache.RPush([]byte(tickers.Raw))

	// Trim the list.
	for {
		entry, err := t.cache.GetFirst()
		if err != nil {
			log.Printf("error: failed to get redis cache entry: %v\n", err)
			break
		}
		if time.Now().Sub(time.Unix(entry.Timestamp, 0)) > time.Hour {
			t.cache.LRemove()
		} else {
			break
		}
	}
}

func (k *TickerStream) ReplayCache(cb func(tickers []pkg.CommonTicker)) {
	log.Printf("kucoin: cache replay start\n")
	i := int64(0)
	for {
		cacheEntry, err := k.cache.GetN(i)
		if err != nil {
			log.Printf("error: failed to get redis cache entry %d: %v\n",
				i, err)
		}
		if cacheEntry == nil {
			break
		}
		var response kucoin.TickResponse
		if err := json.Unmarshal([]byte(cacheEntry.Message), &response); err != nil {
			log.Printf("error: failed to decode kucoin ticker cache entry: %v\n", err)
			continue
		}
		cb(k.toCommonTicker(&response))
		i += 1
	}
	log.Printf("kucoin: cache replay done: ticks: %d\n", i)
}
