// ============================================================================
// 54-footer-mobile-lift.js
// Original app.js lines 10594-10612 (19 lines)
// ============================================================================


// Lift the footer above the mobile dock on phones/tablets
(function(){
  try{
    const dock = document.querySelector('.ra-mobile-dock');
    const root = document.documentElement;

    function setOffset(){
      const h = dock ? (dock.offsetHeight || 0) : 0;
      root.style.setProperty('--dock-offset', (h ? h + 8 : 0) + 'px'); // +8px breathing room
    }

    if (dock){
      setOffset();
      window.addEventListener('resize', setOffset);
      new ResizeObserver(setOffset).observe(dock);
    }
  }catch(_){}
})();