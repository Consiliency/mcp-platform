/**
 * Unit tests for GitHub Actions workflow validation
 * @module tests/unit/workflows/workflow-validation.test
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

describe('GitHub Actions Workflow Validation', () => {
  const workflowsDir = path.join(__dirname, '../../../.github/workflows');
  let workflowFiles = [];

  beforeAll(async () => {
    try {
      // Get all workflow files
      const files = await fs.readdir(workflowsDir);
      workflowFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    } catch (error) {
      console.error('Failed to read workflows directory:', error);
      workflowFiles = [];
    }
  });

  describe('Workflow structure validation', () => {
    it('should have workflow files', () => {
      expect(workflowFiles.length).toBeGreaterThan(0);
    });

    it.each([
      'ci.yml',
      'build.yml',
      'release.yml',
      'code-analysis.yml',
      'dependency-check.yml',
      'docker-scan.yml'
    ])('should have %s workflow', (filename) => {
      expect(workflowFiles).toContain(filename);
    });
  });

  describe('Workflow content validation', () => {
    let workflows = {};

    beforeAll(async () => {
      // Load all workflows
      for (const file of workflowFiles) {
        const content = await fs.readFile(path.join(workflowsDir, file), 'utf8');
        workflows[file] = yaml.load(content);
      }
    });

    describe('Common workflow properties', () => {
      test.each(workflowFiles)('%s should have required properties', (file) => {
        const workflow = workflows[file];
        
        expect(workflow).toHaveProperty('name');
        expect(workflow.name).toBeTruthy();
        expect(workflow).toHaveProperty('on');
        expect(workflow).toHaveProperty('jobs');
        expect(Object.keys(workflow.jobs).length).toBeGreaterThan(0);
      });

      test.each(workflowFiles)('%s should have valid trigger events', (file) => {
        const workflow = workflows[file];
        const validEvents = [
          'push', 'pull_request', 'workflow_dispatch', 'schedule',
          'release', 'workflow_call', 'repository_dispatch'
        ];
        
        const events = Array.isArray(workflow.on) ? workflow.on : Object.keys(workflow.on);
        events.forEach(event => {
          expect(validEvents).toContain(event);
        });
      });
    });

    describe('CI workflow validation', () => {
      let ciWorkflow;

      beforeAll(() => {
        ciWorkflow = workflows['ci.yml'];
      });

      it('should trigger on push and pull_request', () => {
        expect(ciWorkflow.on).toHaveProperty('push');
        expect(ciWorkflow.on).toHaveProperty('pull_request');
      });

      it('should have branch filters', () => {
        expect(ciWorkflow.on.push).toHaveProperty('branches');
        expect(ciWorkflow.on.pull_request).toHaveProperty('branches');
      });

      it('should have required CI jobs', () => {
        const requiredJobs = ['lint', 'test', 'security-scan'];
        requiredJobs.forEach(job => {
          expect(ciWorkflow.jobs).toHaveProperty(job);
        });
      });

      it('should use matrix strategy for testing', () => {
        const testJob = ciWorkflow.jobs.test;
        expect(testJob).toHaveProperty('strategy');
        expect(testJob.strategy).toHaveProperty('matrix');
        expect(testJob.strategy.matrix).toHaveProperty('node-version');
        expect(testJob.strategy.matrix['node-version'].length).toBeGreaterThan(1);
      });

      it('should upload test coverage', () => {
        const testJob = ciWorkflow.jobs.test;
        const uploadStep = testJob.steps.find(step => 
          step.name && step.name.toLowerCase().includes('coverage')
        );
        expect(uploadStep).toBeDefined();
      });
    });

    describe('Build workflow validation', () => {
      let buildWorkflow;

      beforeAll(() => {
        buildWorkflow = workflows['build.yml'];
      });

      it('should have multi-platform build matrix', () => {
        const buildJob = Object.values(buildWorkflow.jobs).find(job => 
          job.strategy && job.strategy.matrix
        );
        expect(buildJob).toBeDefined();
        expect(buildJob.strategy.matrix).toHaveProperty('platform');
        expect(buildJob.strategy.matrix.platform).toContain('linux');
        expect(buildJob.strategy.matrix.platform).toContain('windows');
        expect(buildJob.strategy.matrix.platform).toContain('macos');
      });

      it('should cache dependencies', () => {
        const jobs = Object.values(buildWorkflow.jobs);
        const cacheSteps = jobs.flatMap(job => 
          job.steps.filter(step => step.uses && step.uses.includes('actions/cache'))
        );
        expect(cacheSteps.length).toBeGreaterThan(0);
      });

      it('should upload build artifacts', () => {
        const jobs = Object.values(buildWorkflow.jobs);
        const uploadSteps = jobs.flatMap(job => 
          job.steps.filter(step => step.uses && step.uses.includes('actions/upload-artifact'))
        );
        expect(uploadSteps.length).toBeGreaterThan(0);
      });
    });

    describe('Release workflow validation', () => {
      let releaseWorkflow;

      beforeAll(() => {
        releaseWorkflow = workflows['release.yml'];
      });

      it('should trigger on version tags', () => {
        expect(releaseWorkflow.on).toHaveProperty('push');
        expect(releaseWorkflow.on.push).toHaveProperty('tags');
        
        const tagPattern = releaseWorkflow.on.push.tags[0];
        expect(tagPattern).toMatch(/v\d+\.\d+\.\d+/);
      });

      it('should have release job', () => {
        expect(releaseWorkflow.jobs).toHaveProperty('release');
      });

      it('should create GitHub release', () => {
        const releaseJob = releaseWorkflow.jobs.release;
        const releaseStep = releaseJob.steps.find(step => 
          step.uses && step.uses.includes('softprops/action-gh-release')
        );
        expect(releaseStep).toBeDefined();
      });

      it('should have proper permissions', () => {
        expect(releaseWorkflow).toHaveProperty('permissions');
        expect(releaseWorkflow.permissions).toHaveProperty('contents', 'write');
      });
    });

    describe('Security workflow validation', () => {
      let codeAnalysisWorkflow;
      let dependencyCheckWorkflow;

      beforeAll(() => {
        codeAnalysisWorkflow = workflows['code-analysis.yml'];
        dependencyCheckWorkflow = workflows['dependency-check.yml'];
      });

      it('should run CodeQL analysis', () => {
        const codeqlJob = Object.values(codeAnalysisWorkflow.jobs).find(job =>
          job.steps.some(step => step.uses && step.uses.includes('github/codeql-action'))
        );
        expect(codeqlJob).toBeDefined();
      });

      it('should scan for vulnerabilities', () => {
        const scanStep = Object.values(dependencyCheckWorkflow.jobs).flatMap(job => job.steps)
          .find(step => step.name && step.name.toLowerCase().includes('vulnerability'));
        expect(scanStep).toBeDefined();
      });

      it('should upload SARIF results', () => {
        const workflows = [codeAnalysisWorkflow, dependencyCheckWorkflow];
        const sarifUploads = workflows.flatMap(w => 
          Object.values(w.jobs).flatMap(job => 
            job.steps.filter(step => 
              step.uses && step.uses.includes('github/codeql-action/upload-sarif')
            )
          )
        );
        expect(sarifUploads.length).toBeGreaterThan(0);
      });
    });

    describe('Docker workflow validation', () => {
      let dockerScanWorkflow;

      beforeAll(() => {
        dockerScanWorkflow = workflows['docker-scan.yml'];
      });

      it('should build Docker images', () => {
        const buildStep = Object.values(dockerScanWorkflow.jobs).flatMap(job => job.steps)
          .find(step => step.uses && step.uses.includes('docker/build-push-action'));
        expect(buildStep).toBeDefined();
      });

      it('should scan for vulnerabilities', () => {
        const scanTools = ['trivy', 'snyk', 'grype'];
        const scanSteps = Object.values(dockerScanWorkflow.jobs).flatMap(job => job.steps)
          .filter(step => 
            scanTools.some(tool => 
              (step.uses && step.uses.toLowerCase().includes(tool)) ||
              (step.run && step.run.toLowerCase().includes(tool))
            )
          );
        expect(scanSteps.length).toBeGreaterThan(0);
      });
    });

    describe('Job dependencies', () => {
      test.each(workflowFiles)('%s should have valid job dependencies', (file) => {
        const workflow = workflows[file];
        const jobNames = Object.keys(workflow.jobs);
        
        Object.entries(workflow.jobs).forEach(([jobName, job]) => {
          if (job.needs) {
            const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
            needs.forEach(dependency => {
              expect(jobNames).toContain(dependency);
            });
          }
        });
      });
    });

    describe('Environment and secrets usage', () => {
      test.each(workflowFiles)('%s should use secrets properly', (file) => {
        const workflow = workflows[file];
        const secretPattern = /\$\{\{\s*secrets\.[A-Z_]+\s*\}\}/g;
        
        const workflowString = JSON.stringify(workflow);
        const secrets = workflowString.match(secretPattern) || [];
        
        secrets.forEach(secret => {
          // Ensure secrets are uppercase
          const secretName = secret.match(/secrets\.([A-Z_]+)/)[1];
          expect(secretName).toMatch(/^[A-Z_]+$/);
        });
      });

      it('should use environment variables consistently', () => {
        const commonEnvVars = ['NODE_ENV', 'CI'];
        
        Object.entries(workflows).forEach(([file, workflow]) => {
          const envSteps = Object.values(workflow.jobs).flatMap(job => 
            job.steps.filter(step => step.env)
          );
          
          envSteps.forEach(step => {
            Object.keys(step.env).forEach(envVar => {
              if (commonEnvVars.includes(envVar)) {
                expect(['production', 'test', 'development', 'true']).toContain(
                  step.env[envVar].toString()
                );
              }
            });
          });
        });
      });
    });

    describe('Action versions', () => {
      test.each(workflowFiles)('%s should use pinned action versions', (file) => {
        const workflow = workflows[file];
        const steps = Object.values(workflow.jobs).flatMap(job => job.steps);
        
        steps.forEach(step => {
          if (step.uses) {
            // Check if action uses a specific version (not latest or master)
            const versionPattern = /@(v\d+|[a-f0-9]{40}|\d+\.\d+\.\d+)/;
            expect(step.uses).toMatch(versionPattern);
          }
        });
      });
    });

    describe('Concurrency control', () => {
      it('should have concurrency groups for PR workflows', () => {
        const prWorkflows = Object.entries(workflows).filter(([_, workflow]) => 
          workflow.on && workflow.on.pull_request
        );
        
        prWorkflows.forEach(([file, workflow]) => {
          if (workflow.concurrency) {
            expect(workflow.concurrency).toHaveProperty('group');
            expect(workflow.concurrency.group).toContain('${{ github.head_ref }}');
            expect(workflow.concurrency).toHaveProperty('cancel-in-progress', true);
          }
        });
      });
    });
  });

  describe('Workflow best practices', () => {
    let allWorkflows;

    beforeAll(async () => {
      allWorkflows = {};
      for (const file of workflowFiles) {
        const content = await fs.readFile(path.join(workflowsDir, file), 'utf8');
        allWorkflows[file] = content;
      }
    });

    it('should not contain hardcoded credentials', () => {
      const credentialPatterns = [
        /password\s*[:=]\s*["'][^"']+["']/i,
        /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
        /token\s*[:=]\s*["'][^"']+["']/i,
        /secret\s*[:=]\s*["'][^"']+["']/i
      ];
      
      Object.entries(allWorkflows).forEach(([file, content]) => {
        credentialPatterns.forEach(pattern => {
          expect(content).not.toMatch(pattern);
        });
      });
    });

    it('should have timeout-minutes for long-running jobs', () => {
      const longRunningKeywords = ['build', 'test', 'deploy', 'integration'];
      
      Object.entries(allWorkflows).forEach(([file, content]) => {
        const workflow = yaml.load(content);
        
        Object.entries(workflow.jobs).forEach(([jobName, job]) => {
          if (longRunningKeywords.some(keyword => jobName.toLowerCase().includes(keyword))) {
            expect(job).toHaveProperty('timeout-minutes');
            expect(job['timeout-minutes']).toBeLessThanOrEqual(60);
          }
        });
      });
    });

    it('should use checkout action with proper depth', () => {
      Object.entries(allWorkflows).forEach(([file, content]) => {
        const workflow = yaml.load(content);
        
        Object.values(workflow.jobs).forEach(job => {
          const checkoutSteps = job.steps.filter(step => 
            step.uses && step.uses.includes('actions/checkout')
          );
          
          checkoutSteps.forEach(step => {
            if (step.with && step.with['fetch-depth'] !== undefined) {
              // Either 0 for full history or 1 for shallow clone
              expect([0, 1]).toContain(step.with['fetch-depth']);
            }
          });
        });
      });
    });
  });
});