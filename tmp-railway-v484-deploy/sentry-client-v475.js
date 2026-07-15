(function () {
  if (window.__froxySentryClientV475) return;
  window.__froxySentryClientV475 = true;

  var DSN = window.FROXY_SENTRY_DSN || 'https://c2174a1e94bd82e312f471a127fe41ab@o4511598450638848.ingest.de.sentry.io/4511598996684880';
  var isProd = /^https:\/\/(www\.)?froxyai\.com$/i.test(location.origin || '');
  var debugEnabled = false;
  try { debugEnabled = localStorage.getItem('froxy_sentry_debug') === '1'; } catch (e) {}
  if (!DSN || (!isProd && !debugEnabled)) return;

  var RELEASE = window.FROXY_RELEASE || 'v479';
  var SECRET_RE = /(sk-[a-z0-9_-]{10,}|sk_[a-z0-9_-]{10,}|pk_[a-z0-9_-]{10,}|xkeysib-[a-z0-9_-]{10,}|gsk_[a-z0-9_-]{10,}|Bearer\s+[a-z0-9._-]{10,}|token["'=:\s]+[a-z0-9._-]{10,}|password["'=:\s]+[^&\s]+)/ig;
  var SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|x-api-key|api[_-]?key|token|password|prompt|message|messages|content|body|input|email|username|name)$/i;

  function scrubString(value) {
    return String(value == null ? '' : value)
      .replace(SECRET_RE, '[redacted]')
      .replace(/([?&](?:token|key|api_key|password|email|prompt|message|q|query)=)[^&]+/ig, '$1[redacted]');
  }

  function scrubObject(value, depth) {
    if (!value || depth > 5) return value;
    if (typeof value === 'string') return scrubString(value);
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(function (item) { return scrubObject(item, depth + 1); });
    var out = {};
    Object.keys(value).slice(0, 80).forEach(function (key) {
      if (SENSITIVE_KEYS.test(key)) out[key] = '[redacted]';
      else out[key] = scrubObject(value[key], depth + 1);
    });
    return out;
  }

  function stripUrl(url) {
    try {
      var u = new URL(url, location.origin);
      ['token', 'key', 'api_key', 'password', 'email', 'prompt', 'message', 'q', 'query'].forEach(function (k) {
        if (u.searchParams.has(k)) u.searchParams.set(k, '[redacted]');
      });
      return u.pathname + (u.search ? u.search : '');
    } catch (e) {
      return scrubString(url || '');
    }
  }

  window.Sentry = window.Sentry || {};
  window.Sentry.onLoad = function () {
    if (!window.Sentry || typeof window.Sentry.init !== 'function') return;
    var integrations = [];
    try {
      if (typeof window.Sentry.browserTracingIntegration === 'function') integrations.push(window.Sentry.browserTracingIntegration());
      if (typeof window.Sentry.replayIntegration === 'function') {
        integrations.push(window.Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
          maskAllInputs: true
        }));
      }
    } catch (e) {}

    window.Sentry.init({
      dsn: DSN,
      environment: isProd ? 'production' : 'local',
      release: RELEASE,
      sendDefaultPii: false,
      integrations: integrations,
      tracesSampleRate: 0.05,
      replaysSessionSampleRate: 0.01,
      replaysOnErrorSampleRate: 1.0,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error promise rejection captured',
        'Script error.'
      ],
      denyUrls: [/extensions\//i, /^chrome-extension:/i, /^moz-extension:/i],
      beforeBreadcrumb: function (breadcrumb) {
        if (!breadcrumb) return breadcrumb;
        if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message).slice(0, 240);
        if (breadcrumb.data) {
          breadcrumb.data = scrubObject(breadcrumb.data, 0);
          if (breadcrumb.data.url) breadcrumb.data.url = stripUrl(breadcrumb.data.url);
        }
        return breadcrumb;
      },
      beforeSend: function (event) {
        if (!event) return event;
        if (event.user) event.user = { id: event.user.id ? String(event.user.id).slice(0, 64) : undefined };
        if (event.request) {
          event.request.url = stripUrl(event.request.url || '');
          delete event.request.cookies;
          delete event.request.data;
          if (event.request.headers) event.request.headers = scrubObject(event.request.headers, 0);
        }
        if (event.extra) event.extra = scrubObject(event.extra, 0);
        if (event.contexts) event.contexts = scrubObject(event.contexts, 0);
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(function (b) {
            if (b.message) b.message = scrubString(b.message).slice(0, 240);
            if (b.data) b.data = scrubObject(b.data, 0);
            return b;
          });
        }
        return event;
      }
    });
  };

  var script = document.createElement('script');
  script.src = 'https://js-de.sentry-cdn.com/c2174a1e94bd82e312f471a127fe41ab.min.js';
  script.crossOrigin = 'anonymous';
  script.async = true;
  document.head.appendChild(script);
})();
