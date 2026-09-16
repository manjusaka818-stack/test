"use strict";

const STORAGE_KEY = "obs-transparent-overlay.settings.v1";
const DB_NAME = "obs-transparent-overlay";
const DB_VERSION = 1;
const IMAGE_STORE = "assets";
const IMAGE_KEY = "active-image";

const DEFAULTS = Object.freeze({
  mode: "text",
  text: "OBS 动态覆盖层",
  fontSize: 64,
  fontFamily: "Microsoft YaHei",
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  imageScale: 100,
  speed: 120,
});

const PRESET_FONTS = [
  "Microsoft YaHei",
  "SimHei",
  "SimSun",
  "DengXian",
  "Arial",
  "Verdana",
  "Georgia",
  "Times New Roman",
  "Courier New",
];

const elements = {
  stage: document.querySelector("#stage"),
  movingObject: document.querySelector("#moving-object"),
  textObject: document.querySelector("#text-object"),
  imageObject: document.querySelector("#image-object"),
  panel: document.querySelector("#settings-panel"),
  closePanel: document.querySelector("#close-panel"),
  modeInputs: [...document.querySelectorAll('input[name="mode"]')],
  textSettings: document.querySelector("#text-settings"),
  imageSettings: document.querySelector("#image-settings"),
  textContent: document.querySelector("#text-content"),
  fontSize: document.querySelector("#font-size"),
  fontSelect: document.querySelector("#font-select"),
  loadLocalFonts: document.querySelector("#load-local-fonts"),
  fontName: document.querySelector("#font-name"),
  fontStatus: document.querySelector("#font-status"),
  fontBold: document.querySelector("#font-bold"),
  fontItalic: document.querySelector("#font-italic"),
  fontUnderline: document.querySelector("#font-underline"),
  fontStrike: document.querySelector("#font-strike"),
  imageFile: document.querySelector("#image-file"),
  clearImage: document.querySelector("#clear-image"),
  imageStatus: document.querySelector("#image-status"),
  imageScaleNumber: document.querySelector("#image-scale-number"),
  imageScaleRange: document.querySelector("#image-scale-range"),
  speedNumber: document.querySelector("#speed-number"),
  speedRange: document.querySelector("#speed-range"),
  fitNotice: document.querySelector("#fit-notice"),
};

let settings = loadSettings();
let objectUrl = "";
let imageMetadata = null;
let imageReady = false;
let position = { x: 0, y: 0 };
let velocity = randomVelocity(settings.speed);
let fitScale = 1;
let visualSize = { width: 0, height: 0 };
let lastFrameTime = null;
let hasPlacedObject = false;
let resizeFrame = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeSettings(candidate) {
  return {
    mode: candidate.mode === "image" ? "image" : "text",
    text: typeof candidate.text === "string" ? candidate.text : DEFAULTS.text,
    fontSize: clamp(finiteNumber(candidate.fontSize, DEFAULTS.fontSize), 8, 400),
    fontFamily:
      typeof candidate.fontFamily === "string" && candidate.fontFamily.trim()
        ? candidate.fontFamily.trim()
        : DEFAULTS.fontFamily,
    bold: Boolean(candidate.bold),
    italic: Boolean(candidate.italic),
    underline: Boolean(candidate.underline),
    strike: Boolean(candidate.strike),
    imageScale: clamp(finiteNumber(candidate.imageScale, DEFAULTS.imageScale), 1, 500),
    speed: clamp(finiteNumber(candidate.speed, DEFAULTS.speed), 1, 1000),
  };
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return sanitizeSettings({ ...DEFAULTS, ...(stored || {}) });
  } catch (error) {
    console.warn("无法读取已保存设置，将使用默认值。", error);
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("无法保存设置。", error);
  }
}

function randomVelocity(speed) {
  const minimumAxisRatio = 0.28;
  let angle = 0;

  do {
    angle = Math.random() * Math.PI * 2;
  } while (
    Math.abs(Math.cos(angle)) < minimumAxisRatio ||
    Math.abs(Math.sin(angle)) < minimumAxisRatio
  );

  return {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed,
  };
}

