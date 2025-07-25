#!/usr/bin/env node
/**
 * Demo script to test the plugin system
 */

const { CLIPluginLoader } = require('../../../interfaces/phase5/cli-plugin.interface');
const MockSDKCore = require('../../../tests/mocks/sdk-core.mock');
const path = require('path');

async function demo() {
  console.log('=== MCP CLI Plugin System Demo ===\n');

  // Create plugin loader
  const loader = new CLIPluginLoader();
  
  // Create context
  const context = {
    config: {},
    logger: console,
    sdk: new MockSDKCore({ apiKey: 'demo-key' })
  };

  // Load Git plugin
  console.log('Loading Git plugin...');
  const gitPluginPath = path.join(__dirname, 'git-plugin/index.js');
  const gitPlugin = await loader.loadPlugin(gitPluginPath);
  await gitPlugin.initialize(context);
  
  const gitMetadata = gitPlugin.getMetadata();
  console.log(`✓ Loaded: ${gitMetadata.name} v${gitMetadata.version}`);
  console.log(`  Description: ${gitMetadata.description}`);
  console.log(`  Commands: ${gitMetadata.commands.join(', ')}\n`);

  // Load Docker plugin
  console.log('Loading Docker plugin...');
  const dockerPluginPath = path.join(__dirname, 'docker-plugin/index.js');
  const dockerPlugin = await loader.loadPlugin(dockerPluginPath);
  await dockerPlugin.initialize(context);
  
  const dockerMetadata = dockerPlugin.getMetadata();
  console.log(`✓ Loaded: ${dockerMetadata.name} v${dockerMetadata.version}`);
  console.log(`  Description: ${dockerMetadata.description}`);
  console.log(`  Commands: ${dockerMetadata.commands.join(', ')}\n`);

  // List all loaded plugins
  console.log('All loaded plugins:');
  const plugins = await loader.listPlugins();
  plugins.forEach(p => {
    console.log(`  - ${p.name} (${p.version}): ${p.description}`);
  });

  // Test plugin hooks
  console.log('\nTesting plugin hooks...');
  const beforeResult = await gitPlugin.beforeCommand('install', { options: { force: true } });
  console.log(`Git plugin beforeCommand result: proceed=${beforeResult.proceed}`);

  // Test SDK integration
  console.log('\nTesting SDK integration...');
  const services = await context.sdk.listServices({ category: 'database' });
  console.log(`Available database services: ${services.map(s => s.name).join(', ')}`);

  console.log('\n✓ Plugin system is working correctly!');
}

demo().catch(console.error);