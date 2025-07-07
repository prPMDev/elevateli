// Debug script to check why AI overlay isn't showing
// Run this in the console on your LinkedIn profile page

console.log('=== LinkedIn Optimizer AI Overlay Debug ===');

// 1. Check if overlay exists but is hidden
const existingOverlay = document.getElementById('linkedin-optimizer-overlay');
console.log('1. Overlay exists?', !!existingOverlay);
if (existingOverlay) {
  console.log('   - Display:', existingOverlay.style.display);
  console.log('   - Visibility:', existingOverlay.style.visibility);
  console.log('   - Parent:', existingOverlay.parentElement);
}

// 2. Check target elements
const targets = [
  '.pv-open-to-carousel .artdeco-carousel__content',
  '.artdeco-carousel__content',
  '.pv-open-to-carousel',
  '.pv-top-card'
];

console.log('\n2. Target elements check:');
targets.forEach(selector => {
  const element = document.querySelector(selector);
  console.log(`   ${selector}:`, !!element);
});

// 3. Check storage for last analysis
chrome.storage.local.get(['lastAnalysis', 'overlayCollapsed'], (data) => {
  console.log('\n3. Storage data:');
  console.log('   - Last analysis:', data.lastAnalysis);
  console.log('   - Overlay collapsed:', data.overlayCollapsed);
  console.log('   - Is personal?', data.lastAnalysis?.isPersonal);
  console.log('   - Has summary?', !!data.lastAnalysis?.summary);
});

// 4. Try to manually inject overlay
console.log('\n4. Attempting manual injection...');
const testOverlay = () => {
  const targetElement = document.querySelector('.pv-top-card') || 
                       document.querySelector('.pv-top-card-v2-section') ||
                       document.querySelector('main section:first-child');
  
  if (!targetElement) {
    console.log('   ERROR: No target element found!');
    return;
  }
  
  console.log('   Target found:', targetElement.className);
  
  // Create minimal test overlay
  const overlay = document.createElement('div');
  overlay.id = 'test-linkedin-optimizer-overlay';
  overlay.style.cssText = `
    margin: 16px;
    padding: 16px;
    background: #f0f0f0;
    border: 2px solid red;
    position: relative;
    z-index: 9999;
  `;
  overlay.innerHTML = '<h3>TEST: LinkedIn Optimizer Overlay Should Be Here</h3>';
  
  targetElement.insertAdjacentElement('afterend', overlay);
  console.log('   Test overlay injected!');
};

testOverlay();

// 5. Check if waitForElement is timing out
console.log('\n5. Checking carousel element availability...');
setTimeout(() => {
  const carousel = document.querySelector('.pv-open-to-carousel .artdeco-carousel__content');
  console.log('   Carousel found after delay?', !!carousel);
}, 2000);