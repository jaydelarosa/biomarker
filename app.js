const DEFAULT_BIOMARKERS = [
  {
    name: "Metabolic Health Score",
    graphValue: 78,
    dateLabel: "Aug 15, 2025",
  },
  {
    name: "Creatinine",
    graphValue: 0.63,
    dateLabel: "Aug 15, 2025",
  },
];

const STATUS = {
  optimal: {
    label: "Optimal",
    className: "status-optimal",
  },
  inRange: {
    label: "In range",
    className: "status-in-range",
  },
  outRange: {
    label: "Out of range",
    className: "status-out-range",
  },
};

const COLORS = {
  outRange: "#F25F5C",
  inRange: "#D48A52",
  optimal: "#37A152",
  background: "#FBF3F3",
};

let chartInstance = null;

const cardsContainer = document.getElementById("cardsContainer");
const modalElement = document.getElementById("biomarkerModal");
const modal = new bootstrap.Modal(modalElement);
const modalTitle = document.getElementById("biomarkerModalLabel");
const graphLegend = document.getElementById("graphLegend");
const graphDate = document.getElementById("graphDate");
const graphValue = document.getElementById("graphValue");
const graphMinLabel = document.getElementById("graphMinLabel");
const graphMaxLabel = document.getElementById("graphMaxLabel");
const chartCanvas = document.getElementById("biomarkerChart");

const csvPath = "./CSV _ FE Take-Home Exercise Data - METRICS Reference ranges.csv";

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines
    .slice(1)
    .map((line) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row;
    })
    .filter((row) => row.Biomarker_Name && row.Biomarker_Name.trim().length > 0);
}

function extractGraphValues(rows) {
  const values = new Map();

  rows.forEach((row) => {
    const name = row.Biomarker_Name?.trim();
    if (!name) {
      return;
    }

    const match = name.match(/^(.*)\s+Graph Value:\s*([+-]?\d*\.?\d+)/i);
    if (!match) {
      return;
    }

    const biomarkerName = match[1].trim();
    const graphValue = Number(match[2]);
    if (!Number.isNaN(graphValue)) {
      values.set(biomarkerName, graphValue);
    }
  });

  return values;
}

function findFirstRange(row, suffix) {
  const keys = Object.keys(row).filter((entry) =>
    entry.toLowerCase().endsWith(suffix)
  );
  for (const key of keys) {
    const value = row[key];
    if (value && value.length > 0) {
      return value;
    }
  }
  return null;
}

function parseRange(value) {
  if (!value) {
    return null;
  }

  const sanitized = value.replace(/[^\d.<>=-]/g, "").trim();
  if (!sanitized) {
    return null;
  }

  const rangeMatch = sanitized.match(
    /^(-?\d*\.?\d+)\s*-\s*(-?\d*\.?\d+)$/
  );
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
      raw: value,
    };
  }

  const lessMatch = sanitized.match(/^(<=|<)\s*(-?\d*\.?\d+)$/);
  if (lessMatch) {
    return {
      min: null,
      max: Number(lessMatch[2]),
      raw: value,
    };
  }

  const greaterMatch = sanitized.match(/^(>=|>)\s*(-?\d*\.?\d+)$/);
  if (greaterMatch) {
    return {
      min: Number(greaterMatch[2]),
      max: null,
      raw: value,
    };
  }

  const numberMatch = sanitized.match(/^(-?\d*\.?\d+)$/);
  if (numberMatch) {
    const numberValue = Number(numberMatch[1]);
    return {
      min: numberValue,
      max: numberValue,
      raw: value,
    };
  }

  return null;
}

function resolveRanges(row) {
  const optimal = parseRange(findFirstRange(row, "_optimal"));
  const inRange = parseRange(findFirstRange(row, "_inrange"));
  const outRange = parseRange(findFirstRange(row, "_outofrange"));

  return { optimal, inRange, outRange };
}

function deriveGraphBounds({ optimal, inRange, outRange }, graphValue) {
  const minValues = [optimal?.min, inRange?.min, outRange?.min].filter(
    (value) => value !== null && value !== undefined
  );
  const maxValues = [optimal?.max, inRange?.max, outRange?.max].filter(
    (value) => value !== null && value !== undefined
  );

  let min = minValues.length ? Math.min(...minValues) : 0;
  let max = maxValues.length ? Math.max(...maxValues) : null;

  if (max === null) {
    max = graphValue ? graphValue * 1.4 : min + 1;
  }

  if (max <= min) {
    max = min + (graphValue ? Math.max(graphValue * 0.5, 1) : 1);
  }

  return { min, max };
}

