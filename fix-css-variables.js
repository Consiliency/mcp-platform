// Fix for missing CSS variables
console.log('Adding CSS variables to fix toggle visibility...');

const style = document.createElement('style');
style.textContent = `
  :root {
    --primary: #3498db;
    --primary-dark: #2980b9;
    --secondary: #2ecc71;
    --danger: #e74c3c;
    --warning: #f39c12;
    --info: #3498db;
    --gray-100: #f8f9fa;
    --gray-200: #e9ecef;
    --gray-300: #dee2e6;
    --gray-400: #ced4da;
    --gray-500: #adb5bd;
    --gray-600: #6c757d;
    --gray-700: #495057;
    --gray-800: #343a40;
    --gray-900: #212529;
  }
  
  /* Ensure toggle sliders are visible */
  .toggle-slider {
    background-color: #ccc !important;
  }
  
  .auto-start-toggle:checked + .toggle-slider {
    background-color: #3498db !important;
  }
  
  /* Fix any other missing styles */
  .status-indicator {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 5px;
  }
  
  .status-indicator.status-running {
    background-color: #2ecc71;
  }
  
  .status-indicator.status-stopped {
    background-color: #e74c3c;
  }
`;

document.head.appendChild(style);

console.log('CSS variables added! The toggles should now be visible.');
console.log('Refresh the styles by checking a toggle element:');

// Force a style recalculation
const toggles = document.querySelectorAll('.toggle-slider');
toggles.forEach((toggle, i) => {
  const bg = getComputedStyle(toggle).backgroundColor;
  console.log(`Toggle ${i + 1} background:`, bg);
});

// Show the current state
console.log('\nCurrent auto-start states:');
document.querySelectorAll('.auto-start-toggle').forEach(toggle => {
  console.log(`- ${toggle.dataset.serverId}: ${toggle.checked ? 'ON ⭐' : 'OFF'}`);
});