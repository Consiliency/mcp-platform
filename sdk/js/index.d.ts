/**
 * MCP SDK TypeScript Definitions
 */

export interface MCPConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  tenantId?: string;
  [key: string]: any;
}

export interface Credentials {
  apiKey?: string;
  username?: string;
  password?: string;
}

export interface AuthResult {
  token: string;
  expiresAt: Date;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  status: 'available' | 'installed';
  installed: boolean;
  config?: any;
  dependencies?: string[];
  documentation?: any;
}

export interface ServiceFilters {
  category?: string;
  tag?: string[];
  status?: string;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

export interface HealthStatus {
  status: string;
  details: {
    [key: string]: any;
  };
}

export declare class MCPClient {
  constructor(config?: MCPConfig);
  
  connect(credentials: string | Credentials): Promise<AuthResult>;
  connectService(serviceId: string): Promise<ServiceProxy>;
  listServices(filters?: ServiceFilters): Promise<Service[]>;
  getService(serviceId: string): Promise<Service>;
  installService(serviceId: string, config?: any): Promise<InstallResult>;
  uninstallService(serviceId: string): Promise<InstallResult>;
  getHealth(serviceId?: string): Promise<HealthStatus>;
  on(event: string, callback: Function): void;
  off(event: string, callback: Function): void;
}

export declare class ServiceProxy {
  constructor(core: any, serviceId: string);
  
  call(method: string, params?: any): Promise<any>;
  getHealth(): Promise<HealthStatus>;
  method(methodName: string): (params?: any) => Promise<any>;
}

export declare class SDKCore {
  constructor(config: MCPConfig);
  
  authenticate(credentials: Credentials): Promise<AuthResult>;
  refreshToken(token: string): Promise<AuthResult>;
  listServices(filters?: ServiceFilters): Promise<Service[]>;
  getService(serviceId: string): Promise<Service>;
  installService(serviceId: string, config?: any): Promise<InstallResult>;
  uninstallService(serviceId: string): Promise<InstallResult>;
  callService(serviceId: string, method: string, params?: any): Promise<any>;
  on(event: string, callback: Function): void;
  off(event: string, callback: Function): void;
  getHealth(serviceId?: string): Promise<HealthStatus>;
}

export default MCPClient;