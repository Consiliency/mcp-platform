const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

describe('Docker Production Setup', () => {
  describe('Production Dockerfiles', () => {
    test('Node.js Dockerfile exists and has required stages', () => {
      const dockerfilePath = path.join(__dirname, '../docker/production/node.Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      
      // Check for multi-stage build
      expect(content).toContain('FROM node:20-alpine AS dependencies');
      expect(content).toContain('FROM node:20-alpine AS build');
      expect(content).toContain('FROM node:20-alpine AS security-scan');
      expect(content).toContain('FROM node:20-alpine AS production');
      
      // Check for security features
      expect(content).toContain('RUN addgroup -g 1001 -S nodejs');
      expect(content).toContain('USER nodejs');
      expect(content).toContain('dumb-init');
      
      // Check for health check
      expect(content).toContain('HEALTHCHECK');
    });

    test('Python Dockerfile exists and has required stages', () => {
      const dockerfilePath = path.join(__dirname, '../docker/production/python.Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      
      // Check for multi-stage build
      expect(content).toContain('FROM python:3.11-slim AS builder');
      expect(content).toContain('FROM python:3.11-slim AS security-scan');
      expect(content).toContain('FROM python:3.11-slim AS production');
      
      // Check for security features
      expect(content).toContain('RUN groupadd -r python -g 1001');
      expect(content).toContain('USER python');
      expect(content).toContain('dumb-init');
      
      // Check for virtual environment
      expect(content).toContain('python -m venv');
    });
  });

  describe('Docker Compose Production', () => {
    let composeConfig;

    beforeAll(() => {
      const composePath = path.join(__dirname, '../docker-compose.production.yml');
      const composeContent = fs.readFileSync(composePath, 'utf8');
      composeConfig = yaml.load(composeContent);
    });

    test('All required services are defined', () => {
      expect(composeConfig.services).toHaveProperty('api');
      expect(composeConfig.services).toHaveProperty('worker');
      expect(composeConfig.services).toHaveProperty('health-monitor');
      expect(composeConfig.services).toHaveProperty('redis');
      expect(composeConfig.services).toHaveProperty('postgres');
      expect(composeConfig.services).toHaveProperty('nginx');
    });

    test('Services have resource limits', () => {
      const services = ['api', 'worker', 'health-monitor', 'redis', 'postgres', 'nginx'];
      
      services.forEach(service => {
        expect(composeConfig.services[service]).toHaveProperty('deploy');
        expect(composeConfig.services[service].deploy).toHaveProperty('resources');
        expect(composeConfig.services[service].deploy.resources).toHaveProperty('limits');
        expect(composeConfig.services[service].deploy.resources).toHaveProperty('reservations');
      });
    });

    test('Services have health checks', () => {
      const services = ['api', 'worker', 'health-monitor', 'redis', 'postgres', 'nginx'];
      
      services.forEach(service => {
        expect(composeConfig.services[service]).toHaveProperty('healthcheck');
        expect(composeConfig.services[service].healthcheck).toHaveProperty('test');
        expect(composeConfig.services[service].healthcheck).toHaveProperty('interval');
        expect(composeConfig.services[service].healthcheck).toHaveProperty('timeout');
        expect(composeConfig.services[service].healthcheck).toHaveProperty('retries');
      });
    });

    test('Production networking is configured', () => {
      expect(composeConfig).toHaveProperty('networks');
      expect(composeConfig.networks).toHaveProperty('mcp-network');
      expect(composeConfig.networks['mcp-network']).toHaveProperty('ipam');
      
      // All services should use the network
      Object.values(composeConfig.services).forEach(service => {
        expect(service.networks).toContain('mcp-network');
      });
    });

    test('Volumes are properly configured', () => {
      expect(composeConfig).toHaveProperty('volumes');
      expect(composeConfig.volumes).toHaveProperty('postgres-data');
      expect(composeConfig.volumes).toHaveProperty('redis-data');
      expect(composeConfig.volumes).toHaveProperty('nginx-cache');
    });

    test('Logging is configured for all services', () => {
      Object.values(composeConfig.services).forEach(service => {
        expect(service).toHaveProperty('logging');
        expect(service.logging).toHaveProperty('driver', 'json-file');
        expect(service.logging).toHaveProperty('options');
        expect(service.logging.options).toHaveProperty('max-size');
        expect(service.logging.options).toHaveProperty('max-file');
      });
    });
  });

  describe('Health Monitoring', () => {
    test('Health monitor server exists', () => {
      const serverPath = path.join(__dirname, '../docker/health/health-monitor-server.js');
      expect(fs.existsSync(serverPath)).toBe(true);
      
      const content = fs.readFileSync(serverPath, 'utf8');
      
      // Check for required functionality
      expect(content).toContain('registerHealthChecks');
      expect(content).toContain('gracefulShutdown');
      expect(content).toContain('process.on(\'SIGTERM\'');
      expect(content).toContain('process.on(\'SIGINT\'');
    });

    test('Health monitor package.json exists', () => {
      const packagePath = path.join(__dirname, '../docker/health/package.json');
      expect(fs.existsSync(packagePath)).toBe(true);
      
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Check dependencies
      expect(packageJson.dependencies).toHaveProperty('express');
      expect(packageJson.dependencies).toHaveProperty('axios');
      expect(packageJson.dependencies).toHaveProperty('redis');
      expect(packageJson.dependencies).toHaveProperty('pg');
    });
  });

  describe('Production Configuration', () => {
    test('Nginx configuration exists', () => {
      const nginxPath = path.join(__dirname, '../docker/production/nginx.conf');
      expect(fs.existsSync(nginxPath)).toBe(true);
      
      const content = fs.readFileSync(nginxPath, 'utf8');
      
      // Check security headers
      expect(content).toContain('X-Frame-Options');
      expect(content).toContain('X-Content-Type-Options');
      expect(content).toContain('Strict-Transport-Security');
      
      // Check rate limiting
      expect(content).toContain('limit_req_zone');
      expect(content).toContain('limit_conn_zone');
      
      // Check SSL configuration
      expect(content).toContain('ssl_protocols TLSv1.2 TLSv1.3');
      expect(content).toContain('ssl_ciphers');
    });

    test('Production environment example exists', () => {
      const envPath = path.join(__dirname, '../.env.production.example');
      expect(fs.existsSync(envPath)).toBe(true);
      
      const content = fs.readFileSync(envPath, 'utf8');
      
      // Check required variables
      expect(content).toContain('JWT_SECRET');
      expect(content).toContain('DATABASE_URL');
      expect(content).toContain('REDIS_URL');
      expect(content).toContain('NODE_ENV=production');
    });

    test('Graceful shutdown handler exists', () => {
      const shutdownPath = path.join(__dirname, '../docker/production/graceful-shutdown.js');
      expect(fs.existsSync(shutdownPath)).toBe(true);
      
      const content = fs.readFileSync(shutdownPath, 'utf8');
      
      // Check functionality
      expect(content).toContain('class GracefulShutdown');
      expect(content).toContain('closeServer');
      expect(content).toContain('closeConnections');
      expect(content).toContain('runCleanup');
    });
  });

  describe('Documentation', () => {
    test('Production README exists and is comprehensive', () => {
      const readmePath = path.join(__dirname, '../docker/production/README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      
      const content = fs.readFileSync(readmePath, 'utf8');
      
      // Check sections
      expect(content).toContain('## Overview');
      expect(content).toContain('## Components');
      expect(content).toContain('## Deployment');
      expect(content).toContain('## Monitoring');
      expect(content).toContain('## Security');
      expect(content).toContain('## Resource Management');
      expect(content).toContain('## Graceful Shutdown');
      expect(content).toContain('## Troubleshooting');
    });
  });
});