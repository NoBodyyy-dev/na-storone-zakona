/* ===== На стороне Закона — общий скрипт ===== */
(function(){
  // Гербовая заглушка: показывается, если emblem.png недоступен
  var CREST = '<svg class="__crest" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Эмблема коллегии">'
    + '<defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2dea3"/><stop offset=".5" stop-color="#c2a052"/><stop offset="1" stop-color="#7f6529"/></linearGradient></defs>'
    + '<circle cx="60" cy="60" r="55" fill="none" stroke="url(#cg)" stroke-width="2"/>'
    + '<circle cx="60" cy="60" r="47" fill="none" stroke="url(#cg)" stroke-width="1" opacity=".6"/>'
    + '<path d="M60 18 C74 30 84 30 92 28 C92 62 82 84 60 100 C38 84 28 62 28 28 C36 30 46 30 60 18 Z" fill="none" stroke="url(#cg)" stroke-width="2" opacity=".85"/>'
    + '<text x="60" y="70" text-anchor="middle" font-family="Playfair Display, serif" font-size="30" font-weight="600" fill="url(#cg)" letter-spacing="1">НСЗ</text>'
    + '</svg>';
  window.crest = function(img){
    var span = document.createElement('span');
    span.innerHTML = CREST;
    var svg = span.firstChild;
    // перенести размерные классы (hero-logo, nav-brand и т.п.) на svg
    if(img.className) svg.setAttribute('class', (svg.getAttribute('class')||'') + ' ' + img.className);
    if(img.classList.contains('hero-logo')) svg.classList.add('crest');
    img.replaceWith(svg);
  };

  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }

  // Запасные варианты для картинок — без inline-обработчиков, чтобы работала
  // строгая Content-Security-Policy. Картинка могла сломаться ещё до того,
  // как выполнился этот скрипт, поэтому проверяем и уже загруженные.
  function onImgError(img, handler){
    if(img.complete && img.naturalWidth === 0) handler(img);
    else img.addEventListener('error', function(){ handler(img); }, { once: true });
  }
  document.querySelectorAll('img[data-crest]').forEach(function(img){ onImgError(img, window.crest); });
  document.querySelectorAll('img[data-hide-on-error]').forEach(function(img){ onImgError(img, function(i){ i.remove(); }); });

  // ===== Cookie и Яндекс Метрика =====
  // Метрика загружается только после «Принять» в уведомлении о cookie.
  // Номер счётчика — из metrika.yandex.ru; пока 0, Метрика не подключается.
  var METRIKA_ID = 0;
  var CONSENT_KEY = 'nsz-cookie';
  var CONSENT_TTL = 365 * 24 * 3600 * 1000; // через год спрашиваем снова
  var metrikaLoaded = false;

  function readConsent(){
    try {
      var c = JSON.parse(localStorage.getItem(CONSENT_KEY));
      if(c && (c.v === 'all' || c.v === 'necessary') && Date.now() - c.t < CONSENT_TTL) return c.v;
    } catch(e){}
    return null;
  }
  function saveConsent(v){
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({v:v, t:Date.now()})); } catch(e){}
  }
  function loadMetrika(){
    if(metrikaLoaded || !METRIKA_ID) return;
    metrikaLoaded = true;
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
      (window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(METRIKA_ID, 'init', {clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:true});
  }
  // при отзыве согласия стираем cookie Метрики (_ym_uid, _ym_d и др.)
  function dropMetrikaCookies(){
    document.cookie.split(';').forEach(function(c){
      var name = c.split('=')[0].trim();
      if(name.indexOf('_ym') !== 0) return;
      var exp = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      document.cookie = exp;
      document.cookie = exp + '; domain=.' + location.hostname.replace(/^www\./, '');
    });
  }

  function showCookieBar(){
    if(document.querySelector('.cookie-bar')) return;
    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Уведомление о cookie');
    bar.innerHTML = '<p>Мы используем cookie и Яндекс Метрику, чтобы понимать, как посетители пользуются сайтом, и улучшать его. '
      + 'Аналитика включится только с вашего согласия. Подробнее — в <a href="/politika-konfidencialnosti#cookie">политике конфиденциальности</a>.</p>'
      + '<div class="cookie-actions"><button type="button" class="btn-ghost" data-cookie="necessary">Отклонить</button>'
      + '<button type="button" class="btn-primary sm" data-cookie="all">Принять</button></div>';
    bar.addEventListener('click', function(e){
      var btn = e.target.closest('[data-cookie]');
      if(!btn) return;
      var v = btn.getAttribute('data-cookie');
      saveConsent(v);
      bar.remove();
      if(v === 'all') loadMetrika();
      else {
        dropMetrikaCookies();
        // уже запущенную Метрику не остановить — перезагружаем страницу без неё
        if(metrikaLoaded) location.reload();
      }
    });
    document.body.appendChild(bar);
  }

  ready(function(){
    // Cookie: применяем сохранённый выбор или спрашиваем
    var consent = readConsent();
    if(consent === 'all') loadMetrika();
    else if(!consent) showCookieBar();
    document.querySelectorAll('[data-cookie-settings]').forEach(function(b){
      b.addEventListener('click', showCookieBar);
    });

    // Мобильное меню
    var burger = document.querySelector('.nav-burger');
    var links = document.querySelector('.nav-links');
    if(burger && links){
      burger.addEventListener('click', function(){
        var open = links.classList.toggle('open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      links.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){
        links.classList.remove('open');
        burger.setAttribute('aria-expanded','false');
      }); });
    }
    // Подсветка активного раздела прайс-листа
    var pnav = document.querySelector('.price-nav');
    if(pnav && 'IntersectionObserver' in window){
      var navLinks = Array.prototype.slice.call(pnav.querySelectorAll('a'));
      var blocks = navLinks.map(function(a){ return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
      var spy = new IntersectionObserver(function(ents){
        ents.forEach(function(e){
          if(!e.isIntersecting) return;
          navLinks.forEach(function(a){ a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); });
        });
      }, {rootMargin:'-140px 0px -55% 0px'});
      blocks.forEach(function(b){ spy.observe(b); });
    }
    // Reveal on scroll
    var els = document.querySelectorAll('.reveal');
    if('IntersectionObserver' in window && els.length){
      var io = new IntersectionObserver(function(ents){
        ents.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
      }, {threshold:.14, rootMargin:'0px 0px -8% 0px'});
      els.forEach(function(el){ io.observe(el); });
    } else { els.forEach(function(el){ el.classList.add('in'); }); }
    // Лайтбокс сканов: открывается кликом по любому [data-zoom],
    // закрывается кликом, Esc или кнопкой — фокус возвращается на карточку.
    var lb = document.getElementById('lb');
    if(lb){
      var lbImg = lb.querySelector('img');
      var lbClose = lb.querySelector('.x');
      var lastFocused = null;

      function openLb(src, label){
        lbImg.src = src;
        lbImg.alt = label || '';
        lb.classList.add('open');
        lb.setAttribute('aria-hidden','false');
        if(lbClose) lbClose.focus();
      }
      function closeLb(){
        lb.classList.remove('open');
        lb.setAttribute('aria-hidden','true');
        lbImg.src = '';
        lbImg.alt = '';
        if(lastFocused){ lastFocused.focus(); lastFocused = null; }
      }

      document.addEventListener('click', function(e){
        var trigger = e.target.closest && e.target.closest('[data-zoom]');
        if(trigger){
          lastFocused = trigger;
          openLb(trigger.getAttribute('data-zoom'), trigger.getAttribute('aria-label'));
          return;
        }
        if(lb.classList.contains('open') && lb.contains(e.target)) closeLb();
      });
      document.addEventListener('keydown', function(e){
        if(e.key === 'Escape' && lb.classList.contains('open')) closeLb();
      });
    }
  });
})();
