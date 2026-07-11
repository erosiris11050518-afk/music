/* ============================================================
   ErosIris-Link — 电影式开场页
   从 config.js (window.SITE_CONFIG) 渲染全部动态内容，
   并处理视频切换 / 深色内容模式 / 移动菜单 / 工作台跳转。
   ============================================================ */
(() => {
  "use strict";

  const C = window.SITE_CONFIG;
  if (!C) {
    console.error("SITE_CONFIG 未加载：请确认 config.js 在 app.js 之前引入。");
    return;
  }

  const CROSSFADE_MS = 1000; // 与 style.css 中 .bg-video 的过渡时长保持一致
  const AUTO_ADVANCE_LEAD_S = CROSSFADE_MS / 1000;
  const SCENE_KEY = "signalpath-welcome-scene";

  const $ = (id) => document.getElementById(id);
  const hero = $("hero");
  const urlParams = new URLSearchParams(window.location.search);
  const demoMode = urlParams.get("demo") === "1";

  function validSceneIndex(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n < C.scenes.length ? n : -1;
  }

  let initialScene = validSceneIndex(urlParams.get("v"));
  if (initialScene < 0) {
    try { initialScene = validSceneIndex(localStorage.getItem(SCENE_KEY)); } catch (e) { initialScene = -1; }
  }
  if (initialScene < 0) initialScene = 0;

  function sceneTheme(index) {
    const scene = C.scenes[index] || C.scenes[0];
    return scene.workbenchTheme === "dark" ? "dark" : "light";
  }

  function rememberScene(index) {
    try {
      localStorage.setItem(SCENE_KEY, String(index));
      localStorage.setItem("signalpath-welcome-theme", sceneTheme(index));
    } catch (e) { /* 隐私模式下保持当前会话可用 */ }
  }

  /* ============================================================
     1. 文案注入
     ============================================================ */
  document.title = C.pageTitle;
  $("logo").textContent = C.brand.logo;
  $("badge").textContent = C.hero.badge;
  $("subtext").textContent = C.hero.subtext;
  const heading = $("heading");
  C.hero.headingLines.forEach((line, i) => {
    if (i > 0) heading.appendChild(document.createElement("br"));
    heading.appendChild(document.createTextNode(line));
  });

  const entryFull = $("entry-full");
  const entrySub = $("entry-sub");
  entryFull.placeholder = C.hero.fullrangePlaceholder || "8";
  entrySub.placeholder = C.hero.subPlaceholder || "4";
  entryFull.setAttribute("aria-label", "全频数量");
  entrySub.setAttribute("aria-label", "超低数量");
  $("entry-cta").textContent = C.hero.inputCta;
  $("nav-get-started").textContent = C.nav.cta;
  $("m-get-started").textContent = C.nav.cta;
  if (demoMode) {
    document.body.classList.add("demo-mode");
    $("nav-get-started").textContent = "进入体验室";
    $("m-get-started").textContent = "进入体验室";
    $("entry-cta").textContent = "开始体验";
  }

  /* ============================================================
     2. 导航链接（桌面胶囊 + 移动菜单共用 config.nav.links）
     ============================================================ */
  const navCta = $("nav-get-started");
  const mCta = $("m-get-started");

  const navItems = C.nav.links.map((item) => typeof item === "string"
    ? { label: item, action: "" }
    : { label: item.label, action: item.action || "" });

  navItems.forEach((item, i) => {
    const a = document.createElement("a");
    a.className = "nav-link";
    a.href = "#";
    a.textContent = item.label;
    a.addEventListener("click", (e) => gotoWorkspace(e, item.action));
    $("nav-pill").insertBefore(a, navCta);

    const m = document.createElement("a");
    m.className = "m-link";
    m.href = "#";
    m.style.setProperty("--i", i);
    m.textContent = item.label;
    m.addEventListener("click", (e) => { setMenu(false); gotoWorkspace(e, item.action); });
    $("mobile-panel").insertBefore(m, mCta);
  });
  mCta.style.setProperty("--i", navItems.length);

  /* ============================================================
     3. 背景视频与场景切换器（config.scenes）
     ============================================================ */
  const videos = [];
  const switchButtons = [];
  const retryCounts = [];
  const videoStack = $("video-stack");
  let activeVideo = initialScene;
  let isTransitioning = false;
  let playbackRetryTimer = 0;
  let nextPreloadTimer = 0;

  function showScenePoster(index) {
    const poster = C.scenes[index] && C.scenes[index].poster;
    videoStack.style.backgroundImage = poster ? `url(${JSON.stringify(poster)})` : "none";
  }

  showScenePoster(initialScene);

  C.scenes.forEach((scene, i) => {
    const v = document.createElement("video");
    v.className = "bg-video" + (i === initialScene ? " is-active" : "");
    v.muted = true;
    v.defaultMuted = true;
    v.loop = false;
    v.autoplay = i === initialScene;
    v.preload = i === initialScene ? "auto" : "none";
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    if (scene.poster) v.poster = scene.poster;
    v.dataset.src = scene.video;
    v.addEventListener("error", () => { v.style.display = "none"; });
    v.addEventListener("playing", () => {
      if (i !== activeVideo) return;
      retryCounts[i] = 0;
      window.clearTimeout(playbackRetryTimer);
      window.clearTimeout(nextPreloadTimer);
      nextPreloadTimer = window.setTimeout(() => {
        if (i === activeVideo) ensureVideoSource((i + 1) % videos.length, "auto");
      }, 2000);
    });
    v.addEventListener("waiting", () => {
      if (i === activeVideo && v.currentTime < 0.25) schedulePlaybackRetry(i);
    });
    v.addEventListener("stalled", () => {
      if (i === activeVideo && v.currentTime < 0.25) schedulePlaybackRetry(i);
    });
    v.addEventListener("timeupdate", () => {
      if (C.sceneAutoAdvance === false || i !== activeVideo || isTransitioning) return;
      if (!Number.isFinite(v.duration) || v.currentTime <= 0) return;
      if (v.duration - v.currentTime <= AUTO_ADVANCE_LEAD_S) {
        setActiveVideo((i + 1) % C.scenes.length);
      }
    });
    v.addEventListener("ended", () => {
      if (C.sceneAutoAdvance === false || i !== activeVideo || isTransitioning) return;
      setActiveVideo((i + 1) % C.scenes.length);
    });
    if (i === initialScene) v.src = scene.video;
    $("video-stack").appendChild(v);
    videos.push(v);
    retryCounts.push(0);

    const b = document.createElement("button");
    b.className = "sw liquid-glass" + (i === initialScene ? " is-active" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === initialScene));
    b.textContent = scene.label;
    b.addEventListener("click", () => setActiveVideo(i));
    $("switcher").appendChild(b);
    switchButtons.push(b);
  });

  hero.classList.toggle("dark-content", !!C.scenes[initialScene].darkContent);
  rememberScene(initialScene);

  function ensureVideoSource(index, preload) {
    const current = videos[index];
    if (!current) return;
    if (preload) current.preload = preload;
    if (!current.hasAttribute("src")) {
      current.src = current.dataset.src;
      current.load();
    }
  }

  function attemptVideoPlay(index) {
    const current = videos[index];
    if (!current || document.hidden) return;
    const playPromise = current.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => { /* 静音自动播放仍被浏览器限制时保留首帧图 */ });
    }
  }

  function schedulePlaybackRetry(index) {
    window.clearTimeout(playbackRetryTimer);
    if ((retryCounts[index] || 0) >= 2) return;
    playbackRetryTimer = window.setTimeout(() => {
      const current = videos[index];
      if (!current || index !== activeVideo || document.hidden || current.currentTime >= 0.25) return;
      retryCounts[index] = (retryCounts[index] || 0) + 1;
      try { current.currentTime = 0; } catch (e) { /* 尚未获得首帧时继续等待 */ }
      attemptVideoPlay(index);
      schedulePlaybackRetry(index);
    }, 1400);
  }

  function playActiveVideo() {
    const current = videos[activeVideo];
    if (!current || document.hidden) return;
    ensureVideoSource(activeVideo, "auto");
    current.muted = true;
    current.defaultMuted = true;
    current.playsInline = true;
    attemptVideoPlay(activeVideo);
    schedulePlaybackRetry(activeVideo);
  }

  // 动态创建的 video 不能只依赖 autoplay 属性；显式启动并在媒体就绪后兜底。
  videos[activeVideo].addEventListener("loadeddata", playActiveVideo, { once: true });
  videos[activeVideo].addEventListener("canplay", playActiveVideo, { once: true });
  window.requestAnimationFrame(playActiveVideo);
  if (document.readyState === "complete") playActiveVideo();
  else window.addEventListener("load", playActiveVideo, { once: true });
  window.addEventListener("pageshow", playActiveVideo);

  function setActiveVideo(index) {
    if (index === activeVideo || isTransitioning) return;
    isTransitioning = true;

    const prev = activeVideo;
    activeVideo = index;
    rememberScene(index);

    showScenePoster(index);
    ensureVideoSource(index, "auto");
    try { videos[index].currentTime = 0; } catch (e) { /* 等待视频元数据 */ }
    playActiveVideo();
    videos[index].classList.add("is-active");
    videos[prev].classList.remove("is-active");

    switchButtons.forEach((btn, i) => {
      btn.classList.toggle("is-active", i === index);
      btn.setAttribute("aria-selected", String(i === index));
    });

    // 偏亮场景切换深色文字（700ms 过渡在 CSS 中）
    hero.classList.toggle("dark-content", !!C.scenes[index].darkContent);

    window.setTimeout(() => {
      isTransitioning = false;
      if (!videos[prev].paused) videos[prev].pause();
      videos[prev].currentTime = 0;
    }, CROSSFADE_MS);
  }

  // 页面隐藏时暂停视频，节省资源
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      videos.forEach((v) => { if (!v.paused) v.pause(); });
    } else {
      playActiveVideo();
    }
  });

  /* ============================================================
     4. 前景遮罩 PNG（config.overlay.image）
     ============================================================ */
  const overlayImg = $("overlay-img");
  if (C.overlay.image) {
    overlayImg.addEventListener("error", () => { $("train-overlay").style.display = "none"; });
    overlayImg.src = C.overlay.image;
  } else {
    $("train-overlay").style.display = "none";
  }

  /* ============================================================
     5. 底部统计（config.stats）
     ============================================================ */
  C.stats.forEach((item, i) => {
    if (i > 0) {
      const d = document.createElement("span");
      d.className = "divider";
      d.setAttribute("aria-hidden", "true");
      d.textContent = "|";
      $("stats").appendChild(d);
    }
    const span = document.createElement("span");
    span.className = "stat";
    if (item.value) {
      const strong = document.createElement("strong");
      strong.textContent = item.value;
      span.appendChild(strong);
      span.appendChild(document.createTextNode(" " + item.text));
    } else {
      span.textContent = item.text;
    }
    $("stats").appendChild(span);
  });

  /* ============================================================
     6. 移动菜单
     ============================================================ */
  const mobileMenu = $("mobile-menu");
  const hamburger = $("hamburger");

  function setMenu(open) {
    mobileMenu.classList.toggle("is-open", open);
    mobileMenu.setAttribute("aria-hidden", String(!open));
    hamburger.classList.toggle("is-open", open);
    hamburger.setAttribute("aria-expanded", String(open));
    hamburger.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    document.body.classList.toggle("menu-open", open);
  }

  hamburger.addEventListener("click", () => {
    setMenu(!mobileMenu.classList.contains("is-open"));
  });
  $("mobile-backdrop").addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileMenu.classList.contains("is-open")) {
      setMenu(false);
      hamburger.focus();
    }
  });

  /* ============================================================
     7. 进入工作台（config.workspaceUrl）
     ============================================================ */
  function speakerCommand() {
    const full = Math.max(0, Math.floor(Number(entryFull.value) || 0));
    const sub = Math.max(0, Math.floor(Number(entrySub.value) || 0));
    const parts = [];
    if (full) parts.push(`${full}只全频`);
    if (sub) parts.push(`${sub}只超低`);
    return parts.join("，");
  }

  function workspaceUrl(action, command) {
    const url = new URL(C.workspaceUrl, window.location.href);
    url.searchParams.set("workspace", "1");
    url.searchParams.set("from", "welcome");
    url.searchParams.set("theme", sceneTheme(activeVideo));
    url.searchParams.set("scene", String(activeVideo));
    if (demoMode) url.searchParams.set("demo", "1");
    if (action) url.searchParams.set("action", action);
    if (command) url.searchParams.set("reverse", command);
    return url.href;
  }

  function gotoWorkspace(e, action) {
    if (e) e.preventDefault();
    const fromForm = !!(e && e.currentTarget === $("entry-form"));
    const command = fromForm ? speakerCommand() : "";
    if (fromForm && !command) {
      entryFull.setCustomValidity("请至少填写一个音响数量");
      entryFull.reportValidity();
      entryFull.addEventListener("input", () => entryFull.setCustomValidity(""), { once: true });
      return;
    }
    try {
      localStorage.setItem("signalpath-theme", sceneTheme(activeVideo));
      localStorage.setItem("signalpath-theme-source", "welcome");
      rememberScene(activeVideo);
    } catch (err) { /* 主题记忆失败不应阻止进入工作台 */ }
    window.location.assign(workspaceUrl(fromForm ? "reverse" : action, command));
  }
  $("nav-get-started").addEventListener("click", gotoWorkspace);
  $("m-get-started").addEventListener("click", gotoWorkspace);
  $("entry-form").addEventListener("submit", gotoWorkspace);
  $("logo").addEventListener("click", (e) => e.preventDefault());

  /* ============================================================
     8. 审核辅助：?v=1..n-1 直接打开指定场景
     ============================================================ */
  /* 场景参数和上次场景已在创建视频前解析，避免首帧闪过暮霞。 */
})();
