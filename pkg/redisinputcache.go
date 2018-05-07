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
	"github.com/go-redis/redis"
	"time"
	"encoding/json"
)

type RedisCacheEntry struct {
	Timestamp int64  `json:"timestamp"`
	Message   string `json:"message"`
}

func DecodeRedisCacheEntry(buf string) (RedisCacheEntry, error) {
	var cacheEntry RedisCacheEntry
	err := json.Unmarshal([]byte(buf), &cacheEntry)
	return cacheEntry, err
}

type RedisInputCache struct {
	client *redis.Client
	key    string
}

func NewRedisInputCache(key string) *RedisInputCache {
	cache := RedisInputCache{}
	cache.client = redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	cache.key = key
	return &cache
}

func (c *RedisInputCache) RPush(buf []byte) {
	entry := RedisCacheEntry{
		Timestamp: time.Now().Unix(),
		Message:   string(buf),
	}
	encoded, _ := json.Marshal(&entry)
	c.client.RPush(c.key, encoded)
}

func (c *RedisInputCache) LRange(start, stop int64) ([]string, error) {
	return c.client.LRange(c.key, start, stop).Result()
}

func (c *RedisInputCache) GetFirst() (*RedisCacheEntry, error) {
	return c.GetN(0)
}

func (c *RedisInputCache) GetN(n int64) (*RedisCacheEntry, error) {
	var cacheEntry RedisCacheEntry
	elements, err := c.LRange(n, n)
	if err != nil {
		return nil, err
	}
	if len(elements) == 0 {
		return nil, nil
	}
	cacheEntry, err = DecodeRedisCacheEntry(elements[0])
	return &cacheEntry, err
}

func (c *RedisInputCache) Len() (int64, error) {
	return c.client.LLen(c.key).Result()
}

// Like LPop, but ignores the result.
func (c *RedisInputCache) LRemove() {
	c.client.LPop(c.key).Err()
}
