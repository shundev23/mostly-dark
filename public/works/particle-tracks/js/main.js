// 素粒子の軌跡 — 3D表示とパネルの制御（three.js r128 のグローバル THREE を使う）
(() => {
  "use strict";

  /* ================= 小道具 ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const clamp01 = (x) => clamp(x, 0, 1);
  const lerp = (a, b, f) => a + (b - a) * f;
  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  const fmt = (x, d = 1) => Number(x).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  const sup = (n) => String(n).split("").map((c) => SUP[c] || c).join("");
  const chip = (c, label, kind = "") => `<li><i class="${kind}" style="--c:${c}"></i><span>${label}</span></li>`;

  const rootStyle = getComputedStyle(document.documentElement);
  const C = {};
  ["proton", "higgs", "photon", "electron", "muon", "tau", "nue", "numu", "nutau", "z", "hadron"].forEach((k) => {
    C[k] = rootStyle.getPropertyValue("--p-" + k).trim() || "#ffffff";
  });
  const INK3 = rootStyle.getPropertyValue("--text-3").trim() || "#8089A2";
  const reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  const viewport = $("#viewport"), panelEl = $("#panel"), hudEl = $("#hud"), labelsEl = $("#labels"), canvas = $("#gl");
  const btnPlay = $("#btn-play"), btnReplay = $("#btn-replay");

  let stepEls = [];
  const setStep = (i) => stepEls.forEach((li, k) => li.classList.toggle("on", k === i));
  let hudCache = null;
  const hud = (html) => { if (html !== hudCache) { hudEl.innerHTML = html; hudCache = html; } };

  /* ================= 3Dの準備 ================= */
  let has3D = !!(window.THREE && window.THREE.OrbitControls);
  let renderer = null, scene3 = null, camera = null, controls = null, GLOW = null, _v = null, raycaster = null;
  if (has3D) {
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { has3D = false; }
  }
  if (has3D) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x05070d, 1);
    scene3 = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.9;
    GLOW = makeGlowTexture();
    _v = new THREE.Vector3();
    raycaster = new THREE.Raycaster();
  } else {
    const fb = document.createElement("div");
    fb.className = "fallback";
    fb.textContent = window.THREE
      ? "この端末・ブラウザでは3D表示（WebGL）が使えません。説明のほうは読めます。"
      : "3D表示に必要なライブラリを読み込めませんでした。通信状況を確かめて、ページを再読み込みしてください。";
    viewport.appendChild(fb);
    btnPlay.hidden = true;
    btnReplay.hidden = true;
  }

  function makeGlowTexture() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const x = cv.getContext("2d");
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.18, "rgba(255,255,255,0.85)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.28)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  function glowSprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW, color: new THREE.Color(color), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.set(size, size, 1);
    return s;
  }

  // 伸びていく実線の飛跡（電気を持つ粒子）
  function tubeTrack(points, color, radius, opts = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, "centripetal");
    const len = curve.getLength();
    const segs = clamp(Math.round(len / (opts.step || 0.02)), 6, 420);
    const radial = 6;
    const geo = new THREE.TubeGeometry(curve, segs, radius, radial, false);
    geo.setDrawRange(0, 0);
    const op = opts.opacity == null ? 1 : opts.opacity;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: op < 1, opacity: op, depthWrite: op >= 1 }));
    const head = opts.head === false ? null : glowSprite(color, opts.headSize || radius * 16);
    if (head) head.visible = false;
    return {
      mesh, head, curve, len, f: 0,
      set(f) {
        f = clamp01(f);
        if (f === this.f && f !== 0) return;
        this.f = f;
        geo.setDrawRange(0, Math.floor(f * segs) * radial * 6);
        if (head) {
          head.visible = f > 0 && f < 1;
          if (f > 0) curve.getPointAt(f, head.position);
        }
      },
      add(group) { group.add(mesh); if (head) group.add(head); return this; },
    };
  }

  // 伸びていく点線（電気を持たない粒子）
  function dashTrack(a, b, color, opts = {}) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), a.clone()]);
    const op = opts.opacity == null ? 0.95 : opts.opacity;
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
      color, dashSize: opts.dash || 0.08, gapSize: opts.gap || 0.06, transparent: true, opacity: op, depthWrite: false,
    }));
    const head = glowSprite(color, opts.headSize || 0.2, Math.min(1, op + 0.2));
    head.visible = false;
    const posAttr = geo.attributes.position;
    const tmp = new THREE.Vector3();
    return {
      line, head, len: a.distanceTo(b), f: 0,
      set(f) {
        f = clamp01(f);
        if (f === this.f && f !== 0) return;
        this.f = f;
        tmp.copy(a).lerp(b, f);
        posAttr.setXYZ(1, tmp.x, tmp.y, tmp.z);
        posAttr.needsUpdate = true;
        line.computeLineDistances();
        geo.computeBoundingSphere();
        head.position.copy(tmp);
        head.visible = f > 0 && f < 1;
      },
      add(group) { group.add(line); group.add(head); return this; },
    };
  }

  function lineOf(points, color, opacity = 1) {
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  }

  // axis "z": xy平面の円（z=offset） / axis "y": xz平面の円（y=offset）
  function ringLine(r, axis, offset, color, opacity) {
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * TAU;
      pts.push(axis === "z"
        ? new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, offset)
        : new THREE.Vector3(Math.cos(a) * r, offset, Math.sin(a) * r));
    }
    return lineOf(pts, color, opacity);
  }

  function disposeGroup(grp) {
    grp.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m.map && m.map !== GLOW) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  /* ---------- 3D空間に貼るラベル ---------- */
  const labels = [];
  function addLabel(html, color, pos, opts = {}) {
    const el = document.createElement("div");
    el.className = "lbl" + (opts.cls ? " " + opts.cls : "");
    el.innerHTML = `<i style="background:${color}"></i><span>${html}</span>`;
    labelsEl.appendChild(el);
    const L = { el, pos: pos || null, obj: opts.follow || null, offset: opts.offset || null, tag: opts.tag || "", visible: true };
    labels.push(L);
    return L;
  }
  function removeLabels(tag) {
    for (let i = labels.length - 1; i >= 0; i--) {
      if (tag == null || labels[i].tag === tag) { labels[i].el.remove(); labels.splice(i, 1); }
    }
  }
  function updateLabels() {
    const w = labelsEl.clientWidth, h = labelsEl.clientHeight;
    for (const L of labels) {
      if (!L.visible) { L.el.style.display = "none"; continue; }
      if (L.obj) L.obj.getWorldPosition(_v); else if (L.pos) _v.copy(L.pos); else continue;
      if (L.offset) _v.add(L.offset);
      _v.project(camera);
      if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.15 || Math.abs(_v.y) > 1.15) { L.el.style.display = "none"; continue; }
      L.el.style.display = "";
      L.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -135%)`;
    }
  }

  /* ---------- 相対論的な運動学（4元運動量） ---------- */
  function boost(p, bx, by, bz) {
    const b2 = bx * bx + by * by + bz * bz;
    if (b2 < 1e-12) return { E: p.E, x: p.x, y: p.y, z: p.z };
    const g = 1 / Math.sqrt(1 - b2), bp = bx * p.x + by * p.y + bz * p.z, k = (g - 1) / b2;
    return { E: g * (p.E + bp), x: p.x + k * bp * bx + g * bx * p.E, y: p.y + k * bp * by + g * by * p.E, z: p.z + k * bp * bz + g * bz * p.E };
  }
  const betaOf = (p) => [p.x / p.E, p.y / p.E, p.z / p.E];
  function isoDir() { const c = rand(-1, 1), s = Math.sqrt(1 - c * c), ph = rand(0, TAU); return [s * Math.cos(ph), s * Math.sin(ph), c]; }
  function twoBody(M, m1, m2) {
    const p = Math.sqrt(Math.max(0, (M * M - (m1 + m2) ** 2) * (M * M - (m1 - m2) ** 2))) / (2 * M);
    const [dx, dy, dz] = isoDir();
    return [
      { E: Math.hypot(p, m1), x: p * dx, y: p * dy, z: p * dz },
      { E: Math.hypot(p, m2), x: -p * dx, y: -p * dy, z: -p * dz },
    ];
  }
  const smear = (p, rel) => { const f = 1 + gauss() * rel; return { E: p.E * f, x: p.x * f, y: p.y * f, z: p.z * f }; };
  function invMass(ps) {
    const s = ps.reduce((a, p) => ({ E: a.E + p.E, x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }), { E: 0, x: 0, y: 0, z: 0 });
    return Math.sqrt(Math.max(0, s.E * s.E - s.x * s.x - s.y * s.y - s.z * s.z));
  }

  /* ================= 場面1：ヒッグス粒子 ================= */
  function HiggsScene() {
    // 単位はメートル。大きさはCMS検出器を参考にした模式図（ミュー粒子検出器は縮めている）
    const DET = { rTrk: 1.1, rEcal: 1.25, rEcalOut: 1.6, rHcalOut: 2.35, rMu: [2.75, 3.05, 3.35], rMuOut: 3.5, half: 3.0, B: 3.8 };
    const V = 2.6; // 画面上の光速（単位/秒）
    const T = { collide: 1.0, higgsEnd: 1.9, zEnd: 2.12 };
    const hist = makeHistogram();
    const TEXT = {
      step4: {
        gg: '光子<span class="sym">γ</span>2個が電磁カロリメータに飛び込み、エネルギーが測られる。光子は電気を持たないので、飛跡検出器には跡が残らない（点線）',
        "4l": "Z粒子2個を経て、電子2個とミュー粒子2個に壊れる。電子は電磁カロリメータで止まり、ミュー粒子は検出器のいちばん外まで突き抜ける",
      },
      hist: {
        gg: "ヒッグス粒子がなくても、光子2個が出る衝突はたくさんある。1回ずつでは見分けがつかないので、衝突を大量に集めて質量のグラフを作り、125 GeVの山を探す。",
        "4l": "電子やミュー粒子が4個出る衝突は、ヒッグス粒子がなくても少しはある。数が少ないぶん、こちらは山がはっきり出やすい。",
      },
    };
    let g = null, evg = null, ev = null, o = null, t = 0, mode = "gg", ro = null;

    return {
      id: "higgs",
      aria: "陽子どうしの衝突でヒッグス粒子が生まれて壊れる様子を、検出器ごと再生する3D表示",
      cam: { pos: [5.4, 3.1, 6.6], target: [0, 0, 0], min: 2.5, max: 16 },
      replay: () => newEvent(),
      panel() {
        return `
        <h2 class="p-title">ヒッグス粒子</h2>
        <p class="p-lead">LHCで陽子どうしをぶつけ、生まれたヒッグス粒子が壊れる様子を検出器ごと再生する。</p>
        <div class="seg" role="group" aria-label="壊れ方">
          <button type="button" class="seg-btn" id="h-mode-gg" data-mode="gg" aria-pressed="${mode === "gg"}">光子2個に壊れる</button>
          <button type="button" class="seg-btn" id="h-mode-4l" data-mode="4l" aria-pressed="${mode === "4l"}">電子2個＋ミュー粒子2個</button>
        </div>
        <ol class="steps">
          <li>陽子のかたまりどうしが、ほぼ光速で正面衝突する</li>
          <li>衝突のエネルギーからヒッグス粒子が生まれる（10億回以上の衝突に1回ほど）</li>
          <li>約10<sup>−22</sup>秒で壊れる（ここでは約10<sup>22</sup>倍のスロー再生）</li>
          <li id="h-step4">${TEXT.step4[mode]}</li>
          <li>飛び出した粒子のエネルギーと向きから、元の粒子の質量を計算する（左上に表示）</li>
        </ol>
        <p class="p-side">灰色の線は、同じ衝突で一緒に出てくるほかの粒子。エネルギーが低いので磁場で大きく曲がる。ヒッグス粒子から出た粒子はエネルギーが高いので、ほぼまっすぐ飛ぶ。</p>
        <section class="block">
          <h3>1回では分からないから、たくさん集める</h3>
          <p id="h-histtext">${TEXT.hist[mode]}</p>
          <div class="hist-wrap"><canvas id="hist" role="img" aria-label="計算した質量ごとの衝突件数のグラフ"></canvas></div>
          <p class="cap">横軸は計算した質量（GeV）。点線はヒッグス粒子がなかった場合の予想で、点線から飛び出した分が山。</p>
          <p class="hist-meta" id="hist-meta"></p>
          <div class="btn-row">
            <button type="button" class="btn" id="h-100">＋100回</button>
            <button type="button" class="btn" id="h-1000">＋1,000回</button>
            <button type="button" class="btn ghost" id="h-reset">やり直す</button>
          </div>
        </section>
        <ul class="legend">
          ${chip(C.proton, "陽子", "dot")}${chip(C.higgs, "ヒッグス粒子", "dot")}${chip(C.photon, '光子 <span class="sym">γ</span>', "dash")}${chip(C.electron, '電子 <span class="sym">e</span>')}${chip(C.muon, 'ミュー粒子 <span class="sym">μ</span>')}${chip(C.z, "Z粒子", "dot")}${chip(C.hadron, "ほかの粒子")}
          <li class="legend-note">点線は電気を持たない粒子</li>
        </ul>
        <p class="note"><b>大げさにしている所</b>：時間（約10<sup>22</sup>倍スロー）。ヒッグス粒子やZ粒子の球は目印で、実際は生まれたその場で壊れる。同じ衝突で出るほかの粒子は、実際はもっと多い。グラフの山は見やすく強調していて、σの計算も簡略版。</p>`;
      },
      bind(root) {
        $$(".seg-btn[data-mode]", root).forEach((b) => b.addEventListener("click", () => {
          if (mode === b.dataset.mode) return;
          mode = b.dataset.mode;
          $$(".seg-btn[data-mode]", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          $("#h-step4", root).innerHTML = TEXT.step4[mode];
          $("#h-histtext", root).textContent = TEXT.hist[mode];
          hist.reset(mode);
          if (g) newEvent();
        }));
        const cv = $("#hist", root);
        hist.attach(cv, $("#hist-meta", root));
        if (hist.total === 0) hist.reset(mode); else hist.draw();
        $("#h-100", root).addEventListener("click", () => hist.add(100));
        $("#h-1000", root).addEventListener("click", () => hist.add(1000));
        $("#h-reset", root).addEventListener("click", () => hist.reset(mode));
        if (window.ResizeObserver) { ro = new ResizeObserver(() => hist.draw()); ro.observe(cv); }
      },
      leave() { hist.detach(); if (ro) { ro.disconnect(); ro = null; } },
      build(group) { g = group; evg = null; buildDetector(); newEvent(); },
      update(dt) {
        if (!ev) return;
        t += dt;
        const fp = clamp01(t / T.collide);
        const zp = lerp(4.4, 0.06, fp * fp);
        o.bunchA.position.z = zp;
        o.bunchB.position.z = -zp;
        o.bunchA.visible = o.bunchB.visible = t < T.collide;
        o.protonLabel.visible = t < T.collide;

        const ff = (t - T.collide) / 0.4;
        o.flash.visible = ff >= 0 && ff <= 1;
        if (o.flash.visible) { const s = Math.sin(ff * Math.PI) * 1.8; o.flash.scale.set(s, s, 1); }

        o.pile.forEach((tr) => tr.set((t - T.collide) / tr.dur));

        const hv = t >= T.collide && t < T.higgsEnd;
        o.higgs.visible = hv;
        o.higgsLabel.visible = hv;
        if (hv) { const s = 0.8 + 0.25 * Math.sin((t - T.collide) * 14); o.higgsGlow.scale.set(s, s, 1); }

        const t0 = ev.mode === "gg" ? T.higgsEnd : T.zEnd;
        if (ev.mode === "4l") {
          const zf = (t - T.higgsEnd) / (T.zEnd - T.higgsEnd + 0.18);
          const zv = zf >= 0 && zf <= 1;
          o.zflash.forEach((s, i) => { s.visible = zv; if (zv) { const k = Math.sin(zf * Math.PI) * (0.55 + i * 0.18); s.scale.set(k, k, 1); } });
          o.zLabel.visible = zv;
        }
        let allDone = true;
        o.tracks.forEach((tr) => {
          const f = (t - t0) / tr.dur;
          tr.set(f);
          tr.label.visible = f > 0.15;
          if (f >= 1) {
            if (tr.deposit) tr.deposit.visible = true;
            if (tr.hits) tr.hits.forEach((h) => { h.visible = true; });
          } else allDone = false;
        });
        if (allDone && t > t0) showResult();
        setStep(t < T.collide ? 0 : t < T.higgsEnd ? 1 : t < T.higgsEnd + 0.3 ? 2 : !allDone ? 3 : 4);
        if (t > t0 + 4.4) newEvent();
      },
    };

    function buildDetector() {
      const layers = [
        { r: DET.rTrk, color: "#7C8DB5", op: 0.07, name: "飛跡検出器" },
        { r: DET.rEcalOut, color: "#3FBF86", op: 0.05, name: "電磁カロリメータ" },
        { r: DET.rHcalOut, color: "#B8925A", op: 0.045, name: "ハドロンカロリメータ" },
        { r: DET.rMuOut, color: "#C24A58", op: 0.04, name: "ミュー粒子検出器" },
      ];
      layers.forEach((L, i) => {
        const geo = new THREE.CylinderGeometry(L.r, L.r, DET.half * 2, 80, 1, true);
        geo.rotateX(Math.PI / 2);
        g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: L.color, transparent: true, opacity: L.op, side: THREE.DoubleSide, depthWrite: false })));
        g.add(ringLine(L.r, "z", DET.half, L.color, 0.5));
        g.add(ringLine(L.r, "z", -DET.half, L.color, 0.22));
        const a = ((96 + i * 14) * Math.PI) / 180;
        addLabel(L.name, L.color, new THREE.Vector3(Math.cos(a) * L.r, Math.sin(a) * L.r, DET.half), { cls: "muted" });
      });
      DET.rMu.forEach((r) => g.add(ringLine(r, "z", DET.half, "#C24A58", 0.3)));
      const pipe = new THREE.CylinderGeometry(0.025, 0.025, 9.4, 12, 1, true);
      pipe.rotateX(Math.PI / 2);
      g.add(new THREE.Mesh(pipe, new THREE.MeshBasicMaterial({ color: "#4A5577", transparent: true, opacity: 0.6 })));
      addLabel("陽子の通り道", "#4A5577", new THREE.Vector3(0, 0, 4.4), { cls: "muted" });
    }

    function bunch() {
      const b = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const s = glowSprite(C.proton, 0.22);
        s.position.set(rand(-0.05, 0.05), rand(-0.05, 0.05), rand(-0.12, 0.12));
        b.add(s);
      }
      b.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: C.proton })));
      return b;
    }

    function genEvent(m) {
      const M = 125.1;
      const pT = Math.abs(gauss()) * 18, phi = rand(0, TAU), y = gauss();
      const mT = Math.hypot(M, pT);
      const H = { E: mT * Math.cosh(y), x: pT * Math.cos(phi), y: pT * Math.sin(phi), z: mT * Math.sinh(y) };
      const bH = betaOf(H);
      if (m === "gg") {
        const [a, b] = twoBody(M, 0, 0).map((p) => smear(boost(p, ...bH), 0.012));
        const cosA = clamp((a.x * b.x + a.y * b.y + a.z * b.z) / (a.E * b.E), -1, 1);
        return { mode: m, parts: [{ kind: "photon", p: a }, { kind: "photon", p: b }], m: Math.sqrt(2 * a.E * b.E * (1 - cosA)), E1: a.E, E2: b.E, alpha: Math.acos(cosA) };
      }
      const mZ = 91.19, mZs = 12 + 21.5 * Math.sqrt(Math.random());
      const [Z1, Z2] = twoBody(M, mZ, mZs).map((p) => boost(p, ...bH));
      const decayZ = (Z, mass, kind) => {
        const ml = kind === "muon" ? 0.1057 : 0.000511;
        return twoBody(mass, ml, ml).map((p) => smear(boost(p, ...betaOf(Z)), 0.015));
      };
      const muFirst = Math.random() < 0.5;
      const k1 = muFirst ? "muon" : "electron", k2 = muFirst ? "electron" : "muon";
      const [l1, l2] = decayZ(Z1, mZ, k1), [l3, l4] = decayZ(Z2, mZs, k2);
      const parts = [{ kind: k1, q: -1, p: l1 }, { kind: k1, q: 1, p: l2 }, { kind: k2, q: -1, p: l3 }, { kind: k2, q: 1, p: l4 }];
      return { mode: m, parts, m: invMass(parts.map((x) => x.p)) };
    }

    // 磁場（検出器の軸方向 3.8 T）の中のらせん。曲率半径 R[m] = pT[GeV] / (0.3 × B[T])
    function helixPoints(p, q, rStop, opt = {}) {
      const pT = Math.hypot(p.x, p.y), phi0 = Math.atan2(p.y, p.x), cot = p.z / pT;
      const R = pT / (0.3 * DET.B);
      const cx = q * R * Math.sin(phi0), cy = -q * R * Math.cos(phi0);
      const rField = opt.rField == null ? Infinity : opt.rField;
      const maxTurn = opt.maxTurn == null ? Infinity : opt.maxTurn;
      const pts = [new THREE.Vector3(0, 0, 0)];
      const ds = Math.max(0.004, Math.min(0.04, R * 0.08));
      let s = 0, cur = pts[0];
      while (pts.length < 1500) {
        s += ds;
        const a = s / R;
        if (a > maxTurn) break;
        const ang = -q * a, ca = Math.cos(ang), sa = Math.sin(ang);
        const x = cx - cx * ca + cy * sa;
        const y = cy - cx * sa - cy * ca;
        cur = new THREE.Vector3(x, y, s * cot);
        pts.push(cur);
        const r = Math.hypot(x, y);
        if (Math.abs(cur.z) >= DET.half) break;
        if (r >= Math.min(rStop, rField)) break;
      }
      const hits = [];
      if (rStop > rField && Math.hypot(cur.x, cur.y) >= rField - 1e-6 && Math.abs(cur.z) < DET.half && pts.length > 1) {
        const dir = cur.clone().sub(pts[pts.length - 2]).normalize();
        const hitRs = (opt.hits || []).slice();
        let P = cur.clone();
        for (let i = 0; i < 200; i++) {
          const Pn = P.clone().addScaledVector(dir, 0.05);
          const r0 = Math.hypot(P.x, P.y), r1 = Math.hypot(Pn.x, Pn.y);
          while (hitRs.length && r1 >= hitRs[0]) { hits.push(P.clone().lerp(Pn, (hitRs[0] - r0) / Math.max(1e-9, r1 - r0))); hitRs.shift(); }
          pts.push(Pn);
          P = Pn;
          if (r1 >= rStop || Math.abs(Pn.z) >= DET.half + 0.6) break;
        }
      }
      pts.hits = hits;
      return pts;
    }

    function straightEnd(d, rBarrel) {
      const tr = Math.hypot(d.x, d.y);
      const tb = tr > 1e-9 ? rBarrel / tr : Infinity;
      const te = Math.abs(d.z) > 1e-9 ? DET.half / Math.abs(d.z) : Infinity;
      return d.clone().multiplyScalar(Math.min(tb, te));
    }

    function outward(p) {
      return Math.abs(p.z) < DET.half - 1e-3 ? new THREE.Vector3(p.x, p.y, 0).normalize() : new THREE.Vector3(0, 0, Math.sign(p.z));
    }

    function deposit(end, E, color) {
      const len = 0.1 + Math.min(0.32, E / 250);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      const out = outward(end);
      m.position.copy(end).addScaledVector(out, len / 2);
      m.lookAt(m.position.clone().add(out));
      m.visible = false;
      evg.add(m);
      return m;
    }

    function hitMark(p, color) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      m.position.copy(p);
      m.lookAt(p.clone().add(outward(p)));
      m.visible = false;
      evg.add(m);
      return m;
    }

    function newEvent() {
      if (!g) return;
      if (evg) { g.remove(evg); disposeGroup(evg); }
      removeLabels("ev");
      evg = new THREE.Group();
      g.add(evg);
      t = 0;
      ev = genEvent(mode);
      o = { tracks: [], pile: [] };

      o.bunchA = bunch(); o.bunchB = bunch();
      evg.add(o.bunchA, o.bunchB);
      o.protonLabel = addLabel("陽子", C.proton, null, { follow: o.bunchA, tag: "ev" });
      o.flash = glowSprite("#ffffff", 0.01);
      evg.add(o.flash);

      o.higgs = new THREE.Group();
      o.higgs.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), new THREE.MeshBasicMaterial({ color: C.higgs })));
      o.higgsGlow = glowSprite(C.higgs, 0.9);
      o.higgs.add(o.higgsGlow);
      o.higgs.visible = false;
      evg.add(o.higgs);
      o.higgsLabel = addLabel("ヒッグス粒子 H", C.higgs, new THREE.Vector3(0, 0.06, 0), { tag: "ev" });
      o.higgsLabel.visible = false;

      // 同じ衝突で出るほかの粒子（エネルギーが低いので大きく曲がる）
      for (let i = 0; i < 26; i++) {
        const pT = 0.3 + -Math.log(1 - Math.random()) * 0.6;
        const eta = rand(-2.4, 2.4), phi = rand(0, TAU), q = Math.random() < 0.5 ? -1 : 1;
        const pts = helixPoints({ x: pT * Math.cos(phi), y: pT * Math.sin(phi), z: pT * Math.sinh(eta) }, q, DET.rTrk, { maxTurn: 1.6 * Math.PI });
        if (pts.length < 4) continue;
        const tr = tubeTrack(pts, C.hadron, 0.0055, { opacity: 0.55, head: false }).add(evg);
        tr.dur = tr.len / V;
        o.pile.push(tr);
      }

      if (ev.mode === "gg") {
        ev.parts.forEach((part) => {
          const d = new THREE.Vector3(part.p.x, part.p.y, part.p.z).normalize();
          const end = straightEnd(d, DET.rEcal);
          const tr = dashTrack(new THREE.Vector3(), end, C.photon, { dash: 0.07, gap: 0.05, headSize: 0.24 }).add(evg);
          tr.dur = Math.max(0.2, end.length() / V);
          tr.deposit = deposit(end, part.p.E, C.photon);
          tr.label = addLabel(`光子 <span class="sym">γ</span>（${fmt(part.p.E, 0)} GeV）`, C.photon, null, { follow: tr.head, tag: "ev" });
          tr.label.visible = false;
          o.tracks.push(tr);
        });
      } else {
        o.zflash = [glowSprite(C.z, 0.01), glowSprite(C.z, 0.01)];
        o.zflash.forEach((s) => evg.add(s));
        o.zLabel = addLabel("Z粒子 ×2（すぐ壊れる）", C.z, new THREE.Vector3(0, -0.06, 0), { tag: "ev" });
        o.zLabel.visible = false;
        ev.parts.forEach((part) => {
          const isMu = part.kind === "muon";
          const color = isMu ? C.muon : C.electron;
          const pts = helixPoints(part.p, part.q, isMu ? DET.rMuOut : DET.rEcal, { rField: DET.rHcalOut, hits: isMu ? DET.rMu : null });
          const tr = tubeTrack(pts, color, 0.012, { headSize: 0.2 }).add(evg);
          tr.dur = Math.max(0.2, tr.len / V);
          if (isMu) tr.hits = pts.hits.map((h) => hitMark(h, C.muon));
          else tr.deposit = deposit(pts[pts.length - 1], part.p.E, C.electron);
          const sign = part.q < 0 ? "<sup>−</sup>" : "<sup>+</sup>";
          tr.label = addLabel(isMu ? `ミュー粒子 <span class="sym">μ${sign}</span>` : `電子 <span class="sym">e${sign}</span>`, color, null, { follow: tr.head, tag: "ev" });
          tr.label.visible = false;
          o.tracks.push(tr);
        });
      }
      hud('<div class="hud-dim">衝突を再生中…</div>');
    }

    function showResult() {
      if (ev.shown) return;
      ev.shown = true;
      if (ev.mode === "gg") {
        hud(`<div class="hud-title">この衝突から計算すると</div>
          <div class="hud-row"><span>光子1のエネルギー</span><b>${fmt(ev.E1)} GeV</b></div>
          <div class="hud-row"><span>光子2のエネルギー</span><b>${fmt(ev.E2)} GeV</b></div>
          <div class="hud-row"><span>2個の開き角</span><b>${fmt((ev.alpha * 180) / Math.PI, 0)}°</b></div>
          <div class="hud-eq"><span class="sym">m = √(2E₁E₂(1 − cos α))</span> = <b>${fmt(ev.m)} GeV</b></div>`);
      } else {
        hud(`<div class="hud-title">この衝突から計算すると</div>
          <div class="hud-row"><span>レプトン4個のエネルギー</span><b>${ev.parts.map((x) => fmt(x.p.E, 0)).join(" / ")} GeV</b></div>
          <div class="hud-eq">4個から計算した質量 = <b>${fmt(ev.m)} GeV</b></div>`);
      }
    }
  }

  /* ---------- 質量のヒストグラム（2D） ---------- */
  function makeHistogram() {
    const lo = 100, hi = 160, bw = 2, n = (hi - lo) / bw;
    // sig: 集めた衝突のうちヒッグス由来の割合（見やすさのため実際より多め）
    const CFG = { gg: { sig: 0.09, sigma: 1.6, flat: false, k: 0.035 }, "4l": { sig: 0.5, sigma: 1.8, flat: true } };
    const bins = new Array(n).fill(0);
    let mode = "gg", total = 0, cv = null, meta = null;
    const shapeFrac = (a, b) => {
      const c = CFG[mode];
      if (c.flat) return (b - a) / (hi - lo);
      const F = (x) => 1 - Math.exp(-c.k * (x - lo));
      return (F(b) - F(a)) / F(hi);
    };
    const sampleBkg = () => {
      const c = CFG[mode];
      if (c.flat) return rand(lo, hi);
      return lo - Math.log(1 - Math.random() * (1 - Math.exp(-c.k * (hi - lo)))) / c.k;
    };
    function add(N) {
      const c = CFG[mode];
      for (let i = 0; i < N; i++) {
        const m = Math.random() < c.sig ? 125.1 + gauss() * c.sigma : sampleBkg();
        const b = Math.floor((m - lo) / bw);
        if (b >= 0 && b < n) { bins[b]++; total++; }
      }
      draw();
    }
    function reset(m) { mode = m || mode; bins.fill(0); total = 0; add(300); }
    // 山の外側（サイドバンド）から背景の量を見積もり、122〜128 GeVの超過を (N − B)/√B で表す簡略版
    function estimate() {
      const wLo = 122, wHi = 128;
      let nW = 0, nS = 0;
      bins.forEach((v, i) => { const a = lo + i * bw; if (a >= wLo && a + bw <= wHi) nW += v; else nS += v; });
      const fW = shapeFrac(wLo, wHi), fS = 1 - fW;
      const Btot = nS / fS, B = Btot * fW;
      return { Btot, z: B > 0 ? (nW - B) / Math.sqrt(B) : null };
    }
    function draw() {
      if (!cv) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const x = cv.getContext("2d");
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, W, H);
      const padL = 32, padR = 8, padT = 14, padB = 20, pw = W - padL - padR, ph = H - padT - padB;
      const est = estimate();
      const maxBin = Math.max(0, ...bins);
      const expMax = est.Btot > 0 ? est.Btot * shapeFrac(lo, lo + bw) : 0;
      const top = Math.max(4, maxBin, expMax) * 1.15;
      const X = (m) => padL + ((m - lo) / (hi - lo)) * pw;
      const Y = (v) => padT + ph - (v / top) * ph;

      x.fillStyle = "rgba(255,181,71,0.12)";
      x.fillRect(X(122), padT, X(128) - X(122), ph);
      x.fillStyle = C.higgs;
      x.font = "500 10px 'IBM Plex Mono', monospace";
      x.textAlign = "center";
      x.fillText("125", X(125), padT - 3);

      x.fillStyle = "#6C7CA6";
      bins.forEach((v, i) => {
        if (!v) return;
        const a = X(lo + i * bw) + 1, b = X(lo + (i + 1) * bw) - 1;
        x.fillRect(a, Y(v), Math.max(1, b - a), padT + ph - Y(v));
      });

      if (est.Btot > 0) {
        x.strokeStyle = "rgba(230,234,243,0.8)";
        x.lineWidth = 1.2;
        x.setLineDash([4, 3]);
        x.beginPath();
        for (let i = 0; i < n; i++) {
          const a = lo + i * bw, px = X(a + bw / 2), py = Y(est.Btot * shapeFrac(a, a + bw));
          if (i) x.lineTo(px, py); else x.moveTo(px, py);
        }
        x.stroke();
        x.setLineDash([]);
      }

      x.strokeStyle = "#2A3558";
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(padL, padT + ph + 0.5);
      x.lineTo(padL + pw, padT + ph + 0.5);
      x.stroke();
      x.fillStyle = INK3;
      x.font = "400 10px 'IBM Plex Mono', monospace";
      x.textAlign = "center";
      [100, 110, 120, 130, 140, 150, 160].forEach((m) => x.fillText(String(m), X(m), H - 6));
      if (maxBin > 0) {
        x.textAlign = "right";
        x.fillText(String(maxBin), padL - 5, Y(maxBin) + 3);
        x.strokeStyle = "#2A3558";
        x.beginPath();
        x.moveTo(padL - 3, Y(maxBin) + 0.5);
        x.lineTo(padL, Y(maxBin) + 0.5);
        x.stroke();
      }

      if (meta) {
        const z = est.z;
        const zText = z == null ? "—" : `${fmt(Math.max(0, z), 1)}σ`;
        meta.innerHTML = `集めた衝突 <b class="stat">${total.toLocaleString("ja-JP")}</b> 件 ／ 山の大きさ <b class="stat">${zText}</b>${z != null && z >= 5 ? '<span class="badge">5σ超え：発見と言える水準</span>' : ""}`;
      }
    }
    return {
      attach(canvasEl, metaEl) { cv = canvasEl; meta = metaEl; },
      detach() { cv = null; meta = null; },
      add, reset, draw,
      get total() { return total; },
    };
  }

  /* ================= 場面2：ミュー粒子 ================= */
  function MuonScene() {
    const V = 3.0;            // 画面上の光速：3 km/秒（実際の約10万分の1）
    const C_KM_US = 0.29979;  // 光速 km/マイクロ秒
    const CTAU = 0.6586;      // 寿命2.197マイクロ秒 × 光速 = 約0.659 km
    const STEP4 = {
      on: "でも速く動くものは、時間がゆっくり進む（ここでは約20〜90倍）。だから多くが地上まで届く",
      off: "時間の遅れがないと、ほとんどが途中で壊れて地上に届かない。これは実際の観測と合わない",
    };
    let g = null, evg = null, sh = null, t = 0, rel = true;
    let stats = { born: 0, done: 0, arrived: 0 }, statsEl = null, statsCache = "";

    return {
      id: "muon",
      aria: "宇宙線から生まれたミュー粒子が、上空15kmから地上へ降ってくる様子を再生する3D表示",
      cam: { pos: [15.5, 8.5, 17], target: [0, 7.2, 0], min: 8, max: 45 },
      replay: () => newShower(),
      panel() {
        return `
        <h2 class="p-title">ミュー粒子</h2>
        <p class="p-lead">宇宙から来た陽子が上空で空気にぶつかり、できたミュー粒子が地上へ降ってくる。地上には、手のひらに毎秒1〜2個くらい届いている。</p>
        <div class="seg" role="group" aria-label="時間の遅れ">
          <button type="button" class="seg-btn" id="mu-rel-on" data-rel="1" aria-pressed="${rel}">時間の遅れ あり（現実）</button>
          <button type="button" class="seg-btn" id="mu-rel-off" data-rel="0" aria-pressed="${!rel}">なし（もしも）</button>
        </div>
        <ol class="steps">
          <li>宇宙から飛んできた陽子（宇宙線）が、上空約15kmで空気の原子核にぶつかる</li>
          <li>π中間子がたくさんでき、すぐにミュー粒子とニュートリノに壊れる</li>
          <li>ミュー粒子の寿命は平均2.2マイクロ秒。光速で飛んでも、その間に進めるのは約660m</li>
          <li id="mu-step4">${rel ? STEP4.on : STEP4.off}</li>
        </ol>
        <p class="stat-line" id="mu-stats"></p>
        <ul class="legend">
          ${chip(C.proton, "陽子（宇宙線）")}${chip(C.hadron, "π中間子")}${chip(C.muon, 'ミュー粒子 <span class="sym">μ</span>')}${chip(C.electron, '電子 <span class="sym">e</span>')}${chip(C.numu, "ニュートリノ", "dash")}
        </ul>
        <p class="note"><b>大げさにしている所</b>：高さは実際の縮尺（左の目盛り1つが1km）。時間は約10万倍スロー。1個ずつの寿命はバラバラで、2.2マイクロ秒は平均。実際の空気シャワーでは、もっとたくさんの粒子ができる。</p>`;
      },
      bind(root) {
        statsEl = $("#mu-stats", root);
        statsCache = "";
        renderStats();
        $$(".seg-btn[data-rel]", root).forEach((b) => b.addEventListener("click", () => {
          const v = b.dataset.rel === "1";
          if (v === rel) return;
          rel = v;
          $$(".seg-btn[data-rel]", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          $("#mu-step4", root).textContent = rel ? STEP4.on : STEP4.off;
          stats = { born: 0, done: 0, arrived: 0 };
          renderStats();
          if (g) newShower();
        }));
      },
      leave() { statsEl = null; },
      build(group) { g = group; evg = null; buildWorld(); newShower(); },
      update(dt) {
        if (!sh) return;
        t += dt;
        sh.prim.set(t / sh.prim.dur);
        sh.primLabel.visible = t < sh.tHit;
        const ff = (t - sh.tHit) / 0.5;
        sh.flash.visible = ff >= 0 && ff <= 1;
        if (sh.flash.visible) { const s = Math.sin(ff * Math.PI) * 3.2; sh.flash.scale.set(s, s, 1); }
        sh.pions.forEach((p) => p.set((t - p.t0) / p.dur));
        sh.piLabel.visible = sh.pions[0].f > 0 && sh.pions[0].f < 1;
        sh.extras.forEach((e) => e.set((t - e.t0) / e.dur));
        sh.muons.forEach((m) => {
          m.set((t - m.t0) / m.dur);
          if (m.f >= 1 && m.tDone == null) {
            m.tDone = t;
            stats.done++;
            if (m.arrives) stats.arrived++;
          }
          if (m.tDone != null) {
            const bf = (t - m.tDone) / 0.6;
            m.burst.visible = bf <= 1;
            if (bf <= 1) { const s = Math.sin(bf * Math.PI) * (m.arrives ? 1.8 : 1.2); m.burst.scale.set(s, s, 1); }
          }
        });
        const m0 = sh.muons[0];
        sh.muLabel.visible = t >= m0.t0;
        const trav = clamp((t - m0.t0) * V, 0, m0.len);
        const tLab = trav / C_KM_US, tMu = rel ? tLab / m0.gamma : tLab;
        const status = t < m0.t0 ? "まだ生まれていない" : m0.f < 1 ? "飛行中" : m0.arrives ? "地上に到着" : `高さ${fmt(m0.end.y, 1)} kmで崩壊`;
        hud(`<div class="hud-title">先頭のミュー粒子</div>
          <div class="hud-row"><span>地上の時計</span><b>${fmt(tLab, 1)} μs</b></div>
          <div class="hud-row"><span>ミュー粒子の時計</span><b class="${tMu > 2.197 ? "warn" : ""}">${fmt(tMu, 2)} μs</b></div>
          <div class="hud-row"><span>時間の遅れ</span><b>${rel ? "約" + fmt(m0.gamma, 0) + "倍" : "なし"}</b></div>
          <div class="hud-row"><span>状態</span><b>${status}</b></div>`);
        setStep(t < sh.tHit ? 0 : t < m0.t0 ? 1 : trav < CTAU * 1.2 ? 2 : 3);
        renderStats();
        if (t > sh.tEnd + 1.6) newShower();
      },
    };

    function renderStats() {
      if (!statsEl) return;
      const pct = stats.done ? Math.round((stats.arrived / stats.done) * 100) : null;
      const html = `これまでに生まれた <b class="stat">${stats.born}</b>個 ／ 地上に届いた <b class="stat">${stats.arrived}</b>個${pct == null ? "" : `（壊れるか届くかが決まった中の <b class="stat">${pct}%</b>）`}`;
      if (html !== statsCache) { statsEl.innerHTML = html; statsCache = html; }
    }

    function buildWorld() {
      g.add(new THREE.GridHelper(14, 14, 0x2a3558, 0x161d33));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshBasicMaterial({ color: "#0C1424", transparent: true, opacity: 0.9 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = -0.01;
      g.add(disc);
      const atm = new THREE.CylinderGeometry(6.6, 6.6, 16, 64, 1, true);
      atm.translate(0, 8, 0);
      g.add(new THREE.Mesh(atm, new THREE.MeshBasicMaterial({ color: "#3A6BD6", transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })));
      [5, 10, 15].forEach((h) => g.add(ringLine(6.6, "y", h, "#3A6BD6", 0.28)));
      const rx = -7.4;
      g.add(lineOf([new THREE.Vector3(rx, 0, 0), new THREE.Vector3(rx, 16, 0)], "#5A6788", 0.9));
      for (let k = 0; k <= 16; k++) {
        const w = k % 5 === 0 ? 0.4 : 0.16;
        g.add(lineOf([new THREE.Vector3(rx, k, 0), new THREE.Vector3(rx + w, k, 0)], "#5A6788", 0.9));
      }
      [0, 5, 10, 15].forEach((k) => addLabel(`${k} km`, "#5A6788", new THREE.Vector3(rx - 0.3, k, 0), { cls: "muted plain" }));
      const det = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 1.8), new THREE.MeshBasicMaterial({ color: "#23305A" }));
      det.position.y = 0.11;
      g.add(det);
      addLabel("地上の検出器", "#8B95AB", new THREE.Vector3(0, 0.3, 0), { cls: "muted" });
    }

    function newShower() {
      if (!g) return;
      if (evg) { g.remove(evg); disposeGroup(evg); }
      removeLabels("ev");
      evg = new THREE.Group();
      g.add(evg);
      t = 0;
      const H = 15 + rand(-0.7, 0.7);
      const hitP = new THREE.Vector3(rand(-1.2, 1.2), H, rand(-1.2, 1.2));
      const startP = hitP.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 4.5, rand(-1.5, 1.5)));
      const prim = tubeTrack([startP, hitP], C.proton, 0.05, { headSize: 0.9 }).add(evg);
      prim.dur = startP.distanceTo(hitP) / V;
      const primLabel = addLabel("宇宙線（陽子）", C.proton, null, { follow: prim.head, tag: "ev" });
      const tHit = prim.dur;
      const flash = glowSprite("#ffffff", 0.01);
      flash.position.copy(hitP);
      flash.visible = false;
      evg.add(flash);

      const pions = [], muons = [], extras = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const th = Math.abs(gauss()) * 0.16, ph = rand(0, TAU);
        const dir = new THREE.Vector3(Math.sin(th) * Math.cos(ph), -Math.cos(th), Math.sin(th) * Math.sin(ph));
        const dPi = rand(0.25, 0.6);
        const piEnd = hitP.clone().addScaledVector(dir, dPi);
        const pi = tubeTrack([hitP.clone(), piEnd], C.hadron, 0.035, { headSize: 0.45 }).add(evg);
        pi.t0 = tHit;
        pi.dur = dPi / V;
        pions.push(pi);

        const nd = dir.clone().add(new THREE.Vector3(rand(-0.08, 0.08), 0, rand(-0.08, 0.08))).normalize();
        const nu = dashTrack(piEnd.clone(), piEnd.clone().addScaledVector(nd, 3.0), C.numu, { opacity: 0.5, headSize: 0.35, dash: 0.25, gap: 0.2 }).add(evg);
        nu.t0 = pi.t0 + pi.dur;
        nu.dur = 3.0 / V;
        extras.push(nu);

        const md = dir.clone().add(new THREE.Vector3(rand(-0.03, 0.03), 0, rand(-0.03, 0.03))).normalize();
        const gamma = rand(20, 90);
        const lambda = (rel ? gamma : 1) * CTAU;           // 平均の飛行距離
        const dDecay = -lambda * Math.log(1 - Math.random()); // 1個ずつの寿命はバラバラ（指数分布）
        const toGround = piEnd.y / -md.y;
        const arrives = dDecay >= toGround;
        const len = arrives ? toGround : dDecay;
        const mEnd = piEnd.clone().addScaledVector(md, len);
        const mu = tubeTrack([piEnd.clone(), mEnd], C.muon, 0.045, { headSize: 0.7 }).add(evg);
        mu.t0 = pi.t0 + pi.dur;
        mu.dur = Math.max(0.05, len / V);
        Object.assign(mu, { gamma, arrives, len, end: mEnd, tDone: null });
        mu.burst = glowSprite(arrives ? C.muon : C.electron, 0.01);
        mu.burst.position.copy(mEnd);
        mu.burst.visible = false;
        evg.add(mu.burst);
        if (!arrives) {
          // μ⁻ → e⁻ + 反電子ニュートリノ + ミューニュートリノ
          const ed = md.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(-0.2, 0.3), rand(-0.5, 0.5))).normalize();
          const el = tubeTrack([mEnd.clone(), mEnd.clone().addScaledVector(ed, 0.6)], C.electron, 0.03, { headSize: 0.4 }).add(evg);
          el.t0 = mu.t0 + mu.dur;
          el.dur = 0.6 / V;
          extras.push(el);
          [C.nue, C.numu].forEach((col) => {
            const d2 = md.clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.1, 0.2), rand(-0.4, 0.4))).normalize();
            const nx = dashTrack(mEnd.clone(), mEnd.clone().addScaledVector(d2, 1.8), col, { opacity: 0.45, headSize: 0.3, dash: 0.2, gap: 0.16 }).add(evg);
            nx.t0 = el.t0;
            nx.dur = 1.8 / V;
            extras.push(nx);
          });
        }
        muons.push(mu);
      }
      stats.born += n;
      const piLabel = addLabel("π中間子", C.hadron, null, { follow: pions[0].head, tag: "ev" });
      piLabel.visible = false;
      const muLabel = addLabel('ミュー粒子 <span class="sym">μ</span>', C.muon, null, { follow: muons[0].head, tag: "ev" });
      muLabel.visible = false;
      const tEnd = Math.max(...muons.map((m) => m.t0 + m.dur), ...extras.map((e) => e.t0 + e.dur));
      sh = { prim, primLabel, tHit, flash, pions, muons, extras, piLabel, muLabel, tEnd };
    }
  }

  /* ================= 場面3：ニュートリノ ================= */
  function NeutrinoScene() {
    const N = 1500;
    let g = null, pts = null, U = null, osc = true, t = 0, nextHit = 2.5, caught = 0;
    let marker = null, earthSpin = null, ring = null, flash = null, hitT = -1, caughtEl = null;
    let startX = 0, endX = 0, cE = null, cM = null, cT = null, stepT = 0, stepI = 0;
    const markerPos = () => { const p = new THREE.Vector3(); marker.getWorldPosition(p); return p; };

    return {
      id: "neutrino",
      aria: "太陽で生まれたニュートリノが地球を素通りし、ときどきスーパーカミオカンデで捕まる様子を表す3D表示",
      cam: { pos: [0, 6.5, 21], target: [-1, 0, 0], min: 8, max: 40 },
      panel() {
        return `
        <h2 class="p-title">ニュートリノ</h2>
        <p class="p-lead">太陽の中心で生まれたニュートリノが、地球をほぼ素通りしていく。1cm²あたり毎秒約660億個が、いまも体を通り抜けている。</p>
        <div class="seg" role="group" aria-label="種類の入れ替わり">
          <button type="button" class="seg-btn" id="nu-osc-on" data-osc="1" aria-pressed="${osc}">種類の入れ替わり（振動）を見る</button>
          <button type="button" class="seg-btn" id="nu-osc-off" data-osc="0" aria-pressed="${!osc}">見ない</button>
        </div>
        <ol class="steps">
          <li>太陽の中心の核融合で、電子ニュートリノが大量に生まれる</li>
          <li>光とほぼ同じ速さで飛び、約8分20秒で地球に届く</li>
          <li>電気を持たず、ほとんど何とも反応しないので、地球をほぼ素通りする</li>
          <li>飛んでいる途中で、種類（電子・ミュー・タウ）が入れ替わる。これが「ニュートリノ振動」で、質量がある証拠</li>
          <li>ごくまれに水と反応すると、青い光の輪（チェレンコフ光）が出る。岐阜県飛騨市の地下1000mにあるスーパーカミオカンデは、5万トンの水と約1万1000本の光センサーでこれをとらえる</li>
        </ol>
        <p class="stat-line">スーパーカミオカンデで捕まえた数 <b class="stat" id="nu-caught">${caught}</b>個</p>
        <ul class="legend">
          ${chip(C.nue, '電子ニュートリノ <span class="sym">ν<sub>e</sub></span>', "dot")}${chip(C.numu, 'ミューニュートリノ <span class="sym">ν<sub>μ</sub></span>', "dot")}${chip(C.nutau, 'タウニュートリノ <span class="sym">ν<sub>τ</sub></span>', "dot")}
        </ul>
        <p class="note"><b>大げさにしている所</b>：太陽と地球の大きさと距離は縮めてある（実際の距離は約1億5000万km）。種類が入れ替わる周期も見やすく大きくしている。実際の太陽ニュートリノの入れ替わりには、太陽内部の物質の影響も効いている。</p>`;
      },
      bind(root) {
        caughtEl = $("#nu-caught", root);
        $$(".seg-btn[data-osc]", root).forEach((b) => b.addEventListener("click", () => {
          osc = b.dataset.osc === "1";
          $$(".seg-btn[data-osc]", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        }));
      },
      leave() { caughtEl = null; },
      build(group) {
        g = group;
        const sunPos = new THREE.Vector3(-9, 0, 0), sunR = 2.0, earthPos = new THREE.Vector3(6.5, 0, 0), earthR = 1.5;
        g.add(new THREE.AmbientLight(0xffffff, 0.2));
        const pl = new THREE.PointLight(0xfff1dc, 1.5, 0);
        pl.position.copy(sunPos);
        g.add(pl);

        const sun = new THREE.Mesh(new THREE.SphereGeometry(sunR, 48, 32), new THREE.MeshBasicMaterial({ color: "#FFB347" }));
        sun.position.copy(sunPos);
        g.add(sun);
        const sg = glowSprite("#FF8F3A", 9, 0.85);
        sg.position.copy(sunPos);
        g.add(sg);
        addLabel("太陽", "#FFB347", sunPos.clone().add(new THREE.Vector3(0, sunR + 0.4, 0)));

        const earthGroup = new THREE.Group();
        earthGroup.position.copy(earthPos);
        earthGroup.rotation.z = THREE.MathUtils.degToRad(23.4);
        g.add(earthGroup);
        earthSpin = new THREE.Group();
        earthGroup.add(earthSpin);
        earthSpin.add(new THREE.Mesh(new THREE.SphereGeometry(earthR, 48, 32), new THREE.MeshStandardMaterial({ color: "#2E63B0", roughness: 0.85, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false })));
        earthSpin.add(new THREE.Mesh(new THREE.SphereGeometry(earthR * 1.004, 24, 12), new THREE.MeshBasicMaterial({ color: "#8FB8FF", wireframe: true, transparent: true, opacity: 0.12, depthWrite: false })));
        const ag = glowSprite("#5AA0FF", 4.4, 0.3);
        ag.position.copy(earthPos);
        g.add(ag);
        addLabel("地球", "#5AA0FF", earthPos.clone().add(new THREE.Vector3(0, earthR + 0.5, 0)));

        const lat = THREE.MathUtils.degToRad(36.43), lon = THREE.MathUtils.degToRad(137.31);
        const nrm = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
        marker = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.11, 16), new THREE.MeshBasicMaterial({ color: "#BFE6FF" }));
        marker.position.copy(nrm).multiplyScalar(earthR + 0.03);
        marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
        earthSpin.add(marker);
        addLabel("スーパーカミオカンデ", "#BFE6FF", null, { follow: marker });

        startX = sunPos.x + sunR * 0.85;
        endX = 17;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
        U = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          const r = 1.9 * Math.sqrt(Math.random()), a = rand(0, TAU);
          pos[i * 3] = rand(startX, endX);
          pos[i * 3 + 1] = r * Math.cos(a);
          pos[i * 3 + 2] = r * Math.sin(a);
          U[i] = Math.random();
        }
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
        pts.renderOrder = 3;
        g.add(pts);
        cE = new THREE.Color(C.nue); cM = new THREE.Color(C.numu); cT = new THREE.Color(C.nutau);

        ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: "#8FD3FF", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        ring.visible = false;
        ring.renderOrder = 4;
        g.add(ring);
        flash = glowSprite("#9FDCFF", 0.01);
        flash.visible = false;
        g.add(flash);
        paint(0);
        hud(`<div class="hud-row"><span>太陽から地球まで</span><b>約8分20秒</b></div>
          <div class="hud-row"><span>通り抜ける数</span><b>1cm²に毎秒約660億個</b></div>`);
      },
      update(dt) {
        if (!pts) return;
        t += dt;
        earthSpin.rotation.y += dt * 0.12;
        paint(dt);
        nextHit -= dt;
        if (nextHit <= 0) {
          nextHit = rand(3.5, 6.5);
          hitT = 0;
          caught++;
          if (caughtEl) caughtEl.textContent = String(caught);
        }
        if (hitT >= 0) {
          hitT += dt;
          const f = hitT / 1.3;
          if (f <= 1) {
            const p = markerPos();
            ring.visible = true;
            ring.position.copy(p);
            ring.quaternion.copy(camera.quaternion);
            const s = 0.06 + f * 0.55;
            ring.scale.set(s, s, s);
            ring.material.opacity = 1 - f;
            flash.visible = true;
            flash.position.copy(p);
            const k = Math.sin(Math.min(1, f * 2) * Math.PI) * 0.9;
            flash.scale.set(k, k, 1);
          } else {
            ring.visible = false;
            flash.visible = false;
            hitT = -1;
          }
        }
        stepT += dt;
        if (stepT > 4) { stepT = 0; stepI = (stepI + 1) % 5; }
        setStep(stepI);
      },
    };

    function paint(dt) {
      const P = pts.geometry.attributes.position.array, Cc = pts.geometry.attributes.color.array;
      for (let i = 0; i < N; i++) {
        let x = P[i * 3] + 3.2 * dt;
        if (x > endX) x = startX;
        P[i * 3] = x;
        let c = cE;
        if (osc) {
          const L = x - startX;
          const pe = 1 - 0.6 * Math.pow(Math.sin((Math.PI * L) / 8.5), 2);
          const pmu = (1 - pe) * (0.5 + 0.35 * Math.sin((Math.PI * L) / 5.3));
          c = U[i] < pe ? cE : U[i] < pe + pmu ? cM : cT;
        }
        Cc[i * 3] = c.r; Cc[i * 3 + 1] = c.g; Cc[i * 3 + 2] = c.b;
      }
      pts.geometry.attributes.position.needsUpdate = true;
      pts.geometry.attributes.color.needsUpdate = true;
    }
  }

  /* ================= 場面4：タウ粒子と3兄弟 ================= */
  function LeptonScene() {
    const MASS = { e: 0.511, mu: 105.66, tau: 1776.9 };
    const R_TAU = 1.3;
    const XS = { e: -3.6, mu: -0.4, tau: 3.4 }, Y_TOP = 1.0, Y_NU = -1.9;
    let g = null, parts = {}, busy = null, t = 0;
    const idle = '<div class="hud-dim">球をタップすると、壊れ方が見られる</div>';

    return {
      id: "leptons",
      aria: "電子・ミュー粒子・タウ粒子と3種類のニュートリノを、重さに比例した体積の球で並べた3D表示",
      cam: { pos: [0.4, 1.6, 10.5], target: [0.2, 0.1, 0], min: 4, max: 20 },
      panel() {
        return `
        <h2 class="p-title">タウ粒子と3兄弟</h2>
        <p class="p-lead">電子・ミュー粒子・タウ粒子は、電気の量も性質もほぼ同じで、重さだけが違う3兄弟。それぞれに専用のニュートリノが1種類ずつつく。球の体積を重さに比例させて並べている。</p>
        <div class="btn-row">
          <button type="button" class="btn" id="lp-mu" data-decay="mu">ミュー粒子を壊す</button>
          <button type="button" class="btn" id="lp-tau" data-decay="tau">タウ粒子を壊す</button>
        </div>
        <dl class="facts">
          <div><dt>電子</dt><dd>0.511 MeV。壊れない。原子の中にいる</dd></div>
          <div><dt>ミュー粒子</dt><dd>電子の約207倍。寿命2.2マイクロ秒。宇宙線として毎日降ってくる</dd></div>
          <div><dt>タウ粒子</dt><dd>電子の約3,477倍。寿命2.9×10<sup>−13</sup>秒。加速器の中で作られる</dd></div>
          <div><dt>ニュートリノ</dt><dd>電子の100万分の1より軽い（正確な値は未解明）。壊れない</dd></div>
        </dl>
        <section class="block life">
          <h3>寿命の比較（対数目盛り）</h3>
          ${lifetimeSVG()}
          <p class="cap">目盛り1つで100万倍ちがう。電子とニュートリノは壊れない。</p>
        </section>
        <ul class="legend">
          ${chip(C.electron, '電子 <span class="sym">e</span>', "dot")}${chip(C.muon, 'ミュー粒子 <span class="sym">μ</span>', "dot")}${chip(C.tau, 'タウ粒子 <span class="sym">τ</span>', "dot")}${chip(C.nue, '<span class="sym">ν<sub>e</sub></span>', "dash")}${chip(C.numu, '<span class="sym">ν<sub>μ</sub></span>', "dash")}${chip(C.nutau, '<span class="sym">ν<sub>τ</sub></span>', "dash")}${chip(C.hadron, "π中間子")}
        </ul>
        <p class="note"><b>大げさにしている所</b>：素粒子に大きさはない。球は重さを比べるための模型。ニュートリノは軽すぎて球にならないので点で表している。</p>`;
      },
      bind(root) {
        $$("[data-decay]", root).forEach((b) => b.addEventListener("click", () => decay(b.dataset.decay)));
      },
      build(group) {
        g = group;
        busy = null;
        parts = {};
        g.add(new THREE.HemisphereLight(0xcfe0ff, 0x141a2c, 0.95));
        const dl = new THREE.DirectionalLight(0xffffff, 0.75);
        dl.position.set(4, 7, 8);
        g.add(dl);
        const radius = (m) => R_TAU * Math.cbrt(m / MASS.tau);
        const info = {
          e: { col: C.electron, name: '電子 <span class="sym">e<sup>−</sup></span>　0.511 MeV' },
          mu: { col: C.muon, name: 'ミュー粒子 <span class="sym">μ<sup>−</sup></span>　105.7 MeV（電子の約207倍）' },
          tau: { col: C.tau, name: 'タウ粒子 <span class="sym">τ<sup>−</sup></span>　1777 MeV（電子の約3,477倍）' },
        };
        ["e", "mu", "tau"].forEach((k) => {
          const r = radius(MASS[k]);
          const col = info[k].col;
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.05, emissive: new THREE.Color(col).multiplyScalar(0.22) }));
          mesh.position.set(XS[k], Y_TOP, 0);
          mesh.userData.kind = k;
          mesh.userData.r = r;
          g.add(mesh);
          parts[k] = mesh;
          if (k === "e") { const halo = glowSprite(col, 0.7, 0.55); halo.position.copy(mesh.position); g.add(halo); }
          addLabel(info[k].name, col, null, { follow: mesh, offset: new THREE.Vector3(0, r + 0.25, 0) });
        });
        [["e", C.nue, '<span class="sym">ν<sub>e</sub></span> 電子ニュートリノ'], ["mu", C.numu, '<span class="sym">ν<sub>μ</sub></span> ミューニュートリノ'], ["tau", C.nutau, '<span class="sym">ν<sub>τ</sub></span> タウニュートリノ']].forEach(([k, col, name]) => {
          const p = new THREE.Vector3(XS[k], Y_NU, 0);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: col }));
          dot.position.copy(p);
          g.add(dot);
          const gl = glowSprite(col, 0.45, 0.6);
          gl.position.copy(p);
          g.add(gl);
          addLabel(name, col, p.clone().add(new THREE.Vector3(0, -0.3, 0)), { cls: "muted" });
        });
        ["第1世代", "第2世代", "第3世代"].forEach((s, i) => addLabel(s, INK3, new THREE.Vector3([XS.e, XS.mu, XS.tau][i], 3.35, 0), { cls: "muted plain" }));
        hud(idle);
      },
      update(dt) {
        if (!g) return;
        t += dt;
        ["e", "mu", "tau"].forEach((k, i) => { if (!busy || busy.k !== k) parts[k].position.y = Y_TOP + Math.sin(t * 0.8 + i) * 0.03; });
        if (!busy) return;
        busy.t += dt;
        const bt = busy.t, src = parts[busy.k];
        const s = bt < 0.25 ? 1 - bt / 0.25 : bt > 2.6 ? clamp01((bt - 2.6) / 0.4) : 0;
        src.scale.setScalar(Math.max(0.0001, s));
        const ff = bt / 0.5;
        busy.flash.visible = ff <= 1;
        if (ff <= 1) { const k = Math.sin(ff * Math.PI) * 2.2; busy.flash.scale.set(k, k, 1); }
        busy.products.forEach((p) => { p.tr.set((bt - 0.2) / 1.0); p.label.visible = p.tr.f > 0.25; });
        if (bt > 3.0) {
          g.remove(busy.group);
          disposeGroup(busy.group);
          removeLabels("prod");
          src.scale.setScalar(1);
          busy = null;
        }
      },
      pick(ray) {
        const hit = ray.intersectObjects([parts.e, parts.mu, parts.tau])[0];
        if (!hit) return;
        const k = hit.object.userData.kind;
        if (k === "e") hud('<div class="hud-title">電子</div><div class="hud-row"><span>寿命</span><b>6.6×10²⁸年以上</b></div><div class="hud-dim">電子は壊れない。これより軽い電気を持つ粒子がないため</div>');
        else decay(k);
      },
    };

    function decay(k) {
      if (!g || busy) return;
      const src = parts[k];
      const origin = new THREE.Vector3(XS[k], Y_TOP, 0);
      const pg = new THREE.Group();
      g.add(pg);
      const flash = glowSprite(k === "mu" ? C.muon : C.tau, 0.01);
      flash.position.copy(origin);
      pg.add(flash);
      busy = { k, t: 0, group: pg, flash, products: [] };
      const add = (color, dir, len, charged, label) => {
        const d = new THREE.Vector3(...dir).normalize();
        const end = origin.clone().addScaledVector(d, len);
        const tr = charged ? tubeTrack([origin.clone(), end], color, 0.03, { headSize: 0.5 }).add(pg) : dashTrack(origin.clone(), end, color, { headSize: 0.4, dash: 0.14, gap: 0.1 }).add(pg);
        const lb = addLabel(label, color, end.clone(), { tag: "prod" });
        lb.visible = false;
        busy.products.push({ tr, label: lb });
      };
      if (k === "mu") {
        add(C.electron, [-0.5, -0.85, 0.2], 2.0, true, '<span class="sym">e<sup>−</sup></span>');
        add(C.nue, [0.95, 0.1, 0.3], 2.4, false, '<span class="sym">ν̄<sub>e</sub></span>');
        add(C.numu, [-0.2, 0.95, -0.25], 2.4, false, '<span class="sym">ν<sub>μ</sub></span>');
        hud('<div class="hud-title">ミュー粒子の壊れ方</div><div class="hud-eq"><span class="sym">μ<sup>−</sup> → e<sup>−</sup> + ν̄<sub>e</sub> + ν<sub>μ</sub></span></div><div class="hud-row"><span>平均寿命</span><b>2.2 μs</b></div>');
      } else {
        const r = Math.random();
        add(C.nutau, [0.35, 0.9, 0.3], 2.6, false, '<span class="sym">ν<sub>τ</sub></span>');
        let eq, share;
        if (r < 0.178) {
          add(C.electron, [-0.6, -0.8, 0.1], 2.2, true, '<span class="sym">e<sup>−</sup></span>');
          add(C.nue, [0.9, -0.4, -0.2], 2.6, false, '<span class="sym">ν̄<sub>e</sub></span>');
          eq = "τ<sup>−</sup> → ν<sub>τ</sub> + e<sup>−</sup> + ν̄<sub>e</sub>"; share = "約18%";
        } else if (r < 0.352) {
          add(C.muon, [-0.6, -0.8, 0.1], 2.2, true, '<span class="sym">μ<sup>−</sup></span>');
          add(C.numu, [0.9, -0.4, -0.2], 2.6, false, '<span class="sym">ν̄<sub>μ</sub></span>');
          eq = "τ<sup>−</sup> → ν<sub>τ</sub> + μ<sup>−</sup> + ν̄<sub>μ</sub>"; share = "約17%";
        } else {
          add(C.hadron, [-0.7, -0.7, 0.1], 2.2, true, '<span class="sym">π<sup>−</sup></span>');
          add(C.hadron, [0.8, -0.55, -0.2], 2.4, false, '<span class="sym">π<sup>0</sup></span>');
          eq = "τ<sup>−</sup> → ν<sub>τ</sub> + π<sup>−</sup> + π<sup>0</sup> など"; share = "約65%（ハドロン全体）";
        }
        hud(`<div class="hud-title">タウ粒子の壊れ方（毎回ランダム）</div><div class="hud-eq"><span class="sym">${eq}</span></div><div class="hud-row"><span>この壊れ方の割合</span><b>${share}</b></div><div class="hud-dim">重いので、レプトンで唯一ハドロンにも壊れる</div>`);
      }
    }
  }

  function lifetimeSVG() {
    const W = 300, H = 124, x0 = 16, x1 = 284, lo = -24, hi = 0, axisY = 62;
    const X = (L) => x0 + ((L - lo) / (hi - lo)) * (x1 - x0);
    const items = [
      { name: "ヒッグス粒子", val: "1.6×10⁻²²秒", t: 1.6e-22, c: C.higgs, up: true },
      { name: "タウ粒子", val: "2.9×10⁻¹³秒", t: 2.9e-13, c: C.tau, up: false },
      { name: "π中間子", val: "2.6×10⁻⁸秒", t: 2.6e-8, c: C.hadron, up: true },
      { name: "ミュー粒子", val: "2.2×10⁻⁶秒", t: 2.2e-6, c: C.muon, up: false },
    ];
    const clampX = (x) => clamp(x, 34, W - 34);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="寿命の比較。ヒッグス粒子は1.6掛ける10のマイナス22乗秒、タウ粒子は2.9掛ける10のマイナス13乗秒、π中間子は2.6掛ける10のマイナス8乗秒、ミュー粒子は2.2掛ける10のマイナス6乗秒。">`;
    s += `<line x1="${x0}" y1="${axisY}" x2="${x1}" y2="${axisY}" stroke="#2A3558" stroke-width="1.5"/>`;
    [-24, -18, -12, -6, 0].forEach((L) => {
      const x = X(L);
      s += `<line x1="${x}" y1="${axisY - 4}" x2="${x}" y2="${axisY + 4}" stroke="#4A5578" stroke-width="1"/>`;
      s += `<text class="t-tick" x="${x}" y="${axisY + 17}" text-anchor="middle">${L === 0 ? "1秒" : "10" + sup(L)}</text>`;
    });
    items.forEach((it) => {
      const x = X(Math.log10(it.t)), tx = clampX(x);
      s += `<circle cx="${x}" cy="${axisY}" r="4.5" fill="${it.c}"/>`;
      if (it.up) {
        s += `<line x1="${x}" y1="${axisY - 6}" x2="${x}" y2="${axisY - 10}" stroke="${it.c}" stroke-width="1"/>`;
        s += `<text class="t-name" x="${tx}" y="${axisY - 27}" text-anchor="middle">${it.name}</text>`;
        s += `<text class="t-val" x="${tx}" y="${axisY - 14}" text-anchor="middle">${it.val}</text>`;
      } else {
        s += `<text class="t-name" x="${tx}" y="${axisY + 36}" text-anchor="middle">${it.name}</text>`;
        s += `<text class="t-val" x="${tx}" y="${axisY + 49}" text-anchor="middle">${it.val}</text>`;
      }
    });
    s += "</svg>";
    return s;
  }

  /* ================= 場面の切り替え ================= */
  const SCENES = { higgs: HiggsScene(), muon: MuonScene(), neutrino: NeutrinoScene(), leptons: LeptonScene() };
  const ORDER = ["higgs", "muon", "neutrino", "leptons"];
  let current = null, group = null, playing = !reduceMotion;

  function setPlaying(p) {
    playing = p;
    btnPlay.textContent = p ? "一時停止" : "再生";
    btnPlay.setAttribute("aria-pressed", String(!p));
  }

  function selectScene(id, focusTab) {
    if (!SCENES[id]) id = "higgs";
    if (current && current.leave) current.leave();
    $$(".tab").forEach((b) => {
      const on = b.dataset.scene === id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focusTab) b.focus();
    });
    panelEl.setAttribute("aria-labelledby", "tab-" + id);
    try { localStorage.setItem("particle-tracks-scene", id); } catch (e) { /* 表示の好みを覚えるだけなので無視 */ }
    current = SCENES[id];
    hudCache = null;
    hud("");
    panelEl.innerHTML = current.panel();
    stepEls = $$(".steps li", panelEl);
    current.bind(panelEl);
    btnReplay.hidden = !has3D || !current.replay;
    if (!has3D) return;
    if (group) { scene3.remove(group); disposeGroup(group); }
    removeLabels();
    group = new THREE.Group();
    scene3.add(group);
    // 縦長の画面では、左右が切れないようにカメラを遠ざける（横長16:11を基準にする）
    const target = new THREE.Vector3(...current.cam.target);
    const k = clamp(1.45 / Math.max(0.1, camera.aspect), 1, 2.2);
    camera.position.set(...current.cam.pos).sub(target).multiplyScalar(k).add(target);
    controls.target.copy(target);
    controls.minDistance = current.cam.min;
    controls.maxDistance = current.cam.max * k;
    controls.update();
    current.build(group);
    if (reduceMotion) for (let i = 0; i < 70; i++) current.update(0.05);
    canvas.setAttribute("aria-label", current.aria);
  }

  $$(".tab").forEach((b) => b.addEventListener("click", () => selectScene(b.dataset.scene)));
  $(".tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const i = ORDER.indexOf(current ? current.id : "higgs");
    const next = e.key === "Home" ? 0 : e.key === "End" ? ORDER.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + ORDER.length) % ORDER.length;
    selectScene(ORDER[next], true);
  });
  btnPlay.addEventListener("click", () => setPlaying(!playing));
  btnReplay.addEventListener("click", () => { if (current && current.replay) { current.replay(); if (!playing) setPlaying(true); } });

  function initialScene() {
    const h = (location.hash || "").slice(1);
    if (SCENES[h]) return h;
    try { const v = localStorage.getItem("particle-tracks-scene"); if (SCENES[v]) return v; } catch (e) { /* 使えない環境では最初の場面 */ }
    return "higgs";
  }

  /* ================= 描画ループ ================= */
  function resize() {
    if (!has3D) return;
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let last = performance.now(), raf = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (playing && current) current.update(dt);
    controls.update();
    renderer.render(scene3, camera);
    updateLabels();
    raf = requestAnimationFrame(frame);
  }

  if (has3D) {
    if (window.ResizeObserver) new ResizeObserver(resize).observe(viewport);
    else window.addEventListener("resize", resize);
    resize();
    let downAt = null;
    canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
    canvas.addEventListener("pointerup", (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 6 || !current || !current.pick) return;
      const r = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      current.pick(raycaster);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
  }

  setPlaying(playing);
  selectScene(initialScene(), false);
  if (has3D) raf = requestAnimationFrame(frame);
})();