function buildSegments(ranges, bounds) {
  const segments = [];
  const { min: graphMin, max: graphMax } = bounds;
  const { optimal, inRange } = ranges;

  const inMin = inRange?.min ?? optimal?.min ?? graphMin;
  const inMax = inRange?.max ?? optimal?.max ?? graphMax;
  const optMin = optimal?.min ?? inMin;
  const optMax = optimal?.max ?? inMax;

  if (graphMin < inMin) {
    segments.push({
      label: "Out of range",
      min: graphMin,
      max: inMin,
      color: COLORS.outRange,
      status: "outRange",
    });
  }

  if (inRange && inMin < optMin) {
    segments.push({
      label: "In range",
      min: inMin,
      max: optMin,
      color: COLORS.inRange,
      status: "inRange",
    });
  }

  if (optimal) {
    segments.push({
      label: "Optimal",
      min: optMin,
      max: optMax,
      color: COLORS.optimal,
      status: "optimal",
    });
  }

  if (inRange && optMax < inMax) {
    segments.push({
      label: "In range",
      min: optMax,
      max: inMax,
      color: COLORS.inRange,
      status: "inRange",
    });
  }

  if (graphMax > inMax) {
    segments.push({
      label: "Out of range",
      min: inMax,
      max: graphMax,
      color: COLORS.outRange,
      status: "outRange",
    });
  }

  const cleaned = segments.filter((segment) => segment.max > segment.min);
  if (!cleaned.length) {
    return [
      {
        label: "Range",
        min: graphMin,
        max: graphMax,
        color: COLORS.inRange,
        status: "inRange",
      },
    ];
  }
  return cleaned;
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString();
}

function formatRangeText(range) {
  if (!range) {
    return "—";
  }
  if (range.min !== null && range.max !== null && range.min !== range.max) {
    return `${formatNumber(range.min)} - ${formatNumber(range.max)}`;
  }
  if (range.min === null && range.max !== null) {
    return `< ${formatNumber(range.max)}`;
  }
  if (range.max === null && range.min !== null) {
    return `> ${formatNumber(range.min)}`;
  }
  if (range.min !== null) {
    return formatNumber(range.min);
  }
  return "—";
}

function resolveStatus(value, ranges) {
  const inRange = (range) => {
    if (!range) {
      return false;
    }
    const aboveMin = range.min === null || value >= range.min;
    const belowMax = range.max === null || value <= range.max;
    return aboveMin && belowMax;
  };

  if (inRange(ranges.optimal)) {
    return STATUS.optimal;
  }
  if (inRange(ranges.inRange)) {
    return STATUS.inRange;
  }
  return STATUS.outRange;
}

function createMiniScale(segments, bounds) {
  const bar = document.createElement("div");
  bar.className = "mini-scale-bar";

  const total = bounds.max - bounds.min;
  segments.forEach((segment) => {
    const height = ((segment.max - segment.min) / total) * 100;
    const segmentDiv = document.createElement("div");
    segmentDiv.className = `mini-segment ${
      segment.status === "optimal"
        ? "seg-opt"
        : segment.status === "inRange"
        ? "seg-in"
        : "seg-out"
    }`;
    segmentDiv.style.height = `${Math.max(height, 6)}%`;
    bar.appendChild(segmentDiv);
  });

  return bar;
}

function buildLegend(segments, unit) {
  graphLegend.innerHTML = "";
  const grouped = [...segments].reverse();

  grouped.forEach((segment) => {
    const item = document.createElement("div");
    item.className = "legend-item";

    const bar = document.createElement("div");
    bar.className = "legend-bar";
    bar.style.background = segment.color;

    const text = document.createElement("div");
    text.className = "legend-text";
    text.textContent = `${formatRangeText(segment)}${unit ? ` ${unit}` : ""}`;

    const label = document.createElement("small");
    label.textContent = segment.label;
    text.appendChild(label);

    item.appendChild(bar);
    item.appendChild(text);
    graphLegend.appendChild(item);
  });
}

