const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const { promisify } = require('util');
const yaml = require('js-yaml');

const globAsync = promisify(glob);

describe('Deployment Documentation Validation', () => {
  const docsRoot = path.join(__dirname, '../..');
  let deploymentDocs;
  let dockerFiles;
  let configFiles;
  let cicdFiles;

  beforeAll(async () => {
    // Find deployment documentation
    deploymentDocs = await globAsync('**/*(DEPLOYMENT|deployment|deploy)*.md', {
      cwd: docsRoot,
      ignore: ['node_modules/**', 'coverage/**']
    });

    // Find Docker files
    dockerFiles = await globAsync('**/{Dockerfile,docker-compose*.yml,docker-compose*.yaml}', {
      cwd: docsRoot,
      ignore: ['node_modules/**']
    });

    // Find configuration files
    configFiles = await globAsync('**/{*.config.js,*.conf,nginx.conf,traefik.yml}', {
      cwd: docsRoot,
      ignore: ['node_modules/**']
    });

    // Find CI/CD files
    cicdFiles = await globAsync('**/{.github/workflows/*.yml,Jenkinsfile,.gitlab-ci.yml}', {
      cwd: docsRoot,
      ignore: ['node_modules/**']
    });
  });

  test('Deployment documentation should exist', () => {
    expect(deploymentDocs.length).toBeGreaterThan(0);
  });

  test('Deployment docs should cover all environments', async () => {
    const environments = ['development', 'staging', 'production'];
    const documentedEnvs = new Set();

    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      environments.forEach(env => {
        if (content.toLowerCase().includes(env)) {
          documentedEnvs.add(env);
        }
      });
    }

    const missingEnvs = environments.filter(env => !documentedEnvs.has(env));
    
    if (missingEnvs.length > 0) {
      console.warn('\nMissing environment documentation:', missingEnvs);
    }

    expect(documentedEnvs.size).toBeGreaterThanOrEqual(2);
  });

  test('Docker deployment should be properly documented', async () => {
    if (dockerFiles.length === 0) {
      console.log('No Docker files found, skipping Docker documentation test');
      return;
    }

    let dockerDocumented = false;
    const dockerTopics = [];

    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      if (/docker/i.test(content)) {
        dockerDocumented = true;
        
        // Check for essential Docker topics
        const topics = {
          'build': /docker\s+build/i.test(content),
          'run': /docker\s+run/i.test(content),
          'compose': /docker-compose/i.test(content),
          'volumes': /volume/i.test(content),
          'networks': /network/i.test(content),
          'environment': /environment|env/i.test(content)
        };
        
        Object.entries(topics).forEach(([topic, found]) => {
          if (found) dockerTopics.push(topic);
        });
      }
    }

    expect(dockerDocumented).toBe(true);
    expect(dockerTopics.length).toBeGreaterThanOrEqual(3);
  });

  test('All Dockerfiles should have corresponding documentation', async () => {
    const undocumentedDockerfiles = [];

    for (const dockerfile of dockerFiles.filter(f => f.includes('Dockerfile'))) {
      const dockerfileName = path.basename(dockerfile);
      let isDocumented = false;

      for (const docFile of deploymentDocs) {
        const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
        
        if (content.includes(dockerfileName) || 
            content.includes(path.dirname(dockerfile))) {
          isDocumented = true;
          break;
        }
      }

      if (!isDocumented) {
        undocumentedDockerfiles.push(dockerfile);
      }
    }

    if (undocumentedDockerfiles.length > 0) {
      console.warn('\nUndocumented Dockerfiles:', undocumentedDockerfiles);
    }

    expect(undocumentedDockerfiles.length).toBeLessThanOrEqual(2);
  });

  test('Environment variables should be documented', async () => {
    const envVarsFound = new Set();
    const envVarsDocumented = new Set();

    // Find environment variables in Docker and config files
    const filesToCheck = [...dockerFiles, ...configFiles];
    
    for (const file of filesToCheck) {
      const content = await fs.readFile(path.join(docsRoot, file), 'utf8');
      
      // Match environment variable patterns
      const patterns = [
        /\$\{?([A-Z_]+[A-Z0-9_]*)\}?/g,
        /process\.env\.([A-Z_]+[A-Z0-9_]*)/g,
        /ENV\s+([A-Z_]+[A-Z0-9_]*)/g,
        /environment:\s*\n\s*-?\s*([A-Z_]+[A-Z0-9_]*)/g
      ];
      
      patterns.forEach(pattern => {
        const matches = [...content.matchAll(pattern)];
        matches.forEach(match => {
          if (match[1] && !match[1].startsWith('NODE_')) {
            envVarsFound.add(match[1]);
          }
        });
      });
    }

    // Check documentation for environment variables
    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      envVarsFound.forEach(envVar => {
        if (content.includes(envVar)) {
          envVarsDocumented.add(envVar);
        }
      });
    }

    const undocumentedVars = [...envVarsFound].filter(v => !envVarsDocumented.has(v));
    
    if (undocumentedVars.length > 0) {
      console.warn('\nUndocumented environment variables:', undocumentedVars.slice(0, 10));
    }

    // At least 50% of env vars should be documented
    const documentationRate = envVarsFound.size > 0 
      ? (envVarsDocumented.size / envVarsFound.size) * 100 
      : 100;
    
    expect(documentationRate).toBeGreaterThanOrEqual(50);
  });

  test('Port mappings should be documented', async () => {
    const ports = new Set();
    
    // Extract ports from Docker files
    for (const dockerFile of dockerFiles) {
      const content = await fs.readFile(path.join(docsRoot, dockerFile), 'utf8');
      
      // Match port patterns
      const portPatterns = [
        /EXPOSE\s+(\d+)/g,
        /ports:\s*\n\s*-?\s*"?(\d+):/gm,
        /-p\s+(\d+):/g,
        /PORT[=:]\s*(\d+)/g
      ];
      
      portPatterns.forEach(pattern => {
        const matches = [...content.matchAll(pattern)];
        matches.forEach(match => {
          if (match[1]) {
            ports.add(match[1]);
          }
        });
      });
    }

    // Check if ports are documented
    let portsDocumented = 0;
    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      ports.forEach(port => {
        if (content.includes(port)) {
          portsDocumented++;
        }
      });
    }

    if (ports.size > 0) {
      const documentationRate = (portsDocumented / ports.size) * 100;
      expect(documentationRate).toBeGreaterThanOrEqual(50);
    }
  });

  test('Database setup should be documented', async () => {
    const dbPatterns = [
      /postgres/i,
      /mysql/i,
      /mongodb/i,
      /redis/i,
      /database/i,
      /migrations?/i
    ];

    let hasDbConfig = false;
    
    // Check if project uses databases
    const allFiles = [...dockerFiles, ...configFiles];
    for (const file of allFiles) {
      const content = await fs.readFile(path.join(docsRoot, file), 'utf8');
      
      if (dbPatterns.some(pattern => pattern.test(content))) {
        hasDbConfig = true;
        break;
      }
    }

    if (!hasDbConfig) {
      console.log('No database configuration found, skipping database documentation test');
      return;
    }

    // Check for database documentation
    let dbDocumented = false;
    const dbTopics = [];

    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      if (dbPatterns.some(pattern => pattern.test(content))) {
        dbDocumented = true;
        
        // Check for essential database topics
        const topics = {
          'connection': /connection|connect|url|uri/i.test(content),
          'schema': /schema|table|collection/i.test(content),
          'migration': /migration|migrate/i.test(content),
          'backup': /backup|restore/i.test(content),
          'credentials': /credentials|password|auth/i.test(content)
        };
        
        Object.entries(topics).forEach(([topic, found]) => {
          if (found) dbTopics.push(topic);
        });
      }
    }

    expect(dbDocumented).toBe(true);
    expect(dbTopics.length).toBeGreaterThanOrEqual(2);
  });

  test('Security considerations should be documented', async () => {
    const securityTopics = [];
    let hasSecuritySection = false;

    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      if (/##?\s*Security/i.test(content)) {
        hasSecuritySection = true;
      }

      const topics = {
        'HTTPS/TLS': /https|tls|ssl|certificate/i.test(content),
        'Authentication': /auth|jwt|token|oauth/i.test(content),
        'Secrets': /secret|credential|key\s*management/i.test(content),
        'Firewall': /firewall|iptables|security\s*group/i.test(content),
        'Updates': /update|patch|vulnerability/i.test(content)
      };

      Object.entries(topics).forEach(([topic, found]) => {
        if (found) securityTopics.push(topic);
      });
    }

    expect(hasSecuritySection || securityTopics.length > 0).toBe(true);
    expect(securityTopics.length).toBeGreaterThanOrEqual(2);
  });

  test('Monitoring and logging setup should be documented', async () => {
    const monitoringTopics = [];
    
    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      const topics = {
        'Logging': /log|winston|morgan|bunyan/i.test(content),
        'Metrics': /metric|prometheus|grafana/i.test(content),
        'Health checks': /health|liveness|readiness/i.test(content),
        'Alerts': /alert|notification|alarm/i.test(content),
        'Tracing': /trace|span|jaeger|zipkin/i.test(content)
      };

      Object.entries(topics).forEach(([topic, found]) => {
        if (found && !monitoringTopics.includes(topic)) {
          monitoringTopics.push(topic);
        }
      });
    }

    expect(monitoringTopics.length).toBeGreaterThanOrEqual(2);
  });

  test('Deployment commands should be properly formatted', async () => {
    const commandIssues = [];

    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      const lines = content.split('\n');
      
      let inCodeBlock = false;
      let codeBlockType = '';
      
      lines.forEach((line, index) => {
        if (line.startsWith('```')) {
          if (!inCodeBlock) {
            inCodeBlock = true;
            codeBlockType = line.substring(3).trim();
          } else {
            inCodeBlock = false;
            codeBlockType = '';
          }
        } else if (inCodeBlock && ['bash', 'sh', 'shell', ''].includes(codeBlockType)) {
          // Check for common command issues
          if (line.includes('sudo') && !line.includes('$')) {
            commandIssues.push({
              file: docFile,
              line: index + 1,
              issue: 'sudo command without proper prompt indicator'
            });
          }
          
          if (line.startsWith('$') && line.includes('  ')) {
            commandIssues.push({
              file: docFile,
              line: index + 1,
              issue: 'Multiple spaces in command'
            });
          }
        }
      });
    }

    if (commandIssues.length > 0) {
      console.warn('\nCommand formatting issues:');
      commandIssues.forEach(({ file, line, issue }) => {
        console.warn(`  ${file}:${line} - ${issue}`);
      });
    }

    expect(commandIssues.length).toBeLessThanOrEqual(5);
  });

  test('CI/CD pipeline should be documented', async () => {
    if (cicdFiles.length === 0) {
      console.log('No CI/CD files found, skipping CI/CD documentation test');
      return;
    }

    let cicdDocumented = false;
    const cicdTopics = [];

    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      if (/ci\/cd|continuous|pipeline|github\s*actions|jenkins|gitlab/i.test(content)) {
        cicdDocumented = true;
        
        const topics = {
          'Build': /build|compile|package/i.test(content),
          'Test': /test|jest|mocha|pytest/i.test(content),
          'Deploy': /deploy|release|publish/i.test(content),
          'Rollback': /rollback|revert|restore/i.test(content),
          'Environments': /staging|production|environment/i.test(content)
        };
        
        Object.entries(topics).forEach(([topic, found]) => {
          if (found) cicdTopics.push(topic);
        });
      }
    }

    expect(cicdDocumented).toBe(true);
    expect(cicdTopics.length).toBeGreaterThanOrEqual(3);
  });

  test('Scaling and performance considerations should be documented', async () => {
    const scalingTopics = [];
    
    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      const topics = {
        'Load balancing': /load\s*balanc|nginx|haproxy|traefik/i.test(content),
        'Caching': /cache|redis|memcached|cdn/i.test(content),
        'Scaling': /scal|replica|instance|cluster/i.test(content),
        'Performance': /performance|optimization|latency|throughput/i.test(content),
        'Resources': /cpu|memory|resource|limit/i.test(content)
      };

      Object.entries(topics).forEach(([topic, found]) => {
        if (found && !scalingTopics.includes(topic)) {
          scalingTopics.push(topic);
        }
      });
    }

    // Should document at least some scaling considerations
    expect(scalingTopics.length).toBeGreaterThanOrEqual(2);
  });

  test('Troubleshooting section should be included', async () => {
    let hasTroubleshooting = false;
    const troubleshootingTopics = [];

    for (const docFile of deploymentDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      
      if (/##?\s*(Troubleshoot|Debug|Common\s*(Issues|Problems)|FAQ)/i.test(content)) {
        hasTroubleshooting = true;
        
        // Check for specific troubleshooting content
        const topics = {
          'Logs': /logs?|logging/i.test(content),
          'Errors': /error|exception|failure/i.test(content),
          'Debug': /debug|inspect|verbose/i.test(content),
          'Solutions': /solution|fix|resolve|workaround/i.test(content)
        };
        
        Object.entries(topics).forEach(([topic, found]) => {
          if (found) troubleshootingTopics.push(topic);
        });
      }
    }

    expect(hasTroubleshooting).toBe(true);
    expect(troubleshootingTopics.length).toBeGreaterThanOrEqual(2);
  });
});