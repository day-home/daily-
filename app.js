const svg = document.querySelector("#plannerSvg");
const dateInput = document.querySelector("#dateInput");
const eventForm = document.querySelector("#eventForm");
const titleInput = document.querySelector("#titleInput");
const startInput = document.querySelector("#startInput");
const endInput = document.querySelector("#endInput");
const colorInput = document.querySelector("#colorInput");
const summaryList = document.querySelector("#summaryList");
const eventList = document.querySelector("#eventList");
const clearButton = document.querySelector("#clearButton");
const deleteButton = document.querySelector("#deleteButton");

const RADIUS = 238;
const SNAP_MINUTES = 5;
const STORAGE_PREFIX = "haru-wonpan:";

let events = [];
let draft = null;
let dragStart = null;
let selectedId = null;

function todayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function storageKey() {
  return `${STORAGE_PREFIX}${dateInput.value}`;
}

function loadEvents() {
  try {
    events = JSON.parse(localStorage.getItem(storageKey()) || "[]");
  } catch {
    events = [];
  }
  selectedId = null;
  draft = null;
  render();
}

function saveEvents() {
  localStorage.setItem(storageKey(), JSON.stringify(events));
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

function parseTime(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
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

function minutesFromPointer(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
  let deg = (Math.atan2(transformed.y, transformed.x) * 180) / Math.PI + 90;
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
      class: `hour-line ${i % 6 === 0 ? "major" : ""}`,
    });
    svg.appendChild(line);
  }

  for (let i = 0; i < 96; i += 1) {
    const angle = minutesToAngle(i * 15);
    const dot = polar(RADIUS - 7, angle);
    if (i % 4 !== 0) svg.appendChild(createSvgElement("circle", { cx: dot.x.toFixed(2), cy: dot.y.toFixed(2), r: 1.2, class: "minute-dot" }));
  }

  [0, 6, 12, 18, 3, 9, 15, 21].forEach((hour) => {
    const position = polar(RADIUS + 28, minutesToAngle(hour * 60));
    appendText(`${hour.toString().padStart(2, "0")}:00`, position.x, position.y, "hour-label");
  });
}

function drawEvent(event) {
  eventSegments(event).forEach((segment) => {
    const path = createSvgElement("path", {
      d: sectorPath(segment.start, segment.end),
      fill: event.color,
      class: `event-sector ${event.id === selectedId ? "selected" : ""}`,
      "data-id": event.id,
      opacity: 0.78,
    });
    svg.appendChild(path);

    const length = segment.end - segment.start;
    if (length >= 45) {
      const mid = segment.start + length / 2;
      const labelPosition = polar(RADIUS * 0.56, minutesToAngle(mid));
      appendText(event.title, labelPosition.x, labelPosition.y, "event-text");
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

function renderSummary() {
  summaryList.innerHTML = "";
  const totals = new Map();

  events.forEach((event) => {
    const key = event.title.trim() || "제목 없음";
    const old = totals.get(key) || { minutes: 0, color: event.color };
    old.minutes += durationOf(event);
    totals.set(key, old);
  });

  if (!totals.size) {
    const empty = document.createElement("li");
    empty.className = "empty-note";
    empty.textContent = "아직 채운 시간이 없어요. 원판을 드래그해서 첫 일정을 추가해보세요.";
    summaryList.appendChild(empty);
    return;
  }

  [...totals.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .forEach(([title, total]) => {
      const item = document.createElement("li");
      item.innerHTML = `
        <span class="list-left"><span class="dot" style="background:${total.color}"></span><span class="list-title">${escapeHtml(title)}</span></span>
        <span class="summary-time">${formatDuration(total.minutes)}</span>
      `;
      summaryList.appendChild(item);
    });
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
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(event.id === selectedId));
      button.innerHTML = `
        <span class="list-left"><span class="dot" style="background:${event.color}"></span><span class="list-title">${escapeHtml(event.title)}</span></span>
        <span class="list-time">${formatTime(event.start)}-${formatTime(event.end)}</span>
      `;
      button.addEventListener("click", () => selectEvent(event.id));
      item.appendChild(button);
      eventList.appendChild(item);
    });
}

function render() {
  svg.innerHTML = "";
  drawClockFace();
  events.forEach(drawEvent);
  drawDraft();
  svg.appendChild(createSvgElement("circle", { r: 5.5, class: "center-dot" }));
  renderSummary();
  renderEventList();
  deleteButton.hidden = !selectedId;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;",
  }[char]));
}

function selectEvent(id) {
  selectedId = id;
  const event = events.find((item) => item.id === id);
  if (event) {
    titleInput.value = event.title;
    startInput.value = formatTime(event.start);
    endInput.value = formatTime(event.end);
    colorInput.value = event.color;
  }
  draft = null;
  render();
}

function upsertEvent() {
  const title = titleInput.value.trim() || "새 일정";
  const start = parseTime(startInput.value);
  const end = parseTime(endInput.value);
  const color = colorInput.value;

  if (start === end) {
    alert("시작 시간과 끝 시간이 같으면 원판에 그릴 수 없어요.");
    return;
  }

  if (selectedId) {
    events = events.map((event) => event.id === selectedId ? { ...event, title, start, end, color } : event);
  } else {
    events.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title,
      start,
      end,
      color,
    });
  }

  saveEvents();
  draft = null;
  selectedId = null;
  titleInput.value = "";
  render();
}

function removeSelected() {
  if (!selectedId) return;
  events = events.filter((event) => event.id !== selectedId);
  selectedId = null;
  saveEvents();
  titleInput.value = "";
  render();
}

svg.addEventListener("pointerdown", (event) => {
  const clickedEventId = event.target.dataset.id;
  if (clickedEventId) {
    selectEvent(clickedEventId);
    return;
  }

  selectedId = null;
  dragStart = minutesFromPointer(event);
  draft = { start: dragStart, end: (dragStart + 30) % 1440, title: "선택 중", color: colorInput.value };
  startInput.value = formatTime(draft.start);
  endInput.value = formatTime(draft.end);
  svg.setPointerCapture(event.pointerId);
  render();
});

svg.addEventListener("pointermove", (event) => {
  if (dragStart === null) return;
  const end = minutesFromPointer(event);
  draft = { start: dragStart, end: end === dragStart ? (dragStart + 30) % 1440 : end, title: "선택 중", color: colorInput.value };
  startInput.value = formatTime(draft.start);
  endInput.value = formatTime(draft.end);
  render();
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
  draft = null;
  saveEvents();
  render();
});

dateInput.addEventListener("change", loadEvents);

colorInput.addEventListener("change", () => {
  if (draft) {
    draft.color = colorInput.value;
    render();
  }
});

dateInput.value = todayValue();
loadEvents();
