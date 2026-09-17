package main

import (
	"sync"
	"time"
)

// TokenBucket implements an in-memory token bucket rate limiter.
type TokenBucket struct {
	capacity     float64
	tokens       float64
	refillRate   float64 // tokens per second
	lastRefill   time.Time
	mu           sync.Mutex
}

func NewTokenBucket(capacity, refillRate float64) *TokenBucket {
	return &TokenBucket{
		capacity:   capacity,
		tokens:     capacity,
		refillRate: refillRate,
		lastRefill: time.Now(),
	}
}

// Allow checks if 1 token can be consumed and returns remaining count and retry delay if blocked.
func (tb *TokenBucket) Allow() (bool, int, time.Duration) {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(tb.lastRefill).Seconds()
	tb.lastRefill = now

	// Refill tokens based on elapsed time
	tb.tokens = tb.tokens + elapsed*tb.refillRate
	if tb.tokens > tb.capacity {
		tb.tokens = tb.capacity
	}

	if tb.tokens >= 1.0 {
		tb.tokens -= 1.0
		return true, int(tb.tokens), 0
	}

	// Calculate wait duration until next token is available
	deficit := 1.0 - tb.tokens
	retryAfter := time.Duration(deficit/tb.refillRate*float64(time.Second)) + 10*time.Millisecond
	return false, 0, retryAfter
}

// RateLimiter manages a collection of token buckets identified by client key (IP, API Key).
type RateLimiter struct {
	defaultCapacity   float64
	defaultRefillRate float64
	buckets           sync.Map
	lastCleanup       time.Time
	cleanupInterval   time.Duration
}

type bucketEntry struct {
	bucket    *TokenBucket
	lastAccess time.Time
}

func NewRateLimiter(capacity, refillRate float64, cleanupInterval time.Duration) *RateLimiter {
	rl := &RateLimiter{
		defaultCapacity:   capacity,
		defaultRefillRate: refillRate,
		cleanupInterval:   cleanupInterval,
		lastCleanup:       time.Now(),
	}
	go rl.evictionLoop()
	return rl
}

func (rl *RateLimiter) GetBucket(key string) *TokenBucket {
	now := time.Now()
	val, ok := rl.buckets.Load(key)
	if ok {
		entry := val.(*bucketEntry)
		entry.lastAccess = now
		return entry.bucket
	}

	bucket := NewTokenBucket(rl.defaultCapacity, rl.defaultRefillRate)
	entry := &bucketEntry{bucket: bucket, lastAccess: now}
	actual, _ := rl.buckets.LoadOrStore(key, entry)
	return actual.(*bucketEntry).bucket
}

func (rl *RateLimiter) Allow(key string) (bool, int, time.Duration) {
	bucket := rl.GetBucket(key)
	return bucket.Allow()
}

func (rl *RateLimiter) evictionLoop() {
	ticker := time.NewTicker(rl.cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		rl.buckets.Range(func(key, val any) bool {
			entry := val.(*bucketEntry)
			// Evict buckets unused for more than 10 minutes
			if now.Sub(entry.lastAccess) > 10*time.Minute {
				rl.buckets.Delete(key)
			}
			return true
		})
	}
}
