// pannes simulées : window.__fail = 'all' ou ['getRealtime', ...]
(function(){
  const desc = Object.getOwnPropertyDescriptor(window.google.script, 'run');
  const base = desc.get;
  function wrap(ok, ko){ return new Proxy({}, { get(_, k){
    if (k === 'withSuccessHandler') return f => wrap(f, ko);
    if (k === 'withFailureHandler') return f => wrap(ok, f);
    return (...a) => {
      const f = window.__fail;
      if (f === 'all' || (Array.isArray(f) && f.includes(k))){ setTimeout(() => ko && ko(new Error('Failed to fetch')), 30); return; }
      let x = base(); if (ok) x = x.withSuccessHandler(ok); if (ko) x = x.withFailureHandler(ko); x[k](...a);
    };
  }}); }
  Object.defineProperty(window.google.script, 'run', { get(){ return wrap(); }, configurable:true });
})();