function setSpeed(nextSpeed) {
  const speed = clamp(finiteNumber(nextSpeed, settings.speed), 1, 1000);
  const magnitude = Math.hypot(velocity.x, velocity.y);

  if (magnitude > 0) {
    velocity.x = (velocity.x / magnitude) * speed;
    velocity.y = (velocity.y / magnitude) * speed;
  } else {
    velocity = randomVelocity(speed);
  }

  settings.speed = speed;
  elements.speedNumber.value = String(speed);
  elements.speedRange.value = String(speed);
  saveSettings();
}

function setImageScale(nextScale) {
  const scale = clamp(finiteNumber(nextScale, settings.imageScale), 1, 500);
  settings.imageScale = scale;
  elements.imageScaleNumber.value = String(scale);
  elements.imageScaleRange.value = String(scale);
  applyImageSize();
  saveSettings();
}

function cssFontFamily(fontName) {
  const escaped = String(fontName)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/[\n\r\f]/g, " ");
  return `"${escaped}", sans-serif`;
}

function applyTextStyles() {
  elements.textObject.textContent = settings.text;
  elements.textObject.style.fontSize = `${settings.fontSize}px`;
  elements.textObject.style.fontFamily = cssFontFamily(settings.fontFamily);
  elements.textObject.style.fontWeight = settings.bold ? "700" : "400";
  elements.textObject.style.fontStyle = settings.italic ? "italic" : "normal";

  const decorations = [];
  if (settings.underline) decorations.push("underline");
  if (settings.strike) decorations.push("line-through");
  elements.textObject.style.textDecoration = decorations.join(" ") || "none";

  scheduleBoundsUpdate();
}

function applyImageSize() {
  if (!imageReady) return;

  const width = elements.imageObject.naturalWidth * (settings.imageScale / 100);
  elements.imageObject.style.width = `${width}px`;
  elements.imageObject.style.height = "auto";
  scheduleBoundsUpdate();
}

function applyMode() {
  const isText = settings.mode === "text";
  elements.textObject.style.display = isText ? "block" : "none";
  elements.imageObject.style.display = !isText && imageReady ? "block" : "none";
  elements.textSettings.classList.toggle("is-hidden", !isText);
  elements.imageSettings.classList.toggle("is-hidden", isText);

  for (const input of elements.modeInputs) {
    input.checked = input.value === settings.mode;
  }

  scheduleBoundsUpdate();
}

function populateFontSelect(fontNames) {
  const names = [...new Set([...PRESET_FONTS, ...fontNames, settings.fontFamily])];
  names.sort((a, b) => a.localeCompare(b, "zh-CN", { sensitivity: "base" }));

  elements.fontSelect.replaceChildren();
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    elements.fontSelect.append(option);
  }

  elements.fontSelect.value = settings.fontFamily;
}

function syncControlsFromSettings() {
  elements.textContent.value = settings.text;
  elements.fontSize.value = String(settings.fontSize);
  elements.fontName.value = settings.fontFamily;
  elements.fontBold.checked = settings.bold;
  elements.fontItalic.checked = settings.italic;
  elements.fontUnderline.checked = settings.underline;
  elements.fontStrike.checked = settings.strike;
  elements.imageScaleNumber.value = String(settings.imageScale);
  elements.imageScaleRange.value = String(settings.imageScale);
  elements.speedNumber.value = String(settings.speed);
  elements.speedRange.value = String(settings.speed);
  populateFontSelect([]);
  applyTextStyles();
  applyMode();
}

function updateStatus(element, message, kind = "") {
  element.textContent = message;
  element.classList.toggle("is-error", kind === "error");
  element.classList.toggle("is-success", kind === "success");
}

function showPanel() {
  elements.panel.classList.remove("is-hidden");
  elements.panel.setAttribute("aria-hidden", "false");
}

