// MMC Lab: passcode-gated Claude chat for modeling teams, plus a monitor view.
// Talks to the lab API (see config.js) directly, or through a relay when the network blocks the API's domain.
(function () {
  'use strict';

  var cfg = window.MMC_LAB || {};
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var params = new URLSearchParams(location.search);
  // Overrides only on localhost, so nobody can send students a link that points the page at another server.
  var API = (isLocal && params.get('api')) || cfg.api || '';
  var RELAY = (isLocal && params.has('relay') ? params.get('relay') : cfg.relay) || '';
  // Relays have request quotas, so idle polling is gentle; it speeds up while Claude is answering.
  var IDLE_MS = cfg.idleMs || 15000;
  var BUSY_MS = cfg.busyMs || 3000;
  var MONITOR_MS = cfg.monitorMs || 8000;

  var root = document.getElementById('lab-main');
  var brandTeam = document.getElementById('lab-brand-team');
  var signOutBtn = document.getElementById('lab-signout');
  var routeLabel = document.getElementById('lab-route');

  /* ---------------------------------------------------------------- utils */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }
  function fmtTime(at) {
    return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function plural(n, w) {
    return n + ' ' + w + (n === 1 ? '' : 's');
  }
  function store(kind) {
    return {
      get: function (k) {
        try {
          return window[kind].getItem(k);
        } catch (e) {
          return null;
        }
      },
      set: function (k, v) {
        try {
          if (v === null) window[kind].removeItem(k);
          else window[kind].setItem(k, v);
        } catch (e) {
          /* private mode */
        }
      },
    };
  }
  var session = store('sessionStorage');
  var local = store('localStorage');

  /* ------------------------------------------------------------- markdown */

  var texCache = {};
  function tex(src, display) {
    var key = (display ? 'D' : 'I') + src;
    if (texCache[key]) return texCache[key];
    var html;
    try {
      html = katex.renderToString(src, { throwOnError: false, displayMode: display, strict: 'ignore', trust: false, output: 'htmlAndMathml' });
    } catch (e) {
      html = '<code>' + esc(src) + '</code>';
    }
    texCache[key] = html;
    return html;
  }

  // Math is pulled out before markdown parsing (so `_` and `*` inside TeX survive),
  // the markdown is sanitized, then KaTeX output is swapped back in.
  function md(text) {
    var stash = [];
    function keep(src, display) {
      stash.push(tex(src.trim(), display));
      return 'MATHTOKEN' + (stash.length - 1) + 'END';
    }
    var src = String(text)
      .replace(/\$\$([\s\S]+?)\$\$/g, function (_m, t) {
        return keep(t, true);
      })
      .replace(/\\\[([\s\S]+?)\\\]/g, function (_m, t) {
        return keep(t, true);
      })
      .replace(/\\\(([\s\S]+?)\\\)/g, function (_m, t) {
        return keep(t, false);
      })
      .replace(/(^|[^\\$\w])\$(?![\s$])([^$\n]+?)\$(?![\d$])/g, function (m, pre, t) {
        return /\s$/.test(t) ? m : pre + keep(t, false);
      });
    var html = DOMPurify.sanitize(marked.parse(src, { gfm: true, breaks: true }));
    return html.replace(/MATHTOKEN(\d+)END/g, function (_m, i) {
      return stash[Number(i)] || '';
    });
  }

  var mdCache = {};
  function mdFor(m) {
    if (!mdCache[m.id]) mdCache[m.id] = md(m.text);
    return mdCache[m.id];
  }

  /* ------------------------------------------------------------ transport */

  function ApiError(status, message) {
    this.status = status;
    this.message = message;
  }
  ApiError.prototype = Object.create(Error.prototype);
  function Blocked() {}

  var route = session.get('mmclab:route') || (API ? 'direct' : 'relay');

  function showRoute() {
    if (!routeLabel) return;
    routeLabel.textContent = route === 'relay' ? 'Connected through relay' : '';
  }

  function direct(method, path, token, body) {
    var headers = {};
    if (token) headers.authorization = 'Bearer ' + token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    return fetch(API + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    }).then(
      function (res) {
        return res.json().then(
          function (data) {
            if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'Request failed (' + res.status + ')');
            return data;
          },
          function () {
            // A filter's block page instead of JSON: treat like a blocked connection.
            throw new Blocked();
          },
        );
      },
      function () {
        throw new Blocked();
      },
    );
  }

  function relayed(method, path, token, body) {
    // text/plain keeps this a "simple" request, so relays need no CORS preflight.
    return fetch(RELAY, { method: 'POST', body: JSON.stringify({ method: method, path: path, token: token || null, body: body }) }).then(
      function (res) {
        return res.json().then(
          function (out) {
            if (!out || typeof out.status !== 'number') throw new ApiError(502, 'The relay sent a bad response.');
            if (out.status >= 400) throw new ApiError(out.status, (out.data && out.data.error) || 'Request failed (' + out.status + ')');
            return out.data;
          },
          function () {
            throw new ApiError(502, 'The relay sent a bad response.');
          },
        );
      },
      function () {
        throw new ApiError(0, 'Can’t reach the lab server. Check your connection, or tell the organizer.');
      },
    );
  }

  function call(path, token, body) {
    var method = body === undefined ? 'GET' : 'POST';
    if (route === 'relay' && RELAY) return relayed(method, path, token, body);
    return direct(method, path, token, body).catch(function (e) {
      if (!(e instanceof Blocked)) throw e;
      if (!RELAY) throw new ApiError(0, 'Can’t reach the lab server. Check your connection, or tell the organizer.');
      route = 'relay';
      session.set('mmclab:route', 'relay');
      showRoute();
      return relayed(method, path, token, body);
    });
  }

  /* ------------------------------------------------------------- theme */

  var themeBtn = document.getElementById('lab-theme');
  var SUN =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>';
  function paintTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.innerHTML = dark ? SUN : MOON;
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.title = dark ? 'Light mode' : 'Dark mode';
  }
  themeBtn.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    local.set('mmclab:theme', next);
    paintTheme();
  });
  paintTheme();

  /* ------------------------------------------------------------ shared UI */

  function meterHTML(used, budget) {
    var remaining = Math.max(0, budget - used);
    var frac = budget ? Math.min(1, used / budget) : 1;
    return (
      '<div class="lab-meter' + (remaining < budget * 0.15 ? ' is-low' : '') + '" aria-label="' + remaining + ' of ' + budget + ' tokens left">' +
      '<div class="lab-meter-bar"><span style="width:' + ((1 - frac) * 100).toFixed(1) + '%"></span></div>' +
      '<div class="lab-meter-text"><strong>' + fmt(remaining) + '</strong> of ' + fmt(budget) + ' tokens left</div></div>'
    );
  }

  var THINKING = '<li class="lab-msg lab-msg-assistant"><div class="lab-thinking" role="status"><span></span><span></span><span></span>Claude is thinking</div></li>';

  function threadHTML(state, pending) {
    var out = state.messages.map(function (m) {
      var body = m.role === 'user' ? '<div class="lab-msg-body lab-plain">' + esc(m.text) + '</div>' : '<div class="lab-msg-body"><div class="lab-md">' + (m.text ? mdFor(m) : '') + '</div></div>';
      return (
        '<li class="lab-msg lab-msg-' + m.role + '"><div class="lab-msg-meta"><span>' + (m.role === 'user' ? 'Team' : 'Claude') + '</span><span>' + fmtTime(m.at) + '</span><span>' + fmt(m.cost) + ' tokens</span></div>' +
        body + (m.note ? '<div class="lab-note">' + esc(m.note) + '</div>' : '') + '</li>'
      );
    });
    var last = state.messages[state.messages.length - 1];
    if (pending) {
      out.push('<li class="lab-msg lab-msg-user"><div class="lab-msg-meta"><span>Team</span><span>sending</span></div><div class="lab-msg-body lab-plain">' + esc(pending) + '</div></li>', THINKING);
    } else if (state.busy && last && last.role === 'user') {
      out.push(THINKING);
    }
    return '<ol class="lab-thread">' + out.join('') + '</ol>';
  }

  function threadKey(state, pending) {
    return state.messages.map(function (m) { return m.id; }).join(',') + '|' + state.busy + '|' + (pending || '');
  }

  function transcript(t) {
    var lines = ['# ' + t.name + ' transcript', '', 'Tokens used: ' + fmt(t.used) + ' of ' + fmt(t.budget), ''];
    if (t.problem && t.problem.trim()) lines.push('## Problem', '', t.problem.trim(), '');
    lines.push('## Conversation', '');
    t.messages.forEach(function (m) {
      lines.push('### ' + (m.role === 'user' ? 'Team' : 'Claude') + ' · ' + fmtTime(m.at) + ' · ' + fmt(m.cost) + ' tokens', '', m.text || '_(no answer)_', '');
      if (m.note) lines.push('> ' + m.note, '');
    });
    return lines.join('\n');
  }

  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // setTimeout-based poller that pauses while the tab is hidden and fires on return.
  function poller(fn, delay) {
    var timer = null;
    var stopped = false;
    function tick() {
      timer = null;
      if (stopped) return;
      if (document.visibilityState !== 'visible') return;
      Promise.resolve(fn()).finally(schedule);
    }
    function schedule() {
      if (!stopped && !timer) timer = setTimeout(tick, delay());
    }
    function onVis() {
      if (document.visibilityState === 'visible' && !stopped) {
        clearTimeout(timer);
        timer = null;
        tick();
      }
    }
    document.addEventListener('visibilitychange', onVis);
    schedule();
    return {
      stop: function () {
        stopped = true;
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVis);
      },
      kick: function () {
        clearTimeout(timer);
        timer = null;
        schedule();
      },
    };
  }

  /* ----------------------------------------------------------------- gate */

  function gateView(onEnter) {
    root.innerHTML =
      '<form class="lab-gate"><h1>MMC Lab</h1><p class="lab-muted">Enter your team’s passcode.</p>' +
      '<input type="password" placeholder="Passcode" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Passcode">' +
      '<button type="submit" class="lab-btn lab-btn-primary" disabled>Enter</button><div class="lab-error" hidden></div></form>';
    var form = root.querySelector('form');
    var input = form.querySelector('input');
    var btn = form.querySelector('button');
    var err = form.querySelector('.lab-error');
    input.focus();
    input.addEventListener('input', function () {
      btn.disabled = !input.value.trim();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input.value.trim() || btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Checking…';
      err.hidden = true;
      call('login', null, { code: input.value }).then(onEnter, function (e2) {
        err.textContent = e2.message || 'Something went wrong';
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Enter';
      });
    });
    return { stop: function () {} };
  }

  /* ----------------------------------------------------------------- team */

  var STARTERS = [
    'What kinds of models could fit this problem? Give strengths and weaknesses of each.',
    'Compare a differential equation model and an agent-based model for this problem.',
    'What assumptions would we need to make, and which are the riskiest?',
  ];

  function teamView(token, onExpired) {
    root.innerHTML =
      '<div class="lab-chat">' +
      '<div class="lab-chat-top"><div data-meter class="lab-meter-slot"></div><button type="button" class="lab-link" data-download disabled>Download transcript</button></div>' +
      '<div data-problem></div><div data-thread></div><div data-end></div>' +
      '<form class="lab-composer"><div class="lab-error" data-error hidden></div><div class="lab-hint" data-busy hidden>Waiting for Claude’s answer. Only one question at a time per team.</div>' +
      '<div class="lab-composer-row"><textarea rows="2" maxlength="6000" placeholder="Ask about models, assumptions, tradeoffs…"></textarea><button type="submit" class="lab-btn lab-btn-primary" disabled>Send</button></div>' +
      '<div class="lab-hint" data-count></div></form></div>';
    var $ = function (sel) {
      return root.querySelector(sel);
    };
    var meter = $('[data-meter]');
    var problemEl = $('[data-problem]');
    var threadEl = $('[data-thread]');
    var endEl = $('[data-end]');
    var errEl = $('[data-error]');
    var busyEl = $('[data-busy]');
    var countEl = $('[data-count]');
    var dlBtn = $('[data-download]');
    var form = $('form');
    var ta = form.querySelector('textarea');
    var sendBtn = form.querySelector('button');

    var state = null;
    var pending = null;
    var lastSent = null;
    var shownKey = '';
    var shownProblem = null;

    function showError(msg) {
      errEl.textContent = msg || '';
      errEl.hidden = !msg;
    }
    function fail(e) {
      if (e && e.status === 401) return onExpired();
      showError((e && e.message) || 'Something went wrong');
    }

    function paintComposer() {
      var out = !state || state.remaining < 300;
      ta.disabled = out;
      ta.placeholder = out && state ? 'Out of tokens' : 'Ask about models, assumptions, tradeoffs…';
      sendBtn.disabled = !state || pending !== null || out || state.busy || !ta.value.trim();
      busyEl.hidden = !(state && state.busy && pending === null);
      countEl.textContent = 'Enter to send · Shift+Enter for a new line · this message ≈ ' + fmt(Math.ceil(ta.value.trim().length / 4)) + ' tokens plus the reply';
      if (state && out && !errEl.textContent) showError('Your team is out of tokens.');
    }

    function paint() {
      if (!state) return;
      meter.innerHTML = meterHTML(state.used, state.budget);
      dlBtn.disabled = !state.messages.length;
      if (state.problem !== shownProblem) {
        shownProblem = state.problem;
        problemEl.innerHTML = state.problem.trim() ? '<details class="lab-problem" open><summary>Problem</summary><div class="lab-md">' + md(state.problem) + '</div></details>' : '';
      }
      var key = threadKey(state, pending);
      if (key !== shownKey) {
        var grew = key.length > shownKey.length;
        shownKey = key;
        if (!state.messages.length && !pending) {
          threadEl.innerHTML =
            '<div class="lab-empty"><p>Use Claude to find and compare candidate models. Each message spends tokens, so make your questions count. You write the paper yourselves.</p><div class="lab-starters">' +
            STARTERS.map(function (s) {
              return '<button type="button">' + esc(s) + '</button>';
            }).join('') +
            '</div></div>';
          threadEl.querySelectorAll('.lab-starters button').forEach(function (b) {
            b.addEventListener('click', function () {
              ta.value = b.textContent;
              ta.focus();
              paintComposer();
            });
          });
        } else {
          threadEl.innerHTML = threadHTML(state, pending);
        }
        if (grew) endEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      // If our question failed server-side, show why and put the text back.
      if (lastSent && state.lastError && state.lastError.at >= lastSent.at) {
        showError(state.lastError.text);
        if (!ta.value) ta.value = lastSent.text;
        lastSent = null;
      }
      paintComposer();
    }

    function refresh() {
      return call('team', token).then(
        function (s) {
          state = s;
          paint();
        },
        fail,
      );
    }

    var poll = poller(refresh, function () {
      return state && state.busy ? BUSY_MS : IDLE_MS;
    });
    refresh();

    function send() {
      var text = ta.value.trim();
      if (!text || pending !== null || !state || state.busy) return;
      showError('');
      pending = text;
      lastSent = { text: text, at: Date.now() };
      ta.value = '';
      paint();
      call('chat', token, { text: text }).then(
        function (s) {
          pending = null;
          state = s;
          paint();
          poll.kick();
        },
        function (e) {
          pending = null;
          lastSent = null;
          if (!ta.value) ta.value = text;
          paint();
          fail(e);
          refresh();
        },
      );
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      send();
    });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });
    ta.addEventListener('input', paintComposer);
    dlBtn.addEventListener('click', function () {
      if (state) download('team-' + state.team + '-transcript.md', transcript(state));
    });
    paintComposer();
    return poll;
  }

  /* -------------------------------------------------------------- monitor */

  function monitorView(token, onExpired) {
    root.classList.add('is-wide');
    root.innerHTML =
      '<div class="lab-monitor">' +
      '<section class="lab-panel"><div class="lab-panel-head"><h2>Problem</h2><div class="lab-actions" data-pactions></div></div><div data-pbody></div></section>' +
      '<div class="lab-error" data-error hidden></div>' +
      '<div class="lab-monitor-grid"><aside class="lab-teams"><div data-teams></div><div class="lab-hint" data-total></div><button type="button" class="lab-link" data-all>Download all transcripts</button></aside>' +
      '<section class="lab-panel lab-viewer"><div class="lab-panel-head"><h2 data-tname></h2><div class="lab-actions">' +
      '<button type="button" class="lab-btn" data-bonus>+10k tokens</button><button type="button" class="lab-btn" data-dl>Download</button><button type="button" class="lab-btn lab-btn-danger" data-reset>Reset</button>' +
      '</div></div><div data-tmeter></div><div data-tthread></div></section></div></div>';
    var $ = function (sel) {
      return root.querySelector(sel);
    };
    var errEl = $('[data-error]');
    var state = null;
    var selected = 1;
    var editing = null;
    var busy = false;
    var shownKey = '';
    var shownProblem = null;

    function showError(msg) {
      errEl.textContent = msg || '';
      errEl.hidden = !msg;
    }
    function fail(e) {
      if (e && e.status === 401) return onExpired();
      showError((e && e.message) || 'Something went wrong');
    }

    function paintProblem() {
      var actions = $('[data-pactions]');
      var body = $('[data-pbody]');
      if (editing !== null) {
        if (!body.querySelector('textarea')) {
          actions.innerHTML = '<button type="button" class="lab-link" data-cancel>Cancel</button><button type="button" class="lab-btn lab-btn-primary" data-save>Save</button>';
          body.innerHTML = '<textarea class="lab-problem-edit" rows="7" placeholder="Paste the problem statement. Teams see it above their chat, and Claude gets it as context. Markdown and $math$ work."></textarea>';
          var ta = body.querySelector('textarea');
          ta.value = editing;
          ta.addEventListener('input', function () {
            editing = ta.value;
          });
          ta.focus();
          actions.querySelector('[data-cancel]').addEventListener('click', function () {
            editing = null;
            shownProblem = null;
            paintProblem();
          });
          actions.querySelector('[data-save]').addEventListener('click', function () {
            act({ action: 'problem', text: editing }).then(function (ok) {
              if (ok) {
                editing = null;
                shownProblem = null;
                paintProblem();
              }
            });
          });
        }
        return;
      }
      if (!state || state.problem === shownProblem) return;
      shownProblem = state.problem;
      actions.innerHTML = '<button type="button" class="lab-link" data-edit>' + (state.problem ? 'Edit' : 'Add problem') + '</button>';
      actions.querySelector('[data-edit]').addEventListener('click', function () {
        editing = state.problem;
        paintProblem();
      });
      body.innerHTML = state.problem ? '<div class="lab-md">' + md(state.problem) + '</div>' : '<p class="lab-muted">No problem posted. Teams can still chat; Claude works from what they type.</p>';
    }

    function paint() {
      if (!state) return;
      paintProblem();
      var team = state.teams.filter(function (t) { return t.team === selected; })[0] || state.teams[0];
      $('[data-teams]').innerHTML = state.teams
        .map(function (t) {
          var qs = t.messages.filter(function (m) { return m.role === 'user'; }).length;
          return (
            '<button type="button" class="lab-team' + (t.team === team.team ? ' is-active' : '') + '" data-team="' + t.team + '">' +
            '<span class="lab-team-name">' + esc(t.name) + (t.busy ? '<span class="lab-dot" title="Waiting on Claude"></span>' : '') + '</span>' +
            '<span class="lab-team-meta">' + plural(qs, 'question') + ' · ' + fmt(t.used) + ' used</span>' +
            '<span class="lab-team-bar"><span style="width:' + Math.min(100, (t.used / t.budget) * 100).toFixed(1) + '%"></span></span></button>'
          );
        })
        .join('');
      root.querySelectorAll('[data-team]').forEach(function (b) {
        b.addEventListener('click', function () {
          selected = Number(b.getAttribute('data-team'));
          shownKey = '';
          paint();
        });
      });
      var total = state.teams.reduce(function (s, t) { return s + t.used; }, 0);
      $('[data-total]').textContent = fmt(total) + ' tokens charged across teams · ' + state.model + (state.mock ? ' · mock mode, no API calls' : '');
      $('[data-tname]').textContent = team.name;
      $('[data-tmeter]').innerHTML = meterHTML(team.used, team.budget);
      var key = team.team + ':' + threadKey(team, null);
      if (key !== shownKey) {
        shownKey = key;
        $('[data-tthread]').innerHTML = team.messages.length ? threadHTML(team, null) : '<p class="lab-muted">No messages yet.</p>';
      }
      root.querySelectorAll('.lab-viewer .lab-btn').forEach(function (b) {
        b.disabled = busy;
      });
      $('[data-dl]').disabled = busy || !team.messages.length;
    }

    function refresh() {
      return call('admin', token).then(
        function (s) {
          state = s;
          showError('');
          paint();
        },
        fail,
      );
    }

    function act(body) {
      busy = true;
      paint();
      return call('admin', token, body).then(
        function (s) {
          busy = false;
          state = s;
          showError('');
          paint();
          return true;
        },
        function (e) {
          busy = false;
          paint();
          fail(e);
          return false;
        },
      );
    }

    $('[data-bonus]').addEventListener('click', function () {
      act({ action: 'bonus', team: selected, amount: 10000 });
    });
    $('[data-dl]').addEventListener('click', function () {
      var t = state && state.teams[selected - 1];
      if (t) download('team-' + t.team + '-transcript.md', transcript(t));
    });
    $('[data-reset]').addEventListener('click', function () {
      var t = state && state.teams[selected - 1];
      if (t && confirm('Erase ' + t.name + '’s conversation and reset its tokens? This can’t be undone.')) act({ action: 'clear', team: selected });
    });
    $('[data-all]').addEventListener('click', function () {
      if (state) download('mmc-lab-all-transcripts.md', state.teams.map(transcript).join('\n\n---\n\n'));
    });

    var poll = poller(refresh, function () {
      return MONITOR_MS;
    });
    refresh();
    return {
      stop: function () {
        poll.stop();
        root.classList.remove('is-wide');
      },
    };
  }

  /* ----------------------------------------------------------------- shell */

  var current = null;

  function loadSession() {
    try {
      return JSON.parse(session.get('mmclab:session') || 'null');
    } catch (e) {
      return null;
    }
  }

  function show(s) {
    if (current) current.stop();
    brandTeam.textContent = s ? ' / ' + s.name : '';
    signOutBtn.hidden = !s;
    if (!s) current = gateView(enter);
    else if (s.role === 'admin') current = monitorView(s.token, leave);
    else current = teamView(s.token, leave);
  }
  function enter(s) {
    session.set('mmclab:session', JSON.stringify(s));
    show(s);
  }
  function leave() {
    session.set('mmclab:session', null);
    show(null);
  }

  signOutBtn.addEventListener('click', leave);
  showRoute();
  show(loadSession());
})();
