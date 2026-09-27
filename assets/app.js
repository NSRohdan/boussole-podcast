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

  /* ---------- Carte : épingles, fiche, boussole ---------- */
  const carte = $("[data-map]");
  if (carte) {
    const aiguille = $(".c-needle", carte);
    const boussole = $(".compass", carte);
    const fiche = $("#pin-card");
    let active = null;

    const viser = (pin) => {
      if (!aiguille || !boussole) return;
      const a = boussole.getBoundingClientRect();
      const b = $(".pin-dot", pin).getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      aiguille.style.setProperty("--angle", `${angle.toFixed(1)}deg`);
    };
    const repos = () => {
      if (active) return viser(active);
      aiguille && aiguille.style.setProperty("--angle", "-18deg");
    };

    const remplir = (pin) => {
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
      const liste = (d.others || "").split(";;").filter(Boolean);
      autres.hidden = !liste.length;
      if (liste.length) {
        autres.append("Aussi ici : ");
        liste.forEach((item, i) => {
          const [id, texte] = item.split("|");
          const a = document.createElement("a");
          a.href = `/episodes/${id}/`;
          a.textContent = texte;
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
    const placer = (pin) => {
      if (mobile()) {
        fiche.style.left = "";
        fiche.style.top = "";
        return;
      }
      // Desktop : la fiche se place à côté de l'épingle, du côté où il y a de la place.
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
    };

    const ouvrir = (pin) => {
      if (active) active.classList.remove("is-active");
      active = pin;
      pin.classList.add("is-active");
      pin.setAttribute("aria-expanded", "true");
      remplir(pin);
      fiche.hidden = false;
      placer(pin);
      viser(pin);
      if (mobile()) {
        const haut = carte.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo({ top: haut, behavior: reduit ? "auto" : "smooth" });
      }
      marquer();
    };
    const fermer = () => {
      if (active) {
        active.classList.remove("is-active");
        active.setAttribute("aria-expanded", "false");
      }
      const precedente = active;
      active = null;
      fiche.hidden = true;
      repos();
      return precedente;
    };

    $$(".pin", carte).forEach((pin) => {
      pin.setAttribute("aria-expanded", "false");
      pin.setAttribute("aria-controls", "pin-card");
      pin.addEventListener("mouseenter", () => viser(pin));
      pin.addEventListener("focus", () => viser(pin));
      pin.addEventListener("mouseleave", repos);
      pin.addEventListener("blur", repos);
      pin.addEventListener("click", () => (active === pin ? fermer() : ouvrir(pin)));
    });
    $(".pin-card-close", fiche).addEventListener("click", () => { const p = fermer(); p && p.focus(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && active) { const p = fermer(); p && p.focus(); } });
    document.addEventListener("click", (e) => { if (active && !e.target.closest(".pin, #pin-card")) fermer(); });
    window.addEventListener("resize", () => { if (active) { placer(active); viser(active); } });

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
