// Package mcp provides a Go SDK for Model Context Protocol services
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Config holds the configuration for the MCP client
type Config struct {
	APIKey        string
	BaseURL       string
	Timeout       time.Duration
	RetryAttempts int
	TenantID      string
}

// Client is the main MCP client
type Client struct {
	config       Config
	authToken    string
	authExpiry   time.Time
	services     map[string]*ServiceProxy
	httpClient   *http.Client
	mu           sync.RWMutex
}

// Service represents an MCP service
type Service struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Version      string   `json:"version"`
	Category     string   `json:"category"`
	Tags         []string `json:"tags"`
	Status       string   `json:"status"`
	Installed    bool     `json:"installed"`
}

// AuthResult represents authentication result
type AuthResult struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// InstallResult represents service installation result
type InstallResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// HealthStatus represents health check result
type HealthStatus struct {
	Status  string                 `json:"status"`
	Details map[string]interface{} `json:"details"`
}

// NewClient creates a new MCP client
func NewClient(config Config) *Client {
	if config.BaseURL == "" {
		config.BaseURL = "https://api.mcp.io"
	}
	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}
	if config.RetryAttempts == 0 {
		config.RetryAttempts = 3
	}

	return &Client{
		config: config,
		services: make(map[string]*ServiceProxy),
		httpClient: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

// Connect authenticates with MCP using the provided credentials
func (c *Client) Connect(ctx context.Context, credentials interface{}) (*AuthResult, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Handle different credential types
	var apiKey string
	switch creds := credentials.(type) {
	case string:
		apiKey = creds
	case map[string]string:
		if key, ok := creds["api_key"]; ok {
			apiKey = key
		} else {
			return nil, errors.New("invalid credentials format")
		}
	default:
		return nil, errors.New("credentials must be string or map")
	}

	// Simulate authentication (in real implementation, call API)
	c.authToken = fmt.Sprintf("go-token-%s", apiKey[:8])
	c.authExpiry = time.Now().Add(time.Hour)

	return &AuthResult{
		Token:     c.authToken,
		ExpiresAt: c.authExpiry,
	}, nil
}

// ConnectService connects to a specific service
func (c *Client) ConnectService(ctx context.Context, serviceID string) (*ServiceProxy, error) {
	// Check if service is installed
	service, err := c.GetService(ctx, serviceID)
	if err != nil {
		return nil, err
	}

	if !service.Installed {
		result, err := c.InstallService(ctx, serviceID, nil)
		if err != nil {
			return nil, err
		}
		if !result.Success {
			return nil, errors.New(result.Message)
		}
	}

	// Create service proxy
	c.mu.Lock()
	proxy := &ServiceProxy{
		client:    c,
		serviceID: serviceID,
	}
	c.services[serviceID] = proxy
	c.mu.Unlock()

	return proxy, nil
}

// ListServices returns a list of available services
func (c *Client) ListServices(ctx context.Context, filters map[string]interface{}) ([]Service, error) {
	if err := c.checkAuth(); err != nil {
		return nil, err
	}

	// In real implementation, call API
	// For now, return mock data
	return []Service{
		{
			ID:          "postgres-mcp",
			Name:        "PostgreSQL MCP",
			Description: "PostgreSQL database service",
			Version:     "14.0",
			Category:    "database",
			Tags:        []string{"sql", "database", "postgres"},
			Status:      "available",
			Installed:   false,
		},
	}, nil
}

// GetService returns detailed information about a service
func (c *Client) GetService(ctx context.Context, serviceID string) (*Service, error) {
	if err := c.checkAuth(); err != nil {
		return nil, err
	}

	// In real implementation, call API
	c.mu.RLock()
	_, installed := c.services[serviceID]
	c.mu.RUnlock()

	return &Service{
		ID:          serviceID,
		Name:        fmt.Sprintf("%s Service", serviceID),
		Description: fmt.Sprintf("Description for %s", serviceID),
		Version:     "1.0.0",
		Category:    "custom",
		Tags:        []string{},
		Status:      "available",
		Installed:   installed,
	}, nil
}

// InstallService installs a service
func (c *Client) InstallService(ctx context.Context, serviceID string, config map[string]interface{}) (*InstallResult, error) {
	if err := c.checkAuth(); err != nil {
		return nil, err
	}

	// In real implementation, call API
	return &InstallResult{
		Success: true,
		Message: fmt.Sprintf("Service %s installed successfully", serviceID),
	}, nil
}

// UninstallService uninstalls a service
func (c *Client) UninstallService(ctx context.Context, serviceID string) (*InstallResult, error) {
	if err := c.checkAuth(); err != nil {
		return nil, err
	}

	c.mu.Lock()
	delete(c.services, serviceID)
	c.mu.Unlock()

	return &InstallResult{
		Success: true,
		Message: fmt.Sprintf("Service %s uninstalled successfully", serviceID),
	}, nil
}

// GetHealth returns health status
func (c *Client) GetHealth(ctx context.Context, serviceID string) (*HealthStatus, error) {
	if err := c.checkAuth(); err != nil {
		return nil, err
	}

	if serviceID != "" {
		c.mu.RLock()
		_, connected := c.services[serviceID]
		c.mu.RUnlock()

		return &HealthStatus{
			Status: "healthy",
			Details: map[string]interface{}{
				"service_id":   serviceID,
				"connected":    connected,
				"last_checked": time.Now().Format(time.RFC3339),
			},
		}, nil
	}

	// Platform health
	c.mu.RLock()
	serviceCount := len(c.services)
	c.mu.RUnlock()

	return &HealthStatus{
		Status: "healthy",
		Details: map[string]interface{}{
			"authentication":     "valid",
			"installed_services": serviceCount,
			"timestamp":         time.Now().Format(time.RFC3339),
		},
	}, nil
}

// checkAuth verifies authentication is valid
func (c *Client) checkAuth() error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.authToken == "" || time.Now().After(c.authExpiry) {
		return errors.New("authentication required")
	}
	return nil
}

// ServiceProxy provides easy access to a specific service
type ServiceProxy struct {
	client    *Client
	serviceID string
}

// Call invokes a method on the service
func (sp *ServiceProxy) Call(ctx context.Context, method string, params interface{}) (interface{}, error) {
	if err := sp.client.checkAuth(); err != nil {
		return nil, err
	}

	// In real implementation, call service
	result := map[string]interface{}{
		"success":    true,
		"service_id": sp.serviceID,
		"method":     method,
		"params":     params,
		"result":     fmt.Sprintf("Response from %s.%s", sp.serviceID, method),
		"timestamp":  time.Now().Format(time.RFC3339),
	}

	return result, nil
}

// GetHealth returns the health status of this service
func (sp *ServiceProxy) GetHealth(ctx context.Context) (*HealthStatus, error) {
	return sp.client.GetHealth(ctx, sp.serviceID)
}