function hidePanel() {
  elements.panel.classList.add("is-hidden");
  elements.panel.setAttribute("aria-hidden", "true");
}

function isPanelVisible() {
  return !elements.panel.classList.contains("is-hidden");
}

function isPointInsideMovingObject(clientX, clientY) {
  if (visualSize.width <= 0 || visualSize.height <= 0) return false;
  const rect = elements.movingObject.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function scheduleBoundsUpdate() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(updateBounds);
}

function updateBounds() {
  const viewportWidth = Math.max(0, window.innerWidth);
  const viewportHeight = Math.max(0, window.innerHeight);
  const baseWidth = elements.movingObject.offsetWidth;
  const baseHeight = elements.movingObject.offsetHeight;

  if (baseWidth <= 0 || baseHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    fitScale = 1;
    visualSize = { width: 0, height: 0 };
    renderPosition();
    return;
  }

  fitScale = Math.min(1, viewportWidth / baseWidth, viewportHeight / baseHeight);
  visualSize = {
    width: baseWidth * fitScale,
    height: baseHeight * fitScale,
  };

  const maxX = Math.max(0, viewportWidth - visualSize.width);
  const maxY = Math.max(0, viewportHeight - visualSize.height);

  if (!hasPlacedObject) {
    position.x = Math.random() * maxX;
    position.y = Math.random() * maxY;
    hasPlacedObject = true;
  } else {
    position.x = clamp(position.x, 0, maxX);
    position.y = clamp(position.y, 0, maxY);
  }

  elements.fitNotice.classList.toggle("is-hidden", fitScale >= 0.9999);
  renderPosition();
}

function renderPosition() {
  elements.movingObject.style.transform =
    `translate3d(${position.x}px, ${position.y}px, 0) scale(${fitScale})`;
}

function advanceAxis(current, axisVelocity, elapsed, limit) {
  if (limit <= 0) {
    return { position: 0, velocity: axisVelocity };
  }

  let nextPosition = current + axisVelocity * elapsed;
  let nextVelocity = axisVelocity;

  while (nextPosition < 0 || nextPosition > limit) {
    if (nextPosition < 0) {
      nextPosition = -nextPosition;
      nextVelocity = -nextVelocity;
    }

    if (nextPosition > limit) {
      nextPosition = limit * 2 - nextPosition;
      nextVelocity = -nextVelocity;
    }
  }

  return { position: nextPosition, velocity: nextVelocity };
}

function animate(timestamp) {
  if (lastFrameTime === null) lastFrameTime = timestamp;
  const elapsed = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
  lastFrameTime = timestamp;

  const maxX = Math.max(0, window.innerWidth - visualSize.width);
  const maxY = Math.max(0, window.innerHeight - visualSize.height);
  const horizontal = advanceAxis(position.x, velocity.x, elapsed, maxX);
  const vertical = advanceAxis(position.y, velocity.y, elapsed, maxY);

  position.x = horizontal.position;
  position.y = vertical.position;
  velocity.x = horizontal.velocity;
  velocity.y = vertical.velocity;
  renderPosition();

  requestAnimationFrame(animate);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持 IndexedDB。"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        database.createObjectStore(IMAGE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败。"));
  });
}

async function withImageStore(mode, operation) {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE, mode);
      const store = transaction.objectStore(IMAGE_STORE);
      let result;

      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }

      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 操作失败。"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB 操作已中止。"));
    });
  } finally {
    database.close();
  }
}

function saveImageRecord(record) {
  return withImageStore("readwrite", (store) => store.put(record));
}

function loadImageRecord() {
  return withImageStore("readonly", (store) => store.get(IMAGE_KEY));
}

function deleteImageRecord() {
  return withImageStore("readwrite", (store) => store.delete(IMAGE_KEY));
}

function waitForImageLoad(image) {
  return new Promise((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }

    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error("图片无法解码或格式不受支持。")), {
      once: true,
    });
  });
}

