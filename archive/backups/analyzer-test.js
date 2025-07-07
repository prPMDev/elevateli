/**
 * Test version - minimal ElevateLI content script
 */

console.log('🔥 ElevateLI TEST script loaded!');
console.log('URL:', window.location.href);

// Simple test injection
setTimeout(() => {
  console.log('🧪 Running test injection...');
  
  const actionsArea = document.querySelector('.pvs-profile-actions--overflow, .pv-top-card-v2-ctas__custom');
  console.log('📍 Actions area found:', !!actionsArea);
  
  if (actionsArea) {
    const testBadge = document.createElement('button');
    testBadge.id = 'test-badge';
    testBadge.textContent = '🧪 TEST';
    testBadge.style.cssText = 'background: red; color: white; padding: 8px; margin: 8px; border: none; border-radius: 4px;';
    testBadge.onclick = () => alert('Test badge clicked!');
    
    actionsArea.appendChild(testBadge);
    console.log('✅ Test badge injected');
  }
}, 2000);