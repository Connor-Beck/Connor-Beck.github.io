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
    particles: [],
    pulses: [],
    pointer: { x: 0, y: 0, active: false },
    width: 0,
    height: 0,
    time: 0,
    last: 0,
    points: []
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const fallbackPoints = () => {
    const points = [];
    const count = 620;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random());
      const x = 0.5 + Math.cos(angle) * 0.43 * radius;
      const y = 0.52 + Math.sin(angle) * 0.34 * radius;
      if (x > 0.08 && x < 0.94 && y > 0.12 && y < 0.93) {
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
    const image = offCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = image.data;
    const points = [];

    const step = 6;
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

    return points.length > 100 ? points : fallbackPoints();
  };

  const loadMaskPoints = () =>
    new Promise((resolve) => {
      const img = new Image();
      img.src = "images/brain.png";
      img.onload = () => resolve(sampleMask(img));
      img.onerror = () => resolve(fallbackPoints());
    });

  const rebuildParticles = () => {
    const isMobile = window.innerWidth < 768;
    const maxParticles = isMobile ? 360 : 560;
    const points = state.points;

    if (!points.length) {
      return;
    }

    const stride = Math.max(1, Math.floor(points.length / maxParticles));
    const selected = [];
    for (let i = 0; i < points.length; i += stride) {
      selected.push(points[i]);
    }

    const brainWidth = Math.min(state.width * (state.width > 980 ? 0.52 : 0.68), 640);
    const brainHeight = brainWidth * 0.8;
    const offsetX = state.width > 980 ? state.width * 0.18 : 0;
    const originX = (state.width - brainWidth) / 2 + offsetX;
    const originY = (state.height - brainHeight) / 2 + state.height * 0.02;

    state.particles = selected.map((point) => {
      const ox = originX + point.x * brainWidth;
      const oy = originY + point.y * brainHeight;
      return {
        x: ox + (Math.random() - 0.5) * brainWidth * 0.2,
        y: oy + (Math.random() - 0.5) * brainHeight * 0.2,
        ox,
        oy,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: 1 + Math.random() * 1.5,
        charge: 0,
        seed: Math.random() * Math.PI * 2
      };
    });
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

  const addPulse = (x, y) => {
    state.pulses.push({ x, y, radius: 0, life: 1 });
    if (state.pulses.length > 5) {
      state.pulses.shift();
    }
  };

  const update = (step) => {
    const repelRadius = Math.max(90, Math.min(state.width, state.height) * 0.14);

    state.particles.forEach((particle) => {
      let ax = (particle.ox - particle.x) * 0.026;
      let ay = (particle.oy - particle.y) * 0.026;

      if (state.pointer.active) {
        const dx = particle.x - state.pointer.x;
        const dy = particle.y - state.pointer.y;
        const dist2 = dx * dx + dy * dy;

        if (dist2 < repelRadius * repelRadius) {
          const dist = Math.sqrt(dist2) || 0.0001;
          const force = (1 - dist / repelRadius) * 1.1;
          ax += (dx / dist) * force;
          ay += (dy / dist) * force;
          particle.charge = Math.min(1, particle.charge + 0.12);
        }
      }

      state.pulses.forEach((pulse) => {
        const dx = particle.x - pulse.x;
        const dy = particle.y - pulse.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const edgeDistance = Math.abs(dist - pulse.radius);
        if (edgeDistance < 26) {
          const force = (1 - edgeDistance / 26) * pulse.life * 1.6;
          ax += (dx / dist) * force;
          ay += (dy / dist) * force;
          particle.charge = Math.min(1, particle.charge + force * 0.5);
        }
      });

      ax += Math.sin(state.time * 0.0013 + particle.seed) * 0.014;
      ay += Math.cos(state.time * 0.0011 + particle.seed) * 0.014;

      particle.vx = (particle.vx + ax) * 0.88;
      particle.vy = (particle.vy + ay) * 0.88;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.charge *= 0.95;
    });

    state.pulses = state.pulses
      .map((pulse) => ({
        x: pulse.x,
        y: pulse.y,
        radius: pulse.radius + 2.8 * step,
        life: pulse.life - 0.018 * step
      }))
      .filter((pulse) => pulse.life > 0);
  };

  const draw = () => {
    ctx.clearRect(0, 0, state.width, state.height);

    const particles = state.particles;
    const connectDistance = Math.max(18, Math.min(state.width, state.height) * 0.038);
    const connectDistance2 = connectDistance * connectDistance;

    ctx.strokeStyle = "rgba(29, 91, 73, 0.18)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < connectDistance2) {
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
        }
      }
    }
    ctx.stroke();

    state.pulses.forEach((pulse) => {
      ctx.strokeStyle = `rgba(15, 61, 49, ${0.3 * pulse.life})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    particles.forEach((particle) => {
      const twinkle = 0.18 + Math.abs(Math.sin(state.time * 0.0017 + particle.seed)) * 0.22;
      const alpha = clamp(0.22 + twinkle + particle.charge * 0.45, 0.18, 0.95);
      ctx.fillStyle = `rgba(15, 61, 49, ${alpha})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size + particle.charge * 0.9, 0, Math.PI * 2);
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
      addPulse(point.x, point.y);
    });

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

    canvas.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        const point = toCanvasPoint(touch.clientX, touch.clientY);
        addPulse(point.x, point.y);
      },
      { passive: true }
    );

    canvas.addEventListener("touchend", () => {
      state.pointer.active = false;
    });

    let resizeTimer;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeCanvas();
      }, 120);
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
