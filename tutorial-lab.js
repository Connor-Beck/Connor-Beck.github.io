(() => {
  "use strict";

  const labRoots = Array.from(document.querySelectorAll(".tutorial-lab"));
  if (!labRoots.length) return;

  const templates = {
    normalize: `import numpy as np

# Task 1.1.0: normalize one neuron to ΔF/F
trace = raw_data[selected_neuron].astype(float).copy()
F0 = np.percentile(trace, 20)
dff = (trace - F0) / (F0 + 1e-9)
time = np.arange(trace.size) / fs

# Users can edit this Plotly figure dictionary directly
figure = {
    "data": [
        {
            "x": time.tolist(),
            "y": trace.tolist(),
            "type": "scatter",
            "mode": "lines",
            "name": "Raw fluorescence",
            "line": {"width": 1.1, "color": "rgba(96, 114, 108, 0.65)"}
        },
        {
            "x": time.tolist(),
            "y": dff.tolist(),
            "type": "scatter",
            "mode": "lines",
            "name": "ΔF/F",
            "yaxis": "y2",
            "line": {"width": 2.0, "color": "rgba(20, 143, 96, 0.95)"}
        }
    ],
    "layout": {
        "title": f"Neuron {selected_neuron}: raw vs ΔF/F",
        "xaxis": {"title": "Time (s)"},
        "yaxis": {"title": "Raw fluorescence (a.u.)"},
        "yaxis2": {
            "title": "ΔF/F",
            "overlaying": "y",
            "side": "right",
            "showgrid": False
        }
    }
}

summary = f"Neuron {selected_neuron} | F0={F0:.2f} | mean ΔF/F={np.mean(dff):.4f}"
`,
    background: `import numpy as np

# Task 1.1.1: remove slow baseline drift
trace = raw_data[selected_neuron].astype(float).copy()
window_sec = 20
window = max(3, int(window_sec * fs))
if window % 2 == 0:
    window += 1

kernel = np.ones(window) / window
baseline = np.convolve(trace, kernel, mode="same")
corrected = trace - baseline
time = np.arange(trace.size) / fs

figure = {
    "data": [
        {
            "x": time.tolist(),
            "y": trace.tolist(),
            "type": "scatter",
            "mode": "lines",
            "name": "Raw",
            "line": {"width": 1.1, "color": "rgba(96, 114, 108, 0.55)"}
        },
        {
            "x": time.tolist(),
            "y": baseline.tolist(),
            "type": "scatter",
            "mode": "lines",
            "name": "Estimated baseline",
            "line": {"width": 1.5, "color": "rgba(194, 114, 77, 0.9)"}
        },
        {
            "x": time.tolist(),
            "y": corrected.tolist(),
            "type": "scatter",
            "mode": "lines",
            "name": "Background-subtracted",
            "line": {"width": 2.0, "color": "rgba(20, 143, 96, 0.96)"}
        }
    ],
    "layout": {
        "title": f"Neuron {selected_neuron}: background subtraction",
        "xaxis": {"title": "Time (s)"},
        "yaxis": {"title": "Signal (a.u.)"}
    }
}

summary = (
    f"Neuron {selected_neuron} | window={window} frames ({window/fs:.1f} s) | "
    f"corrected std={np.std(corrected):.3f}"
)
`,
    events: `import numpy as np

# Task 1.2: detect calcium transients from ΔF/F
trace = raw_data[selected_neuron].astype(float).copy()
F0 = np.percentile(trace, 20)
dff = (trace - F0) / (F0 + 1e-9)
mu = np.mean(dff)
sigma = np.std(dff)
threshold = mu + 3.0 * sigma
events = np.where(dff > threshold)[0]
time = np.arange(trace.size) / fs

figure = {
    "data": [
        {
            "x": time.tolist(),
            "y": trace.tolist(),
            "type": "scatter",
            "mode": "lines",
            "name": "Raw fluorescence",
            "line": {"width": 1.1, "color": "rgba(96, 114, 108, 0.55)"}
        },
        {
            "x": time.tolist(),
            "y": dff.tolist(),
            "type": "scatter",
            "mode": "lines",
            "name": "ΔF/F",
            "yaxis": "y2",
            "line": {"width": 2.0, "color": "rgba(20, 143, 96, 0.96)"}
        },
        {
            "x": (events / fs).tolist(),
            "y": dff[events].tolist(),
            "type": "scatter",
            "mode": "markers",
            "name": "Detected events",
            "yaxis": "y2",
            "marker": {"size": 7, "color": "rgba(218, 86, 80, 0.96)"}
        }
    ],
    "layout": {
        "title": f"Neuron {selected_neuron}: event detection",
        "xaxis": {"title": "Time (s)"},
        "yaxis": {"title": "Raw fluorescence (a.u.)"},
        "yaxis2": {
            "title": "ΔF/F",
            "overlaying": "y",
            "side": "right",
            "showgrid": False
        }
    }
}

summary = (
    f"Neuron {selected_neuron} | threshold={threshold:.3f} | "
    f"events={events.size} | event rate={events.size / (trace.size / fs):.3f} Hz"
)
`,
    ensemble: `import numpy as np

# Task 1.3 starter: detect high coactivity ensemble-event bins
# Edit these settings to explore behavior
subset_neurons = min(raw_data.shape[0], 64)
z_threshold = 2.5
bin_sec = 0.5
shuffle_count = 120
percentile_cutoff = 99

subset = raw_data[:subset_neurons].astype(float)
F0 = np.percentile(subset, 20, axis=1, keepdims=True)
dff = (subset - F0) / (F0 + 1e-9)

z = (dff - np.mean(dff, axis=1, keepdims=True)) / (np.std(dff, axis=1, keepdims=True) + 1e-9)
event_matrix = (z > z_threshold).astype(np.int8)

bin_frames = max(1, int(round(bin_sec * fs)))
trim = (event_matrix.shape[1] // bin_frames) * bin_frames
event_matrix = event_matrix[:, :trim]

binned = event_matrix.reshape(event_matrix.shape[0], -1, bin_frames).max(axis=2)
coactivity = binned.sum(axis=0).astype(float)

rng = np.random.default_rng(12)
null = np.empty((shuffle_count, binned.shape[1]), dtype=float)
for s in range(shuffle_count):
    shifted = np.empty_like(event_matrix)
    for n in range(event_matrix.shape[0]):
        shift = int(rng.integers(0, event_matrix.shape[1]))
        shifted[n] = np.roll(event_matrix[n], shift)
    shifted_binned = shifted.reshape(shifted.shape[0], -1, bin_frames).max(axis=2)
    null[s] = shifted_binned.sum(axis=0)

threshold = float(np.percentile(null, percentile_cutoff))
ensemble_bins = np.where(coactivity > threshold)[0]
time_bins = np.arange(coactivity.size) * (bin_frames / fs)

figure = {
    "data": [
        {
            "x": time_bins.tolist(),
            "y": coactivity.tolist(),
            "type": "scatter",
            "mode": "lines",
            "name": "Coactivity (neurons/bin)",
            "line": {"width": 2.0, "color": "rgba(20, 143, 96, 0.96)"}
        },
        {
            "x": time_bins.tolist(),
            "y": [threshold] * coactivity.size,
            "type": "scatter",
            "mode": "lines",
            "name": f"Null {percentile_cutoff}th percentile",
            "line": {"width": 1.6, "dash": "dash", "color": "rgba(194, 114, 77, 0.95)"}
        },
        {
            "x": time_bins[ensemble_bins].tolist(),
            "y": coactivity[ensemble_bins].tolist(),
            "type": "scatter",
            "mode": "markers",
            "name": "Detected ensemble-event bins",
            "marker": {"size": 8, "color": "rgba(180, 43, 43, 0.96)"}
        }
    ],
    "layout": {
        "title": "Task 1.3 starter: coactivity and ensemble-event bins",
        "xaxis": {"title": "Time (s)"},
        "yaxis": {"title": "Active neurons / bin"}
    }
}

summary = (
    f"neurons used={subset_neurons} | bin={bin_frames} frames ({bin_frames/fs:.3f} s) | "
    f"threshold={threshold:.2f} | ensemble bins={ensemble_bins.size}"
)
`
  };

  const runtime = {
    pyodide: null,
    loadingPromise: null,
    queue: Promise.resolve(),
    fullNeurons: 0,
    fullFrames: 0,
    subsetNeurons: 0,
    subsetFrames: 0,
    fs: 4.8
  };

  const setStatus = (lab, message, mode = "pending") => {
    lab.statusEl.textContent = message;
    lab.statusEl.classList.remove("error", "ready");
    if (mode === "error") {
      lab.statusEl.classList.add("error");
    } else if (mode === "ready") {
      lab.statusEl.classList.add("ready");
    }
  };

  const setOutput = (lab, message) => {
    lab.outputEl.textContent = message;
  };

  const setBusy = (lab, value) => {
    lab.busy = value;
    if (lab.runEl) lab.runEl.disabled = value || !runtime.pyodide;
    if (lab.resetEl) lab.resetEl.disabled = value;
    if (lab.neuronEl) lab.neuronEl.disabled = value || !runtime.pyodide;
  };

  const clampNeuronIndex = (lab) => {
    if (!lab.neuronEl) return 0;
    const parsed = Number.parseInt(lab.neuronEl.value, 10);
    const clamped = Number.isFinite(parsed)
      ? Math.max(0, Math.min(runtime.subsetNeurons - 1, parsed))
      : 0;
    lab.neuronEl.value = String(clamped);
    return clamped;
  };

  const resetTemplate = (lab) => {
    lab.codeEl.value = templates[lab.template] || templates.normalize;
  };

  const queuePython = (job) => {
    runtime.queue = runtime.queue.then(job, job);
    return runtime.queue;
  };

  const renderFigure = (lab, figureObj) => {
    const figure = figureObj && typeof figureObj === "object" ? figureObj : {};
    const data = Array.isArray(figure.data) ? figure.data : [];
    const layout = Object.assign(
      {
        margin: { l: 58, r: 24, t: 42, b: 48 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        legend: { orientation: "h", y: 1.18 },
        xaxis: { zeroline: false },
        yaxis: { zeroline: false }
      },
      figure.layout || {}
    );

    Plotly.react(lab.plotEl, data, layout, {
      responsive: true,
      displayModeBar: true
    });
  };

  const ensureRuntime = async (csvPath, fs) => {
    if (runtime.pyodide) return;
    if (runtime.loadingPromise) return runtime.loadingPromise;

    runtime.fs = fs;
    runtime.loadingPromise = (async () => {
      if (!window.loadPyodide || !window.Plotly) {
        throw new Error("Pyodide or Plotly failed to load.");
      }

      const pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/"
      });
      await pyodide.loadPackage(["numpy"]);

      const response = await fetch(csvPath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load ${csvPath}: ${response.status}`);
      }
      const csvText = await response.text();

      pyodide.globals.set("csv_text", csvText);
      pyodide.globals.set("fs", fs);

      await pyodide.runPythonAsync(`
import numpy as np

def _load_calcium_subset(csv_text, max_neurons=120, max_frames=2500):
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
subset_neurons, subset_frames = raw_data.shape
del csv_text
`);

      const fullNeuronsProxy = pyodide.globals.get("full_neurons");
      const fullFramesProxy = pyodide.globals.get("full_frames");
      const subsetNeuronsProxy = pyodide.globals.get("subset_neurons");
      const subsetFramesProxy = pyodide.globals.get("subset_frames");

      runtime.fullNeurons = Number(fullNeuronsProxy.toJs());
      runtime.fullFrames = Number(fullFramesProxy.toJs());
      runtime.subsetNeurons = Number(subsetNeuronsProxy.toJs());
      runtime.subsetFrames = Number(subsetFramesProxy.toJs());

      fullNeuronsProxy.destroy();
      fullFramesProxy.destroy();
      subsetNeuronsProxy.destroy();
      subsetFramesProxy.destroy();

      runtime.pyodide = pyodide;
    })();

    return runtime.loadingPromise;
  };

  const runLab = async (lab) => {
    if (!runtime.pyodide || lab.busy) return;
    setBusy(lab, true);
    setStatus(lab, "Running...", "pending");

    const selectedNeuron = clampNeuronIndex(lab);

    try {
      await queuePython(async () => {
        runtime.pyodide.globals.set("selected_neuron", selectedNeuron);
        await runtime.pyodide.runPythonAsync(
          `figure = None\nsummary = ""\n${lab.codeEl.value}\n` +
            `\nif figure is None:\n` +
            `    raise RuntimeError("Define a variable named 'figure' as a Plotly dict.")\n`
        );

        const figureProxy = runtime.pyodide.globals.get("figure");
        const figure = figureProxy.toJs({ dict_converter: Object.fromEntries });
        figureProxy.destroy();

        const summaryProxy = runtime.pyodide.globals.get("summary");
        const summaryValue = typeof summaryProxy.toJs === "function" ? summaryProxy.toJs() : summaryProxy;
        if (typeof summaryProxy.destroy === "function") summaryProxy.destroy();

        renderFigure(lab, figure);
        setOutput(lab, String(summaryValue || "Run completed."));
      });
      setStatus(lab, "Ready", "ready");
    } catch (error) {
      setStatus(lab, "Error", "error");
      setOutput(lab, String(error));
    } finally {
      setBusy(lab, false);
    }
  };

  const labs = labRoots
    .map((root) => {
      const codeEl = root.querySelector(".tutorial-lab-code");
      const outputEl = root.querySelector(".tutorial-lab-output");
      const plotEl = root.querySelector(".tutorial-lab-plot");
      const runEl = root.querySelector(".tutorial-lab-run");
      const resetEl = root.querySelector(".tutorial-lab-reset");
      const statusEl = root.querySelector(".tutorial-lab-status");
      const neuronEl = root.querySelector(".tutorial-lab-neuron");

      if (!codeEl || !outputEl || !plotEl || !runEl || !resetEl || !statusEl) {
        return null;
      }

      return {
        root,
        codeEl,
        outputEl,
        plotEl,
        runEl,
        resetEl,
        statusEl,
        neuronEl,
        template: root.dataset.template || "normalize",
        csvPath: root.dataset.csv || "Fluorescent%20Data.csv",
        fs: Number.parseFloat(root.dataset.fs || "4.8") || 4.8,
        busy: false
      };
    })
    .filter(Boolean);

  const initializeLab = async (lab) => {
    setBusy(lab, true);
    setStatus(lab, "Loading runtime...", "pending");
    resetTemplate(lab);

    try {
      await ensureRuntime(lab.csvPath, lab.fs);

      if (lab.neuronEl) {
        lab.neuronEl.min = "0";
        lab.neuronEl.max = String(Math.max(0, runtime.subsetNeurons - 1));
        lab.neuronEl.value = "0";
      }

      setStatus(lab, "Ready", "ready");
      setOutput(
        lab,
        `Dataset ready.\n` +
          `full CSV: ${runtime.fullNeurons} neurons x ${runtime.fullFrames} frames\n` +
          `interactive subset: ${runtime.subsetNeurons} neurons x ${runtime.subsetFrames} frames`
      );
      await runLab(lab);
    } catch (error) {
      setStatus(lab, "Error", "error");
      setOutput(lab, String(error));
      setBusy(lab, false);
    }
  };

  labs.forEach((lab) => {
    lab.runEl.addEventListener("click", () => {
      runLab(lab);
    });

    lab.resetEl.addEventListener("click", () => {
      resetTemplate(lab);
      setOutput(lab, "Template restored.");
    });

    if (lab.neuronEl) {
      lab.neuronEl.addEventListener("change", () => {
        clampNeuronIndex(lab);
      });
    }
  });

  labs.forEach((lab) => {
    initializeLab(lab);
  });
})();
