/* ============================================================
   SIGNAL — main.js
   1. Effet signature « decode » (scramble de texte)
   2. Curseur custom + boutons magnétiques
   3. Navigation : rail vertical + sommaire plein écran
   4. Reveals au scroll (GSAP / ScrollTrigger)
   5. Marquees de compétences
   6. Tilt + halo des project cards
   7. Scène Three.js (icosaèdre bruité en vertex shader)
   ============================================================ */

import * as THREE from "three";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const isMobile = window.matchMedia("(max-width: 640px)").matches;

/* ------------------------------------------------------------
   1. Effet signature : decode / scramble
   ------------------------------------------------------------ */
const GLYPHS = "!<>-_\\/[]{}—=+*^?#01";

function scramble(el, duration = 0.6) {
  const original = el.dataset.text ?? (el.dataset.text = el.textContent);
  const start = performance.now();
  const total = duration * 1000;
  cancelAnimationFrame(el._scrambleRaf);

  const tick = (now) => {
    const p = Math.min((now - start) / total, 1);
    const resolved = Math.floor(original.length * p);
    let out = original.slice(0, resolved);
    for (let i = resolved; i < original.length; i++) {
      out += original[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) el._scrambleRaf = requestAnimationFrame(tick);
  };
  el._scrambleRaf = requestAnimationFrame(tick);
}

// au hover sur tout élément marqué data-scramble
if (!prefersReducedMotion) {
  document.querySelectorAll("[data-scramble]").forEach((el) => {
    const target = el.closest("a, button") ?? el;
    target.addEventListener("mouseenter", () => scramble(el));
  });
}

/* ------------------------------------------------------------
   2. Curseur custom + magnétisme des boutons (desktop)
   ------------------------------------------------------------ */
if (isFinePointer && !prefersReducedMotion) {
  const cursor = document.querySelector(".cursor");
  const dot = cursor.querySelector(".cursor__dot");
  const ring = cursor.querySelector(".cursor__ring");
  let mx = -100, my = -100, rx = -100, ry = -100;

  window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });

  (function loop() {
    // le ring traîne derrière le dot (lerp)
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  })();

  document.querySelectorAll("a, button").forEach((el) => {
    el.addEventListener("mouseenter", () => cursor.classList.add("is-hover"));
    el.addEventListener("mouseleave", () => cursor.classList.remove("is-hover"));
  });

  // boutons magnétiques : attirés par le curseur
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      gsap.to(el, { x: x * 0.25, y: y * 0.3, duration: 0.4, ease: "power2.out" });
    });
    el.addEventListener("mouseleave", () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
    });
  });
}

/* ------------------------------------------------------------
   3. Navigation : sommaire plein écran + rail
   ------------------------------------------------------------ */
const overlay = document.getElementById("overlay");
const menuBtn = document.getElementById("menuBtn");
const overlayItems = overlay.querySelectorAll(".overlay__item");
let menuOpen = false;

const menuTl = gsap.timeline({ paused: true })
  .set(overlay, { visibility: "visible" })
  .to(overlay, { clipPath: "inset(0 0 0% 0)", duration: 0.6, ease: "power3.inOut" })
  .from(overlayItems, { y: 60, opacity: 0, stagger: 0.06, duration: 0.5, ease: "power3.out" }, "-=0.2");

function toggleMenu(open) {
  menuOpen = open ?? !menuOpen;
  menuBtn.setAttribute("aria-expanded", String(menuOpen));
  overlay.setAttribute("aria-hidden", String(!menuOpen));
  menuOpen ? menuTl.play() : menuTl.reverse();
}

menuBtn.addEventListener("click", () => toggleMenu());
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && menuOpen) toggleMenu(false); });

// clic sur un lien (overlay ou rail) → scroll fluide
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    if (menuOpen) toggleMenu(false);
    gsap.to(window, { scrollTo: { y: target, autoKill: true }, duration: 1, ease: "power3.inOut" });
  });
});

// rail : section active + indicateur coulissant
const railItems = [...document.querySelectorAll(".rail__item")];
const indicator = document.querySelector(".rail__indicator");

function setActive(id) {
  railItems.forEach((item, i) => {
    const active = item.getAttribute("href") === `#${id}`;
    item.classList.toggle("is-active", active);
    if (active && indicator) {
      indicator.style.transform = `translateY(${item.offsetTop}px)`;
    }
  });
}

