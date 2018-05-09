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

package pkg

import (
	"math"
	"time"
	"github.com/crankykernel/cryptotrader/binance"
	"log"
)

type TickerMetrics struct {
	// Common metrics.
	PriceChangePercent  float64
	VolumeChangePercent float64
	High                float64
	Low                 float64
	Range               float64
	RangePercent        float64

	// Require trades.
	Vwap        float64
	TotalVolume float64
	NetVolume   float64
	BuyVolume   float64
}

type TickerTracker struct {
	Symbol     string
	Ticks      []CommonTicker
	Metrics    map[int]*TickerMetrics
	LastUpdate time.Time
	H24Metrics TickerMetrics

	// Trades, in Binance format.
	Trades []binance.AggTrade

	HaveVwap        bool
	HaveTotalVolume bool
	HaveNetVolume   bool
}

var Buckets []int

func init() {
	Buckets = []int{
		1,
		2,
		3,
		4,
		5,
		10,
		15,
		60,
	}
}

func NewTickerTracker(symbol string) *TickerTracker {
	tracker := TickerTracker{
		Symbol:  symbol,
		Ticks:   []CommonTicker{},
		Trades:  []binance.AggTrade{},
		Metrics: make(map[int]*TickerMetrics),
	}

	for _, i := range Buckets {
		tracker.Metrics[i] = &TickerMetrics{}
	}

	return &tracker;
}

func (t *TickerTracker) LastTick() *CommonTicker {
	if len(t.Ticks) == 0 {
		return nil
	}
	return &t.Ticks[len(t.Ticks)-1]
}

func (t *TickerTracker) Recalculate() {
	lastTick := t.LastTick()
	now := time.Now()

	nextBucket := 0
	maxBucket := 0

	// Need at least 2 ticks to calculate anything...
	if len(t.Ticks) < 2 {
		return
	}

	for _, i := range Buckets {
		metrics := t.Metrics[i]
		metrics.Low = 0
		metrics.High = 0
	}

	high := float64(0)
	low := float64(0)
	for i := len(t.Ticks) - 1; i >= 0; i-- {
		tick := t.Ticks[i]
		timeDiff := int(now.Sub(tick.Timestamp).Seconds())
		bucket := ((timeDiff - 1) / 60) + 1

		if i == len(t.Ticks)-1 {
			high = tick.LastPrice
			low = tick.LastPrice
		} else {
			if tick.LastPrice < low {
				low = tick.LastPrice
			}
			if tick.LastPrice > high {
				high = tick.LastPrice
			}
		}

		if _, exists := t.Metrics[bucket]; !exists {
			continue
		}

		metrics := t.Metrics[bucket];
		metrics.High = high
		metrics.Low = low
		metrics.Range = Round8(high - low)
		metrics.RangePercent = Round3(metrics.Range / low * 100)
	}

	// Some 24 hour metrics.
	t.H24Metrics.High = lastTick.High
	t.H24Metrics.Low = lastTick.Low
	t.H24Metrics.Range = Round8(lastTick.High - lastTick.Low)
	t.H24Metrics.RangePercent = Round3(t.H24Metrics.Range / lastTick.Low * 100)

	for i := 0; i < len(t.Ticks); i++ {
		tick := t.Ticks[i]
		timeDiff := int(now.Sub(tick.Timestamp).Seconds())
		bucket := ((timeDiff - 1) / 60) + 1

		if i == 0 {
			nextBucket = bucket
			maxBucket = bucket
		} else if bucket > nextBucket {
			continue
		}

		if _, exists := t.Metrics[bucket]; !exists {
			continue
		}

		metrics := t.Metrics[bucket];
		priceDiff := lastTick.LastPrice - tick.LastPrice
		priceDiffPct := Round3(priceDiff / tick.LastPrice * 100)
		metrics.PriceChangePercent = priceDiffPct

		volumeDiff := lastTick.QuoteVolume - tick.QuoteVolume
		volumeDiffPct := Round3((volumeDiff / tick.QuoteVolume) * 100)
		metrics.VolumeChangePercent = volumeDiffPct

		nextBucket = bucket - 1
	}

	previousPrice := t.Metrics[Buckets[0]].PriceChangePercent
	previousVolume := t.Metrics[Buckets[0]].PriceChangePercent
	for j := 1; j < len(Buckets); j++ {
		if maxBucket < Buckets[j] {
			t.Metrics[Buckets[j]].PriceChangePercent = previousPrice
			t.Metrics[Buckets[j]].VolumeChangePercent = previousVolume
		}
		previousPrice = t.Metrics[Buckets[j]].PriceChangePercent
		previousVolume = t.Metrics[Buckets[j]].VolumeChangePercent
	}

	// Calculate values that depend on actual trades:
	// - VWAP
	// - Total volume
	// - Net volume
	if len(t.Trades) > 0 {
		t.HaveNetVolume = true
		t.HaveTotalVolume = true
		t.HaveVwap = true;
		vwapPrice := float64(0)
		vwapVolume := float64(0)
		buyVolume := float64(0)
		sellVolume := float64(0)

		for i := len(t.Trades) - 1; i >= 0; i-- {
			trade := t.Trades[i]

			age := now.Sub(trade.Timestamp)

			if trade.IsBuy() {
				buyVolume += trade.QuoteQuantity
			} else {
				sellVolume += trade.QuoteQuantity
			}

			vwapVolume += trade.Quantity
			vwapPrice += trade.Quantity * trade.Price
			vwap := vwapPrice / vwapVolume

			totalVolume := buyVolume + sellVolume
			netVolume := buyVolume - sellVolume

			for _, i := range Buckets {
				if age <= time.Duration(i)*60*time.Second {
					t.Metrics[i].NetVolume = netVolume
					t.Metrics[i].TotalVolume = totalVolume
					t.Metrics[i].BuyVolume = buyVolume
					t.Metrics[i].Vwap = vwap
				}
			}
		}
	}

	t.PruneTrades(now)
}

