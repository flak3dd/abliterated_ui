package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"sync/atomic"
	"time"
)

type GatewayConfig struct {
	Port         string
	UpstreamURL  string
	RateCapacity float64
	RateRefill   float64
}

type GatewayMetrics struct {
	TotalRequests     uint64 `json:"total_requests"`
	RateLimitedReqs   uint64 `json:"rate_limited_requests"`
	RejectedReqs      uint64 `json:"rejected_requests"`
	ProxiedRequests   uint64 `json:"proxied_requests"`
	ActiveConnections int64  `json:"active_connections"`
	UptimeSeconds     int64  `json:"uptime_seconds"`
}

var (
	metrics   GatewayMetrics
	startTime = time.Now()
)

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func main() {
	cfg := GatewayConfig{
		Port:         getEnv("GATEWAY_PORT", "8080"),
		UpstreamURL:  getEnv("UPSTREAM_URL", "http://127.0.0.1:8090"),
		RateCapacity: 60.0, // 60 burst tokens
		RateRefill:   10.0, // 10 tokens per second
	}

	targetURL, err := url.Parse(cfg.UpstreamURL)
	if err != nil {
		log.Fatalf("[Gateway] Invalid upstream URL: %v", err)
	}

	limiter := NewRateLimiter(cfg.RateCapacity, cfg.RateRefill, 2*time.Minute)

	// Create reverse proxy with streaming flush interval
	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	proxy.FlushInterval = 20 * time.Millisecond // Guarantee instant SSE token streaming

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = targetURL.Host
		req.Header.Set("X-Forwarded-Host", req.Header.Get("Host"))
		req.Header.Set("X-Gateway-Engine", "Sovereign-Spark-Go/1.22")
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[Gateway] Upstream error connecting to %s: %v", targetURL.String(), err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":       false,
			"error":    fmt.Sprintf("Upstream gateway failure: %v", err),
			"upstream": targetURL.String(),
		})
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddUint64(&metrics.TotalRequests, 1)
		atomic.AddInt64(&metrics.ActiveConnections, 1)
		defer atomic.AddInt64(&metrics.ActiveConnections, -1)

		// CORS Preflight
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		w.Header().Set("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Health probe
		if r.URL.Path == "/health" || r.URL.Path == "/api/gateway/health" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"ok":        true,
				"service":   "sovereign-spark-go-gateway",
				"port":      cfg.Port,
				"upstream":  cfg.UpstreamURL,
				"uptime_s":  int64(time.Since(startTime).Seconds()),
				"metrics":   getMetrics(),
			})
			return
		}

		// Prometheus metrics
		if r.URL.Path == "/metrics" {
			w.Header().Set("Content-Type", "text/plain")
			m := getMetrics()
			fmt.Fprintf(w, "# HELP gateway_requests_total Total number of incoming requests\n")
			fmt.Fprintf(w, "# TYPE gateway_requests_total counter\n")
			fmt.Fprintf(w, "gateway_requests_total %d\n", m.TotalRequests)
			fmt.Fprintf(w, "gateway_rate_limited_total %d\n", m.RateLimitedReqs)
			fmt.Fprintf(w, "gateway_proxied_total %d\n", m.ProxiedRequests)
			fmt.Fprintf(w, "gateway_active_connections %d\n", m.ActiveConnections)
			return
		}

		// 1. Request Inspection
		inspectRes := InspectRequest(r)
		if !inspectRes.Valid {
			atomic.AddUint64(&metrics.RejectedReqs, 1)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(inspectRes.StatusCode)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"ok":    false,
				"error": inspectRes.ErrorMsg,
			})
			return
		}

		// 2. Token Bucket Rate Limiting
		allowed, remaining, retryAfter := limiter.Allow(inspectRes.ClientKey)
		w.Header().Set("X-RateLimit-Limit", strconv.FormatInt(int64(cfg.RateCapacity), 10))
		w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))

		if !allowed {
			atomic.AddUint64(&metrics.RateLimitedReqs, 1)
			w.Header().Set("Retry-After", strconv.FormatInt(int64(retryAfter.Seconds())+1, 10))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"ok":          false,
				"error":       "Rate limit exceeded. Please throttle requests.",
				"retry_after": retryAfter.String(),
			})
			return
		}

		// 3. Forward to Upstream
		atomic.AddUint64(&metrics.ProxiedRequests, 1)
		proxy.ServeHTTP(w, r)
	})

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  180 * time.Second,
	}

	log.Printf("⚡ [Go Gateway] Listening on :%s -> Proxying to %s", cfg.Port, cfg.UpstreamURL)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[Gateway] Server error: %v", err)
	}
}

func getMetrics() GatewayMetrics {
	return GatewayMetrics{
		TotalRequests:     atomic.LoadUint64(&metrics.TotalRequests),
		RateLimitedReqs:   atomic.LoadUint64(&metrics.RateLimitedReqs),
		RejectedReqs:      atomic.LoadUint64(&metrics.RejectedReqs),
		ProxiedRequests:   atomic.LoadUint64(&metrics.ProxiedRequests),
		ActiveConnections: atomic.LoadInt64(&metrics.ActiveConnections),
		UptimeSeconds:     int64(time.Since(startTime).Seconds()),
	}
}
