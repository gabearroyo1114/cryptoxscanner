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
	"log"
	"time"
	"encoding/json"
)

type StreamClient struct {
	name          string
	client        *binance.StreamClient
	streams       []string
}

func NewStreamClient(name string, streams ...string) *StreamClient {
	return &StreamClient{
		name:          name,
		client:        binance.NewStreamClient(),
		streams:       streams,
	}
}

func (s *StreamClient) ReadNext() ([]byte, error) {
	_, body, err := s.client.Next()
	return body, err
}

func (s *StreamClient) Decode(buf []byte) (*binance.RawStreamMessage, error) {
	var message binance.RawStreamMessage
	err := json.Unmarshal(buf, &message)
	return &message, err
}

func (s *StreamClient) Run(channel chan *binance.RawStreamMessage) {
	for {
		// Connect, runs in its own loop until connected.
		log.Printf("binance: connecting to stream [%s]\n", s.name)
		s.Connect()
		log.Printf("binance: connected to stream [%s]\n", s.name)

		// Read loop.
	ReadLoop:
		for {
			body, err := s.ReadNext()
			if err != nil {
				log.Printf("binance: read error on stream [%s]: %v\n",
					s.name, err)
				break ReadLoop
			}

			message, err := s.Decode(body)
			if err != nil {
				log.Printf("binance: failed to decode message on stream [%s]: %v\n",
					s.name, err)
				goto ReadLoop
			}

			channel <- message
		}

		time.Sleep(1 * time.Second)
	}
}

func (s *StreamClient) Connect() {
	for {
		err := s.client.Connect(s.streams...)
		if err == nil {
			return
		}
		log.Printf("binance: failed to connect to stream [%s]: %v\n",
			s.name, err)
		time.Sleep(1 * time.Second)
	}
}