async function displayImageBlob(blob, metadata = {}) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);

  imageReady = false;
  objectUrl = URL.createObjectURL(blob);
  elements.imageObject.src = objectUrl;
  await waitForImageLoad(elements.imageObject);

  imageReady = true;
  imageMetadata = {
    name: metadata.name || "已保存图片",
    type: metadata.type || blob.type || "未知格式",
    naturalWidth: elements.imageObject.naturalWidth,
    naturalHeight: elements.imageObject.naturalHeight,
  };

  applyImageSize();
  applyMode();
  updateStatus(
    elements.imageStatus,
    `${imageMetadata.name} · ${imageMetadata.naturalWidth} × ${imageMetadata.naturalHeight}`,
    "success",
  );
}

async function handleImageSelection(file) {
  if (!file) return;
  if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".gif")) {
    updateStatus(elements.imageStatus, "请选择静态图片或 GIF 文件。", "error");
    return;
  }

  updateStatus(elements.imageStatus, "正在读取并保存图片…");

  try {
    await displayImageBlob(file, { name: file.name, type: file.type });
    await saveImageRecord({
      id: IMAGE_KEY,
      blob: file,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      naturalWidth: elements.imageObject.naturalWidth,
      naturalHeight: elements.imageObject.naturalHeight,
      savedAt: Date.now(),
    });
    updateStatus(
      elements.imageStatus,
      `${file.name} · ${elements.imageObject.naturalWidth} × ${elements.imageObject.naturalHeight} · 已保存`,
      "success",
    );
  } catch (error) {
    console.error(error);
    updateStatus(elements.imageStatus, `图片处理失败：${error.message}`, "error");
  } finally {
    elements.imageFile.value = "";
  }
}

async function restoreImage() {
  try {
    const record = await loadImageRecord();
    if (!record?.blob) {
      updateStatus(elements.imageStatus, "尚未选择图片。图片模式下对象将保持隐藏。");
      return;
    }

    await displayImageBlob(record.blob, record);
  } catch (error) {
    console.error(error);
    updateStatus(elements.imageStatus, `无法恢复已保存图片：${error.message}`, "error");
  }
}

async function clearSavedImage() {
  try {
    await deleteImageRecord();
    imageReady = false;
    imageMetadata = null;
    elements.imageObject.removeAttribute("src");
    elements.imageObject.style.display = "none";

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    }

    updateStatus(elements.imageStatus, "已清除保存的图片。", "success");
    scheduleBoundsUpdate();
  } catch (error) {
    console.error(error);
    updateStatus(elements.imageStatus, `清除失败：${error.message}`, "error");
  }
}

async function loadLocalFonts() {
  if (!("queryLocalFonts" in window)) {
    updateStatus(
      elements.fontStatus,
      "当前浏览器不支持读取本机字体。请在下方手动输入已安装字体名称。",
      "error",
    );
    return;
  }

  elements.loadLocalFonts.disabled = true;
  updateStatus(elements.fontStatus, "正在请求本机字体访问权限…");

  try {
    const fontData = await window.queryLocalFonts();
    const families = [...new Set(fontData.map((font) => font.family).filter(Boolean))];
    populateFontSelect(families);
    updateStatus(elements.fontStatus, `已读取 ${families.length} 个字体家族。`, "success");
  } catch (error) {
    const message = error?.name === "NotAllowedError"
      ? "未获得字体读取权限。你仍可手动输入字体名称。"
      : `读取失败：${error.message || "请改用手动字体名称。"}`;
    updateStatus(elements.fontStatus, message, "error");
  } finally {
    elements.loadLocalFonts.disabled = false;
  }
}

function setFontFamily(name) {
  const normalized = String(name).trim();
  if (!normalized) return;

  settings.fontFamily = normalized;
  elements.fontName.value = normalized;

  if (![...elements.fontSelect.options].some((option) => option.value === normalized)) {
    const option = document.createElement("option");
    option.value = normalized;
    option.textContent = normalized;
    elements.fontSelect.append(option);
  }

  elements.fontSelect.value = normalized;
  applyTextStyles();
  saveSettings();
}

