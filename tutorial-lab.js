(() => {
  "use strict";

  const root = document.getElementById("tutorial-lab");
  if (!root) {
    return;
  }

  const moduleSelect = document.getElementById("lab-module");
  const neuronInput = document.getElementById("lab-neuron");
  const runButton = document.getElementById("lab-run");
  const resetButton = document.getElementById("lab-reset");
  const statusChip = document.getElementById("lab-status");
  const codeArea = document.getElementById("lab-code");
  const output = document.getElementById("lab-output");
  const plot = document.getElementById("lab-plot");

  if (
    !moduleSelect ||
    !neuronInput ||
    !runButton ||
    !resetButton ||
    !statusChip ||
    !codeArea ||
    !output ||
    !plot
  ) {
    return;
  }

  const templates = {
    normalize: `import numpy as np

# Task 1.1.0: normalize one neuron with DeltaF/F
trace = raw_data[selected_neuron].copy()
F0 = np.percentile(trace, 20)
dff = (trace - F0) / (F0 + 1e-9)

result = {
    "raw": trace,
    "processed": dff,
    "label": "DeltaF/F",
    "events": []
}
`,
    background: `import numpy as np

# Task 1.1.1: subtract slow baseline drift
trace = raw_data[selected_neuron].copy()
window_sec = 20
window = max(3, int(window_sec * fs))
if window % 2 == 0:
    window += 1

kernel = np.ones(window) / window
baseline = np.convolve(trace, kernel, mode="same")
corrected = trace - baseline

result = {
    "raw": trace,
    "processed": corrected,
    "label": "Background subtracted",
    "events": []
}
`,
    events: `import numpy as np

# Task 1.2: detect transient events on a normalized trace
trace = raw_data[selected_neuron].copy()
F0 = np.percentile(trace, 20)
dff = (trace - F0) / (F0 + 1e-9)

mu = np.mean(dff)
sigma = np.std(dff)
threshold = mu + 3.0 * sigma  # try changing 3.0 to 4.0 or 5.0
events = np.where(dff > threshold)[0]

result = {
    "raw": trace,
    "processed": dff,
    "label": f"DeltaF/F with events (threshold={threshold:.3f})",
    "events": events
}
`
  };

  let pyodide = null;
  let neuronCount = 0;
  let frameCount = 0;
  let fullNeuronCount = 0;
  let fullFrameCount = 0;
  let busy = false;
  let samplingRate = Number.parseFloat(root.dataset.fs || "4.8");
  if (!Number.isFinite(samplingRate) || samplingRate <= 0) {
    samplingRate = 4.8;
  }

  const setBusy = (value) => {
    busy = value;
    runButton.disabled = value || !pyodide;
    resetButton.disabled = value;
    moduleSelect.disabled = value;
    neuronInput.disabled = value || !pyodide;
  };

  const setStatus = (message, mode = "pending") => {
    statusChip.textContent = message;
    statusChip.classList.remove("error", "ready");
    if (mode === "error") {
      statusChip.classList.add("error");
    } else if (mode === "ready") {
      statusChip.classList.add("ready");
    }
  };

  const setOutput = (message) => {
    output.textContent = message;
  };

  const toNumberArray = (value) => {
    if (value == null) return [];
    if (Array.isArray(value)) return value.map((item) => Number(item));
    if (ArrayBuffer.isView(value)) return Array.from(value, (item) => Number(item));
    if (typeof value === "number") return [Number(value)];
    if (typeof value.toJs === "function") {
      const converted = value.toJs();
      if (typeof value.destroy === "function") value.destroy();
      return toNumberArray(converted);
    }
    return [];
  };

  const clampNeuronIndex = () => {
    const maxIndex = Math.max(0, neuronCount - 1);
    const parsed = Number.parseInt(neuronInput.value, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(maxIndex, parsed)) : 0;
    neuronInput.value = String(clamped);
    return clamped;
  };

  const resetTemplate = () => {
    const selected = moduleSelect.value;
    codeArea.value = templates[selected] || templates.normalize;
  };

  const renderPlot = (result, selectedNeuron) => {
    const raw = toNumberArray(result.raw);
    const processed = toNumberArray(result.processed);
    const events = toNumberArray(result.events);

    if (!raw.length || !processed.length) {
      throw new Error("result['raw'] and result['processed'] must be non-empty arrays.");
    }

    const n = Math.min(raw.length, processed.length);
    const x = Array.from({ length: n }, (_, idx) => idx / samplingRate);
    const rawTrace = raw.slice(0, n);
    const procTrace = processed.slice(0, n);

    const traces = [
      {
        x,
        y: rawTrace,
        mode: "lines",
        name: "Raw",
        line: { width: 1.1, color: "rgba(99, 116, 111, 0.65)" }
      },
      {
        x,
        y: procTrace,
        mode: "lines",
        name: result.label || "Processed",
        line: { width: 2, color: "rgba(20, 143, 96, 0.96)" }
      }
    ];

    if (events.length) {
      const validEvents = events
        .map((idx) => Math.trunc(Number(idx)))
        .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < n);
      traces.push({
        x: validEvents.map((idx) => idx / samplingRate),
        y: validEvents.map((idx) => procTrace[idx]),
        mode: "markers",
        name: "Events",
        marker: { size: 7, color: "rgba(218, 86, 80, 0.95)" }
      });
    }

    Plotly.newPlot(
      plot,
      traces,
      {
        margin: { l: 54, r: 16, t: 36, b: 48 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        legend: { orientation: "h", y: 1.18 },
        xaxis: { title: "Time (s)", zeroline: false },
        yaxis: { title: "Signal", zeroline: false }
      },
      { responsive: true, displayModeBar: false }
    );

    const rawMean = rawTrace.reduce((sum, val) => sum + val, 0) / n;
    const procMean = procTrace.reduce((sum, val) => sum + val, 0) / n;
    const eventCount = events.length ? events.length : 0;
    setOutput(
      `Neuron ${selectedNeuron} | points: ${n}\n` +
        `raw mean: ${rawMean.toFixed(3)}\n` +
        `processed mean: ${procMean.toFixed(3)}\n` +
        `events: ${eventCount}`
    );
  };

  const runCode = async () => {
    if (!pyodide || busy) return;
    setBusy(true);
    setStatus("Running...", "pending");

    const selectedNeuron = clampNeuronIndex();
    pyodide.globals.set("selected_neuron", selectedNeuron);

    try {
      await pyodide.runPythonAsync(
        `result = None\n${codeArea.value}\n` +
          `\nif result is None:\n` +
          `    raise RuntimeError("Create a variable named 'result' (dict with raw/processed arrays).")\n`
      );

      const resultProxy = pyodide.globals.get("result");
      const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
      resultProxy.destroy();

      renderPlot(result, selectedNeuron);
      setStatus("Ready", "ready");
    } catch (error) {
      setStatus("Error", "error");
      setOutput(String(error));
    } finally {
      setBusy(false);
    }
  };

  const initialize = async () => {
    if (!window.loadPyodide || !window.Plotly) {
      setStatus("Runtime unavailable", "error");
      setOutput("Pyodide or Plotly did not load. Check network access and refresh.");
      return;
    }

    setBusy(true);
    setStatus("Loading Python runtime...", "pending");
    resetTemplate();

    try {
      pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/"
      });
      await pyodide.loadPackage(["numpy"]);

      setStatus("Loading calcium data...", "pending");
      const csvPath = root.dataset.csv || "Fluorescent%20Data.csv";
      const response = await fetch(csvPath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load ${csvPath}: ${response.status}`);
      }
      const csvText = await response.text();
      pyodide.globals.set("csv_text", csvText);
      pyodide.globals.set("fs", samplingRate);

      await pyodide.runPythonAsync(`
import numpy as np

def _load_calcium_subset(csv_text, max_neurons=48, max_frames=2500):
    lines = [line.strip() for line in csv_text.splitlines() if line.strip()]
    if not lines:
        raise ValueError("CSV file appears empty.")

    full_neurons = len(lines)
    first_row = np.fromstring(lines[0], sep=",", dtype=np.float64)
    full_frames = int(first_row.size)

    rows = []
    for idx, line in enumerate(lines):
        if idx >= max_neurons:
            break
        arr = np.fromstring(line, sep=",", dtype=np.float64)
        if arr.size == 0:
            continue
        rows.append(arr[:max_frames])

    if not rows:
        raise ValueError("No numeric rows were parsed from CSV.")

    min_len = min(row.size for row in rows)
    data = np.vstack([row[:min_len] for row in rows]).astype(np.float64, copy=False)
    return data, full_neurons, full_frames

raw_data, full_neurons, full_frames = _load_calcium_subset(csv_text)
n_neurons, n_frames = raw_data.shape
del csv_text
`);

      const neuronProxy = pyodide.globals.get("n_neurons");
      const frameProxy = pyodide.globals.get("n_frames");
      const fullNeuronProxy = pyodide.globals.get("full_neurons");
      const fullFrameProxy = pyodide.globals.get("full_frames");
      neuronCount = Number(typeof neuronProxy.toJs === "function" ? neuronProxy.toJs() : neuronProxy);
      frameCount = Number(typeof frameProxy.toJs === "function" ? frameProxy.toJs() : frameProxy);
      fullNeuronCount = Number(
        typeof fullNeuronProxy.toJs === "function" ? fullNeuronProxy.toJs() : fullNeuronProxy
      );
      fullFrameCount = Number(
        typeof fullFrameProxy.toJs === "function" ? fullFrameProxy.toJs() : fullFrameProxy
      );
      neuronProxy.destroy();
      frameProxy.destroy();
      fullNeuronProxy.destroy();
      fullFrameProxy.destroy();

      neuronInput.min = "0";
      neuronInput.max = String(Math.max(0, neuronCount - 1));
      neuronInput.value = "0";

      setStatus("Ready", "ready");
      setOutput(
        `Dataset loaded.\n` +
          `full CSV: ${fullNeuronCount} neurons x ${fullFrameCount} frames\n` +
          `interactive subset: ${neuronCount} neurons x ${frameCount} frames`
      );

      await runCode();
    } catch (error) {
      setStatus("Error", "error");
      setOutput(String(error));
    } finally {
      setBusy(false);
      runButton.disabled = !pyodide;
      neuronInput.disabled = !pyodide;
    }
  };

  moduleSelect.addEventListener("change", () => {
    resetTemplate();
  });

  resetButton.addEventListener("click", () => {
    resetTemplate();
    setOutput("Template restored.");
  });

  runButton.addEventListener("click", () => {
    runCode();
  });

  neuronInput.addEventListener("change", () => {
    clampNeuronIndex();
  });

  initialize();
})();
