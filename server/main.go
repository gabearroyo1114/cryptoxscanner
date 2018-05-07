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
	"log"
	"time"
	"net/http"
	"encoding/json"
	"fmt"
	"github.com/gorilla/mux"
	"github.com/crankykernel/cryptoxscanner/pkg"
	"github.com/crankykernel/cryptoxscanner/pkg/binance"
	"crypto/sha256"
	"encoding/hex"
	"math/rand"
)

var salt []byte

func init() {
	rand.Seed(time.Now().UnixNano())
	salt = make([]byte, 256)
	rand.Read(salt)
}

type Options struct {
	Port uint16
}

func ServerMain(options Options) {

	// Start the KuCoin runner.
	kucoinWebSocketHandler := NewBroadcastWebSocketHandler()
	go KuCoinRunner(kucoinWebSocketHandler)

	// Start the Binance runner. This is a little bit of a message as the
	// socket can subscribe to specific symbol feeds directly. This should be
	// abstracted with some sort of broker.
	binanceFeed := NewBinanceRunner()
	binanceWebSocketHandler := NewBroadcastWebSocketHandler()
	binanceFeed.websocket = binanceWebSocketHandler
	binanceWebSocketHandler.Feed = binanceFeed
	go binanceFeed.Run()

	router := mux.NewRouter()

	router.HandleFunc("/ws/kucoin/live", kucoinWebSocketHandler.Handle)
	router.HandleFunc("/ws/kucoin/monitor", kucoinWebSocketHandler.Handle)

	router.HandleFunc("/ws/binance/live", binanceWebSocketHandler.Handle)
	router.HandleFunc("/ws/binance/monitor", binanceWebSocketHandler.Handle)
	router.HandleFunc("/ws/binance/symbol", binanceWebSocketHandler.Handle)

	router.PathPrefix("/api/1/binance/proxy").Handler(binance.NewApiProxy())

	router.HandleFunc("/api/1/ping", pingHandler)
	router.HandleFunc("/api/1/status/websockets", webSocketsStatusHandler)

	http.Handle("/", router)

	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", options.Port), nil))
}

func buildUpdateMessage(tracker *pkg.TickerTracker) map[string]interface{} {
	last := tracker.LastTick()
	key := last.Symbol

	message := map[string]interface{}{
		"symbol": key,
		"close":  last.LastPrice,
		"bid":    last.Bid,
		"ask":    last.Ask,
		"high":   last.High,
		"low":    last.Low,
		"volume": last.QuoteVolume,

		"price_change_pct": map[string]float64{
			"1m":  tracker.Metrics[1].PriceChangePercent,
			"5m":  tracker.Metrics[5].PriceChangePercent,
			"10m": tracker.Metrics[10].PriceChangePercent,
			"15m": tracker.Metrics[15].PriceChangePercent,
			"1h":  tracker.Metrics[60].PriceChangePercent,
			"24h": tracker.LastTick().PriceChangePct24,
		},

		"volume_change_pct": map[string]float64{
			"1m":  tracker.Metrics[1].VolumeChangePercent,
			"2m":  tracker.Metrics[2].VolumeChangePercent,
			"3m":  tracker.Metrics[3].VolumeChangePercent,
			"4m":  tracker.Metrics[4].VolumeChangePercent,
			"5m":  tracker.Metrics[5].VolumeChangePercent,
			"10m": tracker.Metrics[10].VolumeChangePercent,
			"15m": tracker.Metrics[15].VolumeChangePercent,
			"1h":  tracker.Metrics[60].VolumeChangePercent,
		},

		"timestamp": last.Timestamp,
	}

	for _, bucket := range pkg.Buckets {
		metrics := tracker.Metrics[bucket]

		message[fmt.Sprintf("l_%d", bucket)] = metrics.Low
		message[fmt.Sprintf("h_%d", bucket)] = metrics.High

		message[fmt.Sprintf("r_%d", bucket)] = metrics.Range
		message[fmt.Sprintf("rp_%d", bucket)] = metrics.RangePercent
	}

	message["r_24"] = tracker.H24Metrics.Range
	message["rp_24"] = tracker.H24Metrics.RangePercent

	return message
}

func pingHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("content-type", "application/json")
	encoder := json.NewEncoder(w)
	encoder.Encode(map[string]interface{}{
		"version": PROTO_VERSION,
	})
}

func webSocketsStatusHandler(w http.ResponseWriter, r *http.Request) {
	wsConnectionTracker.Lock.RLock()
	defer wsConnectionTracker.Lock.RUnlock()

	paths := map[string]int{}

	for path := range wsConnectionTracker.Paths {
		count := len(wsConnectionTracker.Paths[path])
		if count > 0 {
			paths[path] += count
		}
	}

	clients := make(map[string][]string)

	for client := range wsConnectionTracker.Clients {

		// Instead of using the actual remote address we use a hash of it
		// as we may be running without password protection and don't want
		// to expose users IP addresses.
		hash := sha256.New()
		hash.Write([]byte(client.GetRemoteHost()))
		hash.Write(salt)
		remoteAddr := hex.EncodeToString(hash.Sum(nil))[0:8]

		for path := range wsConnectionTracker.Clients[client] {
			clients[remoteAddr] = append(
				clients[remoteAddr], path)
		}
	}

	encoder := json.NewEncoder(w)
	encoder.Encode(map[string]interface{}{
		"paths":   paths,
		"clients": clients,
	})
}
