/**
 * Charts, drawn as SVG by hand.
 *
 * No charting library: the whole dashboard ships from the API's own `public/`
 * folder with no build step, and the four shapes here — a time series, a donut,
 * a heatmap and a sparkline — are less code than the loader for one would be.
 * Everything is drawn in a fixed viewBox and scaled by CSS, so a chart is
 * crisp at any width without measuring anything on load.
 */

import { el } from "./ui.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function node(tag, attrs = {}, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    element.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child) element.append(child);
  }
  return element;
}

/** Round an axis maximum up to something a person would have chosen. */
function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/* -------------------------------------------------------------- time series */

const W = 840;
const H = 260;
const PAD = { top: 16, right: 14, bottom: 26, left: 42 };

/**
 * One or two daily series over the same dates.
 *
 * Straight segments rather than a spline: these are daily counts, and a curve
 * would draw values on days that never happened.
 */
export function timeSeries({
  labels,
  series,
  height = H,
  formatLabel = (v) => v,
  formatValue = (v) => v,
}) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const stepX = labels.length > 1 ? innerW / (labels.length - 1) : 0;

  const x = (i) => PAD.left + i * stepX;
  const y = (v) => PAD.top + innerH - (v / max) * innerH;

  const grid = [];
  // Pick a tick count that divides the axis maximum, so a chart topping out at
  // 10 is labelled 0/2/4/6/8/10 rather than 0/3/5/8/10.
  const ticks = [4, 5, 3, 2].find((t) => max % t === 0) ?? 4;
  for (let t = 0; t <= ticks; t++) {
    const value = (max / ticks) * t;
    const gy = y(value);
    grid.push(node("line", { x1: PAD.left, x2: W - PAD.right, y1: gy, y2: gy }));
    grid.push(
      node(
        "text",
        { x: PAD.left - 8, y: gy + 3.5, "text-anchor": "end", class: "chart-axis" },
        document.createTextNode(formatValue(value))
      )
    );
  }

  // About six date labels whatever the range, so a 90-day chart doesn't turn
  // its axis into a smear.
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6));
  const xLabels = labels.map((label, i) =>
    i % labelEvery === 0 || i === labels.length - 1
      ? node(
          "text",
          {
            x: x(i),
            y: height - 8,
            "text-anchor": i === labels.length - 1 ? "end" : "middle",
            class: "chart-axis",
          },
          document.createTextNode(formatLabel(label))
        )
      : null
  );

  const defs = node("defs");
  const paths = [];

  series.forEach((s, index) => {
    const line = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

    if (s.fill !== false) {
      const gradientId = `grad-${index}-${Math.random().toString(36).slice(2, 8)}`;
      defs.append(
        node(
          "linearGradient",
          { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 },
          node("stop", { offset: "0%", "stop-color": s.color, "stop-opacity": 0.28 }),
          node("stop", { offset: "100%", "stop-color": s.color, "stop-opacity": 0 })
        )
      );
      paths.push(
        node("path", {
          d: `${line} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`,
          fill: `url(#${gradientId})`,
        })
      );
    }

    paths.push(
      node("path", {
        d: line,
        fill: "none",
        stroke: s.color,
        "stroke-width": 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      })
    );
  });

  const cursor = node("line", {
    y1: PAD.top,
    y2: PAD.top + innerH,
    stroke: "var(--border-strong)",
    "stroke-width": 1,
    opacity: 0,
  });
  const markers = series.map((s) =>
    node("circle", {
      r: 3.5,
      fill: "var(--surface)",
      stroke: s.color,
      "stroke-width": 2,
      opacity: 0,
    })
  );

  const chart = node(
    "svg",
    { viewBox: `0 0 ${W} ${height}`, class: "chart", role: "img" },
    defs,
    node("g", { class: "chart-grid" }, grid),
    xLabels,
    paths,
    cursor,
    markers
  );

  const tip = el("div", { class: "chart-tip", hidden: true });
  const wrap = el("div", { class: "chart-wrap" }, chart, tip);

  const move = (event) => {
    const box = chart.getBoundingClientRect();
    const ratio = W / box.width;
    const svgX = (event.clientX - box.left) * ratio;
    const index = Math.max(
      0,
      Math.min(labels.length - 1, Math.round((svgX - PAD.left) / (stepX || 1)))
    );

    cursor.setAttribute("x1", x(index));
    cursor.setAttribute("x2", x(index));
    cursor.setAttribute("opacity", 1);
    markers.forEach((marker, i) => {
      marker.setAttribute("cx", x(index));
      marker.setAttribute("cy", y(series[i].values[index]));
      marker.setAttribute("opacity", 1);
    });

    tip.replaceChildren(
      el("strong", { text: formatLabel(labels[index], true) }),
      ...series.map((s) =>
        el(
          "span",
          {},
          el("i", { style: { background: s.color } }),
          `${s.label} `,
          el("b", { text: String(s.values[index]) })
        )
      )
    );
    tip.hidden = false;
    // Anchored in percentages so the tooltip tracks the point through any
    // resize without the chart having to be re-measured.
    tip.style.left = `${(x(index) / W) * 100}%`;
    tip.style.top = `${(PAD.top / height) * 100}%`;
    tip.classList.toggle("flip", index > labels.length * 0.65);
  };

  const leave = () => {
    tip.hidden = true;
    cursor.setAttribute("opacity", 0);
    markers.forEach((marker) => marker.setAttribute("opacity", 0));
  };

  chart.addEventListener("pointermove", move);
  chart.addEventListener("pointerleave", leave);

  return wrap;
}