document.querySelectorAll("[data-section]").forEach((section) => {
  ScrollTrigger.create({
    trigger: section,
    start: "top 50%",
    end: "bottom 50%",
    onEnter: () => setActive(section.id),
    onEnterBack: () => setActive(section.id),
  });
});

/* ------------------------------------------------------------
   4. Reveals au scroll
   ------------------------------------------------------------ */
if (!prefersReducedMotion) {
  // intro du hero
  gsap.timeline({ defaults: { ease: "power3.out" } })
    .from(".hero__eyebrow", { y: 20, opacity: 0, duration: 0.7, delay: 0.15 })
    .from(".hero__line > span", { yPercent: 110, duration: 1, stagger: 0.12 }, "-=0.4")
    .from(".hero__tagline", { y: 24, opacity: 0, duration: 0.7 }, "-=0.5")
    .from(".hero__cta .btn", { y: 24, opacity: 0, stagger: 0.1, duration: 0.6 }, "-=0.4")
    .from(".hero__hint", { opacity: 0, duration: 0.8 }, "-=0.2");

  // blocs simples
  gsap.utils.toArray("[data-reveal]").forEach((el) => {
    gsap.from(el, {
      y: 50, opacity: 0, duration: 0.9, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 82%" },
    });
  });

  // grilles : enfants en stagger
  gsap.utils.toArray("[data-reveal-stagger]").forEach((grid) => {
    gsap.from(grid.children, {
      y: 60, opacity: 0, duration: 0.8, stagger: 0.12, ease: "power3.out",
      scrollTrigger: { trigger: grid, start: "top 80%" },
    });
  });

  // grande phrase "à propos" : reveal mot à mot
  const statement = document.querySelector("[data-reveal-lines]");
  if (statement) {
    const words = statement.innerHTML.trim().split(/\s+/);
    statement.innerHTML = words
      .map((w) => `<span class="w" style="display:inline-block">${w}</span>`)
      .join(" ");
    gsap.from(statement.querySelectorAll(".w"), {
      y: 26, opacity: 0, duration: 0.55, stagger: 0.025, ease: "power2.out",
      scrollTrigger: { trigger: statement, start: "top 78%" },
    });
  }

  // scanlines : la ligne acide balaye le titre de section
  gsap.utils.toArray(".scanline").forEach((line) => {
    gsap.fromTo(line, { "--scan": "0%" }, {
      "--scan": "100%", duration: 1.4, ease: "power2.inOut",
      scrollTrigger: { trigger: line, start: "top 85%" },
    });
  });

  // scramble des titres de projets quand ils apparaissent
  gsap.utils.toArray(".project-card__title").forEach((title) => {
    ScrollTrigger.create({
      trigger: title, start: "top 85%", once: true,
      onEnter: () => scramble(title, 0.8),
    });
  });
}

/* ------------------------------------------------------------
   5. Marquees (défilement infini, directions alternées)
   ------------------------------------------------------------ */
if (!prefersReducedMotion) {
  document.querySelectorAll(".marquee").forEach((m) => {
    const track = m.querySelector(".marquee__track");
    const dir = m.dataset.dir === "right" ? 1 : -1;
    // le contenu est dupliqué dans le HTML : on boucle sur 50 %
    gsap.fromTo(track,
      { xPercent: dir === 1 ? -50 : 0 },
      { xPercent: dir === 1 ? 0 : -50, duration: 28, ease: "none", repeat: -1 });
  });
}

/* ------------------------------------------------------------
   6. Project cards : tilt 3D + halo suiveur
   ------------------------------------------------------------ */
if (isFinePointer && !prefersReducedMotion) {
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      // halo radial
      card.style.setProperty("--mx", `${px * 100}%`);
      card.style.setProperty("--my", `${py * 100}%`);
      // tilt subtil
      gsap.to(card, {
        rotateY: (px - 0.5) * 7,
        rotateX: (0.5 - py) * 7,
        transformPerspective: 900,
        duration: 0.5, ease: "power2.out",
      });
    });
    card.addEventListener("mouseleave", () => {
      gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" });
    });
  });
}

/* ------------------------------------------------------------
   7. Scène Three.js — « le signal »
   Icosaèdre wireframe + nuage de points, déformés par un bruit
   simplex calculé dans le vertex shader (GPU → 60fps).
   ------------------------------------------------------------ */
const canvas = document.getElementById("scene");

