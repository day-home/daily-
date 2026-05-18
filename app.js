const svg = document.querySelector("#plannerSvg");
const dateInput = document.querySelector("#dateInput");
const eventForm = document.querySelector("#eventForm");
const formTitle = document.querySelector("#formTitle");
const titleInput = document.querySelector("#titleInput");
const startInput = document.querySelector("#startInput");
const endInput = document.querySelector("#endInput");
const colorInput = document.querySelector("#colorInput");
const colorPalette = document.querySelector("#colorPalette");
const customColorBox = document.querySelector("#customColorBox");
const customColorInput = document.querySelector("#customColorInput");
const addColorButton = document.querySelector("#addColorButton");
const submitButton = document.querySelector("#submitButton");
const summaryList = document.querySelector("#summaryList");
const eventList = document.querySelector("#eventList");
const clearButton = document.querySelector("#clearButton");
const deleteButton = document.querySelector("#deleteButton");

// 내보내기 버튼 추가
const exportPngButton = document.querySelector("#exportPngButton");
const exportPdfButton = document.querySelector("#exportPdfButton");

const RADIUS = 238;
const SNAP_MINUTES = 10;
const STORAGE_PREFIX = "haru-wonpan:";
const CUSTOM_COLORS_KEY = `${STORAGE_PREFIX}custom-colors`;

const DEFAULT_COLORS = [
  "#e6ddfb",
  "#e1edfc",
  "#f8d5eb",
  "#feff91",
  "#f5c6c4",
  "#f1f1f1",
];

let events = [];
let paletteColors = [...DEFAULT_COLORS];
let draft = null;
let dragStart = null;
let selectedId = null;
let openColorMenuId = null;

function todayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function storageKey() {
  return `${STORAGE_PREFIX}${dateInput.value || todayValue()}`;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeColor(color, fallback = DEFAULT_COLORS[0]) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color.toLowerCase() : fallback;
}

function loadCustomColors() {
  const saved = safeJsonParse(localStorage.getItem(CUSTOM_COLORS_KEY), []);
  const validSaved = Array.isArray(saved)
    ? saved.map((color) => normalizeColor(color, null)).filter(Boolean)
    : [];

  if (validSaved.length >= DEFAULT_COLORS.length) {
    paletteColors = [...new Set(validSaved)];
  } else {
    paletteColors = [...new Set([...DEFAULT_COLORS, ...validSaved])];
  }
}

function saveCustomColors() {
  localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(paletteColors));
}

function normalizeEvent(event) {
  return {
    id: event.id || createId(),
    title: typeof event.title === "string" ? event.title : "새 일정",
    start: Number.isFinite(event.start) ? snap(event.start) : 480,
    end: Number.isFinite(event.end) ? snap(event.end) : 540,
    color: normalizeColor(event.color),
  };
}

function loadEvents() {
  const saved = safeJsonParse(localStorage.getItem(storageKey()), []);
  events = Array.isArray(saved) ? saved.map(normalizeEvent) : [];

  selectedId = null;
  openColorMenuId = null;
  draft = null;

  resetForm(false);
  render();
}

function saveEvents() {
  localStorage.setItem(storageKey(), JSON.stringify(events));
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function minutesToAngle(minutes) {
  return (minutes / 1440) * 360 - 90;
}

function polar(radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
  };
}

