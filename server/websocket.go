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
	"github.com/gorilla/websocket"
	"net/http"
	"log"
	"encoding/json"
	"sync"
	"strings"
)

var wsConnectionTracker *WsConnectionTracker

func init() {
	wsConnectionTracker = NewWsConnectionTracker()
}

type WsConnectionTracker struct {
	Paths   map[string]map[*WebSocketClient]bool
	Clients map[*WebSocketClient]map[string]bool
	Lock    sync.RWMutex
}

func NewWsConnectionTracker() *WsConnectionTracker {
	return &WsConnectionTracker{
		Paths:   make(map[string]map[*WebSocketClient]bool),
		Clients: make(map[*WebSocketClient]map[string]bool),
	}
}

func (w *WsConnectionTracker) Add(path string, conn *WebSocketClient) {
	w.Lock.Lock()
	if w.Paths[path] == nil {
		w.Paths[path] = map[*WebSocketClient]bool{}
	}
	if w.Clients[conn] == nil {
		w.Clients[conn] = map[string]bool{}
	}
	w.Paths[path][conn] = true
	w.Clients[conn][path] = true
	defer w.Lock.Unlock()
}

func (w *WsConnectionTracker) Del(path string, conn *WebSocketClient) {
	w.Lock.Lock()

	w.Paths[path][conn] = false
	delete(w.Paths[path], conn)

	w.Clients[conn][path] = false
	delete(w.Clients[conn], path)

	defer w.Lock.Unlock()
}

type WebSocketClient struct {
	// The websocket connection.
	conn *websocket.Conn

	// The http request.
	r *http.Request

	// Data written into this Channel will be sent to the client.
	sendChannel chan []byte

	done bool
}

func NewWebSocketClient(c *websocket.Conn, r *http.Request) *WebSocketClient {
	return &WebSocketClient{
		conn:        c,
		sendChannel: make(chan []byte),
		r:           r,
	}
}

func (c *WebSocketClient) GetRemoteAddr() string {
	remoteAddr := c.r.Header.Get("x-forwarded-for")
	if remoteAddr != "" {
		return remoteAddr
	}
	remoteAddr = c.r.Header.Get("x-real-ip")
	if remoteAddr != "" {
		return remoteAddr
	}
	return c.r.RemoteAddr
}

func (c *WebSocketClient) GetRemoteHost() string {
	remoteAddr := c.GetRemoteAddr()
	return strings.Split(remoteAddr, ":")[0]
}

func (c *WebSocketClient) WriteTextMessage(msg []byte) error {
	return c.conn.WriteMessage(websocket.TextMessage, msg)
}

type TickerWebSocketHandler struct {
	upgrader    websocket.Upgrader
	clients     map[*WebSocketClient]bool
	clientsLock sync.RWMutex
	Feed        *BinanceRunner
}

func NewBroadcastWebSocketHandler() *TickerWebSocketHandler {
	handler := TickerWebSocketHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
			EnableCompression: true,
		},
		clients: make(map[*WebSocketClient]bool),
	}
	return &handler
}

func (h *TickerWebSocketHandler) CloseClient(client *WebSocketClient) {
	delete(h.clients, client)
	client.conn.Close()
}

func (h *TickerWebSocketHandler) AddClient(client *WebSocketClient) {
	h.clientsLock.Lock()
	defer h.clientsLock.Unlock()
	h.clients[client] = true
}

func (h *TickerWebSocketHandler) Upgrade(w http.ResponseWriter, r *http.Request) (*WebSocketClient, error) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return nil, err
	}
	return NewWebSocketClient(conn, r), nil
}

func (h *TickerWebSocketHandler) Handle(w http.ResponseWriter, r *http.Request) {
	client, err := h.Upgrade(w, r)
	if err != nil {
		log.Printf("Failed to upgrade websocket connection: %v\n", err)
		return
	}
	h.AddClient(client)
	log.Printf("WebSocket connnected to %s: RemoteAddr=%v; Origin=%s\n",
		r.URL.String(),
		client.GetRemoteAddr(),
		r.Header.Get("origin"))

	wsConnectionTracker.Add(r.URL.String(), client)
	defer wsConnectionTracker.Del(r.URL.String(), client)

	symbol := r.FormValue("symbol")

	// The read loop just reads and discards message until an error is
	// received.
	go h.readLoop(client)

	if symbol != "" {
		channel := h.Feed.Subscribe(symbol)
		defer h.Feed.Unsubscribe(symbol, channel)
		for {
			select {
			case filteredMessage := <-channel:
				bytes, err := json.Marshal(filteredMessage)
				if err != nil {
					log.Printf("failed to marshal filtered ticker: %v\n", err)
					continue
				}

				if err := client.WriteTextMessage(bytes); err != nil {
					log.Printf("WebSocket write error: %v\n", err)
					goto Done
				}
			case msg := <-client.sendChannel:
				if msg == nil {
					goto Done
				}
				// Discard.
			}
		}
	} else {
		for {
			msg := <-client.sendChannel
			if msg == nil {
				goto Done
			}
			if err := client.WriteTextMessage(msg); err != nil {
				log.Printf("WebSocket write error: %v\n", err)
				break
			}
		}
	}
Done:
	client.done = true
	log.Printf("WebSocket connection closed: %v\n", client.GetRemoteAddr())
}

func (h *TickerWebSocketHandler) readLoop(client *WebSocketClient) {
	for {
		if _, _, err := client.conn.ReadMessage(); err != nil {
			break;
		}
	}
	client.sendChannel <- nil
}

type TickerStream struct {
	Tickers []interface{} `json:"tickers"`
}

func (h *TickerWebSocketHandler) Broadcast(v TickerStream) error {
	buf, err := json.Marshal(v)
	if err != nil {
		return err
	}

	h.clientsLock.RLock()
	defer h.clientsLock.RUnlock()

	for client := range h.clients {
		select {
		case client.sendChannel <- buf:
		default:
			log.Printf("WebSocket client [%v] appears to be blocked. Dropping.\n",
				client.GetRemoteAddr())
			client.done = true
		}

		if client.done {
			h.CloseClient(client)
		}
	}

	return nil
}