// bruit simplex 3D (Ashima / Ian McEwan, domaine public)
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

// déplacement commun : chaque sommet est poussé le long de sa normale
const DISPLACE_GLSL = /* glsl */ `
  vec3 dir = normalize(position);
  float n = snoise(dir * 1.9 + uTime * 0.22);
  vec3 displaced = position + dir * n * uAmp;
`;

function initScene() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 30);
  camera.position.z = 5.2;

  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.35 },
    uAcid: { value: new THREE.Color(0xc6f32d) },
    uViolet: { value: new THREE.Color(0x7c6cff) },
  };

  // --- maillage wireframe (la structure du signal) ---
  const wireGeo = new THREE.IcosahedronGeometry(1.7, isMobile ? 2 : 3);
  const wireMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: NOISE_GLSL + `
      uniform float uTime; uniform float uAmp;
      varying float vNoise; varying float vDepth;
      void main() {
        ${DISPLACE_GLSL}
        vNoise = n;
        vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uAcid; uniform vec3 uViolet;
      varying float vNoise; varying float vDepth;
      void main() {
        // les crêtes du bruit passent au lime, les creux au violet
        vec3 col = mix(uViolet, uAcid, smoothstep(-0.6, 0.8, vNoise));
        // fog maison : les lignes lointaines s'éteignent → profondeur
        float fade = smoothstep(7.5, 3.5, vDepth);
        gl_FragColor = vec4(col, 0.34 * fade);
      }`,
  });
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(wireGeo), wireMat);
  scene.add(wire);

  // --- nuage de points (l'énergie du signal) ---
  const ptsGeo = new THREE.IcosahedronGeometry(1.7, isMobile ? 3 : 4);
  const ptsMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: NOISE_GLSL + `
      uniform float uTime; uniform float uAmp;
      varying float vNoise; varying float vDepth;
      void main() {
        ${DISPLACE_GLSL}
        vNoise = n;
        vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
        vDepth = -mv.z;
        gl_PointSize = (28.0 / vDepth) * (0.7 + 0.5 * n);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uAcid; uniform vec3 uViolet;
      varying float vNoise; varying float vDepth;
      void main() {
        // point rond avec bord doux
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        vec3 col = mix(uViolet, uAcid, smoothstep(-0.5, 0.9, vNoise));
        float fade = smoothstep(7.5, 3.5, vDepth);
        gl_FragColor = vec4(col, (1.0 - d * 2.0) * 0.85 * fade);
      }`,
  });
  const points = new THREE.Points(ptsGeo, ptsMat);
  scene.add(points);

  const group = new THREE.Group();
  group.add(wire, points);
  scene.add(group);
  // sur desktop, l'objet est décalé à droite pour laisser respirer le titre
  group.position.x = isMobile ? 0 : 1.4;

  // --- réactivité souris + scroll ---
  const target = { rx: 0, ry: 0, amp: 0.35 };
  if (isFinePointer) {
    window.addEventListener("mousemove", (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      target.ry = nx * 0.55;
      target.rx = ny * 0.4;
      // le bruit s'intensifie près des bords → le signal "répond"
      target.amp = 0.35 + Math.hypot(nx, ny) * 0.22;
    });
  }
  let scrollT = 0;
  ScrollTrigger.create({
    trigger: "#hero", start: "top top", end: "bottom top", scrub: true,
    onUpdate: (self) => { scrollT = self.progress; },
  });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // --- boucle de rendu, mise en pause quand le hero est hors écran ---
  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; })
    .observe(canvas);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden) return; // économise GPU/batterie
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    uniforms.uAmp.value += (target.amp - uniforms.uAmp.value) * 0.05;

    // rotation de base + inertie vers la cible souris + réaction au scroll
    group.rotation.y += ((t * 0.12 + target.ry + scrollT * 2.2) - group.rotation.y) * 0.05;
    group.rotation.x += ((target.rx + scrollT * 0.8) - group.rotation.x) * 0.05;
    group.position.y = scrollT * 1.6;            // le signal s'élève au scroll
    const s = 1 - scrollT * 0.25;                // et recule légèrement
    group.scale.setScalar(s);

    renderer.render(scene, camera);
  });
}

// lazy init : la 3D ne démarre qu'une fois la page prête
// (affichée même en mouvement réduit — elle est lente et non essentielle)
requestAnimationFrame(() => initScene());
