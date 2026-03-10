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
    links: [],
    spikes: [],
    pulses: [],
    pointer: { x: 0, y: 0, active: false },
    propagationFactor: 1,
    last: 0
  };

  const synfireSlider = document.getElementById("synfire-slider");

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const factorFromSlider = (sliderValue) => {
    const t = clamp(sliderValue, 0, 1);
    if (t <= 0.33) {
      return 0.5 + (t / 0.33) * 0.5;
    }
    return 1 + ((t - 0.33) / 0.67) * 0.9;
  };

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

    return points.length > 180 ? points : fallbackPoints();
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

  const rebuildParticles = () => {
    const isMobile = window.innerWidth < 768;
    const maxParticles = isMobile ? 340 : 560;
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

    const padX = state.width * 0.08;
    const padY = state.height * 0.1;
    const drawWidth = Math.max(1, state.width - padX * 2);
    const drawHeight = Math.max(1, state.height - padY * 2);
    const jitter = Math.max(10, Math.min(drawWidth, drawHeight) * 0.025);

    state.particles = selected.map((point) => {
      const ox = padX + point.x * drawWidth + (Math.random() - 0.5) * jitter;
      const oy = padY + point.y * drawHeight + (Math.random() - 0.5) * jitter;
      return {
        x: ox + (Math.random() - 0.5) * jitter * 0.9,
        y: oy + (Math.random() - 0.5) * jitter * 0.9,
        ox,
        oy,
        vx: (Math.random() - 0.5) * 0.36,
        vy: (Math.random() - 0.5) * 0.36,
        size: 1 + Math.random() * 1.5,
        charge: Math.random() * 0.08,
        refractory: 0,
        neighbors: []
      };
    });

    buildGraph();
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

  const queueSpike = (index, from, mode, strength, delay) => {
    state.spikes.push({ index, from, mode, strength, delay });
  };

  const propagateSpontaneous = (index, from, strength) => {
    const factor = state.propagationFactor;
    const pThree = clamp(0.1 * factor, 0, 0.45);
    const pOne = clamp(0.5 * factor, 0, 0.98 - pThree);
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
      queueSpike(target, index, "spontaneous", strength * 0.92, baseDelay + Math.random() * 0.2);
    });
  };

  const propagateClick = (index, from, strength, isRoot = false) => {
    const factor = state.propagationFactor;
    const rootChance = clamp(0.9 * factor, 0.05, 0.995);
    const chainChance = clamp(0.6 * factor, 0.05, 0.985);

    if (isRoot) {
      if (Math.random() >= rootChance) {
        return;
      }
      const targets = sampleNeighbors(index, 3, from);
      const baseDelay = 0.45 + Math.random() * 0.35;
      targets.forEach((target) => {
        queueSpike(target, index, "click", strength * 0.95, baseDelay + Math.random() * 0.08);
      });
      return;
    }

    if (Math.random() >= chainChance) {
      return;
    }

    const target = sampleNeighbors(index, 1, from)[0];
    if (typeof target === "number") {
      queueSpike(target, index, "click", strength * 0.94, 0.45 + Math.random() * 0.45);
    }
  };

  const excite = (index, mode, strength, from = -1, root = false) => {
    const particle = state.particles[index];
    if (!particle || strength < 0.12 || particle.refractory > 0) {
      return;
    }

    particle.charge = Math.max(particle.charge, Math.min(1.5, strength));
    particle.refractory = 4 + Math.random() * 6;

    if (mode === "spontaneous") {
      propagateSpontaneous(index, from, strength);
      return;
    }

    propagateClick(index, from, strength, root);
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

    excite(nearest, "click", 1.45, -1, true);
    addPulse(x, y);
  };

  const update = (step) => {
    const repelRadius = Math.max(72, Math.min(state.width, state.height) * 0.16);

    state.particles.forEach((particle) => {
      let ax = (particle.ox - particle.x) * 0.024;
      let ay = (particle.oy - particle.y) * 0.024;

      if (state.pointer.active) {
        const dx = particle.x - state.pointer.x;
        const dy = particle.y - state.pointer.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < repelRadius * repelRadius) {
          const dist = Math.sqrt(dist2) || 0.001;
          const force = (1 - dist / repelRadius) * 0.15;
          ax += (dx / dist) * force;
          ay += (dy / dist) * force;
        }
      }

      particle.vx = (particle.vx + ax) * 0.9;
      particle.vy = (particle.vy + ay) * 0.9;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;

      particle.refractory = Math.max(0, particle.refractory - step);
      particle.charge *= 0.92;
    });

    if (Math.random() < 0.016 && state.particles.length) {
      const randomIndex = Math.floor(Math.random() * state.particles.length);
      excite(randomIndex, "spontaneous", 0.95);
    }

    for (let i = state.spikes.length - 1; i >= 0; i -= 1) {
      const spike = state.spikes[i];
      spike.delay -= step;
      if (spike.delay <= 0) {
        excite(spike.index, spike.mode, spike.strength, spike.from, false);
        state.spikes.splice(i, 1);
      }
    }

    state.pulses = state.pulses
      .map((pulse) => ({
        x: pulse.x,
        y: pulse.y,
        radius: pulse.radius + 3.2 * step,
        life: pulse.life - 0.02 * step
      }))
      .filter((pulse) => pulse.life > 0);
  };

  const draw = () => {
    ctx.clearRect(0, 0, state.width, state.height);

    const particles = state.particles;

    ctx.lineWidth = 0.56;
    state.links.forEach(([a, b]) => {
      const p1 = particles[a];
      const p2 = particles[b];
      const linkCharge = clamp((p1.charge + p2.charge) * 0.3, 0, 0.72);
      const alpha = 0.07 + linkCharge;
      ctx.strokeStyle = `rgba(90, 255, 165, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    state.pulses.forEach((pulse) => {
      ctx.strokeStyle = `rgba(120, 255, 190, ${0.42 * pulse.life})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    particles.forEach((particle) => {
      const glow = clamp(particle.charge, 0, 1.6);
      const green = Math.floor(88 + glow * 112);
      const alpha = clamp(0.22 + glow * 0.55, 0.2, 0.95);
      const size = particle.size + glow * 0.9;
      ctx.fillStyle = `rgba(120, ${green}, 145, ${alpha})`;
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

    update(delta / 16.67);
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

    if (synfireSlider) {
      const initial = Number(synfireSlider.value) / 100;
      state.propagationFactor = factorFromSlider(initial);
      synfireSlider.addEventListener("input", () => {
        const normalized = Number(synfireSlider.value) / 100;
        state.propagationFactor = factorFromSlider(normalized);
      });
    }
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
