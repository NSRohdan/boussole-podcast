/* Boussole : lecteur, carte des épisodes (la boussole pointe vers l'épingle),
   filtres et recherche. Sans dépendance, sans cookie, sans mesure d'audience. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Toast ---------- */
  const toast = $("#toast");
  let toastTimer;
  const dire = (texte) => {
    if (!toast) return;
    toast.textContent = texte;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-on"), 2200);
  };

  /* ---------- Lecteur ---------- */
  const player = $("#player");
  const audio = $("#audio");
  const pPlay = $("#p-play");
  const pTitle = $("#p-title");
  const pSeek = $("#p-seek");
  const pCur = $("#p-cur");
  const pDur = $("#p-dur");
  const pSpeed = $("#p-speed");
  const vitesses = [1, 1.25, 1.5, 0.75];
  let courant = null;

  const temps = (s) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  const marquer = () => {
    const lecture = audio && !audio.paused;
    player && player.classList.toggle("is-playing", lecture);
    pPlay && pPlay.setAttribute("aria-label", lecture ? "Pause" : "Lecture");
    $$("[data-play]").forEach((b) => {
      const actif = lecture && b.dataset.id && b.dataset.id === courant;
      b.classList.toggle("is-playing", !!actif);
      const lib = b.querySelector("span");
      if (lib && b.classList.contains("btn") && !b.closest(".pin-card")) {
        lib.textContent = actif ? "En écoute…" : "Écouter le dernier épisode";
      }
    });
  };

  const jouer = (src, titre, id) => {
    if (!audio || !src) return;
    if (courant === id && !audio.paused) { audio.pause(); return; }
    if (courant !== id) {
      audio.src = src;
      courant = id;
      pTitle.textContent = titre;
      pTitle.href = `/episodes/${id}/`;
      pSeek.value = 0;
      pCur.textContent = "0:00";
      pDur.textContent = "…";
    }
    player.hidden = false;
    document.body.classList.add("has-player");
    audio.play().catch(() => dire("Lecture impossible pour le moment."));
  };

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-play]");
    if (b && !b.disabled) {
      e.preventDefault();
      jouer(b.dataset.src, b.dataset.title, b.dataset.id);
    }
  });

  if (audio) {
    audio.addEventListener("play", marquer);
    audio.addEventListener("pause", marquer);
    audio.addEventListener("ended", marquer);
    audio.addEventListener("loadedmetadata", () => { pDur.textContent = temps(audio.duration); });
    audio.addEventListener("timeupdate", () => {
      if (!audio.duration) return;
      pSeek.value = (audio.currentTime / audio.duration) * 100;
      pCur.textContent = temps(audio.currentTime);
    });
    audio.addEventListener("error", () => { if (courant) dire("Cet épisode n'est pas disponible."); });
    pPlay.addEventListener("click", () => (audio.paused ? audio.play() : audio.pause()));
    pSeek.addEventListener("input", () => { if (audio.duration) audio.currentTime = (pSeek.value / 100) * audio.duration; });
    $("#p-back").addEventListener("click", () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
    $("#p-fwd").addEventListener("click", () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
    pSpeed.addEventListener("click", () => {
      const v = vitesses[(vitesses.indexOf(audio.playbackRate) + 1) % vitesses.length];
      audio.playbackRate = v;
      const texte = String(v).replace(".", ",");
      pSpeed.textContent = `${texte}×`;
      pSpeed.setAttribute("aria-label", `Vitesse de lecture : ${texte} fois`);
    });
    $("#p-close").addEventListener("click", () => { audio.pause(); player.hidden = true; document.body.classList.remove("has-player"); });
    document.addEventListener("keydown", (e) => {
      if (player.hidden || e.target.closest("input, textarea, button, a, summary")) return;
      if (e.code === "Space") { e.preventDefault(); audio.paused ? audio.play() : audio.pause(); }
    });
  }

  /* ---------- Carte : zoom, regroupement, filtres, fiche, boussole ---------- */
  const carte = $("[data-map]");
  if (carte) {
    const inner = $(".map-inner", carte);
    const terres = $(".map-land", carte);
    const aiguille = $(".c-needle", carte);
    const boussole = $(".compass", carte);
    const fiche = $("#pin-card");
    const pins = $$(".pin", carte);
    const btnPlus = $('[data-zoom="in"]', carte);
    const btnMoins = $('[data-zoom="out"]', carte);
    const astuce = $(".map-hint", carte);
    const regions = $$(".region");
    const filtres = $$(".ml-btn");
    const resets = $$(".ml-reset");
    const S_MAX = 22;
    const RAYON = 38; // px à l'écran : en dessous, les épingles se regroupent
    let s = 1, tx = 0, ty = 0;
    let active = null;
    let groupes = new Map(); // épingle meneuse -> membres du groupe
    let detailDemande = false;
    const themesActifs = new Set();

    /* --- Boussole --- */
    const viser = (pin) => {
      if (!aiguille || !boussole || !pin) return;
      const a = boussole.getBoundingClientRect();
      const b = $(".pin-dot", pin).getBoundingClientRect();
      const angle = (Math.atan2(b.left + b.width / 2 - (a.left + a.width / 2), -(b.top + b.height / 2 - (a.top + a.height / 2))) * 180) / Math.PI;
      aiguille.style.setProperty("--angle", `${angle.toFixed(1)}deg`);
    };
    const repos = () => {
      if (active) return viser(active);
      aiguille && aiguille.style.setProperty("--angle", "-18deg");
    };

    /* --- Géométrie : position de la carte dans son cadre --- */
    const base = () => ({ bx: inner.offsetLeft, by: inner.offsetTop, bw: inner.offsetWidth, bh: inner.offsetHeight, W: carte.clientWidth, H: carte.clientHeight });
    const borner = () => {
      const { bx, by, bw, bh, W, H } = base();
      const ajuster = (t, b0, taille, vue) => {
        const plein = s * taille;
        if (plein <= vue) return (vue - plein) / 2 - b0;
        return Math.min(-b0, Math.max(vue - b0 - plein, t));
      };
      tx = ajuster(tx, bx, bw, W);
      ty = ajuster(ty, by, bh, H);
    };
    const ecran = (pin) => {
      const { bx, by, bw, bh } = base();
      return [bx + tx + s * parseFloat(pin.dataset.fx) * bw, by + ty + s * parseFloat(pin.dataset.fy) * bh];
    };

    /* --- Regroupement selon le zoom, et filtres par thème --- */
    const visible = (pin) => !themesActifs.size || pin.dataset.themes.split(" ").some((t) => themesActifs.has(t));
    const regrouper = () => {
      groupes = new Map();
      const meneuses = [];
      pins.forEach((pin) => {
        pin.classList.remove("is-grouped");
        const cpt = $(".pin-count", pin);
        if (cpt) cpt.remove();
        if (!visible(pin)) { pin.hidden = true; return; }
        pin.hidden = false;
        const [px, py] = ecran(pin);
        const proche = meneuses.find((m) => Math.hypot(m.px - px, m.py - py) < RAYON);
        if (proche) {
          groupes.get(proche.pin).push(pin);
          pin.hidden = true;
        } else {
          meneuses.push({ pin, px, py });
          groupes.set(pin, [pin]);
        }
      });
      groupes.forEach((membres, pin) => {
        if (membres.length < 2) return;
        pin.classList.add("is-grouped");
        const c = document.createElement("span");
        c.className = "pin-count";
        c.textContent = `+${membres.length - 1}`;
        $(".pin-label", pin).append(c);
      });
      if (active && active.hidden) fermer();
    };

    /* --- Application du zoom --- */
    let rafId = 0;
    const appliquer = (anime) => {
      borner();
      inner.classList.toggle("is-animating", !!anime && !reduit);
      inner.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      inner.style.setProperty("--inv", (1 / s).toFixed(4));
      carte.classList.toggle("is-zoomed", s > 1.01);
      btnMoins.disabled = s <= 1.01;
      btnPlus.disabled = s >= S_MAX - 0.01;
      if (s >= 2.5 && !detailDemande) chargerDetail();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { regrouper(); if (active) { placer(active); viser(active); } });
    };
    const zoomerEn = (facteur, mx, my, anime) => {
      const { bx, by } = base();
      const s2 = Math.min(S_MAX, Math.max(1, s * facteur));
      const u = (mx - bx - tx) / s;
      const v = (my - by - ty) / s;
      s = s2;
      tx = mx - bx - s * u;
      ty = my - by - s * v;
      appliquer(anime);
    };
    const cadrer = (x0, y0, x1, y1, anime = true) => {
      const { bx, by, bw, bh, W, H } = base();
      const larg = Math.max((x1 - x0) * bw, 1);
      const haut = Math.max((y1 - y0) * bh, 1);
      s = Math.min(S_MAX, Math.max(1, Math.min(W / larg, H / haut) * 0.9));
      tx = W / 2 - bx - s * ((x0 + x1) / 2) * bw;
      ty = H / 2 - by - s * ((y0 + y1) / 2) * bh;
      appliquer(anime);
    };
    const reinitialiser = (anime = true) => { s = 1; tx = 0; ty = 0; appliquer(anime); };
    const marquerRegion = (bouton) => regions.forEach((r) => { const on = r === bouton; r.classList.toggle("is-on", on); r.setAttribute("aria-pressed", String(on)); });

    /* --- Tracé détaillé des frontières, chargé au premier zoom --- */
    function chargerDetail() {
      detailDemande = true;
      fetch("/assets/monde-detail.txt").then((r) => (r.ok ? r.text() : Promise.reject())).then((d) => { if (d) terres.setAttribute("d", d); }).catch(() => {});
    }

    /* --- Fiche épisode --- */
    const remplir = (pin, membres) => {
      const d = pin.dataset;
      const champ = (n) => $(`[data-f="${n}"]`, fiche);
      champ("type").textContent = d.type;
      champ("type").className = `badge b-${d.kind}`;
      champ("date").textContent = `${d.date} · ${d.duration}`;
      champ("place").textContent = d.place;
      champ("place").hidden = !d.place;
      champ("title").textContent = d.title;
      champ("title").href = `/episodes/${d.id}/`;
      champ("summary").textContent = d.summary;
      champ("link").href = `/episodes/${d.id}/`;
      const autres = champ("others");
      autres.textContent = "";
      const liste = (membres || []).filter((m) => m !== pin).slice(0, 5);
      autres.hidden = !liste.length;
      if (liste.length) {
        autres.append("Aussi ici : ");
        liste.forEach((m, i) => {
          const a = document.createElement("a");
          a.href = `/episodes/${m.dataset.id}/`;
          a.textContent = `${m.dataset.place} · ${m.dataset.title}`;
          autres.append(a);
          if (i < liste.length - 1) autres.append(" · ");
        });
      }
      const bouton = champ("play");
      bouton.dataset.src = d.src;
      bouton.dataset.title = d.title;
      bouton.dataset.id = d.id;
    };

    const mobile = () => window.matchMedia("(max-width: 760px)").matches;
    function placer(pin) {
      if (mobile()) { fiche.style.left = ""; fiche.style.top = ""; return; }
      const c = carte.getBoundingClientRect();
      const p = $(".pin-dot", pin).getBoundingClientRect();
      const w = fiche.offsetWidth;
      const h = fiche.offsetHeight;
      const px = p.left + p.width / 2 - c.left;
      const py = p.top + p.height / 2 - c.top;
      const aDroite = px + 28 + w <= c.width - 12;
      const left = aDroite ? px + 28 : Math.max(12, px - 28 - w);
      const top = Math.max(12, Math.min(c.height - h - 12, py - h / 2));
      fiche.style.left = `${left}px`;
      fiche.style.top = `${top}px`;
      fiche.style.setProperty("--ox", aDroite ? "0%" : "100%");
      fiche.style.setProperty("--oy", `${py - top}px`);
    }
    const ouvrir = (pin) => {
      if (active) active.classList.remove("is-active");
      active = pin;
      pin.classList.add("is-active");
      pin.setAttribute("aria-expanded", "true");
      remplir(pin, groupes.get(pin));
      fiche.hidden = false;
      placer(pin);
      viser(pin);
      if (mobile()) {
        const haut = carte.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo({ top: haut, behavior: reduit ? "auto" : "smooth" });
      }
      marquer();
    };
    function fermer() {
      if (active) { active.classList.remove("is-active"); active.setAttribute("aria-expanded", "false"); }
      const precedente = active;
      active = null;
      fiche.hidden = true;
      repos();
      return precedente;
    }

    // Toucher une épingle : un groupe encore serré se déplie (zoom), sinon la fiche s'ouvre.
    const toucher = (pin) => {
      const membres = groupes.get(pin) || [pin];
      if (membres.length > 1 && s < S_MAX - 0.01) {
        const fx = membres.map((m) => parseFloat(m.dataset.fx));
        const fy = membres.map((m) => parseFloat(m.dataset.fy));
        const marge = 0.01;
        const avant = s;
        fermer();
        cadrer(Math.min(...fx) - marge, Math.min(...fy) - marge, Math.max(...fx) + marge, Math.max(...fy) + marge);
        marquerRegion(null);
        if (s > avant * 1.05) return;
      }
      if (active === pin) fermer(); else ouvrir(pin);
    };

    pins.forEach((pin) => {
      pin.setAttribute("aria-expanded", "false");
      pin.setAttribute("aria-controls", "pin-card");
      pin.addEventListener("mouseenter", () => viser(pin));
      pin.addEventListener("focus", () => viser(pin));
      pin.addEventListener("mouseleave", repos);
      pin.addEventListener("blur", repos);
      pin.addEventListener("click", (e) => { if (glisse) { e.preventDefault(); return; } toucher(pin); });
    });
    $(".pin-card-close", fiche).addEventListener("click", () => { const p = fermer(); p && p.focus(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && active) { const p = fermer(); p && p.focus(); } });
    document.addEventListener("click", (e) => { if (active && !e.target.closest(".pin, #pin-card")) fermer(); });

    /* --- Boutons, régions, filtres --- */
    btnPlus.addEventListener("click", () => { fermer(); zoomerEn(2, carte.clientWidth / 2, carte.clientHeight / 2, true); marquerRegion(null); });
    btnMoins.addEventListener("click", () => {
      fermer();
      if (s / 2 <= 1.01) { reinitialiser(); marquerRegion(regions[0]); }
      else { zoomerEn(0.5, carte.clientWidth / 2, carte.clientHeight / 2, true); marquerRegion(null); }
    });
    regions.forEach((r) => r.addEventListener("click", () => {
      fermer();
      marquerRegion(r);
      if (!r.dataset.box) return reinitialiser();
      const [x0, y0, x1, y1] = r.dataset.box.split(",").map(Number);
      cadrer(x0, y0, x1, y1);
    }));
    const majFiltres = () => {
      filtres.forEach((f) => { const on = themesActifs.has(f.dataset.theme); f.classList.toggle("is-on", on); f.setAttribute("aria-pressed", String(on)); });
      resets.forEach((r) => { r.hidden = !themesActifs.size; });
      carte.classList.toggle("is-filtered", themesActifs.size > 0);
      regrouper();
    };
    filtres.forEach((f) => f.addEventListener("click", () => {
      const t = f.dataset.theme;
      themesActifs.has(t) ? themesActifs.delete(t) : themesActifs.add(t);
      majFiltres();
    }));
    resets.forEach((r) => r.addEventListener("click", () => { themesActifs.clear(); majFiltres(); }));

    /* --- Molette (avec Ctrl ou ⌘), double-clic, glisser, pincer --- */
    let astuceTimer;
    carte.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) {
        if (astuce) { astuce.classList.add("is-on"); clearTimeout(astuceTimer); astuceTimer = setTimeout(() => astuce.classList.remove("is-on"), 1400); }
        return;
      }
      e.preventDefault();
      fermer();
      const c = carte.getBoundingClientRect();
      zoomerEn(Math.exp(-e.deltaY * 0.0022), e.clientX - c.left, e.clientY - c.top, false);
      marquerRegion(null);
    }, { passive: false });
    carte.addEventListener("dblclick", (e) => {
      if (e.target.closest(".pin, .zoom, .map-legend")) return;
      const c = carte.getBoundingClientRect();
      fermer();
      zoomerEn(2, e.clientX - c.left, e.clientY - c.top, true);
      marquerRegion(null);
    });

    const pointeurs = new Map();
    let glisse = false, depart = null, pince = null;
    carte.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".zoom, .map-legend, #pin-card") || (e.pointerType === "mouse" && e.button !== 0)) return;
      pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      glisse = false;
      depart = { x: e.clientX, y: e.clientY, tx, ty };
      if (pointeurs.size === 2) {
        const [a, b] = [...pointeurs.values()];
        pince = { d: Math.hypot(a.x - b.x, a.y - b.y), s };
      }
    });
    carte.addEventListener("pointermove", (e) => {
      if (!pointeurs.has(e.pointerId)) return;
      pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const c = carte.getBoundingClientRect();
      if (pointeurs.size === 2 && pince) {
        const [a, b] = [...pointeurs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        glisse = true;
        fermer();
        zoomerEn((pince.s * d) / pince.d / s, (a.x + b.x) / 2 - c.left, (a.y + b.y) / 2 - c.top, false);
        marquerRegion(null);
        return;
      }
      const dx = e.clientX - depart.x;
      const dy = e.clientY - depart.y;
      if (!glisse && Math.hypot(dx, dy) < 6) return;
      const { bw, W } = base();
      if (!glisse && s <= 1.01 && bw <= W + 1) return; // rien à déplacer à l'échelle 1
      if (!glisse) { glisse = true; carte.setPointerCapture(e.pointerId); carte.classList.add("is-dragging"); fermer(); }
      tx = depart.tx + dx;
      ty = depart.ty + dy;
      appliquer(false);
    });
    const lacher = (e) => {
      pointeurs.delete(e.pointerId);
      if (pointeurs.size < 2) pince = null;
      if (pointeurs.size === 0) {
        carte.classList.remove("is-dragging");
        setTimeout(() => { glisse = false; }, 0);
      }
    };
    carte.addEventListener("pointerup", lacher);
    carte.addEventListener("pointercancel", lacher);

    window.addEventListener("resize", () => appliquer(false));
    appliquer(false);

    // Accueil : la boussole se tourne vers l'épisode le plus récent.
    const recent = $(".pin.is-latest", carte);
    if (recent && !reduit) setTimeout(() => viser(recent), 700);
  }

  /* ---------- Épisodes : filtres, thèmes, recherche ---------- */
  const liste = $("#ep-list");
  if (liste) {
    const items = $$(".ep", liste);
    const vide = $("#ep-empty");
    const plus = $("#more");
    const etatTheme = $("#active-theme");
    const noms = {};
    $$(".legend-row").forEach((r) => { noms[r.dataset.themeLink] = r.querySelector("strong").textContent; });
    const PAGE = 12;
    let limite = PAGE;
    let type = "";
    let theme = "";
    let q = "";

    const normaliser = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    const appliquer = () => {
      const termes = normaliser(q).split(/\s+/).filter(Boolean);
      let visibles = 0;
      items.forEach((li) => {
        const ok = (!type || li.dataset.type === type)
          && (!theme || li.dataset.themes.split(" ").includes(theme))
          && termes.every((t) => normaliser(li.dataset.search).includes(t));
        if (ok) visibles += 1;
        li.hidden = !ok || visibles > limite;
      });
      vide.hidden = visibles !== 0;
      if (items.length) vide.textContent = "Aucun épisode ne correspond. Essaie un autre mot ou un autre filtre.";
      plus.hidden = visibles <= limite;
      if (theme) {
        etatTheme.hidden = false;
        etatTheme.innerHTML = "";
        const t = document.createElement("span");
        t.textContent = `Thème ${theme} · ${noms[theme] || ""}`;
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "Retirer le filtre";
        b.addEventListener("click", () => { theme = ""; appliquer(); });
        etatTheme.append(t, b);
      } else {
        etatTheme.hidden = true;
      }
    };

    $$(".chip[data-type]").forEach((c) => c.addEventListener("click", () => {
      type = c.dataset.type;
      limite = PAGE;
      $$(".chip[data-type]").forEach((x) => { x.classList.toggle("is-on", x === c); x.setAttribute("aria-pressed", String(x === c)); });
      appliquer();
    }));
    $("#q").addEventListener("input", (e) => { q = e.target.value; limite = PAGE; appliquer(); });
    plus.addEventListener("click", () => { limite += PAGE; appliquer(); });
    document.addEventListener("click", (e) => {
      const lien = e.target.closest("[data-theme-link]");
      if (!lien) return;
      e.preventDefault();
      theme = lien.dataset.themeLink;
      limite = PAGE;
      appliquer();
      $("#episodes").scrollIntoView({ behavior: reduit ? "auto" : "smooth" });
    });

    const demande = new URLSearchParams(location.search).get("theme");
    if (demande && noms[demande]) theme = demande;

    // Lien direct vers un épisode (#AAAA-MM-JJ-type) : on le montre.
    const cible = location.hash && document.getElementById(location.hash.slice(1));
    if (cible && cible.classList.contains("ep")) {
      limite = Math.max(PAGE, items.indexOf(cible) + 1);
      cible.classList.add("is-target");
    }
    appliquer();
  }

  /* ---------- Copier le flux RSS ---------- */
  $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      dire("Lien copié. Colle-le dans ton appli de podcast.");
    } catch {
      dire("Copie impossible : sélectionne le lien à la main.");
    }
  }));
})();
