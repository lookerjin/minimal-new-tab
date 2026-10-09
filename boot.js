'use strict';
// Prevent a wrong-color flash before the asynchronous sync settings load.
try {
  const mode = localStorage.getItem('lastMode') || 'auto';
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = mode === 'black' || (mode !== 'white' && mode !== 'auto' && dark) || (mode === 'auto' && dark) ? 'dark' : 'light';
  document.documentElement.dataset.mode = mode;
} catch (_) { document.documentElement.dataset.theme = 'light'; }
