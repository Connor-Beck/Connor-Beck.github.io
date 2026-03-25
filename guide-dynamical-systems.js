(() => {
  const root = document.querySelector("[data-dynamics-demo]");
  if (!root) {
    return;
  }

  const pendulumCanvas = root.querySelector("[data-dynamics-pendulum]");
  const phaseCanvas = root.querySelector("[data-dynamics-phase]");
  const sampleEl = root.querySelector("[data-dynamics-sample]");
  const batchReadoutEl = root.querySelector("[data-dynamics-batch-readout]");
  const batchSizeInput = root.querySelector("[data-dynamics-batch-size]");
  const observationsEl = root.querySelector("[data-dynamics-observations]");
  const frictionButton = root.querySelector("[data-dynamics-friction]");
  const equationEl = root.querySelector("[data-dynamics-equation]");
  const equationCopyEl = root.querySelector("[data-dynamics-equation-copy]");

  if (
    !pendulumCanvas ||
    !phaseCanvas ||
    !sampleEl ||
    !batchReadoutEl ||
    !batchSizeInput ||
    !observationsEl ||
    !frictionButton ||
    !equationEl ||
    !equationCopyEl
  ) {
    return;
  }

  const pendulumCtx = pendulumCanvas.getContext("2d");
  const phaseCtx = phaseCanvas.getContext("2d");
  if (!pendulumCtx || !phaseCtx) {
    return;
  }

  const config = {
    dt: 1 / 60,
    gravity: 9.81,
    length: 1,
    randomTrialMs: 3000,
    manualTrialMs: 5000,
    thetaLimit: Math.PI,
    omegaLimit: 5,
    estimateBandwidthTheta: 0.62,
    estimateBandwidthOmega: 0.82,
    revealBandwidthTheta: 0.32,
    revealBandwidthOmega: 0.42,
    friction: 0.72
  };

  const state = {
    theta: 0,
    omega: 0,
    elapsedMs: 0,
    trialIndex: 0,
    batchSize: 20,
    trialDurationMs: config.randomTrialMs,
    trialSource: "random",
    frictionEnabled: false,
    observations: [],
    history: [],
    currentTrace: [],
    accumulator: 0,
    lastTime: 0
  };

  const currentBlue = { r: 20, g: 61, b: 118, a: 1 };
  const historicalGray = { r: 122, g: 136, b: 148, a: 0.34 };
  const axisGray = "rgba(66, 80, 74, 0.76)";
  const gridGray = "rgba(17, 32, 25, 0.08)";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const colorToString = (color) => `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const wrapAngle = (angle) => {
    const wrapped = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return clamp(wrapped, -Math.PI, Math.PI);
  };

  const mixColor = (from, to, t) => ({
    r: Math.round(lerp(from.r, to.r, t)),
    g: Math.round(lerp(from.g, to.g, t)),
    b: Math.round(lerp(from.b, to.b, t)),
    a: lerp(from.a, to.a, t)
  });

  const resizeCanvas = (canvas, ctx) => {
    const ratio = dpr();
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const getPendulumLayout = () => {
    const width = pendulumCanvas.clientWidth;
    const height = pendulumCanvas.clientHeight;
    return {
      width,
      height,
      pivotX: width * 0.5,
      pivotY: height * 0.16,
      rodLength: Math.min(width, height) * 0.34,
      bobRadius: Math.max(14, Math.min(width, height) * 0.05)
    };
  };

  const randomAngle = () => {
    return wrapAngle(Math.random() * Math.PI * 2 - Math.PI);
  };

  const dynamics = (theta, omega) => ({
    dTheta: omega,
    dOmega: -(config.gravity / config.length) * Math.sin(theta) - (state.frictionEnabled ? config.friction * omega : 0)
  });

  const rk4Step = (theta, omega, dt) => {
    const k1 = dynamics(theta, omega);
    const k2 = dynamics(theta + 0.5 * dt * k1.dTheta, omega + 0.5 * dt * k1.dOmega);
    const k3 = dynamics(theta + 0.5 * dt * k2.dTheta, omega + 0.5 * dt * k2.dOmega);
    const k4 = dynamics(theta + dt * k3.dTheta, omega + dt * k3.dOmega);

    return {
      theta: theta + (dt / 6) * (k1.dTheta + 2 * k2.dTheta + 2 * k3.dTheta + k4.dTheta),
      omega: omega + (dt / 6) * (k1.dOmega + 2 * k2.dOmega + 2 * k3.dOmega + k4.dOmega)
    };
  };

  const updateEquationCopy = () => {
    if (state.frictionEnabled) {
      frictionButton.textContent = "Remove friction";
      frictionButton.classList.add("is-active");
      equationEl.innerHTML = "&theta;&#776; = -(g / L) sin(&theta;) - c&theta;&#775;";
      equationCopyEl.textContent =
        "Friction adds a damping term proportional to velocity, so repeated passes lose energy and the phase portrait contracts into an inward spiral toward the stable fixed point.";
      return;
    }

    frictionButton.textContent = "Add friction";
    frictionButton.classList.remove("is-active");
    equationEl.innerHTML = "&theta;&#776; = -(g / L) sin(&theta;)";
    equationCopyEl.textContent =
      "With gravity alone, the system approximately preserves energy, so repeated trajectories stay on ring-like loops instead of collapsing inward.";
  };

  const updateStatus = () => {
    sampleEl.textContent = String(state.trialIndex);
    batchReadoutEl.textContent = String(state.batchSize);
    batchSizeInput.value = String(state.batchSize);
    observationsEl.textContent = String(state.observations.length);
    updateEquationCopy();
  };

  const startTrial = ({ resetBatch = false, theta = randomAngle(), source = "random" } = {}) => {
    if (resetBatch) {
      state.trialIndex = 0;
      state.history = [];
      state.observations = [];
    }

    state.trialIndex += 1;
    state.theta = wrapAngle(theta);
    state.omega = 0;
    state.elapsedMs = 0;
    state.accumulator = 0;
    state.trialSource = source;
    state.trialDurationMs = source === "manual" ? config.manualTrialMs : config.randomTrialMs;
    state.currentTrace = [
      {
        theta: state.theta,
        omega: state.omega,
        elapsedMs: 0
      }
    ];

    updateStatus();
  };

  const finishTrial = () => {
    state.history.push(state.currentTrace.map((point) => ({ ...point })));

    if (state.trialIndex >= state.batchSize) {
      startTrial({ resetBatch: true, source: "random" });
      return;
    }

    startTrial({ source: "random" });
  };

  const launchManualTrial = (theta) => {
    startTrial({ theta, source: "manual" });
  };

  const stepSimulation = () => {
    const derivative = dynamics(state.theta, state.omega);
    state.observations.push({
      omega: state.omega,
      theta: state.theta,
      dOmega: derivative.dOmega,
      dTheta: derivative.dTheta
    });

    const next = rk4Step(state.theta, state.omega, config.dt);
    state.theta = wrapAngle(next.theta);
    state.omega = next.omega;
    state.elapsedMs += config.dt * 1000;

    state.currentTrace.push({
      theta: state.theta,
      omega: state.omega,
      elapsedMs: state.elapsedMs
    });

    observationsEl.textContent = String(state.observations.length);

    if (state.elapsedMs >= state.trialDurationMs) {
      finishTrial();
    }
  };

  const update = (now) => {
    if (!state.lastTime) {
      state.lastTime = now;
      return;
    }

    const delta = Math.min(40, now - state.lastTime);
    state.lastTime = now;
    state.accumulator += delta / 1000;

    while (state.accumulator >= config.dt) {
      stepSimulation();
      state.accumulator -= config.dt;
    }
  };

  const drawPendulum = () => {
    resizeCanvas(pendulumCanvas, pendulumCtx);

    const { width, height, pivotX, pivotY, rodLength, bobRadius } = getPendulumLayout();
    const bobX = pivotX + rodLength * Math.sin(state.theta);
    const bobY = pivotY + rodLength * Math.cos(state.theta);

    pendulumCtx.clearRect(0, 0, width, height);

    pendulumCtx.strokeStyle = "rgba(17, 32, 25, 0.1)";
    pendulumCtx.lineWidth = 1;
    pendulumCtx.setLineDash([6, 6]);
    pendulumCtx.beginPath();
    pendulumCtx.moveTo(pivotX, pivotY - 8);
    pendulumCtx.lineTo(pivotX, pivotY + rodLength + 22);
    pendulumCtx.stroke();
    pendulumCtx.setLineDash([]);

    pendulumCtx.strokeStyle = "rgba(15, 61, 49, 0.92)";
    pendulumCtx.lineWidth = 4;
    pendulumCtx.beginPath();
    pendulumCtx.moveTo(pivotX, pivotY);
    pendulumCtx.lineTo(bobX, bobY);
    pendulumCtx.stroke();

    pendulumCtx.beginPath();
    pendulumCtx.fillStyle = "rgba(15, 61, 49, 0.94)";
    pendulumCtx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    pendulumCtx.fill();

    pendulumCtx.beginPath();
    pendulumCtx.fillStyle = "rgba(24, 75, 138, 0.98)";
    pendulumCtx.arc(bobX, bobY, bobRadius, 0, Math.PI * 2);
    pendulumCtx.fill();

    pendulumCtx.beginPath();
    pendulumCtx.fillStyle = "rgba(255, 255, 255, 0.24)";
    pendulumCtx.arc(bobX - bobRadius * 0.25, bobY - bobRadius * 0.25, bobRadius * 0.34, 0, Math.PI * 2);
    pendulumCtx.fill();

    pendulumCtx.fillStyle = axisGray;
    pendulumCtx.font = '600 12px "Source Sans 3", sans-serif';
    pendulumCtx.fillText("Click in the pane to choose a new initial angle", 18, height - 18);
  };

  const drawArrow = (ctx, x, y, dx, dy, color, lineWidth) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();

    const angle = Math.atan2(dy, dx);
    const head = 4.2;
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx - head * Math.cos(angle - Math.PI / 6), y + dy - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x + dx - head * Math.cos(angle + Math.PI / 6), y + dy - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };

  const drawPhasePlot = () => {
    resizeCanvas(phaseCanvas, phaseCtx);

    const width = phaseCanvas.clientWidth;
    const height = phaseCanvas.clientHeight;
    const padding = { top: 22, right: 20, bottom: 42, left: 54 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const xToPx = (omega) => padding.left + ((omega + config.omegaLimit) / (2 * config.omegaLimit)) * plotWidth;
    const yToPx = (theta) => padding.top + ((config.thetaLimit - theta) / (2 * config.thetaLimit)) * plotHeight;

    phaseCtx.clearRect(0, 0, width, height);
    phaseCtx.fillStyle = "rgba(255, 255, 255, 0.65)";
    phaseCtx.fillRect(padding.left, padding.top, plotWidth, plotHeight);

    phaseCtx.strokeStyle = gridGray;
    phaseCtx.lineWidth = 1;

    const xTicks = [-4, -2, 0, 2, 4];
    const yTicks = [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI];

    xTicks.forEach((tick) => {
      const x = xToPx(tick);
      phaseCtx.beginPath();
      phaseCtx.moveTo(x, padding.top);
      phaseCtx.lineTo(x, padding.top + plotHeight);
      phaseCtx.stroke();
    });

    yTicks.forEach((tick) => {
      const y = yToPx(tick);
      phaseCtx.beginPath();
      phaseCtx.moveTo(padding.left, y);
      phaseCtx.lineTo(padding.left + plotWidth, y);
      phaseCtx.stroke();
    });

    const cols = 15;
    const rows = 13;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const omega = -config.omegaLimit + (col / (cols - 1)) * config.omegaLimit * 2;
        const theta = config.thetaLimit - (row / (rows - 1)) * config.thetaLimit * 2;

        let estimateWeight = 0;
        let sumOmega = 0;
        let sumTheta = 0;
        let revealStrength = 0;

        state.observations.forEach((observation) => {
          const estimateDx = (observation.omega - omega) / config.estimateBandwidthOmega;
          const estimateDy = (observation.theta - theta) / config.estimateBandwidthTheta;
          const estimateDistSq = estimateDx * estimateDx + estimateDy * estimateDy;
          const estimateKernel = Math.exp(-0.5 * estimateDistSq);

          estimateWeight += estimateKernel;
          sumOmega += observation.dOmega * estimateKernel;
          sumTheta += observation.dTheta * estimateKernel;

          const revealDx = (observation.omega - omega) / config.revealBandwidthOmega;
          const revealDy = (observation.theta - theta) / config.revealBandwidthTheta;
          const revealDistSq = revealDx * revealDx + revealDy * revealDy;
          revealStrength = Math.max(revealStrength, Math.exp(-0.5 * revealDistSq));
        });

        if (estimateWeight < 0.015 || revealStrength < 0.08) {
          continue;
        }

        const fieldOmega = sumOmega / estimateWeight;
        const fieldTheta = sumTheta / estimateWeight;
        const rawDx = fieldOmega * (plotWidth / (2 * config.omegaLimit)) * 0.15;
        const rawDy = -fieldTheta * (plotHeight / (2 * config.thetaLimit)) * 0.15;
        const magnitude = Math.hypot(rawDx, rawDy) || 1;
        const scale = Math.min(1, 16 / magnitude);
        const confidence = clamp(estimateWeight / 2.6, 0.18, 1);
        const visibility = clamp(revealStrength * 1.1, 0, 1);

        drawArrow(
          phaseCtx,
          xToPx(omega),
          yToPx(theta),
          rawDx * scale,
          rawDy * scale,
          `rgba(76, 109, 124, ${visibility * (0.08 + confidence * 0.34)})`,
          1.1
        );
      }
    }

    const drawTrace = (trace, color, lineWidth) => {
      if (trace.length < 2) {
        return;
      }

      phaseCtx.strokeStyle = color;
      phaseCtx.lineWidth = lineWidth;
      phaseCtx.beginPath();
      phaseCtx.moveTo(xToPx(trace[0].omega), yToPx(trace[0].theta));
      for (let i = 1; i < trace.length; i += 1) {
        phaseCtx.lineTo(xToPx(trace[i].omega), yToPx(trace[i].theta));
      }
      phaseCtx.stroke();
    };

    state.history.forEach((trace) => {
      drawTrace(trace, colorToString(historicalGray), 2.1);
    });

    if (state.currentTrace.length > 1) {
      for (let i = 1; i < state.currentTrace.length; i += 1) {
        const previous = state.currentTrace[i - 1];
        const point = state.currentTrace[i];
        const age = state.elapsedMs - point.elapsedMs;
        const t = clamp(age / state.trialDurationMs, 0, 1);
        const segmentColor = mixColor(currentBlue, historicalGray, t);

        phaseCtx.strokeStyle = colorToString(segmentColor);
        phaseCtx.lineWidth = 2.6;
        phaseCtx.beginPath();
        phaseCtx.moveTo(xToPx(previous.omega), yToPx(previous.theta));
        phaseCtx.lineTo(xToPx(point.omega), yToPx(point.theta));
        phaseCtx.stroke();
      }

      const latest = state.currentTrace[state.currentTrace.length - 1];
      phaseCtx.fillStyle = colorToString(currentBlue);
      phaseCtx.beginPath();
      phaseCtx.arc(xToPx(latest.omega), yToPx(latest.theta), 4.5, 0, Math.PI * 2);
      phaseCtx.fill();
    }

    phaseCtx.strokeStyle = axisGray;
    phaseCtx.lineWidth = 1.2;
    phaseCtx.strokeRect(padding.left, padding.top, plotWidth, plotHeight);

    phaseCtx.fillStyle = axisGray;
    phaseCtx.font = '600 12px "Source Sans 3", sans-serif';
    phaseCtx.textAlign = "center";
    xTicks.forEach((tick) => {
      phaseCtx.fillText(String(tick), xToPx(tick), height - 16);
    });

    phaseCtx.textAlign = "right";
    phaseCtx.fillText("-pi", padding.left - 8, yToPx(-Math.PI) + 4);
    phaseCtx.fillText("-pi/2", padding.left - 8, yToPx(-Math.PI / 2) + 4);
    phaseCtx.fillText("0", padding.left - 8, yToPx(0) + 4);
    phaseCtx.fillText("pi/2", padding.left - 8, yToPx(Math.PI / 2) + 4);
    phaseCtx.fillText("pi", padding.left - 8, yToPx(Math.PI) + 4);

    phaseCtx.textAlign = "center";
    phaseCtx.fillText("Angular velocity", padding.left + plotWidth / 2, height - 4);

    phaseCtx.save();
    phaseCtx.translate(14, padding.top + plotHeight / 2);
    phaseCtx.rotate(-Math.PI / 2);
    phaseCtx.fillText("Position", 0, 0);
    phaseCtx.restore();
  };

  const draw = () => {
    drawPendulum();
    drawPhasePlot();
  };

  const startFreshBatch = () => {
    startTrial({ resetBatch: true, source: "random" });
    draw();
  };

  pendulumCanvas.addEventListener("click", (event) => {
    const rect = pendulumCanvas.getBoundingClientRect();
    const { pivotX, pivotY } = getPendulumLayout();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = x - pivotX;
    const dy = y - pivotY;

    if (Math.hypot(dx, dy) < 24) {
      return;
    }

    const angle = wrapAngle(Math.atan2(dx, dy));
    launchManualTrial(angle);
    draw();
  });

  batchSizeInput.addEventListener("change", () => {
    const parsed = Number.parseInt(batchSizeInput.value, 10);
    state.batchSize = clamp(Number.isFinite(parsed) ? parsed : 20, 1, 100);
    startFreshBatch();
  });

  frictionButton.addEventListener("click", () => {
    state.frictionEnabled = !state.frictionEnabled;
    startFreshBatch();
  });

  const tick = (now) => {
    update(now);
    draw();
    window.requestAnimationFrame(tick);
  };

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(draw, 120);
  });

  startFreshBatch();
  window.requestAnimationFrame(tick);
})();
