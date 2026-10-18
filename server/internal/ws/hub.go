// Package ws pushes events (AI job status) to the browser tabs of a user.
package ws

import (
	"sync"

	"github.com/MaSch0212/masch-notes/server/internal/api"
)

// sendBuffer is the number of queued messages per connection; slower consumers are dropped.
const sendBuffer = 16

type client struct {
	send chan api.WsServerMessage
	drop chan struct{}
	once sync.Once
}

func (c *client) dropNow() { c.once.Do(func() { close(c.drop) }) }

// Hub fans messages out to the authenticated connections of a user.
type Hub struct {
	mu      sync.Mutex
	clients map[int64]map[*client]struct{}
}

func NewHub() *Hub { return &Hub{clients: map[int64]map[*client]struct{}{}} }

func (h *Hub) register(userID int64) *client {
	c := &client{send: make(chan api.WsServerMessage, sendBuffer), drop: make(chan struct{})}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[userID] == nil {
		h.clients[userID] = map[*client]struct{}{}
	}
	h.clients[userID][c] = struct{}{}
	return c
}

func (h *Hub) unregister(userID int64, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients[userID], c)
	if len(h.clients[userID]) == 0 {
		delete(h.clients, userID)
	}
}

func (h *Hub) connCount(userID int64) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients[userID])
}

// Publish sends msg to every connection of the user without blocking; a connection
// whose buffer is full is dropped (the client reconnects and re-checks its jobs).
func (h *Hub) Publish(userID int64, msg api.WsServerMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients[userID] {
		select {
		case c.send <- msg:
		default:
			c.dropNow()
		}
	}
}