function buildChart(segments, bounds, value, unit) {
  const total = bounds.max - bounds.min;
  const markerX = value - bounds.min;

  const datasets = segments.map((segment) => ({
    label: segment.label,
    data: [segment.max - segment.min],
    backgroundColor: segment.color,
    borderSkipped: false,
    borderRadius: 12,
    barPercentage: 0.5,
    categoryPercentage: 0.8,
  }));

  datasets.push({
    type: "scatter",
    label: "Latest result",
    data: [{ x: markerX, y: 0 }],
    pointRadius: 8,
    pointHoverRadius: 9,
    pointBackgroundColor: COLORS.outRange,
    pointBorderColor: "#ffffff",
    pointBorderWidth: 4,
  });

  const markerPlugin = {
    id: "markerLine",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) {
        return;
      }
      const xPos = scales.x.getPixelForValue(markerX);
      const meta = chart.getDatasetMeta(0);
      const yCenter = meta?.data?.[0]?.y ?? (chartArea.top + chartArea.bottom) / 2;

      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "#D74D4D";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xPos, chartArea.top + 8);
      ctx.lineTo(xPos, chartArea.bottom - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(xPos, yCenter, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(242,95,92,0.15)";
      ctx.fill();
      ctx.restore();
    },
  };

  const config = {
    type: "bar",
    data: {
      labels: ["Range"],
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      scales: {
        x: {
          stacked: true,
          min: 0,
          max: total,
          display: false,
        },
        y: {
          stacked: true,
          display: false,
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: true,
          filter: (context) => context.dataset.type === "scatter",
          callbacks: {
            label: () =>
              `${formatNumber(value)}${unit ? ` ${unit}` : ""}`,
          },
        },
      },
      animation: {
        duration: 600,
      },
    },
    plugins: [markerPlugin],
  };

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(chartCanvas, config);
}

function createCard(biomarker, row) {
  const ranges = resolveRanges(row || {});
  const unit =
    row?.Unit ||
    (biomarker.name.toLowerCase() === "creatinine" ? "mg/dL" : "");
  const status = resolveStatus(biomarker.graphValue, ranges);
  const bounds = deriveGraphBounds(ranges, biomarker.graphValue);
  const segments = buildSegments(ranges, bounds);

  const card = document.createElement("div");
  card.className = "stat-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");

  const info = document.createElement("div");
  info.className = "stat-info";
  const title = document.createElement("div");
  title.className = "stat-title";
  title.textContent = biomarker.name.replace(/\bScore\b/i, "").trim();

  const meta = document.createElement("div");
  meta.className = "stat-meta";

  const statusPill = document.createElement("span");
  statusPill.className = `status-pill ${status.className}`;
  statusPill.innerHTML = `<span class="status-dot"></span>${status.label}`;

  const value = document.createElement("span");
  value.className = "stat-value";
  value.textContent = `${formatNumber(biomarker.graphValue)}${
    unit ? ` ${unit}` : ""
  }`;

  const range = document.createElement("span");
  range.className = "stat-range";
  const displayRange = ranges.optimal || ranges.inRange || ranges.outRange;
  range.textContent = displayRange
    ? `${formatRangeText(displayRange)}${unit ? ` ${unit}` : ""}`
    : "Range unavailable";

  meta.appendChild(statusPill);
  meta.appendChild(value);
  meta.appendChild(range);

  info.appendChild(title);
  info.appendChild(meta);

  const mini = document.createElement("div");
  mini.className = "mini-scale";

  if (segments.length) {
    mini.appendChild(createMiniScale(segments, bounds));
  }

  card.appendChild(info);
  card.appendChild(mini);

  const openModal = () => {
    modalTitle.textContent = biomarker.name;
    graphDate.textContent = biomarker.dateLabel;
    graphValue.textContent = `${formatNumber(biomarker.graphValue)}${
      unit ? ` ${unit}` : ""
    }`;
    graphMinLabel.textContent = formatNumber(bounds.min);
    graphMaxLabel.textContent = formatNumber(bounds.max);
    buildLegend(segments, unit);
    buildChart(segments, bounds, biomarker.graphValue, unit);
    modal.show();
  };

  card.addEventListener("click", openModal);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openModal();
    }
  });

  return card;
}

async function init() {
  const response = await fetch(csvPath);
  const text = await response.text();
  const rows = parseCsv(text);
  const graphValues = extractGraphValues(rows);
  const rowMap = new Map(
    rows.map((row) => [row.Biomarker_Name?.trim(), row])
  );

  DEFAULT_BIOMARKERS.forEach((biomarker) => {
    const row = rowMap.get(biomarker.name) || null;
    const valueFromCsv = graphValues.get(biomarker.name);
    const card = createCard(
      {
        ...biomarker,
        graphValue:
          valueFromCsv === undefined ? biomarker.graphValue : valueFromCsv,
      },
      row
    );
    cardsContainer.appendChild(card);
  });
}

init();
