(() => {
  "use strict";

  const labRoots = Array.from(document.querySelectorAll(".tutorial-lab"));
  if (!labRoots.length) return;

  const templates = {
    task11: `import numpy as np

# Task 1.1 deliverable:
# Plot representative traces for raw, normalized (ΔF/F),
# background-subtracted, and denoised signals.

trace = raw_data[selected_neuron].astype(float).copy()
time = np.arange(trace.size) / fs

# Step 1.1.0 normalize to ΔF/F
F0 = np.percentile(trace, 20)
dff = (trace - F0) / (F0 + 1e-9)

# Step 1.1.1 background subtraction (slow drift)
window_sec = 20
window = max(3, int(window_sec * fs))
if window % 2 == 0:
    window += 1
kernel = np.ones(window) / window
baseline = np.convolve(dff, kernel, mode="same")
bg_sub = dff - baseline

# Step 1.1.2 denoise (simple moving-average smoothing)
smooth_window = max(3, int(0.6 * fs))
if smooth_window % 2 == 0:
    smooth_window += 1
smooth_kernel = np.ones(smooth_window) / smooth_window
denoised = np.convolve(bg_sub, smooth_kernel, mode="same")

# Users can edit this Plotly figure dictionary
figure = {
    "data": [
        {"x": time.tolist(), "y": trace.tolist(), "type": "scatter", "mode": "lines",
         "name": "Raw fluorescence", "xaxis": "x", "yaxis": "y",
         "line": {"width": 1.2, "color": "rgba(96, 114, 108, 0.75)"}},
        {"x": time.tolist(), "y": dff.tolist(), "type": "scatter", "mode": "lines",
         "name": "Normalized (ΔF/F)", "xaxis": "x2", "yaxis": "y2",
         "line": {"width": 1.7, "color": "rgba(20, 143, 96, 0.95)"}},
        {"x": time.tolist(), "y": bg_sub.tolist(), "type": "scatter", "mode": "lines",
         "name": "Background-subtracted", "xaxis": "x3", "yaxis": "y3",
         "line": {"width": 1.7, "color": "rgba(194, 114, 77, 0.95)"}},
        {"x": time.tolist(), "y": denoised.tolist(), "type": "scatter", "mode": "lines",
         "name": "Denoised", "xaxis": "x4", "yaxis": "y4",
         "line": {"width": 1.9, "color": "rgba(52, 126, 170, 0.95)"}}
    ],
    "layout": {
        "title": f"Task 1.1 signal cleaning | neuron {selected_neuron}",
        "xaxis": {"domain": [0, 1], "anchor": "y", "showticklabels": False},
        "yaxis": {"domain": [0.77, 1.0], "title": "Raw"},
        "xaxis2": {"domain": [0, 1], "anchor": "y2", "showticklabels": False},
        "yaxis2": {"domain": [0.52, 0.74], "title": "ΔF/F"},
        "xaxis3": {"domain": [0, 1], "anchor": "y3", "showticklabels": False},
        "yaxis3": {"domain": [0.27, 0.49], "title": "BG-sub"},
        "xaxis4": {"domain": [0, 1], "anchor": "y4", "title": "Time (s)"},
        "yaxis4": {"domain": [0.0, 0.22], "title": "Denoised"}
    }
}

summary = (
    f"neuron={selected_neuron} | F0={F0:.2f} | "
    f"std raw={np.std(trace):.3f}, std ΔF/F={np.std(dff):.3f}, "
    f"std denoised={np.std(denoised):.3f}"
)
`,

    task12: `import numpy as np

# Task 1.2 deliverables:
# (1) traces with events
# (2) scatter/raster (time vs neuron ID)
# (3) transient metrics summary

trace = raw_data[selected_neuron].astype(float).copy()
time = np.arange(trace.size) / fs
F0 = np.percentile(trace, 20)
dff = (trace - F0) / (F0 + 1e-9)
mu = np.mean(dff)
sigma = np.std(dff)
threshold = mu + 3.0 * sigma
events = np.where(dff > threshold)[0]

# Build a raster from a subset of neurons
raster_neurons = min(raw_data.shape[0], 80)
subset = raw_data[:raster_neurons].astype(float)
subset_F0 = np.percentile(subset, 20, axis=1, keepdims=True)
subset_dff = (subset - subset_F0) / (subset_F0 + 1e-9)
subset_mu = np.mean(subset_dff, axis=1, keepdims=True)
subset_sigma = np.std(subset_dff, axis=1, keepdims=True)
subset_thresh = subset_mu + 3.0 * subset_sigma
event_matrix = subset_dff > subset_thresh

raster_x = []
raster_y = []
for n in range(raster_neurons):
    idx = np.where(event_matrix[n])[0]
    if idx.size:
        raster_x.extend((idx / fs).tolist())
        raster_y.extend([n] * idx.size)

event_counts = event_matrix.sum(axis=1)
mean_event_rate_hz = float(np.mean(event_counts / (subset.shape[1] / fs)))

figure = {
    "data": [
        {"x": time.tolist(), "y": trace.tolist(), "type": "scatter", "mode": "lines",
         "name": "Raw fluorescence", "xaxis": "x", "yaxis": "y",
         "line": {"width": 1.2, "color": "rgba(96, 114, 108, 0.7)"}},
        {"x": time.tolist(), "y": dff.tolist(), "type": "scatter", "mode": "lines",
         "name": "ΔF/F", "xaxis": "x2", "yaxis": "y2",
         "line": {"width": 1.9, "color": "rgba(20, 143, 96, 0.95)"}},
        {"x": (events / fs).tolist(), "y": dff[events].tolist(), "type": "scatter", "mode": "markers",
         "name": "Detected events", "xaxis": "x2", "yaxis": "y2",
         "marker": {"size": 7, "color": "rgba(218, 86, 80, 0.95)"}},
        {"x": raster_x, "y": raster_y, "type": "scatter", "mode": "markers",
         "name": "Raster events", "xaxis": "x3", "yaxis": "y3",
         "marker": {"size": 3.5, "color": "rgba(50, 92, 150, 0.9)"}}
    ],
    "layout": {
        "title": f"Task 1.2 event detection | neuron {selected_neuron}",
        "xaxis": {"domain": [0, 1], "anchor": "y", "showticklabels": False},
        "yaxis": {"domain": [0.72, 1.0], "title": "Raw"},
        "xaxis2": {"domain": [0, 1], "anchor": "y2", "showticklabels": False},
        "yaxis2": {"domain": [0.36, 0.66], "title": "ΔF/F + events"},
        "xaxis3": {"domain": [0, 1], "anchor": "y3", "title": "Time (s)"},
        "yaxis3": {"domain": [0.0, 0.30], "title": "Neuron ID"}
    }
}

summary = (
    f"selected neuron events={events.size} | threshold={threshold:.3f}\\n"
    f"raster neurons={raster_neurons} | mean event rate={mean_event_rate_hz:.3f} Hz | "
    f"max events/neuron={int(np.max(event_counts))}"
)
`,

    task13: `import numpy as np

# Task 1.3 starter:
# coactivity + shuffled null threshold for ensemble-event bins

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
        {"x": time_bins.tolist(), "y": coactivity.tolist(), "type": "scatter", "mode": "lines",
         "name": "Coactivity (neurons/bin)", "line": {"width": 2.0, "color": "rgba(20, 143, 96, 0.96)"}},
        {"x": time_bins.tolist(), "y": [threshold] * coactivity.size, "type": "scatter", "mode": "lines",
         "name": f"Null {percentile_cutoff}th percentile", "line": {"width": 1.6, "dash": "dash", "color": "rgba(194, 114, 77, 0.95)"}},
        {"x": time_bins[ensemble_bins].tolist(), "y": coactivity[ensemble_bins].tolist(), "type": "scatter", "mode": "markers",
         "name": "Detected ensemble-event bins", "marker": {"size": 8, "color": "rgba(180, 43, 43, 0.96)"}}
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
    subsetFrames: 0
  };

  const proxyToJs = (value) => (value && typeof value.toJs === "function" ? value.toJs() : value);
  const destroyProxy = (value) => {
    if (value && typeof value.destroy === "function") value.destroy();
  };

  const setStatus = (lab, message, mode = "pending") => {
    lab.statusEl.textContent = message;
    lab.statusEl.classList.remove("error", "ready");
    if (mode === "error") lab.statusEl.classList.add("error");
    if (mode === "ready") lab.statusEl.classList.add("ready");
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
    const maxIndex = Math.max(0, runtime.subsetNeurons - 1);
    const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(maxIndex, parsed)) : 0;
    lab.neuronEl.value = String(clamped);
    return clamped;
  };

  const resetTemplate = (lab) => {
    lab.codeEl.value = templates[lab.template] || templates.task11;
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
        margin: { l: 60, r: 24, t: 44, b: 48 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        legend: { orientation: "h", y: 1.15 },
        xaxis: { zeroline: false },
        yaxis: { zeroline: false }
      },
      figure.layout || {}
    );

    Plotly.react(lab.plotEl, data, layout, { responsive: true, displayModeBar: true });
  };

  const ensureRuntime = async (csvPath, fs) => {
    if (runtime.pyodide) return;
    if (runtime.loadingPromise) return runtime.loadingPromise;

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

      runtime.fullNeurons = Number(proxyToJs(fullNeuronsProxy));
      runtime.fullFrames = Number(proxyToJs(fullFramesProxy));
      runtime.subsetNeurons = Number(proxyToJs(subsetNeuronsProxy));
      runtime.subsetFrames = Number(proxyToJs(subsetFramesProxy));

      destroyProxy(fullNeuronsProxy);
      destroyProxy(fullFramesProxy);
      destroyProxy(subsetNeuronsProxy);
      destroyProxy(subsetFramesProxy);

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
        const payloadJson = await runtime.pyodide.runPythonAsync(
          `import json\nimport math\nfigure = None\nsummary = ""\n${lab.codeEl.value}\n` +
            `\nif figure is None:\n` +
            `    raise RuntimeError("Define a variable named 'figure' as a Plotly dict.")\n` +
            `\ndef _sanitize_plotly(value):\n` +
            `    if isinstance(value, float):\n` +
            `        return value if math.isfinite(value) else None\n` +
            `    if isinstance(value, dict):\n` +
            `        return {str(k): _sanitize_plotly(v) for k, v in value.items()}\n` +
            `    if isinstance(value, (list, tuple)):\n` +
            `        return [_sanitize_plotly(v) for v in value]\n` +
            `    return value\n` +
            `\njson.dumps({"figure": _sanitize_plotly(figure), "summary": str(summary)})\n`
        );

        const parsedPayload = JSON.parse(String(payloadJson));
        renderFigure(lab, parsedPayload.figure);
        setOutput(lab, String(parsedPayload.summary || "Run completed."));
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

      if (!codeEl || !outputEl || !plotEl || !runEl || !resetEl || !statusEl) return null;

      return {
        root,
        codeEl,
        outputEl,
        plotEl,
        runEl,
        resetEl,
        statusEl,
        neuronEl,
        template: root.dataset.template || "task11",
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
      setBusy(lab, false);
      await runLab(lab);
    } catch (error) {
      setStatus(lab, "Error", "error");
      setOutput(lab, String(error));
      setBusy(lab, false);
    }
  };

  labs.forEach((lab) => {
    lab.runEl.addEventListener("click", () => runLab(lab));
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