function bindEvents() {
  elements.panel.addEventListener("pointerup", (event) => event.stopPropagation());
  elements.closePanel.addEventListener("click", hidePanel);

  document.addEventListener("pointerup", (event) => {
    if (isPanelVisible()) {
      hidePanel();
      return;
    }

    if (!isPointInsideMovingObject(event.clientX, event.clientY)) showPanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hidePanel();
  });

  document.addEventListener("dragstart", (event) => event.preventDefault());
  document.addEventListener("contextmenu", (event) => {
    if (!isPanelVisible()) event.preventDefault();
  });

  for (const input of elements.modeInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      settings.mode = input.value;
      applyMode();
      saveSettings();
    });
  }

  elements.textContent.addEventListener("input", () => {
    settings.text = elements.textContent.value;
    applyTextStyles();
    saveSettings();
  });

  elements.fontSize.addEventListener("input", () => {
    settings.fontSize = clamp(finiteNumber(elements.fontSize.value, settings.fontSize), 8, 400);
    applyTextStyles();
    saveSettings();
  });
  elements.fontSize.addEventListener("change", () => {
    elements.fontSize.value = String(settings.fontSize);
  });

  elements.fontSelect.addEventListener("change", () => setFontFamily(elements.fontSelect.value));
  elements.fontName.addEventListener("change", () => setFontFamily(elements.fontName.value));
  elements.loadLocalFonts.addEventListener("click", loadLocalFonts);

  const styleBindings = [
    [elements.fontBold, "bold"],
    [elements.fontItalic, "italic"],
    [elements.fontUnderline, "underline"],
    [elements.fontStrike, "strike"],
  ];

  for (const [element, key] of styleBindings) {
    element.addEventListener("change", () => {
      settings[key] = element.checked;
      applyTextStyles();
      saveSettings();
    });
  }

  elements.imageFile.addEventListener("change", () => handleImageSelection(elements.imageFile.files?.[0]));
  elements.clearImage.addEventListener("click", clearSavedImage);
  elements.imageScaleRange.addEventListener("input", () => setImageScale(elements.imageScaleRange.value));
  elements.imageScaleNumber.addEventListener("input", () => {
    if (elements.imageScaleNumber.value !== "") setImageScale(elements.imageScaleNumber.value);
  });
  elements.imageScaleNumber.addEventListener("change", () => setImageScale(elements.imageScaleNumber.value));

  elements.speedRange.addEventListener("input", () => setSpeed(elements.speedRange.value));
  elements.speedNumber.addEventListener("input", () => {
    if (elements.speedNumber.value !== "") setSpeed(elements.speedNumber.value);
  });
  elements.speedNumber.addEventListener("change", () => setSpeed(elements.speedNumber.value));

  window.addEventListener("resize", scheduleBoundsUpdate, { passive: true });
  window.addEventListener("beforeunload", () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(scheduleBoundsUpdate);
    resizeObserver.observe(elements.movingObject);
  }
}

function initializeFontStatus() {
  if (!window.isSecureContext) {
    updateStatus(
      elements.fontStatus,
      "本机字体读取要求安全环境（HTTPS 或 localhost）。当前仍可手动输入字体名称。",
      "error",
    );
  } else if (!("queryLocalFonts" in window)) {
    updateStatus(
      elements.fontStatus,
      "当前浏览器不支持自动枚举字体。请手动输入字体名称。",
    );
  } else {
    updateStatus(elements.fontStatus, "单击“读取本机字体”后，浏览器会请求访问权限。");
  }
}

async function initialize() {
  syncControlsFromSettings();
  bindEvents();
  initializeFontStatus();
  await restoreImage();
  scheduleBoundsUpdate();
  requestAnimationFrame(animate);
}

initialize();
