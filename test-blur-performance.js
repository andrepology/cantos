console.log('Testing blur performance...');

// Test backdrop-filter performance
const testDiv = document.createElement('div');
testDiv.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  backdrop-filter: blur(10px);
  background: rgba(255,255,255,0.36);
  z-index: 9999;
`;

const startTime = performance.now();
document.body.appendChild(testDiv);

requestAnimationFrame(() => {
  const renderTime = performance.now() - startTime;
  console.log(`Backdrop-filter blur(10px) render time: ${renderTime.toFixed(2)}ms`);
  
  // Test opacity animation
  testDiv.style.transition = 'opacity 380ms ease';
  testDiv.style.opacity = '0';
  
  setTimeout(() => {
    document.body.removeChild(testDiv);
    console.log('Blur performance test complete');
  }, 400);
});
