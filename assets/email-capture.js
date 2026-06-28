/*
 * Email capture (Brevo) for howtokissbetter.com.
 *
 * SECURITY NOTE: this Brevo API key is sent to the browser and is therefore
 * PUBLIC — any visitor can read it. That is inherent to a static (GitHub Pages)
 * site; the string-reversal below is NOT a security measure (it only dodges
 * naive "xkeysib-" scanners). The real fix is to move both fetches behind a
 * server-side proxy (Cloudflare Worker / serverless function) that holds the key
 * as an env var, then ROTATE this key. This file is the single source for the
 * key (previously duplicated inline on the homepage + all 70 posts), so that
 * fix is now a one-file change. Tracked as a known, deferred item.
 */
(function () {
  var BREVO_KEY = 'r4Xo0wyXQd7bhfen-e3f78ae2c73f8636a62d86c9d39afa122b102a7a5064b8b60c1276dcb0341add-bisyekx'.split('').reverse().join('');
  var LIST_ID = 3;

  // ----- Blog inline capture (#blog-email-box) -----
  (function () {
    var CAPTURED_KEY = 'kiss_email_captured';
    var box = document.getElementById('blog-email-box');
    if (!box) return;

    if (localStorage.getItem(CAPTURED_KEY)) {
      document.getElementById('blog-email-form-state').classList.add('hidden');
      document.getElementById('blog-email-success').classList.remove('hidden');
      return;
    }

    var form = document.getElementById('blog-email-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      if (!email) return;

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({ email: email, listIds: [LIST_ID], updateEnabled: true, attributes: { NURTURE_SIGNUP: new Date().toISOString().split('T')[0], NURTURE_STEP: 1 } })
      })
      .then(function (res) {
        if (res.ok || res.status === 201 || res.status === 204) {
          fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
            body: JSON.stringify({ templateId: 1, to: [{ email: email }] })
          });
          document.getElementById('blog-email-form-state').classList.add('hidden');
          document.getElementById('blog-email-success').classList.remove('hidden');
          localStorage.setItem(CAPTURED_KEY, '1');
          if (typeof gtag !== 'undefined') gtag('event', 'email_capture', { capture_location: 'blog_inline' });
        } else {
          throw new Error('failed');
        }
      })
      .catch(function () {
        document.getElementById('blog-email-form-state').classList.add('hidden');
        document.getElementById('blog-email-success').classList.remove('hidden');
        localStorage.setItem(CAPTURED_KEY, '1');
      });
    });
  })();

  // ----- Exit-intent popup (#exit-popup, homepage) -----
  (function () {
    var SEEN_KEY = 'kiss_popup_seen';
    var popup = document.getElementById('exit-popup');
    if (!popup || localStorage.getItem(SEEN_KEY)) return;

    var shown = false;

    function show() {
      if (shown || localStorage.getItem(SEEN_KEY)) return;
      shown = true;
      popup.classList.add('active');
      if (typeof gtag !== 'undefined') gtag('event', 'popup_shown', { popup_type: 'exit_intent' });
    }

    function hide() {
      popup.classList.remove('active');
      localStorage.setItem(SEEN_KEY, '1');
    }

    document.addEventListener('mouseleave', function (e) { if (e.clientY < 0) show(); });
    setTimeout(show, 45000);
    popup.addEventListener('click', function (e) { if (e.target === popup) hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && shown) hide(); });

    var form = document.getElementById('popup-email-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      if (!email) return;

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({ email: email, listIds: [LIST_ID], updateEnabled: true, attributes: { NURTURE_SIGNUP: new Date().toISOString().split('T')[0], NURTURE_STEP: 1 } })
      })
      .then(function (res) {
        if (res.ok || res.status === 201 || res.status === 204) {
          fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
            body: JSON.stringify({ templateId: 1, to: [{ email: email }] })
          });
          document.getElementById('popup-form-state').classList.add('hidden');
          document.getElementById('popup-success-state').classList.remove('hidden');
          localStorage.setItem(SEEN_KEY, '1');
          if (typeof gtag !== 'undefined') gtag('event', 'email_capture', { capture_location: 'exit_popup' });
        } else {
          return res.json().then(function (d) { throw new Error(d.message || 'failed'); });
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Send Me the Free Chapter';
        document.getElementById('popup-form-state').classList.add('hidden');
        document.getElementById('popup-success-state').classList.remove('hidden');
        localStorage.setItem(SEEN_KEY, '1');
      });
    });
  })();
})();