function sectorPath(start, end, radius = RADIUS) {
  const diff = end - start;
  if (diff <= 0) return "";

  const startPoint = polar(radius, minutesToAngle(start));
  const endPoint = polar(radius, minutesToAngle(end));
  const largeArcFlag = diff > 720 ? 1 : 0;

  return [
    "M 0 0",
    `L ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function eventSegments(event) {
  const { start, end } = event;

  if (start === end) return [];
  if (end > start) return [{ start, end }];

  return [
    { start, end: 1440 },
    { start: 0, end },
  ];
}

function durationOf(event) {
  if (event.end > event.start) return event.end - event.start;
  if (event.end < event.start) return 1440 - event.start + event.end;
  return 0;
}

function formatTime(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60).toString().padStart(2, "0");
  const m = (normalized % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function parseClockText(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return snap(hour * 60 + minute);
}

function normalizeTimeInput(input, fallback) {
  const parsed = parseClockText(input.value);

  if (parsed === null) {
    input.value = formatTime(fallback);
    return fallback;
  }

  input.value = formatTime(parsed);
  return parsed;
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

function snap(minutes) {
  const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
  return ((snapped % 1440) + 1440) % 1440;
}

function pointerPoint(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;

  const matrix = svg.getScreenCTM();
  if (!matrix) return null;

  return point.matrixTransform(matrix.inverse());
}

function isInsideClock(point) {
  if (!point) return false;
  return Math.hypot(point.x, point.y) <= RADIUS;
}

function minutesFromPoint(point) {
  let deg = (Math.atan2(point.y, point.x) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  return snap((deg / 360) * 1440);
}

function appendText(text, x, y, className) {
  const el = createSvgElement("text", {
    x: x.toFixed(2),
    y: y.toFixed(2),
    class: className,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
  });

  el.textContent = text;
  svg.appendChild(el);
}

function estimateTextWidth(text) {
  return [...String(text)].reduce((total, char) => {
    if (char === " ") return total + 4;
    if (/[\u0000-\u007f]/.test(char)) return total + 7.5;
    return total + 13.5;
  }, 0);
}

function wrapByWords(text, maxWidth, maxLines = 4) {
  const words = String(text || "새 일정").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["새 일정"];

  const lines = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;

    if (current && estimateTextWidth(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    visible[maxLines - 1] = `${visible[maxLines - 1]}…`;
    return visible;
  }

  return lines;
}

function appendWrappedText(text, x, y, className, maxWidth) {
  const lines = wrapByWords(text, maxWidth);
  const longest = Math.max(...lines.map(estimateTextWidth));
  const fontSize = Math.max(10, Math.min(15, Math.floor((15 * maxWidth) / Math.max(longest, 1))));
  const lineHeight = Math.max(12, fontSize + 3);

  const el = createSvgElement("text", {
    x: x.toFixed(2),
    y: y.toFixed(2),
    class: className,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-size": fontSize,
  });

  lines.forEach((line, index) => {
    const tspan = createSvgElement("tspan", {
      x: x.toFixed(2),
      dy: index === 0 ? (-((lines.length - 1) * lineHeight) / 2).toFixed(2) : lineHeight.toFixed(2),
    });

    tspan.textContent = line;
    el.appendChild(tspan);
  });

  svg.appendChild(el);
}

function drawClockFace() {
  svg.appendChild(createSvgElement("circle", { r: RADIUS, class: "clock-face" }));

  for (let i = 0; i < 24; i += 1) {
    const angle = minutesToAngle(i * 60);
    const end = polar(RADIUS, angle);

    const line = createSvgElement("line", {
      x1: 0,
      y1: 0,
      x2: end.x.toFixed(2),
      y2: end.y.toFixed(2),
      class: `hour-line ${i % 6 === 0 ? "major" : i % 6 === 3 ? "diagonal" : ""}`,
    });

    svg.appendChild(line);
  }

  for (let i = 0; i < 144; i += 1) {
    if (i % 6 === 0) continue;

    const angle = minutesToAngle(i * 10);
    const dot = polar(RADIUS - 7, angle);

    svg.appendChild(createSvgElement("circle", {
      cx: dot.x.toFixed(2),
      cy: dot.y.toFixed(2),
      r: 0.9,
      class: "minute-dot",
    }));
  }
}

function drawEvent(event) {
  eventSegments(event).forEach((segment) => {
    const path = createSvgElement("path", {
      d: sectorPath(segment.start, segment.end),
      fill: event.color,
      class: `event-sector ${event.id === selectedId ? "selected" : ""}`,
      "data-id": event.id,
      opacity: 0.82,
    });

    svg.appendChild(path);

    const length = segment.end - segment.start;

    if (length >= 30) {
      const mid = segment.start + length / 2;
      const labelRadius = RADIUS * 0.58;
      const labelPosition = polar(labelRadius, minutesToAngle(mid));
      const arcWidth = labelRadius * ((length / 1440) * Math.PI * 2);
      const maxWidth = Math.max(26, Math.min(118, arcWidth * 0.86));

      appendWrappedText(event.title || "새 일정", labelPosition.x, labelPosition.y, "event-text", maxWidth);
    }
  });
}

function drawDraft() {
  if (!draft || draft.start === draft.end) return;

  eventSegments(draft).forEach((segment) => {
    svg.appendChild(createSvgElement("path", {
      d: sectorPath(segment.start, segment.end),
      class: "draft-sector",
    }));
  });
}

function drawBoundaryLabels() {
  const boundaries = new Set();
  const sources = [...events];

  if (draft && draft.start !== draft.end) sources.push(draft);

  if (!sources.length) {
    [0, 360, 720, 1080].forEach((minutes) => boundaries.add(minutes));
  } else {
    sources.forEach((event) => {
      boundaries.add(snap(event.start));
      boundaries.add(snap(event.end));
    });
  }

  [...boundaries].sort((a, b) => a - b).forEach((minutes) => {
    const position = polar(RADIUS + 28, minutesToAngle(minutes));
    appendText(formatTime(minutes), position.x, position.y, sources.length ? "boundary-label" : "boundary-label guide");
  });
}

function updateCustomColorPreview() {
  customColorBox.style.setProperty("--custom-preview", normalizeColor(customColorInput.value, "#ffffff"));
}

function renderColorPalette() {
  colorPalette.querySelectorAll(".palette-color-wrap").forEach((swatch) => swatch.remove());

  paletteColors.forEach((color) => {
    const wrap = document.createElement("div");
    wrap.className = "palette-color-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-swatch";
    button.style.backgroundColor = color;
    button.dataset.color = color;
    button.setAttribute("aria-label", color);
    button.setAttribute("aria-pressed", String(colorInput.value.toLowerCase() === color.toLowerCase()));

    const editor = document.createElement("input");
    editor.type = "color";
    editor.className = "palette-color-editor";
    editor.value = color;
    editor.setAttribute("aria-label", "기본 색상 수정");

    button.addEventListener("click", () => {
      const isAlreadySelected = colorInput.value.toLowerCase() === color.toLowerCase();

      if (isAlreadySelected) {
        editor.click();
        return;
      }

      setCurrentColor(color);
    });

    editor.addEventListener("input", () => {
      replacePaletteColor(color, editor.value);
    });

    wrap.append(button, editor);
    colorPalette.insertBefore(wrap, customColorBox);
  });
}

function setCurrentColor(color, redraw = true) {
  const normalized = normalizeColor(color);
  colorInput.value = normalized;

  if (draft) draft.color = normalized;

  if (selectedId && !draft) {
    const selectedEvent = events.find((event) => event.id === selectedId);

    if (selectedEvent) {
      selectedEvent.color = normalized;
      saveEvents();
    }
  }

  if (redraw) render();
  else renderColorPalette();
}

function addCustomColor(color) {
  const normalized = normalizeColor(color, null);
  if (!normalized) return;

  if (!paletteColors.includes(normalized)) {
    paletteColors.push(normalized);
    saveCustomColors();
  }

  setCurrentColor(normalized);
}

function replacePaletteColor(oldColor, newColor, options = {}) {
  const oldNormalized = normalizeColor(oldColor, null);
  const newNormalized = normalizeColor(newColor, null);

  if (!oldNormalized || !newNormalized) return;

  const oldIndex = paletteColors.indexOf(oldNormalized);
  const existingIndex = paletteColors.indexOf(newNormalized);

  if (oldIndex !== -1) {
    if (existingIndex !== -1 && existingIndex !== oldIndex) {
      paletteColors.splice(oldIndex, 1);
    } else {
      paletteColors[oldIndex] = newNormalized;
    }

    saveCustomColors();
  }

  if (options.eventId) {
    const target = events.find((event) => event.id === options.eventId);
    if (target) {
      target.color = newNormalized;
      selectedId = target.id;
      saveEvents();
      fillFormFromEvent(target);
    }
  } else {
    setCurrentColor(newNormalized, false);
  }

  render();
}

function renderSummary() {
  summaryList.innerHTML = "";
  const totals = new Map();

  events.forEach((event) => {
    const key = event.title.trim() || "새 일정";
    const old = totals.get(key) || { minutes: 0, color: event.color };
    old.minutes += durationOf(event);
    totals.set(key, old);
  });

  if (!totals.size) {
    const empty = document.createElement("li");
    empty.className = "empty-note";
    empty.textContent = "아직 추가된 일정이 없어요.";
    summaryList.appendChild(empty);
    return;
  }

  [...totals.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .forEach(([title, total]) => {
      const item = document.createElement("li");

      item.innerHTML = `
        <span class="list-left">
          <span class="dot" style="background:${total.color}"></span>
          <span class="summary-title">${escapeHtml(title)}</span>
        </span>
        <span class="summary-time">${formatDuration(total.minutes)}</span>
      `;

      summaryList.appendChild(item);
    });
}

function fillFormFromEvent(event) {
  titleInput.value = event.title;
  startInput.value = formatTime(event.start);
  endInput.value = formatTime(event.end);

  setCurrentColor(event.color, false);

  formTitle.textContent = "일정 수정";
  submitButton.textContent = "수정하기";
  deleteButton.hidden = false;
}

function openColorMenuFor(id) {
  openColorMenuId = openColorMenuId === id ? null : id;
  selectedId = id;

  const event = events.find((item) => item.id === id);
  if (event) fillFormFromEvent(event);

  render();
}

function updateEventColor(id, color) {
  const event = events.find((item) => item.id === id);
  if (!event) return;

  event.color = normalizeColor(color);
  selectedId = id;
  openColorMenuId = null;

  saveEvents();
  fillFormFromEvent(event);
  render();
}

function updateEventTime(id, key, value, input) {
  const event = events.find((item) => item.id === id);
  if (!event) return;

  const fallback = event[key];
  const parsed = parseClockText(value);

  if (parsed === null) {
    input.value = formatTime(fallback);
    return;
  }

  event[key] = parsed;
  input.value = formatTime(parsed);
  selectedId = id;

  saveEvents();
  fillFormFromEvent(event);
  render();
}

function renderEventList() {
  eventList.innerHTML = "";

  if (!events.length) {
    const item = document.createElement("li");
    item.className = "empty-note";
    item.textContent = "일정이 생기면 여기에 목록으로 보여요.";
    eventList.appendChild(item);
    return;
  }

  [...events]
    .sort((a, b) => a.start - b.start)
    .forEach((event) => {
      const item = document.createElement("li");
      item.className = `event-row ${event.id === selectedId ? "selected" : ""}`;

      const colorWrap = document.createElement("div");
      colorWrap.className = "list-color-wrap";

      const colorButton = document.createElement("button");
      colorButton.type = "button";
      colorButton.className = "list-color-button";
      colorButton.style.backgroundColor = event.color;
      colorButton.setAttribute("aria-label", "일정 색상 선택");
      colorButton.addEventListener("click", () => openColorMenuFor(event.id));

      colorWrap.appendChild(colorButton);

      if (openColorMenuId === event.id) {
  const menu = document.createElement("div");
  menu.className = "list-color-menu";

  paletteColors.forEach((color) => {
    const miniWrap = document.createElement("div");
    miniWrap.className = "mini-color-wrap";

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "mini-color-swatch";
    menuButton.style.backgroundColor = color;
    menuButton.setAttribute("aria-label", color);
    menuButton.setAttribute("aria-pressed", String(event.color === color));

    const editor = document.createElement("input");
    editor.type = "color";
    editor.className = "mini-color-editor";
    editor.value = color;
    editor.setAttribute("aria-label", "고정 색상 수정");

    menuButton.addEventListener("click", () => {
      const isAlreadySelected = event.color.toLowerCase() === color.toLowerCase();

      if (isAlreadySelected) {
        editor.click();
        return;
      }

      updateEventColor(event.id, color);
    });

    editor.addEventListener("input", () => {
      replacePaletteColor(color, editor.value, { eventId: event.id });
    });

    miniWrap.append(menuButton, editor);
    menu.appendChild(miniWrap);
  });

  const oneTimeColor = document.createElement("label");
  oneTimeColor.className = "mini-custom-color-box";
  oneTimeColor.style.setProperty("--mini-custom-preview", event.color);
  oneTimeColor.setAttribute("aria-label", "일회용 색상 만들기");

  const oneTimeInput = document.createElement("input");
  oneTimeInput.type = "color";
  oneTimeInput.value = event.color;

  const plus = document.createElement("span");
  plus.textContent = "+";
  plus.setAttribute("aria-hidden", "true");

  oneTimeInput.addEventListener("input", () => {
    oneTimeColor.style.setProperty("--mini-custom-preview", oneTimeInput.value);
    updateEventColor(event.id, oneTimeInput.value);
  });

  oneTimeColor.append(oneTimeInput, plus);
  menu.appendChild(oneTimeColor);

  colorWrap.appendChild(menu);
}

      const titleEdit = document.createElement("input");
      titleEdit.type = "text";
      titleEdit.className = "list-title-input";
      titleEdit.value = event.title;
      titleEdit.placeholder = "새 일정";
      titleEdit.setAttribute("aria-label", "일정 이름 수정");

      titleEdit.addEventListener("focus", () => {
        selectedId = event.id;
        openColorMenuId = null;
        fillFormFromEvent(event);
        renderPlannerOnly();
      });

      titleEdit.addEventListener("change", () => {
        event.title = titleEdit.value.trim() || "새 일정";
        selectedId = event.id;

        saveEvents();
        fillFormFromEvent(event);
        render();
      });

      titleEdit.addEventListener("keydown", (keyboardEvent) => {
        if (keyboardEvent.key === "Enter") titleEdit.blur();
      });

      const timeEditor = document.createElement("div");
      timeEditor.className = "list-time-editor";

      const startEdit = document.createElement("input");
      startEdit.type = "text";
      startEdit.inputMode = "numeric";
      startEdit.maxLength = 5;
      startEdit.value = formatTime(event.start);
      startEdit.setAttribute("aria-label", "시작 시간 수정");

      startEdit.addEventListener("focus", () => {
        selectedId = event.id;
        openColorMenuId = null;
        fillFormFromEvent(event);
        renderPlannerOnly();
      });

      startEdit.addEventListener("change", () => updateEventTime(event.id, "start", startEdit.value, startEdit));

      startEdit.addEventListener("keydown", (keyboardEvent) => {
        if (keyboardEvent.key === "Enter") startEdit.blur();
      });

      const dash = document.createElement("span");
      dash.textContent = "-";

      const endEdit = document.createElement("input");
      endEdit.type = "text";
      endEdit.inputMode = "numeric";
      endEdit.maxLength = 5;
      endEdit.value = formatTime(event.end);
      endEdit.setAttribute("aria-label", "끝 시간 수정");

      endEdit.addEventListener("focus", () => {
        selectedId = event.id;
        openColorMenuId = null;
        fillFormFromEvent(event);
        renderPlannerOnly();
      });

      endEdit.addEventListener("change", () => updateEventTime(event.id, "end", endEdit.value, endEdit));

      endEdit.addEventListener("keydown", (keyboardEvent) => {
        if (keyboardEvent.key === "Enter") endEdit.blur();
      });

      timeEditor.append(startEdit, dash, endEdit);
      item.append(colorWrap, titleEdit, timeEditor);
      eventList.appendChild(item);
    });
}

function renderPlannerOnly() {
  svg.innerHTML = "";

  drawClockFace();
  events.forEach(drawEvent);
  drawDraft();
  drawBoundaryLabels();

  svg.appendChild(createSvgElement("circle", { r: 5.2, class: "center-dot" }));
}

function render() {
  renderPlannerOnly();
  renderColorPalette();
  renderSummary();
  renderEventList();

  deleteButton.hidden = !selectedId;
  formTitle.textContent = selectedId ? "일정 수정" : "일정 추가";
  submitButton.textContent = selectedId ? "수정하기" : "추가하기";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;",
  }[char]));
}

function selectEvent(id) {
  selectedId = id;
  openColorMenuId = null;

  const event = events.find((item) => item.id === id);
  if (event) fillFormFromEvent(event);

  draft = null;
  render();
}

function resetForm(shouldRender = true) {
  selectedId = null;
  openColorMenuId = null;
  draft = null;

  titleInput.value = "";
  startInput.value = "08:00";
  endInput.value = "09:00";

  setCurrentColor(colorInput.value || DEFAULT_COLORS[0], false);

  formTitle.textContent = "일정 추가";
  submitButton.textContent = "추가하기";
  deleteButton.hidden = true;

  if (shouldRender) render();
}

function upsertEvent() {
  const oldEvent = selectedId ? events.find((event) => event.id === selectedId) : null;

  const title = titleInput.value.trim() || "새 일정";
  const start = normalizeTimeInput(startInput, oldEvent?.start ?? draft?.start ?? 480);
  const end = normalizeTimeInput(endInput, oldEvent?.end ?? draft?.end ?? 540);
  const color = colorInput.value;

  if (start === end) {
    alert("시작 시간과 끝 시간이 같으면 원판에 그릴 수 없어요.");
    return;
  }

  if (selectedId) {
    events = events.map((event) => event.id === selectedId ? { ...event, title, start, end, color } : event);
  } else {
    events.push({
      id: createId(),
      title,
      start,
      end,
      color,
    });
  }

  saveEvents();
  resetForm();
}

function removeSelected() {
  if (!selectedId) return;

  events = events.filter((event) => event.id !== selectedId);

  saveEvents();
  resetForm();
}

// ──────────────────────────────────────────────────
// [추가된 기능] 이미지(PNG) & PDF 파일 내보내기 핵심 로직
// ──────────────────────────────────────────────────

// 외부 라이브러리 로드를 위한 헬퍼 함수
function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (window.jspdf) { resolve(); return; }
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("라이브러리 로드 실패"));
    document.head.appendChild(script);
  });
}

async function exportPlanner(type = 'png') {
  // 1. 원본 SVG 클론 (DOM 직접 조작 방지)
  const clonedSvg = svg.cloneNode(true);
  
  // 2. 외부 CSS 스타일시트에서 시간표 스타일만 추출하여 주입 (색상 및 글꼴 깨짐 방지)
  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  let cssStyles = "";
  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules || sheet.rules;
      if (!rules) continue;
      for (const rule of rules) {
        cssStyles += rule.cssText + "\n";
      }
    } catch (e) {
      // 크로스 오리진 스타일시트 에러 방지용 예외 처리
    }
  }
  styleEl.textContent = cssStyles;
  clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);

  // SVG 크기 측정 및 속성 부여
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox.width || svg.getBoundingClientRect().width || 600;
  const height = viewBox.height || svg.getBoundingClientRect().height || 600;
  clonedSvg.setAttribute("width", width);
  clonedSvg.setAttribute("height", height);

  // 3. SVG 문서를 데이터 URI 포맷으로 변경
  const svgString = new XMLSerializer().serializeToString(clonedSvg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(svgBlob);

  // 4. 가상 이미지 객체에 로드 후 Canvas에 그리기
  const img = new Image();
  img.src = blobUrl;
  
  await new Promise((resolve) => { img.onload = resolve; });

  const canvas = document.createElement("canvas");
  const scale = 2; // 선명한 결과물을 위해 2배 고해상도로 렌더링
  canvas.width = width * scale;
  canvas.height = height * scale;
  
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // 배경색 흰색 설정
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  
  URL.revokeObjectURL(blobUrl);

  const dateStr = dateInput.value || todayValue();
  const fileName = `스케줄표_${dateStr}`;

  // 5. 타입별 분기 처리 (PNG vs PDF)
  if (type === 'png') {
    const imageData = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = imageData;
    link.download = `${fileName}.png`;
    link.click();
  } else if (type === 'pdf') {
    try {
      // jsPDF CDN 라이브러리 동적 로드
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      const { jsPDF } = window.jspdf;
      
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = pdf.internal.pageSize.getWidth();
      
      // A4 용지 규격에 맞게 중앙 배치 디자인 구성
      const printWidth = 160; 
      const printHeight = (height / width) * printWidth;
      const x = (pageWidth - printWidth) / 2;
      const y = 40; 
      
      // 상단 타이틀 텍스트 추가
      pdf.setFontSize(16);
      pdf.text(`${dateStr} 하루 원판 시간표`, pageWidth / 2, 25, { align: "center" });
      
      // 이미지 삽입 및 파일 저장
      pdf.addImage(imgData, "PNG", x, y, printWidth, printHeight);
      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      console.error("PDF 생성 실패:", err);
      alert("PDF 저장 중 문제가 발생했어. 인터넷 연결을 확인해줘!");
    }
  }
}

// ──────────────────────────────────────────────────

svg.addEventListener("pointerdown", (event) => {
  const point = pointerPoint(event);

  if (!isInsideClock(point)) return;

  const clickedEventId = event.target.dataset.id;

  if (clickedEventId) {
    selectEvent(clickedEventId);
    return;
  }

  selectedId = null;
  openColorMenuId = null;
  dragStart = minutesFromPoint(point);

  draft = {
    start: dragStart,
    end: (dragStart + 30) % 1440,
    title: titleInput.value.trim() || "선택 중",
    color: colorInput.value,
  };

  startInput.value = formatTime(draft.start);
  endInput.value = formatTime(draft.end);

  formTitle.textContent = "일정 추가";
  submitButton.textContent = "추가하기";
  deleteButton.hidden = true;

  svg.setPointerCapture(event.pointerId);
  render();
});

svg.addEventListener("pointermove", (event) => {
  if (dragStart === null) return;

  const point = pointerPoint(event);
  if (!point) return;

  const end = minutesFromPoint(point);

  draft = {
    start: dragStart,
    end: end === dragStart ? (dragStart + SNAP_MINUTES) % 1440 : end,
    title: titleInput.value.trim() || "선택 중",
    color: colorInput.value,
  };

  startInput.value = formatTime(draft.start);
  endInput.value = formatTime(draft.end);

  renderPlannerOnly();
});

svg.addEventListener("pointerup", (event) => {
  if (dragStart === null) return;

  svg.releasePointerCapture(event.pointerId);
  dragStart = null;
  titleInput.focus();
});

svg.addEventListener("pointercancel", () => {
  dragStart = null;
});

eventForm.addEventListener("submit", (event) => {
  event.preventDefault();
  upsertEvent();
});

deleteButton.addEventListener("click", removeSelected);

clearButton.addEventListener("click", () => {
  if (!events.length) return;

  const ok = confirm("오늘 원판의 모든 일정을 지울까요?");
  if (!ok) return;

  events = [];
  selectedId = null;
  openColorMenuId = null;
  draft = null;

  saveEvents();
  resetForm();
});

dateInput.addEventListener("change", loadEvents);

customColorInput.addEventListener("input", updateCustomColorPreview);

addColorButton.addEventListener("click", () => {
  addCustomColor(customColorInput.value);
});

titleInput.addEventListener("input", () => {
  if (draft) {
    draft.title = titleInput.value.trim() || "선택 중";
    renderPlannerOnly();
  }
});

startInput.addEventListener("change", () => {
  const fallback = selectedId
    ? events.find((event) => event.id === selectedId)?.start ?? 480
    : draft?.start ?? 480;

  const start = normalizeTimeInput(startInput, fallback);

  if (draft) {
    draft.start = start;
    renderPlannerOnly();
  }
});

endInput.addEventListener("change", () => {
  const fallback = selectedId
    ? events.find((event) => event.id === selectedId)?.end ?? 540
    : draft?.end ?? 540;

  const end = normalizeTimeInput(endInput, fallback);

  if (draft) {
    draft.end = end;
    renderPlannerOnly();
  }
});

// 내보내기 버튼 이벤트 리스너 바인딩
if (exportPngButton) {
  exportPngButton.addEventListener("click", () => exportPlanner("png"));
}
if (exportPdfButton) {
  exportPdfButton.addEventListener("click", () => exportPlanner("pdf"));
}

loadCustomColors();
const urlDate = new URLSearchParams(window.location.search).get("date");
dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(urlDate || "") ? urlDate : todayValue();
updateCustomColorPreview();
setCurrentColor(DEFAULT_COLORS[0], false);
loadEvents();
