try {
  var t = localStorage.getItem('termind-theme')
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t
} catch (e) {}