/* --------------------------------------------------------------------- donut */

export function donut({ segments, centerValue, centerLabel, size = 168 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const rings = segments.map((segment) => {
    const share = total > 0 ? segment.value / total : 0;
    const ring = node("circle", {
      cx: 70,
      cy: 70,
      r: radius,
      fill: "none",
      stroke: segment.color,
      "stroke-width": 17,
      "stroke-linecap": share > 0 && share < 1 ? "butt" : "round",
      "stroke-dasharray": `${share * circumference} ${circumference}`,
      "stroke-dashoffset": -offset,
      transform: "rotate(-90 70 70)",
    });
    offset += share * circumference;
    return ring;
  });

  const chart = node(
    "svg",
    { viewBox: "0 0 140 140", width: size, height: size, role: "img" },
    node("circle", {
      cx: 70,
      cy: 70,
      r: radius,
      fill: "none",
      stroke: "var(--surface-sunken)",
      "stroke-width": 17,
    }),
    rings,
    node(
      "text",
      {
        x: 70,
        y: 68,
        "text-anchor": "middle",
        fill: "var(--text)",
        "font-size": 24,
        "font-weight": 650,
      },
      document.createTextNode(String(centerValue))
    ),
    node(
      "text",
      {
        x: 70,
        y: 86,
        "text-anchor": "middle",
        fill: "var(--text-subtle)",
        "font-size": 10.5,
      },
      document.createTextNode(centerLabel)
    )
  );

  return el(
    "div",
    { class: "donut-wrap" },
    chart,
    el(
      "div",
      { class: "legend legend-stacked" },
      segments.map((segment) =>
        el(
          "span",
          {},
          el("i", { class: "swatch", style: { background: segment.color } }),
          `${segment.label} `,
          el("b", { text: String(segment.value) })
        )
      )
    )
  );
}

/* ------------------------------------------------------------------- heatmap */

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Seven days by twenty-four hours.
 *
 * Postgres numbers the week from Sunday; the rows here start on Monday, which
 * is what puts the two weekend rows together where a reader expects them.
 */
export function heatmap(cells) {
  const cell = 26;
  const gap = 3;
  const left = 34;
  const top = 18;
  const width = left + 24 * (cell + gap);
  const height = top + 7 * (cell + gap);

  const counts = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.count]));
  const max = Math.max(1, ...cells.map((c) => c.count));

  const rects = [];
  for (let row = 0; row < 7; row++) {
    const dow = (row + 1) % 7; // row 0 is Monday, which Postgres calls 1
    for (let hour = 0; hour < 24; hour++) {
      const count = counts.get(`${dow}-${hour}`) ?? 0;
      rects.push(
        node(
          "rect",
          {
            x: left + hour * (cell + gap),
            y: top + row * (cell + gap),
            width: cell,
            height: cell,
            class: "heat-cell",
            fill: count > 0 ? "var(--accent)" : "var(--surface-sunken)",
            // Square-rooted, not linear. One busy hour sets the maximum, and on
            // a linear ramp every ordinary hour then washes out to almost the
            // same pale tint — which is the opposite of what a heatmap is for.
            "fill-opacity": count > 0 ? 0.14 + 0.86 * Math.sqrt(count / max) : 1,
          },
          node(
            "title",
            {},
            document.createTextNode(
              `${DOW_LABELS[row]} ${String(hour).padStart(2, "0")}:00 — ${count} ${
                count === 1 ? "entry" : "entries"
              }`
            )
          )
        )
      );
    }
  }

  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21].map((hour) =>
    node(
      "text",
      {
        x: left + hour * (cell + gap) + cell / 2,
        y: 11,
        "text-anchor": "middle",
        class: "chart-axis",
      },
      document.createTextNode(String(hour).padStart(2, "0"))
    )
  );

  const dayLabels = DOW_LABELS.map((label, row) =>
    node(
      "text",
      { x: 0, y: top + row * (cell + gap) + cell / 2 + 3.5, class: "chart-axis" },
      document.createTextNode(label)
    )
  );

  return node(
    "svg",
    { viewBox: `0 0 ${width} ${height}`, class: "chart", role: "img" },
    hourLabels,
    dayLabels,
    rects
  );
}

/* ----------------------------------------------------------------- sparkline */

export function sparkline(values, color = "var(--accent)", width = 120, height = 30) {
  if (!values.length) return el("span");
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${i * stepX},${height - (v / max) * (height - 3) - 1.5}`)
    .join(" ");

  return node(
    "svg",
    { viewBox: `0 0 ${width} ${height}`, width, height, class: "spark" },
    node("path", {
      d: points,
      fill: "none",
      stroke: color,
      "stroke-width": 1.8,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );
}
