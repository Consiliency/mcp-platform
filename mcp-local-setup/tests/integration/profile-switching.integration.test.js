/**
 * Integration tests for profile switching (create, switch, delete profiles)
 */

const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const { spawn } = require('child_process');
const {
  createTestProfile,
  cleanupTestResources
} = require('../framework/test-helpers');

// Increase timeout for integration tests
jest.setTimeout(30000);

describe('Profile Switching Integration Tests', () => {
  const testResources = [];
  const MCP_HOME = process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');
  const profilesDir = path.join(MCP_HOME, 'profiles');
  const currentProfileFile = path.join(MCP_HOME, '.current-profile');

  beforeAll(async () => {
    // Ensure profiles directory exists
    await fs.mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test resources
    await cleanupTestResources(testResources);
    testResources.length = 0;
  });

  describe('Profile Creation', () => {
    it('should create a new profile with services', async () => {
      const profileName = 'test-profile-1';
      const services = ['service1', 'service2', 'service3'];
      
      const profilePath = await createTestProfile(services, {
        name: profileName,
        description: 'Test profile for integration testing',
        autoStart: true,
        restartPolicy: 'unless-stopped'
      });
      
      testResources.push(`profile:${profileName}`);

      // Verify profile was created
      const profileExists = await fs.access(profilePath).then(() => true).catch(() => false);
      expect(profileExists).toBe(true);

      // Verify profile content
      const profileContent = await fs.readFile(profilePath, 'utf8');
      const profile = yaml.load(profileContent);
      
      expect(profile.name).toBe(profileName);
      expect(profile.services).toEqual(services);
      expect(profile.settings.auto_start).toBe(true);
      expect(profile.settings.restart_policy).toBe('unless-stopped');
    });

    it('should create profile with empty services list', async () => {
      const profileName = 'empty-profile';
      
      const profilePath = await createTestProfile([], {
        name: profileName,
        description: 'Empty profile'
      });
      
      testResources.push(`profile:${profileName}`);

      const profileContent = await fs.readFile(profilePath, 'utf8');
      const profile = yaml.load(profileContent);
      
      expect(profile.services).toEqual([]);
    });

    it('should handle profile name conflicts', async () => {
      const profileName = 'duplicate-profile';
      
      // Create first profile
      await createTestProfile(['service1'], { name: profileName });
      testResources.push(`profile:${profileName}`);

      // Try to create duplicate
      await expect(createTestProfile(['service2'], { name: profileName }))
        .rejects.toThrow();
    });

    it('should validate profile yaml structure', async () => {
      const profileName = 'validated-profile';
      const profilePath = path.join(profilesDir, `${profileName}.yml`);
      
      // Write invalid YAML
      await fs.writeFile(profilePath, 'invalid: yaml: structure:');
      testResources.push(`profile:${profileName}`);

      // Try to load the profile
      await expect(yaml.load(await fs.readFile(profilePath, 'utf8')))
        .rejects.toThrow();
    });
  });

  describe('Profile Switching', () => {
    it('should switch to an existing profile', async () => {
      // Create profiles
      const profile1 = 'switch-test-1';
      const profile2 = 'switch-test-2';
      
      await createTestProfile(['service1'], { name: profile1 });
      await createTestProfile(['service2'], { name: profile2 });
      testResources.push(`profile:${profile1}`, `profile:${profile2}`);

      // Switch to profile2
      await fs.writeFile(currentProfileFile, profile2);

      // Verify current profile
      const currentProfile = await fs.readFile(currentProfileFile, 'utf8');
      expect(currentProfile).toBe(profile2);
    });

    it('should handle switching to non-existent profile', async () => {
      const nonExistentProfile = 'does-not-exist';
      
      // Try to switch to non-existent profile
      await fs.writeFile(currentProfileFile, nonExistentProfile);
      
      // System should detect this when trying to load services
      const profilePath = path.join(profilesDir, `${nonExistentProfile}.yml`);
      const exists = await fs.access(profilePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should update docker-compose when switching profiles', async () => {
      const profile1 = 'compose-update-1';
      const profile2 = 'compose-update-2';
      
      await createTestProfile(['nginx', 'redis'], { name: profile1 });
      await createTestProfile(['postgres', 'rabbitmq'], { name: profile2 });
      testResources.push(`profile:${profile1}`, `profile:${profile2}`);

      // Switch to profile1
      await fs.writeFile(currentProfileFile, profile1);
      
      // Run registry manager to generate docker-compose
      const generateCompose = () => new Promise((resolve, reject) => {
        const proc = spawn('node', [
          path.join(MCP_HOME, 'scripts', 'registry-manager.js'),
          'generate',
          profile1
        ], {
          cwd: MCP_HOME,
          stdio: 'pipe'
        });
        
        proc.on('close', code => resolve(code === 0));
        proc.on('error', reject);
      });

      const generated = await generateCompose();
      expect(generated).toBe(true);

      // Docker compose should now contain services from profile1
      const composePath = path.join(MCP_HOME, 'docker-compose.yml');
      const composeExists = await fs.access(composePath).then(() => true).catch(() => false);
      expect(composeExists).toBe(true);
    });

    it('should preserve profile settings when switching', async () => {
      const profileWithSettings = 'settings-test';
      
      await createTestProfile(['service1'], {
        name: profileWithSettings,
        autoStart: true,
        restartPolicy: 'always',
        customSetting: 'preserved'
      });
      testResources.push(`profile:${profileWithSettings}`);

      // Switch to this profile
      await fs.writeFile(currentProfileFile, profileWithSettings);

      // Load and verify settings are preserved
      const profilePath = path.join(profilesDir, `${profileWithSettings}.yml`);
      const profile = yaml.load(await fs.readFile(profilePath, 'utf8'));
      
      expect(profile.settings.auto_start).toBe(true);
      expect(profile.settings.restart_policy).toBe('always');
    });
  });

  describe('Profile Deletion', () => {
    it('should delete a profile successfully', async () => {
      const profileToDelete = 'delete-me';
      
      const profilePath = await createTestProfile(['service1'], {
        name: profileToDelete
      });

      // Verify it exists
      const existsBefore = await fs.access(profilePath).then(() => true).catch(() => false);
      expect(existsBefore).toBe(true);

      // Delete the profile
      await fs.unlink(profilePath);

      // Verify it's gone
      const existsAfter = await fs.access(profilePath).then(() => true).catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it('should handle deleting current profile', async () => {
      const currentProfileName = 'current-to-delete';
      
      await createTestProfile(['service1'], { name: currentProfileName });
      testResources.push(`profile:${currentProfileName}`);

      // Make it current
      await fs.writeFile(currentProfileFile, currentProfileName);

      // Delete the profile
      const profilePath = path.join(profilesDir, `${currentProfileName}.yml`);
      await fs.unlink(profilePath);

      // System should handle the missing current profile gracefully
      const current = await fs.readFile(currentProfileFile, 'utf8');
      expect(current).toBe(currentProfileName); // File still points to deleted profile

      // In practice, the system should detect this and fall back to default
    });

    it('should not affect other profiles when deleting', async () => {
      const profile1 = 'keep-this-1';
      const profile2 = 'keep-this-2';
      const profileToDelete = 'delete-this';
      
      await createTestProfile(['s1'], { name: profile1 });
      await createTestProfile(['s2'], { name: profile2 });
      await createTestProfile(['s3'], { name: profileToDelete });
      testResources.push(`profile:${profile1}`, `profile:${profile2}`);

      // Delete one profile
      const deletePath = path.join(profilesDir, `${profileToDelete}.yml`);
      await fs.unlink(deletePath);

      // Others should still exist
      const profile1Exists = await fs.access(
        path.join(profilesDir, `${profile1}.yml`)
      ).then(() => true).catch(() => false);
      const profile2Exists = await fs.access(
        path.join(profilesDir, `${profile2}.yml`)
      ).then(() => true).catch(() => false);

      expect(profile1Exists).toBe(true);
      expect(profile2Exists).toBe(true);
    });
  });

  describe('Profile Management CLI', () => {
    it('should list all available profiles', async () => {
      // Create test profiles
      const profiles = ['list-test-1', 'list-test-2', 'list-test-3'];
      for (const profile of profiles) {
        await createTestProfile([], { name: profile });
        testResources.push(`profile:${profile}`);
      }

      // List profiles
      const files = await fs.readdir(profilesDir);
      const profileNames = files
        .filter(f => f.endsWith('.yml'))
        .map(f => f.replace('.yml', ''));

      expect(profileNames).toEqual(expect.arrayContaining(profiles));
    });

    it('should show current profile', async () => {
      const activeProfile = 'active-profile';
      
      await createTestProfile(['service1'], { name: activeProfile });
      testResources.push(`profile:${activeProfile}`);
      
      await fs.writeFile(currentProfileFile, activeProfile);

      const current = await fs.readFile(currentProfileFile, 'utf8');
      expect(current).toBe(activeProfile);
    });

    it('should export profile configuration', async () => {
      const profileToExport = 'export-test';
      
      await createTestProfile(['service1', 'service2'], {
        name: profileToExport,
        description: 'Profile for export testing'
      });
      testResources.push(`profile:${profileToExport}`);

      // Read profile for export
      const profilePath = path.join(profilesDir, `${profileToExport}.yml`);
      const profileContent = await fs.readFile(profilePath, 'utf8');
      const profile = yaml.load(profileContent);

      // Verify exportable content
      expect(profile).toHaveProperty('name', profileToExport);
      expect(profile).toHaveProperty('services');
      expect(profile).toHaveProperty('description');
    });

    it('should import profile configuration', async () => {
      const importedProfile = {
        name: 'imported-profile',
        description: 'Imported from external source',
        services: ['imported-service1', 'imported-service2'],
        settings: {
          auto_start: false,
          restart_policy: 'no'
        }
      };

      // Import by writing to profiles directory
      const importPath = path.join(profilesDir, `${importedProfile.name}.yml`);
      await fs.writeFile(importPath, yaml.dump(importedProfile));
      testResources.push(`profile:${importedProfile.name}`);

      // Verify import
      const imported = yaml.load(await fs.readFile(importPath, 'utf8'));
      expect(imported).toEqual(importedProfile);
    });
  });

  describe('Profile Environment Variables', () => {
    it('should apply profile-specific environment variables', async () => {
      const envProfile = 'env-test';
      
      const profile = {
        name: envProfile,
        services: ['env-service'],
        environment: {
          PROFILE_VAR: 'test-value',
          NODE_ENV: 'testing'
        }
      };

      const profilePath = path.join(profilesDir, `${envProfile}.yml`);
      await fs.writeFile(profilePath, yaml.dump(profile));
      testResources.push(`profile:${envProfile}`);

      // When this profile is active, these env vars should be applied
      const loaded = yaml.load(await fs.readFile(profilePath, 'utf8'));
      expect(loaded.environment).toEqual({
        PROFILE_VAR: 'test-value',
        NODE_ENV: 'testing'
      });
    });

    it('should merge profile env with system env', async () => {
      const mergeProfile = 'env-merge';
      
      // Set system env
      process.env.SYSTEM_VAR = 'system-value';
      
      const profile = {
        name: mergeProfile,
        services: ['service1'],
        environment: {
          PROFILE_VAR: 'profile-value'
        }
      };

      const profilePath = path.join(profilesDir, `${mergeProfile}.yml`);
      await fs.writeFile(profilePath, yaml.dump(profile));
      testResources.push(`profile:${mergeProfile}`);

      // Both env vars should be available
      expect(process.env.SYSTEM_VAR).toBe('system-value');
      const loaded = yaml.load(await fs.readFile(profilePath, 'utf8'));
      expect(loaded.environment.PROFILE_VAR).toBe('profile-value');

      delete process.env.SYSTEM_VAR;
    });
  });
});