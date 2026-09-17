package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
)

const (
	MaxPayloadBytes = 10 * 1024 * 1024 // 10 MB payload limit
)

// InspectResult holds the outcome of inspecting an incoming request.
type InspectResult struct {
	Valid     bool
	ClientKey string
	ErrorMsg  string
	StatusCode int
}

// ExtractClientKey resolves client identity: Authorization Bearer Token > CF-Connecting-IP > X-Forwarded-For > RemoteAddr.
func ExtractClientKey(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		token := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		if len(token) > 0 {
			// Mask token to use first 16 chars for key bucket
			if len(token) > 24 {
				return "token:" + token[:24]
			}
			return "token:" + token
		}
	}

	cfIP := strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))
	if cfIP != "" {
		return "ip:" + cfIP
	}

	xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if xff != "" {
		parts := strings.Split(xff, ",")
		return "ip:" + strings.TrimSpace(parts[0])
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return "ip:" + host
	}
	return "ip:" + r.RemoteAddr
}

// InspectRequest inspects payload size, headers, and validates JSON if payload is present.
func InspectRequest(r *http.Request) InspectResult {
	clientKey := ExtractClientKey(r)

	// Guard methods
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodDelete:
		return InspectResult{Valid: true, ClientKey: clientKey}
	case http.MethodPost, http.MethodPut, http.MethodPatch:
		// continue inspection
	default:
		return InspectResult{
			Valid:      false,
			ClientKey:  clientKey,
			StatusCode: http.StatusMethodNotAllowed,
			ErrorMsg:   fmt.Sprintf("Method %s not allowed", r.Method),
		}
	}

	// Guard payload size limit
	if r.ContentLength > MaxPayloadBytes {
		return InspectResult{
			Valid:      false,
			ClientKey:  clientKey,
			StatusCode: http.StatusRequestEntityTooLarge,
			ErrorMsg:   fmt.Sprintf("Payload exceeds maximum allowed size of %d bytes", MaxPayloadBytes),
		}
	}

	// Read and buffer body for validation and rewinding
	if r.Body != nil && r.ContentLength != 0 {
		limitedReader := io.LimitReader(r.Body, MaxPayloadBytes+1)
		bodyBytes, err := io.ReadAll(limitedReader)
		if err != nil {
			return InspectResult{
				Valid:      false,
				ClientKey:  clientKey,
				StatusCode: http.StatusBadRequest,
				ErrorMsg:   "Failed to read request body",
			}
		}

		if int64(len(bodyBytes)) > MaxPayloadBytes {
			return InspectResult{
				Valid:      false,
				ClientKey:  clientKey,
				StatusCode: http.StatusRequestEntityTooLarge,
				ErrorMsg:   "Payload exceeds maximum allowed size",
			}
		}

		// If body is present and Content-Type indicates JSON, validate JSON syntax
		cType := strings.ToLower(r.Header.Get("Content-Type"))
		if strings.Contains(cType, "application/json") && len(bodyBytes) > 0 {
			if !json.Valid(bodyBytes) {
				return InspectResult{
					Valid:      false,
					ClientKey:  clientKey,
					StatusCode: http.StatusBadRequest,
					ErrorMsg:   "Malformed JSON syntax in request body",
				}
			}
		}

		// Rewind body so downstream reverse proxy can read it
		r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	}

	return InspectResult{Valid: true, ClientKey: clientKey}
}
