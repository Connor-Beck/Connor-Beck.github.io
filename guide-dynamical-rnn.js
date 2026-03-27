(() => {
  const root = document.querySelector("[data-rnn-demo]");
  if (!root) {
    return;
  }

  const networkCanvas = root.querySelector("[data-rnn-network]");
  const latentCanvas = root.querySelector("[data-rnn-latent]");
  const phaseEl = root.querySelector("[data-rnn-phase]");
  const contextEl = root.querySelector("[data-rnn-context]");
  const choiceEl = root.querySelector("[data-rnn-choice]");
  const timeEl = root.querySelector("[data-rnn-time]");
  const motionEl = root.querySelector("[data-rnn-motion]");
  const colorEl = root.querySelector("[data-rnn-color]");
  const outputEl = root.querySelector("[data-rnn-output]");
  const projectionEl = root.querySelector("[data-rnn-projection]");

  if (
    !networkCanvas ||
    !latentCanvas ||
    !phaseEl ||
    !contextEl ||
    !choiceEl ||
    !timeEl ||
    !motionEl ||
    !colorEl ||
    !outputEl ||
    !projectionEl
  ) {
    return;
  }

  const networkCtx = networkCanvas.getContext("2d");
  const latentCtx = latentCanvas.getContext("2d");
  if (!networkCtx || !latentCtx) {
    return;
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const norm = (vector) => Math.hypot(...vector);
  const normalize = (vector) => {
    const length = norm(vector) || 1;
    return vector.map((value) => value / length);
  };
  const subtractProjection = (vector, basis) => {
    const amount = dot(vector, basis);
    return vector.map((value, index) => value - amount * basis[index]);
  };
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const formatSigned = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

  const createRng = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  };

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

  const config = {
    units: 12,
    latentDims: 4,
    dt: 0.05,
    cueStart: 2,
    stimulusStart: 5,
    stimulusEnd: 14,
    trialDuration: 20,
    stepCount: Math.round(20 / 0.05),
    evidenceLevels: [-0.9, -0.6, -0.35, 0.35, 0.6, 0.9]
  };

  const buildModel = () => {
    const rng = createRng(2);
    const mixing = Array.from({ length: config.units }, (_, index) => {
      const row = Array.from({ length: config.latentDims }, () => lerp(-1, 1, rng()));
      row[3] += index % 4 === 0 ? 1.2 : index % 4 === 1 ? -1.2 : lerp(-0.2, 0.2, rng());
      return row;
    });

    const recurrent = Array.from({ length: config.units }, (_, row) =>
      Array.from({ length: config.units }, (_, col) => {
        if (row === col) {
          return 0.42 + lerp(-0.06, 0.06, rng());
        }
        let value = lerp(-0.18, 0.18, rng());
        if (Math.abs(row - col) === 1) {
          value += 0.08 * ((row + col) % 2 === 0 ? 1 : -1);
        }
        return value;
      })
    );

    return { mixing, recurrent };
  };

  const model = buildModel();

  const tanh = (value) => Math.tanh(value);

  const simulateTrial = (params, seed = 11) => {
    const rng = createRng(seed);
    const x = Array(config.units).fill(0);
    const z = [0, 0, 0, 0];
    const rates = [];
    const latentStates = [];
    const motionSeries = [];
    const colorSeries = [];
    const relevantSeries = [];
    const irrelevantSeries = [];
    const spikes = [];

    for (let step = 0; step < config.stepCount; step += 1) {
      const time = step * config.dt;
      let motionInput = 0;
      let colorInput = 0;
      let contextCue = 0;

      if (time >= config.cueStart) {
        contextCue = params.context === "motion" ? 1 : -1;
      }

      if (time >= config.stimulusStart && time <= config.stimulusEnd) {
        motionInput =
          params.motion +
          0.08 * Math.sin(0.7 * time + 0.4) +
          0.04 * Math.sin(1.7 * time + 1.1) +
          lerp(-0.015, 0.015, rng());
        colorInput =
          params.color +
          0.08 * Math.sin(0.9 * time + 1.0) +
          0.04 * Math.sin(1.4 * time + 0.3) +
          lerp(-0.015, 0.015, rng());
      }

      const relevantInput = params.context === "motion" ? motionInput : colorInput;
      const irrelevantInput = params.context === "motion" ? colorInput : motionInput;

      z[0] = 0.94 * z[0] + 0.18 * relevantInput;
      z[1] = 0.9 * z[1] + 0.14 * irrelevantInput;
      z[2] = 0.96 * z[2] + 0.18 * contextCue;
      z[3] = 0.95 * z[3] + 0.16 * tanh(1.35 * z[0] + 0.25 * z[3]);

      const previousRates = x.map(tanh);
      const nextRates = [];
      const spikeStep = [];

      for (let unit = 0; unit < config.units; unit += 1) {
        let drive = 0;
        for (let other = 0; other < config.units; other += 1) {
          drive += model.recurrent[unit][other] * previousRates[other];
        }
        for (let latentIndex = 0; latentIndex < config.latentDims; latentIndex += 1) {
          drive += model.mixing[unit][latentIndex] * z[latentIndex];
        }

        x[unit] = 0.88 * x[unit] + 0.12 * drive;
        const rate = tanh(x[unit]);
        nextRates.push(rate);

        const spikeProbability = clamp(0.015 + Math.max(0, rate) * 0.1, 0.01, 0.18);
        spikeStep.push(rng() < spikeProbability ? 1 : 0);
      }

      rates.push(nextRates);
      latentStates.push(z.slice());
      motionSeries.push(motionInput);
      colorSeries.push(colorInput);
      relevantSeries.push(relevantInput);
      irrelevantSeries.push(irrelevantInput);
      spikes.push(spikeStep);
    }

    const targetChoice = params.context === "motion" ? Math.sign(params.motion) : Math.sign(params.color);

    return {
      ...params,
      targetChoice: targetChoice >= 0 ? 1 : -1,
      rates,
      latentStates,
      motionSeries,
      colorSeries,
      relevantSeries,
      irrelevantSeries,
      spikes
    };
  };

  const solveLinearSystem = (matrix, vector) => {
    const size = matrix.length;
    const A = matrix.map((row) => row.slice());
    const b = vector.slice();

    for (let column = 0; column < size; column += 1) {
      let pivotRow = column;
      for (let row = column + 1; row < size; row += 1) {
        if (Math.abs(A[row][column]) > Math.abs(A[pivotRow][column])) {
          pivotRow = row;
        }
      }

      if (pivotRow !== column) {
        [A[column], A[pivotRow]] = [A[pivotRow], A[column]];
        [b[column], b[pivotRow]] = [b[pivotRow], b[column]];
      }

      const pivot = A[column][column] || 1e-8;
      for (let index = column; index < size; index += 1) {
        A[column][index] /= pivot;
      }
      b[column] /= pivot;

      for (let row = 0; row < size; row += 1) {
        if (row === column) {
          continue;
        }
        const factor = A[row][column];
        if (!factor) {
          continue;
        }
        for (let index = column; index < size; index += 1) {
          A[row][index] -= factor * A[column][index];
        }
        b[row] -= factor * b[column];
      }
    }

    return b;
  };

  const fitWeights = (designRows, targets) => {
    const dims = designRows[0].length;
    const xtx = Array.from({ length: dims }, () => Array(dims).fill(0));
    const xty = Array(dims).fill(0);

    designRows.forEach((row, rowIndex) => {
      for (let i = 0; i < dims; i += 1) {
        xty[i] += row[i] * targets[rowIndex];
        for (let j = 0; j < dims; j += 1) {
          xtx[i][j] += row[i] * row[j];
        }
      }
    });

    return solveLinearSystem(xtx, xty);
  };

  const fitMultiResponse = (designRows, responseRows) => {
    const predictorCount = designRows[0].length;
    const responseCount = responseRows[0].length;
    const xtx = Array.from({ length: predictorCount }, () => Array(predictorCount).fill(0));
    const xty = Array.from({ length: predictorCount }, () => Array(responseCount).fill(0));

    designRows.forEach((row, sampleIndex) => {
      for (let i = 0; i < predictorCount; i += 1) {
        for (let j = 0; j < predictorCount; j += 1) {
          xtx[i][j] += row[i] * row[j];
        }
        for (let responseIndex = 0; responseIndex < responseCount; responseIndex += 1) {
          xty[i][responseIndex] += row[i] * responseRows[sampleIndex][responseIndex];
        }
      }
    });

    const responseCoefficients = Array.from({ length: responseCount }, (_, responseIndex) =>
      solveLinearSystem(
        xtx,
        xty.map((row) => row[responseIndex])
      )
    );

    return Array.from({ length: predictorCount }, (_, predictorIndex) =>
      responseCoefficients.map((coefficients) => coefficients[predictorIndex])
    );
  };

  const trainingTrials = [];
  let trainingSeed = 100;
  ["motion", "color"].forEach((context) => {
    config.evidenceLevels.forEach((motion) => {
      config.evidenceLevels.forEach((color) => {
        trainingTrials.push(simulateTrial({ context, motion, color }, trainingSeed));
        trainingSeed += 1;
      });
    });
  });

  const readoutDesign = [];
  const readoutTargets = [];
  trainingTrials.forEach((trial) => {
    for (let step = Math.round(10 / config.dt); step < config.stepCount; step += 8) {
      readoutDesign.push(trial.rates[step].concat(1));
      readoutTargets.push(trial.latentStates[step][3]);
    }
  });
  const readoutWeights = fitWeights(readoutDesign, readoutTargets);
  const readoutBias = readoutWeights[readoutWeights.length - 1];
  const readoutVector = readoutWeights.slice(0, -1);

  const regressionDesign = [];
  const regressionResponses = [];
  trainingTrials.forEach((trial) => {
    const contextValue = trial.context === "motion" ? 1 : -1;
    const relevantValue = trial.context === "motion" ? trial.motion : trial.color;
    const irrelevantValue = trial.context === "motion" ? trial.color : trial.motion;

    for (let step = Math.round(5 / config.dt); step < config.stepCount; step += 5) {
      const decodedChoice = dot(readoutVector, trial.rates[step]) + readoutBias;
      regressionDesign.push([1, decodedChoice, relevantValue, irrelevantValue, contextValue]);
      regressionResponses.push(trial.rates[step]);
    }
  });

  const regressionCoefficients = fitMultiResponse(regressionDesign, regressionResponses);
  const choiceAxisRaw = regressionCoefficients[1];
  const relevantAxisRaw = regressionCoefficients[2];
  const relevantAxis = normalize(relevantAxisRaw);
  const choiceAxis = normalize(subtractProjection(choiceAxisRaw, relevantAxis));

  const projectState = (stateVector) => ({
    x: dot(relevantAxis, stateVector),
    y: dot(choiceAxis, stateVector)
  });

  const projectTrial = (trial) =>
    trial.rates.map((stateVector) => {
      const point = projectState(stateVector);
      return {
        x: point.x,
        y: point.y
      };
    });

  const referenceTrajectories = trainingTrials
    .filter(
      (trial) =>
        Math.abs(trial.motion) >= 0.6 &&
        Math.abs(trial.color) >= 0.6 &&
        Math.sign(trial.motion) !== Math.sign(trial.color)
    )
    .slice(0, 12)
    .map(projectTrial);

  const referenceExtents = (() => {
    const points = referenceTrajectories.flat();
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX,
      minY,
      maxY
    };
  })();

  const generateParams = (rng) => {
    const context = rng() < 0.5 ? "motion" : "color";
    let motion = config.evidenceLevels[Math.floor(rng() * config.evidenceLevels.length)];
    let color = config.evidenceLevels[Math.floor(rng() * config.evidenceLevels.length)];

    if (rng() < 0.65) {
      color = Math.abs(color) * Math.sign(-motion);
    }

    return {
      context,
      motion,
      color
    };
  };

  const decodeChoice = (stateVector) => dot(readoutVector, stateVector) + readoutBias;

  const projectChoice = (stateVector) => dot(choiceAxis, stateVector);

  const liveRng = createRng(37);
  let liveSeed = 1000;
  let currentTrial = null;
  let currentProjection = [];
  let cycleStart = performance.now();
  let currentStep = -1;
  let flashLevels = Array(config.units).fill(0);

  const beginTrial = (now = performance.now()) => {
    let trial = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const params = generateParams(liveRng);
      const candidate = simulateTrial(params, liveSeed);
      liveSeed += 1;
      const finalChoice = decodeChoice(candidate.rates[candidate.rates.length - 1]);
      const predicted = finalChoice >= 0 ? 1 : -1;
      if (predicted === candidate.targetChoice) {
        trial = candidate;
        break;
      }
      trial = candidate;
    }

    currentTrial = trial;
    currentProjection = projectTrial(trial);
    cycleStart = now;
    currentStep = -1;
    flashLevels = Array(config.units).fill(0);
  };

  const networkNodes = Array.from({ length: config.units }, (_, index) => ({
    x: 0.34 + (index % 3) * 0.17,
    y: 0.22 + Math.floor(index / 3) * 0.19
  }));

  const networkEdges = [];
  for (let target = 0; target < config.units; target += 1) {
    for (let source = 0; source < config.units; source += 1) {
      const weight = model.recurrent[target][source];
      if (source === target || Math.abs(weight) < 0.14) {
        continue;
      }
      networkEdges.push({ source, target, weight });
    }
  }

  const drawRoundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  };

  const drawInputMeter = (ctx, box, label, value, highlighted) => {
    ctx.save();
    drawRoundedRect(ctx, box.x, box.y, box.w, box.h, 16);
    ctx.fillStyle = highlighted ? "rgba(24, 75, 138, 0.1)" : "rgba(17, 32, 25, 0.045)";
    ctx.fill();
    ctx.strokeStyle = highlighted ? "rgba(24, 75, 138, 0.25)" : "rgba(17, 32, 25, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(17, 32, 25, 0.88)";
    ctx.font = '700 12px "Source Sans 3", sans-serif';
    ctx.fillText(label, box.x + 14, box.y + 20);

    const meterY = box.y + box.h - 26;
    const meterX = box.x + 14;
    const meterW = box.w - 28;
    ctx.strokeStyle = "rgba(17, 32, 25, 0.16)";
    ctx.beginPath();
    ctx.moveTo(meterX, meterY);
    ctx.lineTo(meterX + meterW, meterY);
    ctx.stroke();

    const centerX = meterX + meterW * 0.5;
    const fillW = (meterW * 0.46 * Math.abs(value)) / 1.05;
    ctx.strokeStyle = value >= 0 ? "rgba(24, 75, 138, 0.92)" : "rgba(176, 94, 52, 0.92)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(centerX, meterY);
    ctx.lineTo(centerX + (value >= 0 ? fillW : -fillW), meterY);
    ctx.stroke();

    ctx.fillStyle = "rgba(66, 80, 74, 0.84)";
    ctx.font = '600 11px "Source Sans 3", sans-serif';
    ctx.fillText(formatSigned(value), box.x + 14, box.y + box.h - 8);
    ctx.restore();
  };

  const drawOutputMeter = (ctx, box, value) => {
    ctx.save();
    drawRoundedRect(ctx, box.x, box.y, box.w, box.h, 16);
    ctx.fillStyle = "rgba(17, 32, 25, 0.045)";
    ctx.fill();
    ctx.strokeStyle = "rgba(17, 32, 25, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(17, 32, 25, 0.88)";
    ctx.font = '700 12px "Source Sans 3", sans-serif';
    ctx.fillText("Choice output", box.x + 14, box.y + 20);

    const meterX = box.x + 14;
    const meterY = box.y + box.h - 26;
    const meterW = box.w - 28;
    ctx.strokeStyle = "rgba(17, 32, 25, 0.16)";
    ctx.beginPath();
    ctx.moveTo(meterX, meterY);
    ctx.lineTo(meterX + meterW, meterY);
    ctx.stroke();

    const centerX = meterX + meterW * 0.5;
    const fillW = (meterW * 0.46 * Math.abs(value)) / 1.25;
    ctx.strokeStyle = value >= 0 ? "rgba(24, 75, 138, 0.96)" : "rgba(176, 94, 52, 0.96)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(centerX, meterY);
    ctx.lineTo(centerX + (value >= 0 ? fillW : -fillW), meterY);
    ctx.stroke();

    ctx.font = '700 14px "Sora", sans-serif';
    ctx.fillStyle = value >= 0 ? "rgba(24, 75, 138, 0.96)" : "rgba(176, 94, 52, 0.96)";
    ctx.fillText(value >= 0 ? "Right" : "Left", box.x + 14, box.y + box.h * 0.54);

    ctx.font = '600 11px "Source Sans 3", sans-serif';
    ctx.fillStyle = "rgba(66, 80, 74, 0.84)";
    ctx.fillText(formatSigned(value), box.x + 14, box.y + box.h - 8);
    ctx.restore();
  };

  const drawNetwork = () => {
    if (!currentTrial) {
      return;
    }

    resizeCanvas(networkCanvas, networkCtx);
    const width = networkCanvas.clientWidth;
    const height = networkCanvas.clientHeight;
    const rates = currentTrial.rates[Math.max(0, currentStep)];
    const motionValue = currentTrial.motionSeries[Math.max(0, currentStep)];
    const colorValue = currentTrial.colorSeries[Math.max(0, currentStep)];
    const outputValue = decodeChoice(rates);
    const contextIsMotion = currentTrial.context === "motion";

    networkCtx.clearRect(0, 0, width, height);
    networkCtx.fillStyle = "rgba(255, 255, 255, 0.78)";
    networkCtx.fillRect(0, 0, width, height);

    drawRoundedRect(networkCtx, width * 0.37, 14, width * 0.26, 32, 16);
    networkCtx.fillStyle = contextIsMotion ? "rgba(24, 75, 138, 0.1)" : "rgba(176, 94, 52, 0.12)";
    networkCtx.fill();
    networkCtx.strokeStyle = contextIsMotion ? "rgba(24, 75, 138, 0.22)" : "rgba(176, 94, 52, 0.26)";
    networkCtx.stroke();
    networkCtx.fillStyle = "rgba(17, 32, 25, 0.88)";
    networkCtx.font = '700 12px "Source Sans 3", sans-serif';
    networkCtx.textAlign = "center";
    networkCtx.fillText(
      `Attend ${contextIsMotion ? "motion" : "color"}`,
      width * 0.5,
      34
    );
    networkCtx.textAlign = "left";

    const motionBox = { x: 16, y: height * 0.2, w: width * 0.2, h: height * 0.22 };
    const colorBox = { x: 16, y: height * 0.56, w: width * 0.2, h: height * 0.22 };
    drawInputMeter(networkCtx, motionBox, "Motion input", motionValue, contextIsMotion);
    drawInputMeter(networkCtx, colorBox, "Color input", colorValue, !contextIsMotion);

    const outputBox = { x: width * 0.8, y: height * 0.38, w: width * 0.16, h: height * 0.24 };
    drawOutputMeter(networkCtx, outputBox, outputValue);

    networkEdges.forEach((edge) => {
      const source = networkNodes[edge.source];
      const target = networkNodes[edge.target];
      const sourceRate = clamp((rates[edge.source] + 1) * 0.5, 0, 1);
      const alpha = 0.05 + Math.abs(edge.weight) * 0.18 + sourceRate * 0.14;
      networkCtx.strokeStyle =
        edge.weight >= 0
          ? `rgba(24, 75, 138, ${alpha})`
          : `rgba(117, 130, 141, ${alpha})`;
      networkCtx.lineWidth = 0.8 + Math.abs(edge.weight) * 1.6;
      networkCtx.beginPath();
      networkCtx.moveTo(source.x * width, source.y * height);
      networkCtx.lineTo(target.x * width, target.y * height);
      networkCtx.stroke();
    });

    networkNodes.forEach((node, index) => {
      const x = node.x * width;
      const y = node.y * height;
      const activity = clamp((rates[index] + 1) * 0.5, 0, 1);
      const flash = flashLevels[index];
      const radius = 12 + activity * 4;

      networkCtx.beginPath();
      networkCtx.fillStyle = `rgba(24, 75, 138, ${0.08 + flash * 0.22})`;
      networkCtx.arc(x, y, radius + flash * 9, 0, Math.PI * 2);
      networkCtx.fill();

      networkCtx.beginPath();
      networkCtx.fillStyle = `rgba(${Math.round(lerp(120, 24, activity))}, ${Math.round(
        lerp(134, 75, activity)
      )}, ${Math.round(lerp(146, 138, activity))}, 0.95)`;
      networkCtx.arc(x, y, radius, 0, Math.PI * 2);
      networkCtx.fill();

      networkCtx.beginPath();
      networkCtx.strokeStyle = flash > 0.15 ? "rgba(255, 255, 255, 0.9)" : "rgba(17, 32, 25, 0.18)";
      networkCtx.lineWidth = flash > 0.15 ? 2 : 1;
      networkCtx.arc(x, y, radius, 0, Math.PI * 2);
      networkCtx.stroke();
    });
  };

  const drawLatent = () => {
    if (!currentProjection.length) {
      return;
    }

    resizeCanvas(latentCanvas, latentCtx);
    const width = latentCanvas.clientWidth;
    const height = latentCanvas.clientHeight;
    const padding = { top: 20, right: 20, bottom: 44, left: 58 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const activePoints = currentProjection.slice(0, Math.max(1, currentStep + 1));
    const xValues = activePoints.map((point) => point.x);
    const yValues = activePoints.map((point) => point.y);

    const minX = Math.min(referenceExtents.minX, ...xValues);
    const maxX = Math.max(referenceExtents.maxX, ...xValues);
    const minY = Math.min(referenceExtents.minY, ...yValues);
    const maxY = Math.max(referenceExtents.maxY, ...yValues);
    const xPad = (maxX - minX || 1) * 0.14;
    const yPad = (maxY - minY || 1) * 0.14;

    const xToPx = (value) => padding.left + ((value - (minX - xPad)) / (maxX - minX + xPad * 2 || 1)) * plotWidth;
    const yToPx = (value) => padding.top + ((maxY + yPad - value) / (maxY - minY + yPad * 2 || 1)) * plotHeight;

    latentCtx.clearRect(0, 0, width, height);
    latentCtx.fillStyle = "rgba(255, 255, 255, 0.78)";
    latentCtx.fillRect(padding.left, padding.top, plotWidth, plotHeight);

    latentCtx.strokeStyle = "rgba(17, 32, 25, 0.08)";
    latentCtx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((fraction) => {
      const x = padding.left + plotWidth * fraction;
      const y = padding.top + plotHeight * fraction;
      latentCtx.beginPath();
      latentCtx.moveTo(x, padding.top);
      latentCtx.lineTo(x, padding.top + plotHeight);
      latentCtx.stroke();
      latentCtx.beginPath();
      latentCtx.moveTo(padding.left, y);
      latentCtx.lineTo(padding.left + plotWidth, y);
      latentCtx.stroke();
    });

    referenceTrajectories.forEach((trajectory) => {
      latentCtx.strokeStyle = "rgba(122, 136, 148, 0.22)";
      latentCtx.lineWidth = 1.5;
      latentCtx.beginPath();
      latentCtx.moveTo(xToPx(trajectory[0].x), yToPx(trajectory[0].y));
      for (let index = 1; index < trajectory.length; index += 1) {
        latentCtx.lineTo(xToPx(trajectory[index].x), yToPx(trajectory[index].y));
      }
      latentCtx.stroke();
    });

    if (activePoints.length > 1) {
      latentCtx.strokeStyle = "rgba(24, 75, 138, 0.96)";
      latentCtx.lineWidth = 2.8;
      latentCtx.beginPath();
      latentCtx.moveTo(xToPx(activePoints[0].x), yToPx(activePoints[0].y));
      for (let index = 1; index < activePoints.length; index += 1) {
        latentCtx.lineTo(xToPx(activePoints[index].x), yToPx(activePoints[index].y));
      }
      latentCtx.stroke();
    }

    const latest = activePoints[activePoints.length - 1];
    latentCtx.fillStyle = "rgba(24, 75, 138, 0.98)";
    latentCtx.beginPath();
    latentCtx.arc(xToPx(latest.x), yToPx(latest.y), 4.6, 0, Math.PI * 2);
    latentCtx.fill();

    latentCtx.strokeStyle = "rgba(66, 80, 74, 0.76)";
    latentCtx.lineWidth = 1.2;
    latentCtx.strokeRect(padding.left, padding.top, plotWidth, plotHeight);

    latentCtx.fillStyle = "rgba(66, 80, 74, 0.84)";
    latentCtx.font = '600 12px "Source Sans 3", sans-serif';
    latentCtx.textAlign = "center";
    latentCtx.fillText("Relevant input axis", padding.left + plotWidth / 2, height - 8);

    latentCtx.save();
    latentCtx.translate(16, padding.top + plotHeight / 2);
    latentCtx.rotate(-Math.PI / 2);
    latentCtx.fillText("Choice axis", 0, 0);
    latentCtx.restore();
  };

  const getPhase = (seconds) => {
    if (seconds < config.cueStart) {
      return "Fixation";
    }
    if (seconds < config.stimulusStart) {
      return "Context cue";
    }
    if (seconds < config.stimulusEnd) {
      return "Evidence integration";
    }
    return "Decision / output";
  };

  const updateReadouts = (seconds) => {
    const step = Math.max(0, currentStep);
    const rates = currentTrial.rates[step];
    const motionValue = currentTrial.motionSeries[step];
    const colorValue = currentTrial.colorSeries[step];
    const outputValue = decodeChoice(rates);

    phaseEl.textContent = getPhase(seconds);
    contextEl.textContent = currentTrial.context === "motion" ? "Motion" : "Color";
    choiceEl.textContent = outputValue >= 0 ? "Right" : "Left";
    timeEl.textContent = seconds.toFixed(1);
    motionEl.textContent = formatSigned(motionValue);
    colorEl.textContent = formatSigned(colorValue);
    outputEl.textContent = formatSigned(outputValue);
    projectionEl.textContent = formatSigned(projectChoice(rates));
  };

  const tick = (now) => {
    if (!currentTrial) {
      beginTrial(now);
    }

    let elapsedSeconds = (now - cycleStart) / 1000;
    if (elapsedSeconds >= config.trialDuration) {
      beginTrial(now);
      elapsedSeconds = 0;
    }

    const nextStep = clamp(Math.floor(elapsedSeconds / config.dt), 0, config.stepCount - 1);
    if (nextStep !== currentStep) {
      currentStep = nextStep;
      const stepSpikes = currentTrial.spikes[currentStep];
      flashLevels = flashLevels.map((level, index) =>
        stepSpikes[index] ? 1 : level * 0.82
      );
    } else {
      flashLevels = flashLevels.map((level) => level * 0.93);
    }

    updateReadouts(elapsedSeconds);
    drawNetwork();
    drawLatent();
    window.requestAnimationFrame(tick);
  };

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      drawNetwork();
      drawLatent();
    }, 120);
  });

  beginTrial();
  window.requestAnimationFrame(tick);
})();
