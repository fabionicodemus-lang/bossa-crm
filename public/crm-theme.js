try { document.documentElement.dataset.theme = localStorage.getItem('bossa:theme') === 'dark' ? 'dark' : 'light'; } catch {}
