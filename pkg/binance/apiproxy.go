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
	"net/http"
	"fmt"
	"log"
	"io"
	"time"
	"bytes"
	"io/ioutil"
	"sync"
)

type proxyCacheEntry struct {
	timestamp time.Time
	content   []byte
	header    http.Header
}

type ApiProxy struct {
	cache map[string]*proxyCacheEntry
	lock  sync.RWMutex
}

func NewApiProxy() *ApiProxy {
	return &ApiProxy{
		cache: make(map[string]*proxyCacheEntry),
	}
}

func (p *ApiProxy) AddToCache(key string, entry proxyCacheEntry) {
	p.lock.Lock()
	defer p.lock.Unlock()
	p.cache[key] = &entry
}

func (p *ApiProxy) GetFromCache(key string) *proxyCacheEntry {
	p.lock.RLock()
	defer p.lock.RUnlock()
	return p.cache[key]
}

func (p *ApiProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	url := fmt.Sprintf("https://api.binance.com%s",
		r.URL.RequestURI()[len("/api/1/binance/proxy"):])

	cached := p.GetFromCache(url)
	if cached != nil {
		if time.Now().Sub(cached.timestamp) <= time.Second*1 {
			w.Header().Add("content-type", cached.header.Get("content-type"))
			w.Header().Add("access-control-allow-origin", "*")
			io.Copy(w, bytes.NewReader(cached.content))
			return
		}
	}

	proxyRequest, err := http.NewRequest("GET", url, nil)
	if err != nil {
		log.Printf("error: %v\n", err)
	}

	proxyResponse, err := http.DefaultClient.Do(proxyRequest)
	if err != nil {
		log.Printf("error: %v", err)
		return
	}

	w.Header().Add("content-type", proxyResponse.Header.Get("content-type"))
	w.Header().Add("access-control-allow-origin", "*")
	w.WriteHeader(proxyResponse.StatusCode)

	content, _ := ioutil.ReadAll(proxyResponse.Body)
	p.AddToCache(url, proxyCacheEntry{
		timestamp: time.Now(),
		content:   content,
		header:    proxyResponse.Header,
	})
	w.Write(content)
}
