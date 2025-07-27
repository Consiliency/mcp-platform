// Check CSS variables and toggle visibility

console.log('=== CSS Diagnostics ===');

// Check if CSS variables are defined
const styles = getComputedStyle(document.documentElement);
console.log('1. CSS Variables:');
console.log('   --primary:', styles.getPropertyValue('--primary'));
console.log('   --gray-400:', styles.getPropertyValue('--gray-400'));
console.log('   --gray-600:', styles.getPropertyValue('--gray-600'));
console.log('   --warning:', styles.getPropertyValue('--warning'));

// Check toggle container visibility
const toggleContainers = document.querySelectorAll('.toggle-container');
console.log('\n2. Toggle containers found:', toggleContainers.length);

toggleContainers.forEach((container, index) => {
  const rect = container.getBoundingClientRect();
  const computed = getComputedStyle(container);
  console.log(`\n   Toggle ${index + 1}:`);
  console.log('   - Display:', computed.display);
  console.log('   - Visibility:', computed.visibility);
  console.log('   - Opacity:', computed.opacity);
  console.log('   - Position:', rect.top, rect.left, rect.width, rect.height);
  console.log('   - Is visible:', rect.width > 0 && rect.height > 0);
});

// Check toggle slider visibility
const toggleSliders = document.querySelectorAll('.toggle-slider');
console.log('\n3. Toggle sliders found:', toggleSliders.length);

if (toggleSliders.length > 0) {
  const slider = toggleSliders[0];
  const computed = getComputedStyle(slider);
  console.log('   First slider styles:');
  console.log('   - Background:', computed.background);
  console.log('   - Width:', computed.width);
  console.log('   - Height:', computed.height);
  console.log('   - Display:', computed.display);
}

// Try to fix CSS variables if missing
if (!styles.getPropertyValue('--primary')) {
  console.log('\n4. CSS variables missing! Adding fallback styles...');
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --primary: #3498db;
      --gray-400: #ccc;
      --gray-600: #666;
      --warning: #f39c12;
    }
  `;
  document.head.appendChild(style);
  console.log('   Added fallback CSS variables');
}