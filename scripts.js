(() => {
  "use strict";

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
    time: 0,
    last: 0
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const fallbackPoints = () => {
    const points = [];
    const count = 700;
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

    return points.length > 160 ? points : fallbackPoints();
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

    const maxLinkDistance = Math.max(22, Math.min(state.width, state.height) * 0.12);
    const maxLinkDistance2 = maxLinkDistance * maxLinkDistance;
    const targetDegree = 4;

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
        const neighbor = distances[k].j;
        if (!particles[i].neighbors.includes(neighbor)) {
          particles[i].neighbors.push(neighbor);
        }
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

    const stride = Math.max(1, Math.floor(points.length / maxParticles));
    const selected = [];
    for (let i = 0; i < points.length; i += stride) {
      selected.push(points[i]);
    }

    const padX = state.width * 0.08;
    const padY = state.height * 0.1;
    const drawWidth = Math.max(1, state.width - padX * 2);
    const drawHeight = Math.max(1, state.height - padY * 2);

    state.particles = selected.map((point) => {
      const ox = padX + point.x * drawWidth;
      const oy = padY + point.y * drawHeight;
      return {
        x: ox + (Math.random() - 0.5) * 10,
        y: oy + (Math.random() - 0.5) * 10,
        ox,
        oy,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: 1.1 + Math.random() * 1.6,
        charge: Math.random() * 0.12,
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

  const excite = (index, strength, from = -1) => {
    const particle = state.particles[index];
    if (!particle || strength < 0.12 || particle.refractory > 0) {
      return;
    }

    particle.charge = Math.max(particle.charge, Math.min(1.5, strength));
    particle.refractory = 5 + Math.random() * 7;

    particle.neighbors.forEach((neighbor) => {
      if (neighbor === from) {
        return;
      }
      const transmitted = strength * (0.58 + Math.random() * 0.26);
      if (transmitted > 0.13 && Math.random() < 0.88) {
        state.spikes.push({
          index: neighbor,
          from: index,
          delay: 0.8 + Math.random() * 2.4,
          strength: transmitted
        });
      }
    });
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

    excite(nearest, 1.45);

    const localRadius = Math.max(35, Math.min(state.width, state.height) * 0.11);
    for (let i = 0; i < state.particles.length; i += 1) {
      const dx = state.particles[i].x - x;
      const dy = state.particles[i].y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < localRadius) {
        const strength = 1.15 * (1 - dist / localRadius);
        if (strength > 0.2) {
          state.spikes.push({
            index: i,
            from: -1,
            delay: dist / 26,
            strength
          });
        }
      }
    }

    addPulse(x, y);
  };

  const update = (step) => {
    const repelRadius = Math.max(75, Math.min(state.width, state.height) * 0.17);

    state.particles.forEach((particle) => {
      let ax = (particle.ox - particle.x) * 0.024;
      let ay = (particle.oy - particle.y) * 0.024;

      if (state.pointer.active) {
        const dx = particle.x - state.pointer.x;
        const dy = particle.y - state.pointer.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < repelRadius * repelRadius) {
          const dist = Math.sqrt(dist2) || 0.001;
          const force = (1 - dist / repelRadius) * 0.65;
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

    if (Math.random() < 0.018 && state.particles.length) {
      const randomIndex = Math.floor(Math.random() * state.particles.length);
      excite(randomIndex, 0.95);
    }

    for (let i = state.spikes.length - 1; i >= 0; i -= 1) {
      const spike = state.spikes[i];
      spike.delay -= step;
      if (spike.delay <= 0) {
        excite(spike.index, spike.strength, spike.from);
        state.spikes.splice(i, 1);
      }
    }

    state.pulses = state.pulses
      .map((pulse) => ({
        x: pulse.x,
        y: pulse.y,
        radius: pulse.radius + 3.4 * step,
        life: pulse.life - 0.021 * step
      }))
      .filter((pulse) => pulse.life > 0);
  };

  const draw = () => {
    ctx.clearRect(0, 0, state.width, state.height);

    const particles = state.particles;

    ctx.lineWidth = 0.55;
    state.links.forEach(([a, b]) => {
      const p1 = particles[a];
      const p2 = particles[b];
      const linkCharge = clamp((p1.charge + p2.charge) * 0.32, 0, 0.7);
      const alpha = 0.08 + linkCharge;
      ctx.strokeStyle = `rgba(96, 255, 170, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    state.pulses.forEach((pulse) => {
      ctx.strokeStyle = `rgba(120, 255, 190, ${0.45 * pulse.life})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    particles.forEach((particle) => {
      const glow = clamp(particle.charge, 0, 1.6);
      const green = Math.floor(92 + glow * 110);
      const alpha = clamp(0.24 + glow * 0.5, 0.22, 0.95);
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
    state.time += delta;

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
