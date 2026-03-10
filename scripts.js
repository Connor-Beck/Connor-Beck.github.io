(() => {
  "use strict";

  if (window.location.pathname.endsWith("/index.html")) {
    const normalizedPath = window.location.pathname.replace(/index\.html$/, "");
    const targetPath = normalizedPath || "/";
    const target = `${targetPath}${window.location.search}${window.location.hash}`;
    window.history.replaceState({}, "", target);
  }

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  const canvas = document.getElementById("brain-canvas");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    width: 0,
    height: 0,
    points: [],
    particles: [],
    brainFrame: null,
    electrodes: [],
    links: [],
    spikes: [],
    pulses: [],
    pointer: { x: 0, y: 0, active: false },
    propagationFactor: 1.63,
    clickSplitBoost: 0,
    last: 0
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ELECTRODE_ACTIVE_MS = 10000;
  const ELECTRODE_HOVER_CLOSE_MS = 500;
  const PARTICLE_CHARGE_DECAY = 0.978;
  const ACTIVATION_VISUAL_BASE = 0.72;
  const ACTIVATION_VISUAL_GAIN = 1.22;
  const ELECTRODE_SECTIONS = [
    { label: "About", href: "about.html" },
    { label: "Publications", href: "publications.html" },
    { label: "Research", href: "research.html" },
    { label: "Tutorials", href: "tutorials.html" },
    { label: "Software", href: "software.html" },
    { label: "3D printing tools", href: "tools.html#three-d-printing-tools" },
    { label: "Behavioral Platforms", href: "tools.html#behavioral-platforms" }
  ];

  const fallbackPoints = () => {
    const points = [];
    const count = 760;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random());
      const x = 0.5 + Math.cos(angle) * 0.42 * radius;
      const y = 0.5 + Math.sin(angle) * 0.35 * radius;
      if (x > 0.08 && x < 0.93 && y > 0.1 && y < 0.92) {
        points.push({ x, y });
      }
    }
    return points;
  };

  const sampleMask = (img) => {
    const offscreen = document.createElement("canvas");
    const maxWidth = 360;
    const scale = Math.min(1, maxWidth / img.width);
    const sampleWidth = Math.max(1, Math.floor(img.width * scale));
    const sampleHeight = Math.max(1, Math.floor(img.height * scale));

    offscreen.width = sampleWidth;
    offscreen.height = sampleHeight;

    const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!offCtx) {
      return fallbackPoints();
    }

    offCtx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
    const { data } = offCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const points = [];
    const step = 5;

    for (let y = 0; y < sampleHeight; y += step) {
      for (let x = 0; x < sampleWidth; x += step) {
        const idx = (y * sampleWidth + x) * 4;
        const alpha = data[idx + 3];
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (alpha > 80 && brightness > 120) {
          points.push({
            x: (x + 0.5) / sampleWidth,
            y: (y + 0.5) / sampleHeight
          });
        }
      }
    }

    if (points.length <= 180) {
      return fallbackPoints();
    }

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    points.forEach((point) => {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    });

    const width = Math.max(0.0001, maxX - minX);
    const height = Math.max(0.0001, maxY - minY);

    return points.map((point) => ({
      x: (point.x - minX) / width,
      y: (point.y - minY) / height
    }));
  };

  const loadMaskPoints = () =>
    new Promise((resolve) => {
      const img = new Image();
      img.src = "images/brain.png";
      img.onload = () => resolve(sampleMask(img));
      img.onerror = () => resolve(fallbackPoints());
    });

  const buildGraph = () => {
    state.links = [];
    const particles = state.particles;
    const n = particles.length;
    if (n < 2) {
      return;
    }

    const maxLinkDistance = Math.max(22, Math.min(state.width, state.height) * 0.13);
    const maxLinkDistance2 = maxLinkDistance * maxLinkDistance;
    const targetDegree = 5;

    particles.forEach((particle) => {
      particle.neighbors = [];
    });

    for (let i = 0; i < n; i += 1) {
      const distances = [];
      for (let j = 0; j < n; j += 1) {
        if (i === j) {
          continue;
        }
        const dx = particles[i].ox - particles[j].ox;
        const dy = particles[i].oy - particles[j].oy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= maxLinkDistance2) {
          distances.push({ j, dist2 });
        }
      }

      distances.sort((a, b) => a.dist2 - b.dist2);
      const limit = Math.min(targetDegree, distances.length);
      for (let k = 0; k < limit; k += 1) {
        particles[i].neighbors.push(distances[k].j);
      }
    }

    const linkSet = new Set();
    for (let i = 0; i < n; i += 1) {
      particles[i].neighbors.forEach((j) => {
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        const key = `${a}:${b}`;
        if (!linkSet.has(key)) {
          linkSet.add(key);
          state.links.push([a, b]);
          if (!particles[j].neighbors.includes(i)) {
            particles[j].neighbors.push(i);
          }
        }
      });
    }
  };

  const buildElectrodes = () => {
    const frame = state.brainFrame;
    if (!frame) {
      state.electrodes = [];
      return;
    }

    const angles = [-152, -124, -56, -16, 34, 88, 138];
    const baseScale = Math.min(frame.width, frame.height);
    const baseLeg1 = Math.max(20, baseScale * 0.09);
    const baseLeg2 = Math.max(28, baseScale * 0.125);
    const edgePad = Math.max(10, Math.min(state.width, state.height) * 0.02);
    const contourPoints = state.points.map((point) => ({
      x: frame.x + point.x * frame.width,
      y: frame.y + point.y * frame.height
    }));
    const angleWindowCos = Math.cos((28 * Math.PI) / 180);

    const pickContourPoint = (theta) => {
      const dirX = Math.cos(theta);
      const dirY = Math.sin(theta);
      let bestScore = -Infinity;
      let bestPoint = null;

      contourPoints.forEach((point) => {
        const vx = point.x - frame.cx;
        const vy = point.y - frame.cy;
        const mag = Math.hypot(vx, vy);
        if (mag < 1) {
          return;
        }

        const alignment = (vx * dirX + vy * dirY) / mag;
        if (alignment < angleWindowCos) {
          return;
        }

        const radial = vx * dirX + vy * dirY;
        const perpendicular = Math.abs(vx * dirY - vy * dirX);
        const score = radial - perpendicular * 0.3;
        if (score > bestScore) {
          bestScore = score;
          bestPoint = point;
        }
      });

      if (bestPoint) {
        return {
          x: bestPoint.x + dirX * 2,
          y: bestPoint.y + dirY * 2
        };
      }

      return {
        x: frame.cx + Math.cos(theta) * frame.rx,
        y: frame.cy + Math.sin(theta) * frame.ry
      };
    };

    state.electrodes = angles.map((deg, idx) => {
      const section = ELECTRODE_SECTIONS[idx % ELECTRODE_SECTIONS.length];
      const theta = (deg * Math.PI) / 180;
      const near = pickContourPoint(theta);

      const dx = near.x - frame.cx;
      const dy = near.y - frame.cy;

      let axis = { x: 0, y: 0 };
      if (Math.abs(dx) >= Math.abs(dy)) {
        axis.x = Math.sign(dx) || (idx % 2 ? -1 : 1);
      } else {
        axis.y = Math.sign(dy) || (idx < 5 ? -1 : 1);
      }

      const elbow = {
        x: near.x + axis.x * baseLeg1,
        y: near.y + axis.y * baseLeg1
      };

      const diagX = Math.sign(dx) || (idx % 2 ? -1 : 1);
      const diagY = Math.sign(dy) || (idx < 5 ? -1 : 1);
      const terminal = {
        x: clamp(elbow.x + diagX * Math.SQRT1_2 * baseLeg2, edgePad, state.width - edgePad),
        y: clamp(elbow.y + diagY * Math.SQRT1_2 * baseLeg2, edgePad, state.height - edgePad)
      };

      return {
        label: section.label,
        href: section.href,
        near,
        elbow,
        terminal,
        activity: 0,
        expanded: false,
        openUntil: 0,
        openReason: "spontaneous",
        hoverCloseAt: 0,
        morph: 0,
        rect: null,
        hoverLatched: false
      };
    });

    const publications = state.electrodes.find((electrode) => electrode.label === "Publications");
    const research = state.electrodes.find((electrode) => electrode.label === "Research");
    if (publications && research) {
      const alignDy = publications.near.y - research.near.y;
      research.near.y = clamp(research.near.y + alignDy, edgePad, state.height - edgePad);
      research.elbow.y = clamp(research.elbow.y + alignDy, edgePad, state.height - edgePad);
      research.terminal.y = clamp(research.terminal.y + alignDy, edgePad, state.height - edgePad);

      if (research.terminal.x < research.near.x + 8) {
        const shift = research.near.x + 8 - research.terminal.x;
        research.elbow.x = clamp(research.elbow.x + shift, edgePad, state.width - edgePad);
        research.terminal.x = clamp(research.terminal.x + shift, edgePad, state.width - edgePad);
      }
    }
  };

  const rebuildParticles = () => {
    const isMobile = window.innerWidth < 768;
    const maxParticles = isMobile ? 420 : 720;
    const points = state.points;

    if (!points.length) {
      return;
    }

    const shuffled = points.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, Math.min(maxParticles, shuffled.length));

    const padX = state.width * 0.008;
    const padY = state.height * 0.012;
    const drawWidth = Math.max(1, state.width - padX * 2);
    const drawHeight = Math.max(1, state.height - padY * 2);
    const brainScale = 0.64;
    const brainWidth = Math.max(1, drawWidth * brainScale);
    const brainHeight = Math.max(1, drawHeight * brainScale);
    const originX = padX + (drawWidth - brainWidth) * 0.5;
    const originY = padY + (drawHeight - brainHeight) * 0.5;
    const jitter = Math.max(12, Math.min(brainWidth, brainHeight) * 0.028);

    state.brainFrame = {
      x: originX,
      y: originY,
      width: brainWidth,
      height: brainHeight,
      cx: originX + brainWidth * 0.5,
      cy: originY + brainHeight * 0.5,
      rx: brainWidth * 0.54,
      ry: brainHeight * 0.51
    };

    state.particles = selected.map((point) => {
      const ox = clamp(
        originX + point.x * brainWidth + (Math.random() - 0.5) * jitter,
        0,
        state.width
      );
      const oy = clamp(
        originY + point.y * brainHeight + (Math.random() - 0.5) * jitter,
        0,
        state.height
      );
      return {
        x: clamp(ox + (Math.random() - 0.5) * jitter * 0.7, 0, state.width),
        y: clamp(oy + (Math.random() - 0.5) * jitter * 0.7, 0, state.height),
        ox,
        oy,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        size: 1 + Math.random() * 1.5,
        charge: Math.random() * 0.08,
        refractory: 0,
        neighbors: []
      };
    });

    buildGraph();
    buildElectrodes();
    state.spikes = [];
    state.pulses = [];
  };

  const resizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    state.width = Math.max(1, Math.floor(rect.width));
    state.height = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.floor(state.width * dpr);
    canvas.height = Math.floor(state.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    rebuildParticles();
  };

  const toCanvasPoint = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const getElectrodeLevel = (electrode) => clamp((electrode.activity - 0.23) / 0.75, 0, 1);
  const getElectrodeRadius = (electrode) => 8.28 + getElectrodeLevel(electrode) * 3.72;

  const pointInRect = (point, rect) =>
    point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;

  const activateElectrode = (
    electrode,
    reason = "spontaneous",
    intensity = 0.3,
    now = performance.now()
  ) => {
    electrode.activity = clamp(electrode.activity + intensity, 0, 1.9);
    if (!electrode.expanded) {
      electrode.expanded = true;
      electrode.openReason = reason;
      electrode.openUntil = reason === "hover" ? 0 : now + ELECTRODE_ACTIVE_MS;
      electrode.hoverCloseAt = reason === "hover" ? now + ELECTRODE_HOVER_CLOSE_MS : 0;
      electrode.rect = null;
    }
  };

  const stimulateNearestElectrode = (x, y, intensity, openLink = false, now = performance.now()) => {
    if (!state.electrodes.length) {
      return;
    }

    let nearest = null;
    let nearestDist2 = Infinity;
    state.electrodes.forEach((electrode) => {
      const dx = electrode.near.x - x;
      const dy = electrode.near.y - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < nearestDist2) {
        nearestDist2 = dist2;
        nearest = electrode;
      }
    });

    if (!nearest) {
      return;
    }

    nearest.activity = clamp(nearest.activity + intensity, 0, 1.9);
    if (openLink) {
      activateElectrode(nearest, "spontaneous", intensity * 0.45, now);
    }
  };

  const findExpandedElectrodeAtPoint = (point) => {
    for (let i = state.electrodes.length - 1; i >= 0; i -= 1) {
      const electrode = state.electrodes[i];
      if (electrode.expanded && electrode.rect && pointInRect(point, electrode.rect)) {
        return electrode;
      }
    }
    return null;
  };

  const sampleNeighbors = (index, count, exclude = -1) => {
    const particle = state.particles[index];
    if (!particle) {
      return [];
    }

    const candidates = particle.neighbors.filter((n) => n !== exclude);
    if (!candidates.length) {
      return [];
    }

    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    return candidates.slice(0, Math.min(count, candidates.length));
  };

  const queueSpike = (index, from, mode, strength, delay, depth = 0) => {
    state.spikes.push({ index, from, mode, strength, delay, depth });
  };

  const propagateSpontaneous = (index, from, strength) => {
    const factor = state.propagationFactor;
    const boost = state.clickSplitBoost;
    const pThree = clamp((0.1 + boost) * factor, 0, 0.5);
    const pOne = clamp((0.5 + boost * 0.7) * factor, 0, 0.98 - pThree);
    const roll = Math.random();
    let fanout = 0;

    if (roll < pThree) {
      fanout = 3;
    } else if (roll < pThree + pOne) {
      fanout = 1;
    }

    if (fanout === 0) {
      return;
    }

    const targets = sampleNeighbors(index, fanout, from);
    const baseDelay = 0.8 + Math.random() * 0.8;
    targets.forEach((target) => {
      queueSpike(target, index, "spontaneous", strength * 0.92, baseDelay + Math.random() * 0.2, 0);
    });
  };

  const propagateClick = (index, from, strength, depth = 0) => {
    const splitChance = clamp(0.1 + state.clickSplitBoost - depth * 0.05, 0.02, 0.5);
    const continueChance = 0.6;
    const split = Math.random() < splitChance;

    if (split) {
      const targets = sampleNeighbors(index, 3, from);
      const baseDelay = 0.45 + Math.random() * 0.35;
      targets.forEach((target) => {
        queueSpike(target, index, "click", strength * 0.92, baseDelay + Math.random() * 0.08, depth + 1);
      });
      return;
    }

    if (Math.random() >= continueChance) {
      return;
    }

    const target = sampleNeighbors(index, 1, from)[0];
    if (typeof target === "number") {
      queueSpike(target, index, "click", strength * 0.92, 0.45 + Math.random() * 0.45, depth + 1);
    }
  };

  const excite = (index, mode, strength, from = -1, depth = 0) => {
    const particle = state.particles[index];
    if (!particle || strength < 0.12 || particle.refractory > 0) {
      return;
    }

    const visualCharge = clamp(
      ACTIVATION_VISUAL_BASE + strength * ACTIVATION_VISUAL_GAIN,
      0,
      1.6
    );
    particle.charge = Math.max(particle.charge, visualCharge);
    particle.refractory = 4 + Math.random() * 6;

    if (mode === "spontaneous") {
      propagateSpontaneous(index, from, strength);
      return;
    }

    propagateClick(index, from, strength, depth);
  };

  const addPulse = (x, y) => {
    state.pulses.push({ x, y, radius: 0, life: 1 });
    if (state.pulses.length > 5) {
      state.pulses.shift();
    }
  };

  const injectAt = (x, y) => {
    if (!state.particles.length) {
      return;
    }

    let nearest = 0;
    let nearestDist2 = Infinity;
    for (let i = 0; i < state.particles.length; i += 1) {
      const dx = state.particles[i].x - x;
      const dy = state.particles[i].y - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < nearestDist2) {
        nearest = i;
        nearestDist2 = dist2;
      }
    }

    state.clickSplitBoost = Math.min(0.4, state.clickSplitBoost + 0.1);
    excite(nearest, "click", 0.95, -1, 0);
    addPulse(x, y);
  };

  const update = (step, now = performance.now()) => {
    const repelRadius = Math.max(54, Math.min(state.width, state.height) * 0.12);
    state.clickSplitBoost = Math.max(0, state.clickSplitBoost - 0.00075 * step);

    state.particles.forEach((particle) => {
      let ax = (particle.ox - particle.x) * 0.024;
      let ay = (particle.oy - particle.y) * 0.024;

      if (state.pointer.active) {
        const dx = particle.x - state.pointer.x;
        const dy = particle.y - state.pointer.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < repelRadius * repelRadius) {
          const dist = Math.sqrt(dist2) || 0.001;
          const force = (1 - dist / repelRadius) * 0.035;
          ax += (dx / dist) * force;
          ay += (dy / dist) * force;
        }
      }

      particle.vx = (particle.vx + ax) * 0.9;
      particle.vy = (particle.vy + ay) * 0.9;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;

      particle.refractory = Math.max(0, particle.refractory - step);
      particle.charge *= PARTICLE_CHARGE_DECAY;
    });

    if (Math.random() < 0.016 && state.particles.length) {
      const randomIndex = Math.floor(Math.random() * state.particles.length);
      excite(randomIndex, "spontaneous", 0.95);
      if (Math.random() < 0.36) {
        const source = state.particles[randomIndex];
        stimulateNearestElectrode(source.x, source.y, 0.34 + Math.random() * 0.33, true, now);
      }
    }

    for (let i = state.spikes.length - 1; i >= 0; i -= 1) {
      const spike = state.spikes[i];
      spike.delay -= step;
      if (spike.delay <= 0) {
        excite(spike.index, spike.mode, spike.strength, spike.from, spike.depth);
        state.spikes.splice(i, 1);
      }
    }

    const senseRadius = Math.max(24, Math.min(state.width, state.height) * 0.055);
    const senseRadius2 = senseRadius * senseRadius;
    let pointerOnLink = false;
    state.electrodes.forEach((electrode) => {
      let sum = 0;
      let hits = 0;
      state.particles.forEach((particle) => {
        const dx = particle.x - electrode.near.x;
        const dy = particle.y - electrode.near.y;
        if (dx * dx + dy * dy <= senseRadius2) {
          sum += particle.charge;
          hits += 1;
        }
      });
      const localActivity = clamp(hits ? sum / hits : 0, 0, 1.6);
      if (localActivity > electrode.activity) {
        electrode.activity = electrode.activity * 0.84 + localActivity * 0.16;
      } else {
        electrode.activity = electrode.activity * 0.962 + localActivity * 0.038;
      }

      if (!electrode.expanded && electrode.activity > 0.82 && Math.random() < 0.035 * step) {
        activateElectrode(electrode, "spontaneous", 0.08, now);
      }

      if (electrode.expanded) {
        if (electrode.openReason === "spontaneous" && now >= electrode.openUntil) {
          electrode.expanded = false;
          electrode.rect = null;
          electrode.activity = Math.min(electrode.activity, 0.42);
        }
        if (electrode.openReason === "hover") {
          if (electrode.hoverCloseAt > 0 && now >= electrode.hoverCloseAt) {
            electrode.expanded = false;
            electrode.rect = null;
            electrode.activity = Math.min(electrode.activity, 0.4);
          }
        }
      }

      const morphTarget = electrode.expanded ? 1 : 0;
      const morphSpeed = electrode.expanded ? 0.24 : 0.28;
      electrode.morph += (morphTarget - electrode.morph) * Math.min(1, morphSpeed * step);
      electrode.morph = clamp(electrode.morph, 0, 1);

      let hovered = false;
      if (state.pointer.active) {
        const dx = state.pointer.x - electrode.terminal.x;
        const dy = state.pointer.y - electrode.terminal.y;
        const terminalHit = dx * dx + dy * dy <= Math.pow(getElectrodeRadius(electrode) + 5, 2);
        const rectHit = Boolean(
          electrode.expanded && electrode.rect && electrode.morph > 0.18 && pointInRect(state.pointer, electrode.rect)
        );
        hovered = terminalHit || rectHit;
        if (rectHit) {
          pointerOnLink = true;
        }
      }

      if (hovered && !electrode.hoverLatched) {
        injectAt(electrode.near.x, electrode.near.y);
        activateElectrode(electrode, "hover", 0.45, now);
        electrode.hoverLatched = true;
      } else if (!hovered) {
        electrode.hoverLatched = false;
      }

      if (electrode.expanded && electrode.openReason === "hover") {
        if (hovered) {
          electrode.hoverCloseAt = now + ELECTRODE_HOVER_CLOSE_MS;
        } else if (electrode.hoverCloseAt === 0) {
          electrode.hoverCloseAt = now + ELECTRODE_HOVER_CLOSE_MS;
        }
      }
    });

    canvas.style.cursor = pointerOnLink ? "pointer" : "default";

    state.pulses = state.pulses
      .map((pulse) => ({
        x: pulse.x,
        y: pulse.y,
        radius: pulse.radius + 3.2 * step,
        life: pulse.life - 0.009 * step
      }))
      .filter((pulse) => pulse.life > 0);
  };

  const draw = () => {
    ctx.clearRect(0, 0, state.width, state.height);

    const particles = state.particles;
    const drawRoundedRect = (x, y, w, h, radius) => {
      const rr = clamp(radius, 0, Math.min(w, h) * 0.5 - 0.25);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    };

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const placedRects = [];
    state.electrodes.forEach((electrode) => {
      const segA = electrode.near;
      const segB = electrode.elbow;
      const segC = electrode.terminal;
      const lenAB = Math.hypot(segB.x - segA.x, segB.y - segA.y);
      const lenBC = Math.hypot(segC.x - segB.x, segC.y - segB.y);
      const fadeDistance = Math.max(36, Math.min(state.width, state.height) * 0.09);
      const wireRgb = "110, 126, 138";
      const maxAlpha = 0.9;

      const alphaAt = (distanceFromBrain) =>
        clamp((distanceFromBrain / fadeDistance) * maxAlpha, 0, maxAlpha);

      const drawSegment = (start, end, d0, d1) => {
        const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
        gradient.addColorStop(0, `rgba(${wireRgb}, ${alphaAt(d0)})`);
        gradient.addColorStop(1, `rgba(${wireRgb}, ${alphaAt(d1)})`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3.1;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      };

      drawSegment(segA, segB, 0, lenAB);
      drawSegment(segB, segC, lenAB, lenAB + lenBC);

      const level = getElectrodeLevel(electrode);
      const r = Math.round(lerp(110, 146, level));
      const g = Math.round(lerp(126, 210, level));
      const b = Math.round(lerp(138, 232, level));
      const radius = getElectrodeRadius(electrode);
      const morphT = clamp(electrode.morph, 0, 1);

      if (electrode.expanded || morphT > 0.02) {
        ctx.font = '600 12px "Sora", "Avenir Next", sans-serif';
        const textWidth = Math.ceil(ctx.measureText(electrode.label).width);
        const padX = 11;
        const boxH = 26;
        const boxW = textWidth + padX * 2;
        const frame = state.brainFrame || { cx: state.width * 0.5 };
        const dirX = Math.sign(segC.x - frame.cx) || 1;
        const connectorInset = Math.max(4, radius * 0.95);
        let targetX = dirX > 0 ? segC.x - connectorInset : segC.x - boxW + connectorInset;
        let targetY = segC.y - boxH * 0.5;
        targetX = clamp(targetX, 8, state.width - boxW - 8);
        targetY = clamp(targetY, 8, state.height - boxH - 8);

        const spacing = 6;
        for (let i = 0; i < placedRects.length; i += 1) {
          const placed = placedRects[i];
          const overlapX =
            targetX < placed.x + placed.w + spacing && targetX + boxW + spacing > placed.x;
          const overlapY =
            targetY < placed.y + placed.h + spacing && targetY + boxH + spacing > placed.y;
          if (overlapX && overlapY) {
            if (segC.y >= placed.y) {
              targetY = placed.y + placed.h + spacing;
            } else {
              targetY = placed.y - boxH - spacing;
            }
            targetY = clamp(targetY, 8, state.height - boxH - 8);
          }
        }

        const startX = segC.x - radius;
        const startY = segC.y - radius;
        const startW = radius * 2;
        const startH = radius * 2;
        const drawX = lerp(startX, targetX, morphT);
        const drawY = lerp(startY, targetY, morphT);
        const drawW = lerp(startW, boxW, morphT);
        const drawH = lerp(startH, boxH, morphT);
        const rr = lerp(radius, 10, morphT);
        electrode.rect = { x: drawX, y: drawY, w: drawW, h: drawH };
        placedRects.push({ x: targetX, y: targetY, w: boxW, h: boxH });

        ctx.lineWidth = 1.05;
        ctx.fillStyle = `rgba(${Math.round(lerp(84, 120, level))}, ${Math.round(
          lerp(102, 185, level)
        )}, ${Math.round(lerp(114, 216, level))}, 0.96)`;
        ctx.strokeStyle = `rgba(${Math.round(lerp(70, 118, level))}, ${Math.round(
          lerp(86, 162, level)
        )}, ${Math.round(lerp(100, 196, level))}, 0.98)`;
        drawRoundedRect(drawX, drawY, drawW, drawH, rr);
        ctx.fill();
        ctx.stroke();

        const textAlpha = clamp((morphT - 0.28) / 0.72, 0, 1);
        if (textAlpha > 0.02) {
          ctx.fillStyle = `rgba(237, 246, 250, ${0.98 * textAlpha})`;
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText(electrode.label, drawX + padX, drawY + drawH * 0.5 + 0.2);
        }
      } else {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.97)`;
        ctx.strokeStyle = `rgba(${Math.round(lerp(74, 98, level))}, ${Math.round(
          lerp(86, 142, level)
        )}, ${Math.round(lerp(98, 156, level))}, ${0.82 + level * 0.16})`;
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.arc(segC.x, segC.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        electrode.rect = null;
      }
    });

    ctx.lineWidth = 1.14;
    state.links.forEach(([a, b]) => {
      const p1 = particles[a];
      const p2 = particles[b];
      const linkCharge = clamp((p1.charge + p2.charge) * 0.44, 0, 1);
      const alpha = 0.28 + linkCharge * 0.78;
      ctx.strokeStyle = `rgba(88, 210, 164, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    state.pulses.forEach((pulse) => {
      ctx.strokeStyle = `rgba(142, 255, 206, ${0.6 * pulse.life})`;
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    particles.forEach((particle) => {
      const glow = clamp(particle.charge, 0, 1.6);
      const red = Math.floor(50 + glow * 44);
      const green = Math.floor(126 + glow * 108);
      const blue = Math.floor(80 + glow * 70);
      const alpha = clamp(0.78 + glow * 0.28, 0.78, 1);
      const size = particle.size + glow * 1.58;
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const tick = (time) => {
    if (!state.last) {
      state.last = time;
    }

    const delta = Math.min(33, time - state.last);
    state.last = time;

    update(delta / 16.67, time);
    draw();

    window.requestAnimationFrame(tick);
  };

  const bindEvents = () => {
    canvas.addEventListener("mousemove", (event) => {
      const point = toCanvasPoint(event.clientX, event.clientY);
      state.pointer.x = point.x;
      state.pointer.y = point.y;
      state.pointer.active = true;
    });

    canvas.addEventListener("mouseenter", () => {
      state.pointer.active = true;
    });

    canvas.addEventListener("mouseleave", () => {
      state.pointer.active = false;
    });

    canvas.addEventListener("click", (event) => {
      const point = toCanvasPoint(event.clientX, event.clientY);
      const linkedElectrode = findExpandedElectrodeAtPoint(point);
      if (linkedElectrode) {
        window.location.href = linkedElectrode.href;
        return;
      }
      injectAt(point.x, point.y);
    });

    canvas.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        const point = toCanvasPoint(touch.clientX, touch.clientY);
        const linkedElectrode = findExpandedElectrodeAtPoint(point);
        if (linkedElectrode) {
          window.location.href = linkedElectrode.href;
          return;
        }
        injectAt(point.x, point.y);
      },
      { passive: true }
    );

    canvas.addEventListener(
      "touchmove",
      (event) => {
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        const point = toCanvasPoint(touch.clientX, touch.clientY);
        state.pointer.x = point.x;
        state.pointer.y = point.y;
        state.pointer.active = true;
      },
      { passive: true }
    );

    canvas.addEventListener("touchend", () => {
      state.pointer.active = false;
    });

    let resizeTimer;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resizeCanvas, 120);
    });

  };

  bindEvents();

  loadMaskPoints().then((points) => {
    state.points = points;
    resizeCanvas();

    if (reducedMotion.matches) {
      draw();
      return;
    }

    window.requestAnimationFrame(tick);
  });
})();