func (t *TickerTracker) Update(ticker CommonTicker) {
	t.LastUpdate = time.Now()
	t.Ticks = append(t.Ticks, ticker)
	now := ticker.Timestamp
	for {
		first := t.Ticks[0]
		if now.Sub(first.Timestamp) > (time.Minute*60)+1 {
			t.Ticks = t.Ticks[1:]
		} else {
			break
		}
	}
}

func (t *TickerTracker) AddTrade(trade binance.AggTrade) {
	if trade.Symbol == "" {
		log.Printf("error: not adding trade with empty symbol")
		return
	}

	if len(t.Trades) > 0 {
		lastTrade := t.Trades[len(t.Trades)-1]
		if trade.Timestamp.Before(lastTrade.Timestamp) {
			log.Printf("error: received trade old than previous trade\n")
		}
	}

	t.Trades = append(t.Trades, trade)
}

func (t *TickerTracker) PruneTrades(now time.Time) {
	chop := 0
	for i, trade := range t.Trades {
		age := now.Sub(trade.Timestamp)
		if age < time.Hour {
			break
		}
		chop = i + 1
	}
	if chop > 0 {
		t.Trades = t.Trades[chop:]
	}
}

type TickerTrackerMap struct {
	Trackers map[string]*TickerTracker
}

func NewTickerTrackerMap() *TickerTrackerMap {
	return &TickerTrackerMap{
		Trackers: make(map[string]*TickerTracker),
	}
}

func (t *TickerTrackerMap) GetTracker(symbol string) *TickerTracker {
	if symbol == "" {
		log.Printf("GetTracker called with empty string symbol")
		return nil
	}
	if _, ok := t.Trackers[symbol]; !ok {
		t.Trackers[symbol] = NewTickerTracker(symbol)
	}
	return t.Trackers[symbol]
}

func (t *TickerTrackerMap) GetLastForSymbol(symbol string) *CommonTicker {
	if tracker, ok := t.Trackers[symbol]; ok {
		return tracker.LastTick()
	}
	return nil
}

func Round8(val float64) float64 {
	out := math.Round(val*100000000) / 100000000
	if math.IsInf(out, 0) {
		log.Printf("error: round8 output value IsInf\n")
	}
	return out
}

func Round3(val float64) float64 {
	out := math.Round(val*1000) / 1000
	if math.IsInf(out, 0) {
		log.Printf("error: round3 output value IsInf\n")
	}
	return out
}
