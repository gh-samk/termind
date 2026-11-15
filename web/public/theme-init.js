/* Farbschema vor dem ersten Zeichnen setzen (kein Aufblitzen).
   Reihenfolge: eingebettet → hell (oder ?theme=light|dark); sonst gespeicherte Wahl; sonst Einstellung des Geräts. */
try {
  var root = document.documentElement
  var params = new URLSearchParams(location.search)
  if (params.get('embed') === '1') {
    var p = params.get('theme')
    root.dataset.theme = p === 'dark' ? 'dark' : 'light'
  } else {
    var t = localStorage.getItem('termind-theme')
    if (t === 'dark' || t === 'light') {
      root.dataset.theme = t
    } else if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)')
      var apply = function () { root.dataset.theme = mq.matches ? 'dark' : 'light' }
      apply()
      // Folgt dem Gerät weiter, solange niemand selbst gewählt hat
      if (mq.addEventListener) mq.addEventListener('change', function () { if (!localStorage.getItem('termind-theme')) apply() })
    }
  }
} catch (e) {}
