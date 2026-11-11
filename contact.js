// Where people can reach the operator. Put the Google Form link here once it exists;
// every legal page and the app's settings read it from this one place.
var MEEMORY_CONTACT_URL = '';
(function () {
  var el = document.getElementById('contact');
  if (!el || !MEEMORY_CONTACT_URL) return;
  var a = document.createElement('a');
  a.href = MEEMORY_CONTACT_URL; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = 'お問い合わせフォーム';
  el.replaceWith(a);
})();
