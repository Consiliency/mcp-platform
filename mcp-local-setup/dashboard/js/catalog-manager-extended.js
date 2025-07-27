/**
 * Extended methods for CatalogManager to support multiple package managers
 * This file extends the base catalog-manager.js with additional package manager support
 */

// Add these methods to the CatalogManager prototype

/**
 * Add server from PyPI
 */
CatalogManager.prototype.addFromPip = async function(pipPackage) {
  if (!pipPackage) {
    this.showAlert('Please enter a PyPI package name', 'error');
    return;
  }
  
  this.showAlert('Adding server from PyPI...', 'info');
  
  try {
    const response = await fetch(`${this.apiBase}/add-pip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pipPackage })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add server: ${response.statusText}`);
    }
    
    const result = await response.json();
    this.showAlert(`Successfully added ${result.name}`, 'success');
    await this.loadCatalogServers();
  } catch (error) {
    this.showAlert('Failed to add server: ' + error.message, 'error');
  }
};

/**
 * Add server from Cargo
 */
CatalogManager.prototype.addFromCargo = async function(crateName) {
  if (!crateName) {
    this.showAlert('Please enter a Cargo crate name', 'error');
    return;
  }
  
  this.showAlert('Adding server from crates.io...', 'info');
  
  try {
    const response = await fetch(`${this.apiBase}/add-cargo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crate: crateName })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add server: ${response.statusText}`);
    }
    
    const result = await response.json();
    this.showAlert(`Successfully added ${result.name}`, 'success');
    await this.loadCatalogServers();
  } catch (error) {
    this.showAlert('Failed to add server: ' + error.message, 'error');
  }
};

/**
 * Add server from Go
 */
CatalogManager.prototype.addFromGo = async function(modulePath) {
  if (!modulePath) {
    this.showAlert('Please enter a Go module path', 'error');
    return;
  }
  
  this.showAlert('Adding server from Go module...', 'info');
  
  try {
    const response = await fetch(`${this.apiBase}/add-go`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: modulePath })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add server: ${response.statusText}`);
    }
    
    const result = await response.json();
    this.showAlert(`Successfully added ${result.name}`, 'success');
    await this.loadCatalogServers();
  } catch (error) {
    this.showAlert('Failed to add server: ' + error.message, 'error');
  }
};

/**
 * Add server from Ruby Gem
 */
CatalogManager.prototype.addFromGem = async function(gemName) {
  if (!gemName) {
    this.showAlert('Please enter a Ruby gem name', 'error');
    return;
  }
  
  this.showAlert('Adding server from RubyGems...', 'info');
  
  try {
    const response = await fetch(`${this.apiBase}/add-gem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gem: gemName })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add server: ${response.statusText}`);
    }
    
    const result = await response.json();
    this.showAlert(`Successfully added ${result.name}`, 'success');
    await this.loadCatalogServers();
  } catch (error) {
    this.showAlert('Failed to add server: ' + error.message, 'error');
  }
};

/**
 * Add server from Composer
 */
CatalogManager.prototype.addFromComposer = async function(packageName) {
  if (!packageName) {
    this.showAlert('Please enter a Composer package name', 'error');
    return;
  }
  
  this.showAlert('Adding server from Packagist...', 'info');
  
  try {
    const response = await fetch(`${this.apiBase}/add-composer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: packageName })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add server: ${response.statusText}`);
    }
    
    const result = await response.json();
    this.showAlert(`Successfully added ${result.name}`, 'success');
    await this.loadCatalogServers();
  } catch (error) {
    this.showAlert('Failed to add server: ' + error.message, 'error');
  }
};

// Override existing methods to support parameter passing
const originalAddFromGitHub = CatalogManager.prototype.addFromGitHub;
CatalogManager.prototype.addFromGitHub = async function(githubUrl) {
  if (!githubUrl) {
    githubUrl = document.getElementById('github-url')?.value.trim();
  }
  
  if (!githubUrl) {
    this.showAlert('Please enter a GitHub URL', 'error');
    return;
  }
  
  // Store the URL in the input field temporarily if it exists
  const githubInput = document.getElementById('github-url');
  if (githubInput) {
    const originalValue = githubInput.value;
    githubInput.value = githubUrl;
    await originalAddFromGitHub.call(this);
    // Restore if it was passed as parameter
    if (githubUrl !== originalValue) {
      githubInput.value = originalValue;
    }
  } else {
    await originalAddFromGitHub.call(this);
  }
};

const originalAddFromNpm = CatalogManager.prototype.addFromNpm;
CatalogManager.prototype.addFromNpm = async function(npmPackage) {
  if (!npmPackage) {
    npmPackage = document.getElementById('npm-package')?.value.trim();
  }
  
  if (!npmPackage) {
    this.showAlert('Please enter an NPM package name', 'error');
    return;
  }
  
  // Store the package in the input field temporarily if it exists
  const npmInput = document.getElementById('npm-package');
  if (npmInput) {
    const originalValue = npmInput.value;
    npmInput.value = npmPackage;
    await originalAddFromNpm.call(this);
    // Restore if it was passed as parameter
    if (npmPackage !== originalValue) {
      npmInput.value = originalValue;
    }
  } else {
    await originalAddFromNpm.call(this);
  }
};