const WAREHOUSES = ["Panipat", "Delhi", "Bangalore"];
const DESTINATIONS = ["Delhi", "Bangalore"];
const STOCK_COLUMN = "quantity_available_ for_ sale";
const MAX_VISIBLE_TABLE_ROWS = 500;
const INVENTORY_DATA_CLEAR_VERSION = "2026-06-30-clear-inventory-pallet-dispatch-only";
const CATALOGUE_COLUMNS = {
  catalogue: ["catalogue", "catalog", "catalogue_name", "catalog_name"],
  sku: ["sku", "pattern", "pattern_number", "sku/pattern number"],
  boxSize: ["box_size", "box size", "boxsize", "rolls_per_box"],
};
const INVENTORY_COLUMNS = {
  sku: ["sku", "sku code", "item sku", "product sku", "pattern", "pattern_number", "sku/pattern number"],
  quantity: [
    STOCK_COLUMN,
    "quantity_available_for_sale",
    "quantity available for sale",
    "qty available for sale",
    "available for sale",
    "quantity for sale",
    "quantity",
    "qty",
  ],
};
const SUPABASE_URL = "https://tbbfbobxmqvlwapqhmin.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KEGfINQNc-eVAYFW8RynrA_Em55TpYL";
const ISSUE_SCREENSHOT_BUCKET = "issue-screenshots";
const ISSUE_ALERT_FUNCTION = "send-issue-alert";
const TECHNICAL_ALERT_DEDUPE_MS = 30 * 60 * 1000;
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let currentUser = null;
let currentProfile = null;
let cloudReady = false;
let cloudSaveTimer = null;
let applyingCloudState = false;
let technicalAlertInFlight = false;
let lastTechnicalAlertAt = 0;

const initialState = {
  catalogues: [],
  stock: {
    Panipat: {},
    Delhi: {},
    Bangalore: {},
  },
  minimums: {},
  reorderPoints: {},
  reorderPoints2: {},
  reorderPoints3: {},
  reorderPoints4: {},
  refillRules: {},
  skuRefillRules: {},
  palletReady: [],
  voidedPalletReady: [],
  batches: [],
  uploadWarnings: [],
  notifications: [],
  issueReports: [],
  dispatchSelections: {},
  counters: {
    batch: 1,
  },
};

let state = loadState();
clearOldInventoryDataOnce();
let currentView = "dashboard";
let currentTransferWarehouse = "Delhi";
let currentTransferCatalogue = "";
let currentTransferStatuses = ["Recommended", "Manual Dispatch", "Covered"];
let currentUnmetWarehouse = "Delhi";
let transferSearch = "";
let unmetSearch = "";
let pendingOpenMovementId = "";
let catalogueStickyFrame = 0;
let activeCatalogueStickyTable = null;
let catalogueImportMessageTimer = null;
let issueScreenshotFiles = [];

function loadState() {
  const saved = localStorage.getItem("fedoraInventoryState");
  if (!saved) return structuredClone(initialState);
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem("fedoraInventoryState", JSON.stringify(state));
  scheduleCloudSave();
}

function normalizeState(savedState = {}) {
  return {
    ...structuredClone(initialState),
    ...savedState,
    stock: {
      ...structuredClone(initialState.stock),
      ...(savedState.stock || {}),
    },
    counters: {
      ...structuredClone(initialState.counters),
      ...(savedState.counters || {}),
    },
    catalogues: savedState.catalogues || [],
    palletReady: savedState.palletReady || [],
    voidedPalletReady: savedState.voidedPalletReady || [],
    batches: savedState.batches || [],
    uploadWarnings: savedState.uploadWarnings || [],
    notifications: savedState.notifications || [],
    issueReports: savedState.issueReports || [],
    dispatchSelections: savedState.dispatchSelections || {},
    minimums: savedState.minimums || {},
    reorderPoints: savedState.reorderPoints || {},
    reorderPoints2: savedState.reorderPoints2 || {},
    reorderPoints3: savedState.reorderPoints3 || {},
    reorderPoints4: savedState.reorderPoints4 || {},
    refillRules: savedState.refillRules || {},
    skuRefillRules: savedState.skuRefillRules || {},
  };
}

function scheduleCloudSave() {
  if (!cloudReady || !currentUser || applyingCloudState) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(saveCloudState, 650);
}

async function saveCloudState() {
  if (!supabaseClient || !currentUser) return;
  const payload = JSON.parse(JSON.stringify(state));
  const { error } = await supabaseClient.from("app_state").upsert({
    id: "main",
    data: payload,
    updated_by: currentUser.id,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Cloud save failed", error);
    reportAppError("Cloud save failed", error.message || String(error));
  }
}

function hasUsefulCloudData(data) {
  return Boolean(
    data &&
      ((data.catalogues && data.catalogues.length) ||
        (data.notifications && data.notifications.length) ||
        (data.palletReady && data.palletReady.length) ||
        (data.batches && data.batches.length))
  );
}

async function loadCloudState() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient.from("app_state").select("data").eq("id", "main").maybeSingle();
  if (error) throw error;

  if (hasUsefulCloudData(data?.data)) {
    applyingCloudState = true;
    state = normalizeState(data.data);
    localStorage.setItem("fedoraInventoryState", JSON.stringify(state));
    applyingCloudState = false;
  }

  cloudReady = true;
  await saveCloudState();
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value ? String(value) : "";
  return date
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
    .replace(",", "")
    .replace(/\b(am|pm)\b/i, (match) => match.toUpperCase());
}

function formatDateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value ? String(value) : "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDispatchReceivedDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) return formatDateOnly(date);
  const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return String(value);
  const [, day, month, year] = match;
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

function addNotification(type, message, details = {}) {
  state.notifications = [
    {
      id: `N-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      message,
      warehouse: details.warehouse || "-",
      detail: details.detail || "",
      at: formatDateTime(),
      read: false,
    },
    ...(state.notifications || []),
  ].slice(0, 300);
}

function addIssueReport(message, details = {}) {
  const issue = {
    id: `IR-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: details.title || "Issue Report",
    message,
    warehouse: details.warehouse || "-",
    page: details.page || "-",
    reporter: getUserDisplayName(),
    reporterRole: formatRole(currentProfile?.role || "Employee"),
    status: details.status || "open",
    screenshots: details.screenshots || [],
    at: formatDateTime(),
  };
  state.issueReports = [issue, ...(state.issueReports || [])].slice(0, 200);
  return issue;
}

function clearOldInventoryDataOnce() {
  if (localStorage.getItem("fedoraInventoryDataClearVersion") === INVENTORY_DATA_CLEAR_VERSION) return;

  state.stock = structuredClone(initialState.stock);
  state.palletReady = [];
  state.voidedPalletReady = [];
  state.batches = [];
  state.uploadWarnings = [];
  state.counters = { batch: 1 };
  saveState();
  localStorage.setItem("fedoraInventoryDataClearVersion", INVENTORY_DATA_CLEAR_VERSION);
}

function setLoginMessage(message) {
  const element = document.querySelector("#loginMessage");
  if (element) element.textContent = message || "";
}

function showAppSession(user) {
  document.body.classList.remove("auth-checking");
  document.querySelector("#authScreen")?.classList.add("hidden");
  document.querySelector("#appShell")?.classList.remove("app-locked");
  const displayName = getUserDisplayName(user);
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const profileName = document.querySelector("#profileName");
  const profileRole = document.querySelector("#profileRole");
  const profileAvatar = document.querySelector("#profileAvatar");
  const welcomeStrip = document.querySelector("#welcomeStrip");
  if (profileName) profileName.textContent = displayName;
  if (profileRole) profileRole.textContent = formatRole(currentProfile?.role || "Employee");
  if (profileAvatar) profileAvatar.textContent = displayName.charAt(0).toUpperCase() || "F";
  if (welcomeStrip) welcomeStrip.textContent = `Welcome, ${firstName}`;
}

function getUserDisplayName(user = currentUser) {
  return (
    currentProfile?.full_name ||
    currentProfile?.display_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Fedora User"
  );
}

function formatRole(role) {
  return String(role || "Employee")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function simpleHash(value) {
  return [...String(value || "")].reduce((hash, character) => {
    const nextHash = (hash << 5) - hash + character.charCodeAt(0);
    return nextHash | 0;
  }, 0).toString(16);
}

function showLoginScreen(message = "") {
  document.body.classList.remove("auth-checking");
  document.querySelector("#authScreen")?.classList.remove("hidden");
  document.querySelector("#appShell")?.classList.add("app-locked");
  setLoginMessage(message);
}

async function loadUserProfile(user) {
  const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data || data.active === false) {
    throw new Error("This user is not active in Fedora Inventory. Please ask the owner to add this email.");
  }
  return data;
}

async function enterAuthenticatedApp(user) {
  currentUser = user;
  currentProfile = await loadUserProfile(user);
  await loadCloudState();
  showAppSession(user);
  render();
}

async function initializeAuth() {
  if (!supabaseClient) {
    showLoginScreen("Supabase connection is not available. Please check internet and refresh.");
    return;
  }

  try {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session?.user) {
      await enterAuthenticatedApp(data.session.user);
    } else {
      showLoginScreen();
    }
  } catch (error) {
    console.error(error);
    showLoginScreen(error.message || "Could not start the app. Please refresh.");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const button = document.querySelector("#loginButton");
  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPassword").value;
  setLoginMessage("Logging in...");
  if (button) button.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await enterAuthenticatedApp(data.user);
    setLoginMessage("");
  } catch (error) {
    console.error(error);
    showLoginScreen(error.message || "Login failed. Please check email and password.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleLogout() {
  await saveCloudState();
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  cloudReady = false;
  showLoginScreen("Logged out.");
}

async function reportAppError(message, detail = "", options = {}) {
  if (!supabaseClient || !currentUser) return { recorded: false, emailed: false };
  const errorMessage = String(message || "Unknown error").slice(0, 500);
  const errorDetail = String(detail || "").slice(0, 4000);
  const page = document.querySelector("#viewTitle")?.textContent || currentView || "-";
  let recorded = false;
  let emailed = false;
  try {
    await supabaseClient.from("app_errors").insert({
      user_id: currentUser.id,
      page,
      message: errorMessage,
      stack: errorDetail,
      browser_info: navigator.userAgent,
    });
    recorded = true;
  } catch (error) {
    console.error("Could not record app error", error);
  }
  if (options.email !== false) {
    emailed = await sendTechnicalErrorAlert(errorMessage, errorDetail, {
      page,
      test: Boolean(options.test),
      force: Boolean(options.force),
    });
  }
  return { recorded, emailed };
}

async function sendTechnicalErrorAlert(message, detail = "", options = {}) {
  if (!supabaseClient || !currentUser || technicalAlertInFlight) return false;
  const now = Date.now();
  const page = options.page || document.querySelector("#viewTitle")?.textContent || currentView || "-";
  const dedupeKey = `fedoraTechnicalAlert:${simpleHash(`${page}|${message}|${String(detail || "").slice(0, 600)}`)}`;
  const lastMatchingAlert = Number(localStorage.getItem(dedupeKey) || 0);
  if (!options.force && lastMatchingAlert && now - lastMatchingAlert < TECHNICAL_ALERT_DEDUPE_MS) return false;
  if (!options.force && now - lastTechnicalAlertAt < 60000) return false;
  technicalAlertInFlight = true;
  lastTechnicalAlertAt = now;
  try {
    const title = options.test ? "Test technical error alert" : "Automatic technical error alert";
    const issueId = `${options.test ? "TEST" : "TECH"}-${now}`;
    const warehouse = currentView === "transfers" ? currentTransferWarehouse : currentView === "unmetShortages" ? currentUnmetWarehouse : "-";
    const description = [
      options.test ? "This is a safe test alert. The app was not crashed." : "The app caught a technical error automatically.",
      "",
      `Error: ${message || "Unknown error"}`,
      detail ? `Details: ${detail}` : "",
      `Browser: ${navigator.userAgent}`,
      `URL: ${window.location.href}`,
      `Time: ${formatDateTime()}`,
    ]
      .filter(Boolean)
      .join("\n");
    const { error } = await supabaseClient.functions.invoke(ISSUE_ALERT_FUNCTION, {
      body: {
        title,
        description,
        page,
        warehouse,
        reporterName: getUserDisplayName(),
        reporterRole: formatRole(currentProfile?.role || "Employee"),
        reporterEmail: currentUser.email || "",
        screenshotUrls: [],
        issueId,
      },
    });
    if (error) throw error;
    localStorage.setItem(dedupeKey, String(now));
    return true;
  } catch (error) {
    console.error("Technical error alert email failed", error);
    return false;
  } finally {
    technicalAlertInFlight = false;
  }
}

function installErrorMonitoring() {
  window.addEventListener("error", (event) => {
    reportAppError(event.message, event.error?.stack || "");
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportAppError("Unhandled app promise error", reason?.stack || reason?.message || String(reason));
  });
}

function skuKey(warehouse, sku) {
  return `${warehouse}::${sku}`;
}

function getMasterSkus() {
  return state.catalogues;
}

function getCatalogueNames() {
  return [...new Set(state.catalogues.map((item) => item.catalogue))].sort();
}

function getSku(sku) {
  return state.catalogues.find((item) => item.sku === sku);
}

function getMinimum(warehouse, sku) {
  const master = getSku(sku);
  return state.minimums[skuKey(warehouse, sku)]?.value ?? (master ? Number(master.boxSize) * 2 : 24);
}

function isCustomMinimum(warehouse, sku) {
  return Boolean(state.minimums[skuKey(warehouse, sku)]?.custom);
}

function setMinimum(warehouse, sku, value, custom = false) {
  state.minimums[skuKey(warehouse, sku)] = { value: Number(value), custom };
}

function getReorderPoint(warehouse, sku) {
  const master = getSku(sku);
  const fallback = master ? Math.max(0, getMinimum(warehouse, sku) - Number(master.boxSize)) : 0;
  return state.reorderPoints?.[skuKey(warehouse, sku)]?.value ?? fallback;
}

function setReorderPoint(warehouse, sku, value, custom = true) {
  state.reorderPoints[skuKey(warehouse, sku)] = { value: Number(value), custom };
}

function getReorderPoint2(warehouse, sku) {
  const master = getSku(sku);
  const fallback = master ? Math.max(0, getMinimum(warehouse, sku) - Number(master.boxSize) * 2) : 0;
  return state.reorderPoints2?.[skuKey(warehouse, sku)]?.value ?? fallback;
}

function setReorderPoint2(warehouse, sku, value, custom = true) {
  state.reorderPoints2[skuKey(warehouse, sku)] = { value: Number(value), custom };
}

function reorderStoreForLevel(level) {
  if (level === 1) return "reorderPoints";
  return `reorderPoints${level}`;
}

function getReorderPointLevel(warehouse, sku, level) {
  const key = skuKey(warehouse, sku);
  const store = reorderStoreForLevel(level);
  const saved = state[store]?.[key];
  if (saved) return saved.value;
  if (level <= 2) {
    const master = getSku(sku);
    return master ? Math.max(0, getMinimum(warehouse, sku) - Number(master.boxSize) * level) : 0;
  }
  return "";
}

function setReorderPointLevel(warehouse, sku, level, value, custom = true) {
  const store = reorderStoreForLevel(level);
  if (!state[store]) state[store] = {};
  const key = skuKey(warehouse, sku);
  if (value === "" || value === null || value === undefined) {
    delete state[store][key];
    return;
  }
  state[store][key] = { value: Number(value), custom };
}

function initializeSkuControls(sku, boxSize) {
  DESTINATIONS.forEach((warehouse) => {
    const maximum = Number(boxSize) * 2;
    setMinimum(warehouse, sku, maximum, false);
    setReorderPoint(warehouse, sku, Math.max(0, maximum - Number(boxSize)), false);
    setReorderPoint2(warehouse, sku, Math.max(0, maximum - Number(boxSize) * 2), false);
  });
}

function refillKey(warehouse, catalogue) {
  return `${warehouse}::${catalogue}`;
}

function isRefillEnabled(warehouse, catalogue) {
  return state.refillRules?.[refillKey(warehouse, catalogue)] !== false;
}

function setRefillEnabled(warehouse, catalogue, enabled) {
  state.refillRules[refillKey(warehouse, catalogue)] = Boolean(enabled);
}

function skuRefillKey(warehouse, sku) {
  return `${warehouse}::${sku}`;
}

function isSkuRefillEnabled(warehouse, sku) {
  return state.skuRefillRules?.[skuRefillKey(warehouse, sku)] !== false;
}

function setSkuRefillEnabled(warehouse, sku, enabled) {
  if (!state.skuRefillRules) state.skuRefillRules = {};
  state.skuRefillRules[skuRefillKey(warehouse, sku)] = Boolean(enabled);
}

function actualStock(warehouse, sku) {
  return Number(state.stock[warehouse]?.[sku] ?? 0);
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function movementQty(warehouse, sku, status) {
  const wantedStatus = normalizeStatus(status);
  if (wantedStatus === "pallet ready") {
    return state.palletReady
      .filter((so) => so.destination === warehouse)
      .flatMap((so) => so.lines)
      .filter((line) => line.sku === sku)
      .reduce((sum, line) => sum + Number(line.rolls || 0), 0);
  }

  return state.batches
    .filter((batch) => batch.destination === warehouse && normalizeStatus(batch.status) === wantedStatus)
    .flatMap((batch) => batch.lines)
    .filter((line) => line.sku === sku)
    .reduce((sum, line) => sum + Number(line.rolls || 0), 0);
}

function projectedStock(warehouse, sku) {
  return (
    actualStock(warehouse, sku) +
    movementQty(warehouse, sku, "Pallet Ready") +
    movementQty(warehouse, sku, "In Transit")
  );
}

function fullBoxesForRolls(rolls, boxSize) {
  const numericBoxSize = Number(boxSize);
  if (!numericBoxSize) return 0;
  return Math.floor(Number(rolls || 0) / numericBoxSize);
}

function looseRollsForRolls(rolls, boxSize) {
  const numericBoxSize = Number(boxSize);
  if (!numericBoxSize) return 0;
  return Number(rolls || 0) % numericBoxSize;
}

function formatBoxRollSummary(rolls, boxSize) {
  const numericRolls = Number(rolls || 0);
  const boxes = fullBoxesForRolls(numericRolls, boxSize);
  const loose = looseRollsForRolls(numericRolls, boxSize);
  const parts = [];
  if (boxes > 0) parts.push(`${boxes} box${boxes === 1 ? "" : "es"}`);
  if (loose > 0) parts.push(`${loose} loose roll${loose === 1 ? "" : "s"}`);
  if (!parts.length) parts.push("0 boxes");
  return `${parts.join(" + ")} / ${numericRolls} rolls`;
}

function requiredBoxesFromReorder(maximum, stock, reorderLevels) {
  if (stock >= maximum) return 0;
  for (let level = reorderLevels.length; level >= 1; level -= 1) {
    const value = reorderLevels[level - 1];
    if (value === "" || value === null || value === undefined) continue;
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && stock <= numericValue) return level;
  }
  return 0;
}

function recommendFor(warehouse, sku) {
  const master = getSku(sku);
  if (!master) return null;
  if (!isRefillEnabled(warehouse, master.catalogue)) return null;
  if (!isSkuRefillEnabled(warehouse, sku)) return null;

  const minimum = getMinimum(warehouse, sku);
  const actual = actualStock(warehouse, sku);
  const pallet = movementQty(warehouse, sku, "Pallet Ready");
  const transit = movementQty(warehouse, sku, "In Transit");
  const projected = actual + pallet + transit;
  const boxSize = Number(master.boxSize);
  const panipatAvailable = actualStock("Panipat", sku);
  const reorderLevels = [1, 2, 3, 4].map((level) => getReorderPointLevel(warehouse, sku, level));

  const requiredBoxes = requiredBoxesFromReorder(minimum, actual, reorderLevels);
  const alreadyPlannedBoxes = Math.floor((pallet + transit) / boxSize);
  const recommendedBoxes = Math.max(0, requiredBoxes - alreadyPlannedBoxes);

  if (requiredBoxes <= 0) {
    return {
      sku,
      catalogue: master.catalogue,
      actual,
      pallet,
      transit,
      projected,
      minimum,
      boxSize,
      boxes: 0,
      rolls: 0,
      panipatAvailable,
      reorder: reorderLevels[0],
      reorderLevels,
      status: projected >= minimum ? "OK" : "Watch",
    };
  }

  if (recommendedBoxes <= 0) {
    return {
      sku,
      catalogue: master.catalogue,
      actual,
      pallet,
      transit,
      projected,
      minimum,
      boxSize,
      boxes: 0,
      rolls: 0,
      neededBoxes: requiredBoxes,
      neededRolls: requiredBoxes * boxSize,
      panipatAvailable,
      reorder: reorderLevels[0],
      reorderLevels,
      status: "OK",
    };
  }

  if (panipatAvailable < boxSize) {
    if (pallet > 0 || transit > 0) {
      return {
        sku,
        catalogue: master.catalogue,
        actual,
        pallet,
        transit,
        projected,
        minimum,
        boxSize,
        boxes: 0,
        rolls: 0,
        neededBoxes: recommendedBoxes,
        neededRolls: recommendedBoxes * boxSize,
        panipatAvailable,
        reorder: reorderLevels[0],
        reorderLevels,
        status: "Waiting Panipat Stock",
      };
    }

    return {
      sku,
      catalogue: master.catalogue,
      actual,
      pallet,
      transit,
      projected,
      minimum,
      boxSize,
      boxes: 0,
      rolls: 0,
      neededBoxes: recommendedBoxes,
      neededRolls: recommendedBoxes * boxSize,
      panipatAvailable,
      reorder: reorderLevels[0],
      reorderLevels,
      status: "Unmet shortage",
    };
  }

  let boxes = recommendedBoxes;
  let rolls = boxes * boxSize;
  if (rolls > panipatAvailable) {
    boxes = Math.floor(panipatAvailable / boxSize);
    rolls = boxes * boxSize;
  }

  return {
    sku,
    catalogue: master.catalogue,
    actual,
    pallet,
    transit,
    projected,
    minimum,
    boxSize,
    boxes,
    rolls,
    neededBoxes: boxes,
    neededRolls: rolls,
    panipatAvailable,
    reorder: reorderLevels[0],
    reorderLevels,
    status: boxes > 0 ? "Recommended" : "Unmet shortage",
  };
}

function getRecommendations(warehouse, onlyActionable = false) {
  const rows = getMasterSkus()
    .map((item) => recommendFor(warehouse, item.sku))
    .filter(Boolean)
    .filter((row) => row.status === "Recommended" || row.status === "Unmet shortage");
  return onlyActionable ? rows.filter((row) => row.boxes > 0) : rows;
}

function getDashboardRows(warehouse) {
  const rows = getMasterSkus()
    .map((item) => recommendFor(warehouse, item.sku))
    .filter(Boolean)
    .filter((row) => row.status !== "Watch" && (row.projected < row.minimum || row.pallet > 0 || row.transit > 0));

  return rows.map((row) => {
    if ((row.pallet > 0 || row.transit > 0) && row.status === "OK") {
      return { ...row, status: "Covered" };
    }
    if (warehouse === "Delhi" && row.status === "Unmet shortage" && row.panipatAvailable > 0) {
      return {
        ...row,
        boxes: 0,
        rolls: 0,
        neededBoxes: row.neededBoxes,
        neededRolls: row.neededRolls,
        status: "Manual Dispatch",
      };
    }
    return row;
  }).filter((row) => row.status !== "Unmet shortage");
}

function getUnmetShortages(warehouse) {
  return getMasterSkus()
    .map((item) => recommendFor(warehouse, item.sku))
    .filter(Boolean)
    .filter((row) => row.status === "Unmet shortage" && (warehouse !== "Delhi" || row.panipatAvailable <= 0));
}

function parseDelimited(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((value) => value.trim());
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pickColumn(row, candidates) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );
  for (const candidate of candidates) {
    const key = normalizeHeader(candidate);
    if (normalized[key] !== undefined) return normalized[key];
  }
  return "";
}

async function parseCatalogueFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    return parseXlsxRows(await file.arrayBuffer());
  }
  return parseDelimited(await file.text());
}

async function parseUploadFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    return parseXlsxRows(await file.arrayBuffer());
  }
  return parseDelimited(await file.text());
}

async function parseXlsxRows(buffer) {
  const entries = await unzipXlsx(buffer);
  const workbook = entries["xl/workbook.xml"];
  const rels = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !rels) throw new Error("Could not read workbook.xml from Excel file.");

  const firstSheetRel = workbook.match(/<sheet[^>]+r:id="([^"]+)"/)?.[1];
  const sheetTarget = firstSheetRel
    ? rels.match(new RegExp(`<Relationship[^>]+Id="${firstSheetRel}"[^>]+Target="([^"]+)"`))?.[1]
    : "worksheets/sheet1.xml";
  const sheetPath = `xl/${sheetTarget.replace(/^\/?xl\//, "")}`;
  const sheetXml = entries[sheetPath] || entries["xl/worksheets/sheet1.xml"];
  if (!sheetXml) throw new Error("Could not read first worksheet from Excel file.");

  const sharedStrings = readSharedStrings(entries["xl/sharedStrings.xml"] || "");
  const rows = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1] || "";
      const index = columnIndex(ref);
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      cells[index] = type === "s" ? sharedStrings[Number(value)] || "" : decodeXml(value);
    }
    return cells;
  }).filter((row) => row.some((cell) => String(cell || "").trim()));

  const headerIndex = detectHeaderRow(rows);
  const headers = rows[headerIndex]?.map((cell) => String(cell || "").trim()) || [];
  return rows.slice(headerIndex + 1).map((row) =>
    headers.reduce((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {}),
  ).filter((row) => Object.values(row).some((value) => String(value || "").trim()));
}

function detectHeaderRow(rows) {
  const inventorySku = INVENTORY_COLUMNS.sku.map(normalizeHeader);
  const inventoryQty = INVENTORY_COLUMNS.quantity.map(normalizeHeader);
  const catalogueName = CATALOGUE_COLUMNS.catalogue.map(normalizeHeader);
  const catalogueBox = CATALOGUE_COLUMNS.boxSize.map(normalizeHeader);

  const index = rows.findIndex((row) => {
    const cells = row.map(normalizeHeader);
    const hasSku = cells.some((cell) => inventorySku.includes(cell));
    const hasInventoryQty = cells.some((cell) => inventoryQty.includes(cell));
    const hasCatalogue = cells.some((cell) => catalogueName.includes(cell));
    const hasBoxSize = cells.some((cell) => catalogueBox.includes(cell));
    return hasSku && (hasInventoryQty || hasCatalogue || hasBoxSize);
  });

  return index >= 0 ? index : 0;
}

function readSharedStrings(xml) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((text) => decodeXml(text[1])).join(""),
  );
}

function decodeXml(value) {
  const doc = new DOMParser().parseFromString(`<x>${value}</x>`, "text/xml");
  return doc.documentElement.textContent || "";
}

function columnIndex(label) {
  return label.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

async function unzipXlsx(buffer) {
  const bytes = new Uint8Array(buffer);
  const entries = {};

  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) throw new Error("This Excel file is not a valid .xlsx file.");

  const entryCount = readU16(bytes, eocdOffset + 10);
  const centralDirectoryOffset = readU32(bytes, eocdOffset + 16);
  let offset = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) break;
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const fileNameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localHeaderOffset = readU32(bytes, offset + 42);
    const nameStart = offset + 46;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + fileNameLength));

    const localNameLength = readU16(bytes, localHeaderOffset + 26);
    const localExtraLength = readU16(bytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      entries[name] = new TextDecoder().decode(await inflateZipEntry(compressed, method));
    }

    offset = nameStart + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(bytes) {
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateZipEntry(data, method) {
  if (method === 0) return data;
  if (method !== 8) throw new Error("Unsupported Excel compression format.");
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot read Excel files directly. Please save the sheet as CSV and import it.");
  }
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const output = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  } catch {
    throw new Error("Could not read this Excel file in the browser. Please save it as CSV and upload again, or share the file so we can adjust the parser.");
  }
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function importCatalogueRows(rows) {
  let added = 0;
  let skipped = 0;
  const existing = new Set(state.catalogues.map((item) => item.sku));
  rows.forEach((row) => {
    const catalogue = String(pickColumn(row, CATALOGUE_COLUMNS.catalogue)).trim();
    const sku = String(pickColumn(row, CATALOGUE_COLUMNS.sku)).trim();
    const boxSize = Number(pickColumn(row, CATALOGUE_COLUMNS.boxSize));
    if (!catalogue || !sku || !boxSize || boxSize <= 0 || existing.has(sku)) {
      skipped += 1;
      return;
    }
    state.catalogues.push({ sku, catalogue, boxSize });
    initializeSkuControls(sku, boxSize);
    existing.add(sku);
    added += 1;
  });
  addNotification(
    "Catalogue Master",
    `Catalogue master imported: ${added} SKUs added, ${skipped} rows skipped.`,
    { detail: `Added ${added}; skipped ${skipped}` },
  );
  saveState();
  render();
  return { added, skipped };
}

function importInventoryRows(warehouse, rows) {
  const masterSet = new Set(state.catalogues.map((item) => item.sku));
  const nextStock = {};
  const found = new Set();
  const detectedColumns = Object.keys(rows[0] || {});
  rows.forEach((row) => {
    const sku = String(pickColumn(row, INVENTORY_COLUMNS.sku)).trim();
    const qty = pickColumn(row, INVENTORY_COLUMNS.quantity);
    if (!sku || !masterSet.has(sku)) return;
    nextStock[sku] = Number(qty || 0);
    found.add(sku);
  });

  const missing = state.catalogues.map((item) => item.sku).filter((sku) => !found.has(sku));
  state.stock[warehouse] = nextStock;
  state.uploadWarnings.unshift({
    warehouse,
    imported: Object.keys(nextStock).length,
    missing,
    detectedColumns,
    at: formatDateTime(),
  });
  addNotification(
    "Inventory Upload",
    `${warehouse} inventory imported with ${Object.keys(nextStock).length} matched SKUs.`,
    {
      warehouse,
      detail: `${missing.length} master SKUs missing from sheet`,
    },
  );
  saveState();
  render();
}

function importInventory(warehouse, text) {
  importInventoryRows(warehouse, parseDelimited(text));
}

function addCatalogue(catalogue, boxSize, skuText) {
  const skus = parseSkuInput(skuText);

  const existing = new Set(state.catalogues.map((item) => item.sku));
  skus.forEach((sku) => {
    if (!existing.has(sku)) {
      state.catalogues.push({ sku, catalogue, boxSize: Number(boxSize) });
      initializeSkuControls(sku, Number(boxSize));
    }
  });
  addNotification("Catalogue Master", `${catalogue} added from manual SKU entry.`, {
    detail: `${skus.length} SKUs submitted`,
  });
  saveState();
  render();
}

function parseSkuInput(skuText) {
  return [
    ...new Set(
      skuText
        .split(/[\s,;]+/)
        .map((sku) => sku.trim())
        .filter(Boolean),
    ),
  ];
}

function createPalletReady(destination, soNumber, selectedLines) {
  if (!soNumber.trim()) {
    alert("Please enter a sales order number.");
    return;
  }
  if (!selectedLines.length) {
    alert("Select at least one recommended SKU.");
    return;
  }
  const overstockLine = selectedLines.find((line) => Number(line.rolls || 0) > actualStock("Panipat", line.sku));
  if (overstockLine) {
    alert(`${overstockLine.sku} cannot be sent with ${overstockLine.rolls} rolls because Panipat has only ${actualStock("Panipat", overstockLine.sku)} rolls.`);
    return;
  }

  const lines = selectedLines.map((line) => ({
    sku: line.sku,
    catalogue: line.catalogue,
    boxes: Number(line.boxes),
    rolls: Number(line.rolls),
    boxSize: Number(line.boxSize),
    looseRolls: looseRollsForRolls(line.rolls, line.boxSize),
  }));

  lines.forEach((line) => {
    state.stock.Panipat[line.sku] = Math.max(0, actualStock("Panipat", line.sku) - line.rolls);
    setDispatchSelection(destination, line.sku, false);
  });

  state.palletReady.push({
    id: `SO-${Date.now()}`,
    soNumber: soNumber.trim(),
    destination,
    status: "Pallet Ready",
    createdAt: formatDateTime(),
    lines,
  });
  addNotification("Pallet Ready SO", `Pallet-ready SO ${soNumber.trim()} created for ${destination}.`, {
    warehouse: destination,
    detail: `${lines.length} SKUs; ${sumRolls(lines)} rolls`,
  });
  saveState();
  render();
}

function voidPalletReadySO(soId) {
  const so = state.palletReady.find((item) => item.id === soId);
  if (!so) return;

  const confirmed = confirm(`Void pallet-ready SO ${so.soNumber}? This will remove it from dispatch planning and restore Panipat stock.`);
  if (!confirmed) return;

  so.lines.forEach((line) => {
    state.stock.Panipat[line.sku] = actualStock("Panipat", line.sku) + Number(line.rolls || 0);
  });

  state.palletReady = state.palletReady.filter((item) => item.id !== soId);
  state.voidedPalletReady = [
    ...(state.voidedPalletReady || []),
    {
      ...so,
      status: "Voided",
      voidedAt: formatDateTime(),
    },
  ];
  addNotification("SO Voided", `Pallet-ready SO ${so.soNumber} was voided.`, {
    warehouse: so.destination,
    detail: `${so.lines.length} SKUs; ${sumRolls(so.lines)} rolls restored to Panipat`,
  });
  saveState();
  render();
}

function createDispatchBatch(destination, selectedSoIds) {
  if (!selectedSoIds.length) {
    alert("Select at least one Pallet Ready SO.");
    return;
  }

  const selected = state.palletReady.filter((so) => selectedSoIds.includes(so.id));
  if (selected.some((so) => so.destination !== destination)) {
    alert("A dispatch batch can include only one destination warehouse.");
    return;
  }

  const merged = new Map();
  selected.flatMap((so) => so.lines).forEach((line) => {
    const current = merged.get(line.sku) || { ...line, boxes: 0, rolls: 0 };
    current.boxes += Number(line.boxes);
    current.rolls += Number(line.rolls);
    current.boxes = fullBoxesForRolls(current.rolls, current.boxSize);
    current.looseRolls = looseRollsForRolls(current.rolls, current.boxSize);
    merged.set(line.sku, current);
  });

  const batchId = `DB-${String(state.counters.batch).padStart(3, "0")}`;
  state.counters.batch += 1;
  state.batches.push({
    id: batchId,
    destination,
    status: "In Transit",
    soNumbers: selected.map((so) => so.soNumber),
    dispatchDate: formatDateOnly(),
    eta: defaultEta(destination),
    createdAt: formatDateTime(),
    baselineStock: Object.fromEntries(
      [...merged.values()].map((line) => [line.sku, actualStock(destination, line.sku)]),
    ),
    lines: [...merged.values()],
  });
  addNotification("Dispatch Batch", `${batchId} created for ${destination}.`, {
    warehouse: destination,
    detail: `${selected.length} SOs; ${[...merged.values()].length} SKUs; ${sumRolls([...merged.values()])} rolls`,
  });
  state.palletReady = state.palletReady.filter((so) => !selectedSoIds.includes(so.id));
  saveState();
  render();
}

function markBatchReceived(batchId, options = {}) {
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return;
  if (options.addToActual !== false) {
    batch.lines.forEach((line) => {
      const baseline = Number(batch.baselineStock?.[line.sku] ?? actualStock(batch.destination, line.sku));
      const expectedAfterReceipt = baseline + Number(line.rolls);
      const currentActual = actualStock(batch.destination, line.sku);
      if (currentActual >= expectedAfterReceipt) return;
      state.stock[batch.destination][line.sku] = currentActual + Number(line.rolls);
    });
  }
  batch.status = "Received";
  batch.receivedAt = formatDateTime();
  batch.receivedBy = options.receivedBy || "Manual";
  addNotification("Dispatch Received", `${batch.id} marked as received.`, {
    warehouse: batch.destination,
    detail: `${sumRolls(batch.lines)} rolls; received by ${batch.receivedBy}`,
  });
  saveState();
  render();
}

function defaultEta(destination) {
  const date = new Date();
  date.setDate(date.getDate() + (destination === "Delhi" ? 1 : 8));
  return formatDateOnly(date);
}

function exportShortage(warehouse, rows = getRecommendations(warehouse, true)) {
  const exportRows = rows.map((row) => ({
    warehouse,
    catalogue: row.catalogue,
    sku: row.sku,
    current_stock: row.actual,
    pallet_ready: row.pallet,
    in_transit: row.transit,
    projected_stock: row.projected,
    maximum_stock: row.minimum,
    box_size: row.boxSize,
    recommended_boxes: row.boxes,
    recommended_rolls: row.rolls,
    panipat_available: row.panipatAvailable,
    status: row.status,
  }));
  const headers = Object.keys(exportRows[0] || { warehouse: "", sku: "", status: "" });
  const csv = [headers.join(","), ...exportRows.map((row) => headers.map((h) => csvValue(row[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${warehouse.toLowerCase()}-shortage-list.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSelectedDispatchShortage() {
  const rows = selectedRecommendations();
  if (!rows.length) {
    alert("Select at least one recommended SKU to export.");
    return;
  }
  exportShortage(currentTransferWarehouse, rows);
}

function reportIssue() {
  openIssueModal();
}

function openIssueModal() {
  issueScreenshotFiles = [];
  const modal = document.querySelector("#issueModal");
  const form = document.querySelector("#issueForm");
  if (!modal || !form) return;
  form.reset();
  showIssueFormMessage("");
  const submitButton = document.querySelector("#submitIssueReport");
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Save Issue";
  }
  updateIssueAttachmentList();
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.querySelector("#issueTitle")?.focus();
}

function closeIssueModal() {
  const modal = document.querySelector("#issueModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  issueScreenshotFiles = [];
  showIssueFormMessage("");
  const submitButton = document.querySelector("#submitIssueReport");
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Save Issue";
  }
}

function updateIssueAttachmentList() {
  const list = document.querySelector("#issueAttachmentList");
  if (!list) return;
  list.innerHTML = issueScreenshotFiles.length
    ? issueScreenshotFiles
        .map((file, index) => `<span>${escapeHtml(file.name)} <small>${Math.ceil(file.size / 1024)} KB</small><button type="button" data-remove-issue-file="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button></span>`)
        .join("")
    : "No screenshots selected.";
}

function showIssueFormMessage(message, type = "ok") {
  const node = document.querySelector("#issueFormMessage");
  if (!node) return;
  node.textContent = message;
  node.className = `issue-form-message ${message ? type : ""}`.trim();
}

async function uploadIssueScreenshots(files, localIssueId) {
  if (!files.length || !supabaseClient || !currentUser) return [];
  const urls = [];
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const safeName = file.name.replace(/[^a-z0-9_.-]/gi, "-").slice(-80);
    const path = `${currentUser.id}/${localIssueId}/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName || `screenshot.${extension}`}`;
    const { error } = await supabaseClient.storage.from(ISSUE_SCREENSHOT_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "image/png",
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabaseClient.storage.from(ISSUE_SCREENSHOT_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }
  return urls;
}

async function sendIssueAlertEmail(issue) {
  if (!supabaseClient || !currentUser) return;
  try {
    const { error } = await supabaseClient.functions.invoke(ISSUE_ALERT_FUNCTION, {
      body: {
        title: issue.title,
        description: issue.message,
        page: issue.page,
        warehouse: issue.warehouse,
        reporterName: issue.reporter,
        reporterRole: issue.reporterRole || formatRole(currentProfile?.role || "Employee"),
        reporterEmail: currentUser.email || "",
        screenshotUrls: issue.screenshots || [],
        issueId: issue.cloudId || issue.id,
      },
    });
    if (error) throw error;
  } catch (error) {
    console.error("Issue alert email failed", error);
    reportAppError("Issue alert email failed", error.message || String(error), { email: false });
  }
}

async function submitIssueReport(event) {
  event.preventDefault();
  const title = document.querySelector("#issueTitle")?.value.trim() || "Issue Report";
  const message = document.querySelector("#issueDescription")?.value.trim();
  if (!message) return;
  const page = document.querySelector("#viewTitle").textContent;
  const warehouse = currentView === "transfers" ? currentTransferWarehouse : currentView === "unmetShortages" ? currentUnmetWarehouse : "-";
  const submitButton = document.querySelector("#submitIssueReport");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
  }
  showIssueFormMessage("");

  let screenshotUrls = [];
  let savedSuccessfully = false;
  const issue = addIssueReport(message.trim(), {
    title,
    warehouse,
    page,
    status: "open",
  });

  try {
    screenshotUrls = await uploadIssueScreenshots(issueScreenshotFiles, issue.id);
    issue.screenshots = screenshotUrls;
    addNotification("Issue Report", title, {
      warehouse,
      detail: `Issue ${issue.id}; Page: ${page}; Screenshots: ${screenshotUrls.length}`,
    });
    saveState();
    render();
    if (supabaseClient && currentUser) {
      const { data, error } = await supabaseClient.from("issue_reports").insert({
        title,
        description: message.trim(),
        page,
        screenshot_url: screenshotUrls.length ? JSON.stringify(screenshotUrls) : null,
        browser_info: `${navigator.userAgent}; Warehouse: ${warehouse}`,
        status: "open",
        reported_by: currentUser.id,
      }).select("id").single();
      if (error) throw error;
      issue.cloudId = data?.id || "";
      await sendIssueAlertEmail(issue);
    }
    savedSuccessfully = true;
    showIssueFormMessage("Issue saved.", "ok");
    if (submitButton) submitButton.textContent = "Saved";
    window.setTimeout(closeIssueModal, 650);
  } catch (error) {
    console.error("Issue report save failed", error);
    reportAppError("Issue report save failed", error.message || String(error));
    issue.screenshots = screenshotUrls;
    addNotification("Issue Report", title, {
      warehouse,
      detail: `Issue ${issue.id}; Page: ${page}; Screenshot upload/report failed`,
    });
    saveState();
    render();
    showIssueFormMessage("Issue saved in Logs, but cloud report or screenshot upload failed. Please tell admin.", "warn");
  } finally {
    if (submitButton && !savedSuccessfully) {
      submitButton.disabled = false;
      submitButton.textContent = "Save Issue";
    }
  }
}

function catalogueSampleRows() {
  return [
    { catalogue: "Canvas", sku: "81369-1", box_size: 12 },
    { catalogue: "Canvas", sku: "81369-2", box_size: 12 },
    { catalogue: "Zen", sku: "72911", box_size: 8 },
    { catalogue: "Tahiti", sku: "13301", box_size: 6 },
  ];
}

function downloadBlob(content, type, filename) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCatalogueSampleCsv() {
  const headers = ["catalogue", "sku", "box_size"];
  const rows = catalogueSampleRows().map((row) =>
    headers.map((header) => csvValue(row[header])).join(","),
  );
  downloadBlob([headers.join(","), ...rows].join("\n"), "text/csv", "catalogue-master-sample.csv");
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatScreenshotLinks(urls = []) {
  if (!urls.length) return "-";
  return urls
    .map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Screenshot ${index + 1}</a>`)
    .join(", ");
}

function downloadCatalogueSampleExcel() {
  const rows = [
    ["catalogue", "sku", "box_size"],
    ...catalogueSampleRows().map((row) => [row.catalogue, row.sku, row.box_size]),
  ];
  downloadBlob(
    new Blob([createXlsx(rows)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "catalogue-master-sample.xlsx",
  );
}

function createXlsx(rows) {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Catalogue Master" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    "xl/worksheets/sheet1.xml": worksheetXml(rows),
  };
  return zipStore(files);
}

function worksheetXml(rows) {
  const body = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => cellXml(value, columnIndex, rowIndex))
          .join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function cellXml(value, columnIndex, rowIndex) {
  const cellRef = `${columnName(columnIndex)}${rowIndex + 1}`;
  if (typeof value === "number") return `<c r="${cellRef}"><v>${value}</v></c>`;
  return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlValue(value)}</t></is></c>`;
}

function columnName(index) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function xmlValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    chunks.push(zipHeader(0x04034b50, [20, 0, 0, 0, 0, crc, data.length, data.length, nameBytes.length, 0]));
    chunks.push(nameBytes, data);
    central.push({
      nameBytes,
      crc,
      size: data.length,
      offset,
    });
    offset += 30 + nameBytes.length + data.length;
  });

  const centralOffset = offset;
  central.forEach((entry) => {
    chunks.push(
      zipHeader(0x02014b50, [
        20,
        20,
        0,
        0,
        0,
        0,
        entry.crc,
        entry.size,
        entry.size,
        entry.nameBytes.length,
        0,
        0,
        0,
        0,
        0,
        entry.offset,
      ]),
    );
    chunks.push(entry.nameBytes);
    offset += 46 + entry.nameBytes.length;
  });

  chunks.push(zipHeader(0x06054b50, [0, 0, central.length, central.length, offset - centralOffset, centralOffset, 0]));
  return new Blob(chunks);
}

function zipHeader(signature, values) {
  const sizes = signature === 0x02014b50 ? [4, 2, 2, 2, 2, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 4, 4] : signature === 0x04034b50 ? [4, 2, 2, 2, 2, 2, 4, 4, 4, 2, 2] : [4, 2, 2, 2, 2, 4, 4, 2];
  const buffer = new ArrayBuffer(sizes.reduce((sum, size) => sum + size, 0));
  const view = new DataView(buffer);
  let offset = 0;
  [signature, ...values].forEach((value, index) => {
    const size = sizes[index];
    if (size === 2) view.setUint16(offset, value, true);
    if (size === 4) view.setUint32(offset, value >>> 0, true);
    offset += size;
  });
  return new Uint8Array(buffer);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeDefaultMaximums() {
  DESTINATIONS.forEach((warehouse) => {
    state.catalogues.forEach((item) => {
      const key = skuKey(warehouse, item.sku);
      const defaultMaximum = Number(item.boxSize) * 2;
      if (!state.minimums[key] || !state.minimums[key].custom) {
        state.minimums[key] = { value: defaultMaximum, custom: false };
      }
      if (!state.reorderPoints) state.reorderPoints = {};
      if (!state.reorderPoints[key]) {
        state.reorderPoints[key] = { value: Math.max(0, getMinimum(warehouse, item.sku) - Number(item.boxSize)), custom: false };
      }
      if (!state.reorderPoints2) state.reorderPoints2 = {};
      if (!state.reorderPoints2[key]) {
        state.reorderPoints2[key] = { value: Math.max(0, getMinimum(warehouse, item.sku) - Number(item.boxSize) * 2), custom: false };
      }
      if (!state.reorderPoints3) state.reorderPoints3 = {};
      if (!state.reorderPoints4) state.reorderPoints4 = {};
    });
  });
  saveState();
}

function seedData() {
  state = structuredClone(initialState);
  addCatalogue("Korea Classic", 12, "123454\n123455\n123456\n123457");
  addCatalogue("Europe Luxe", 8, "EU-801\nEU-802\nEU-803");
  addCatalogue("China Value", 16, "CN-1601\nCN-1602");
  state.stock.Panipat = {
    "123454": 120,
    "123455": 24,
    "123456": 0,
    "123457": 60,
    "EU-801": 40,
    "EU-802": 24,
    "EU-803": 0,
    "CN-1601": 32,
    "CN-1602": 48,
  };
  state.stock.Delhi = {
    "123454": 16,
    "123455": 8,
    "123456": 10,
    "123457": 30,
    "EU-801": 16,
    "EU-802": 20,
    "EU-803": 12,
    "CN-1601": 12,
    "CN-1602": 28,
  };
  state.stock.Bangalore = {
    "123454": 8,
    "123455": 24,
    "123456": 18,
    "123457": 12,
    "EU-801": 8,
    "EU-802": 16,
    "EU-803": 24,
    "CN-1601": 20,
    "CN-1602": 4,
  };
  saveState();
  render();
}

function render() {
  if (currentUser) showAppSession(currentUser);
  renderNotificationBadge();
  renderCurrentView();
  requestCatalogueStickySync();
}

function requestCatalogueStickySync() {
  if (catalogueStickyFrame) return;
  catalogueStickyFrame = requestAnimationFrame(() => {
    catalogueStickyFrame = 0;
    syncCatalogueStickyHeader();
  });
}

function syncCatalogueStickyHeader() {
  const catalogueView = document.querySelector("#catalogue");
  if (!catalogueView) return;
  const clearActive = () => {
    catalogueView.classList.remove("catalogue-nested-sticky-active");
    catalogueView.querySelectorAll(".nested-sku-table.is-sticky-table").forEach((table) => {
      table.classList.remove("is-sticky-table");
    });
    activeCatalogueStickyTable = null;
  };

  if (currentView !== "catalogue") {
    clearActive();
    return;
  }

  const openNestedTables = [...catalogueView.querySelectorAll(".catalogue-details[open] .nested-sku-table")];
  if (!openNestedTables.length) {
    clearActive();
    return;
  }

  const isActiveTableStillValid =
    activeCatalogueStickyTable &&
    openNestedTables.includes(activeCatalogueStickyTable) &&
    (() => {
      const rect = activeCatalogueStickyTable.getBoundingClientRect();
      const headerHeight = activeCatalogueStickyTable.querySelector("thead")?.getBoundingClientRect().height || 42;
      return rect.top <= 52 && rect.bottom > headerHeight + 72;
    })();

  const activeTable = isActiveTableStillValid
    ? activeCatalogueStickyTable
    : openNestedTables.find((table) => {
      const rect = table.getBoundingClientRect();
      const headerHeight = table.querySelector("thead")?.getBoundingClientRect().height || 42;
      return rect.top <= 4 && rect.bottom > headerHeight + 72;
    });

  catalogueView.querySelectorAll(".nested-sku-table.is-sticky-table").forEach((table) => {
    if (table !== activeTable) table.classList.remove("is-sticky-table");
  });

  if (!activeTable) {
    clearActive();
    return;
  }

  activeCatalogueStickyTable = activeTable;
  activeTable.classList.add("is-sticky-table");
  catalogueView.classList.add("catalogue-nested-sticky-active");
}

function renderNotificationBadge() {
  const badge = document.querySelector("#notificationBadge");
  if (!badge) return;
  const count = (state.notifications || []).filter((item) => item.read !== true).length;
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.classList.toggle("visible", count > 0);
}

function renderCurrentView() {
  if (currentView === "dashboard") renderDashboard();
  if (currentView === "catalogue") {
    renderCatalogue();
    renderSkuPreview();
  }
  if (currentView === "uploads") renderUploads();
  if (currentView === "transfers") renderTransfers();
  if (currentView === "unmetShortages") renderUnmetShortages();
  if (currentView === "notifications") renderNotifications();
}

function renderSkuPreview() {
  const input = document.querySelector("#skuList");
  const preview = document.querySelector("#skuPreview");
  const count = document.querySelector("#skuPreviewCount");
  if (!input || !preview || !count) return;
  const skus = parseSkuInput(input.value);
  count.textContent = `${skus.length} SKU${skus.length === 1 ? "" : "s"} detected`;
  preview.innerHTML = skus.map((sku) => `<span class="sku-chip">${sku}</span>`).join("");
}

function showCatalogueImportMessage(text, type = "ok") {
  const message = document.querySelector("#catalogueImportMessage");
  if (!message) return;
  clearTimeout(catalogueImportMessageTimer);
  message.innerHTML = `<div class="notice ${type} transient-notice">${text}</div>`;
  catalogueImportMessageTimer = setTimeout(() => {
    const notice = message.querySelector(".transient-notice");
    if (notice) notice.classList.add("is-hiding");
    catalogueImportMessageTimer = setTimeout(() => {
      message.innerHTML = "";
    }, 260);
  }, 3500);
}

function renderCatalogue() {
  const body = document.querySelector("#catalogueRows");
  if (!body) return;
  const catalogueNames = getCatalogueNames();
  body.innerHTML =
    catalogueNames
      .map((catalogue) => {
        const items = state.catalogues.filter((item) => item.catalogue === catalogue);
        const boxSizes = [...new Set(items.map((item) => item.boxSize))].join(", ");
        const delhiEnabled = isRefillEnabled("Delhi", catalogue);
        const bangaloreEnabled = isRefillEnabled("Bangalore", catalogue);
        return `<tr class="catalogue-group-row">
          <td colspan="5">
            <details class="catalogue-details">
              <summary>
                <span><strong>${catalogue}</strong></span>
                <span>${boxSizes}</span>
                <span>${items.length} SKUs</span>
                ${DESTINATIONS.map((warehouse) => `<span>${refillToggle(warehouse, catalogue)}</span>`).join("")}
              </summary>
              <div class="catalogue-bulk-controls">
                ${DESTINATIONS.map((warehouse) => catalogueBulkControls(warehouse, catalogue)).join("")}
                <button class="compact-save secondary-compact" data-apply-catalogue="${catalogue}">Apply to Catalogue</button>
              </div>
              <table class="nested-sku-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Box Size</th>
                    <th>Delhi Max</th>
                    <th>Delhi R1</th>
                    <th>Delhi R2</th>
                    <th>Delhi R3</th>
                    <th>Delhi R4</th>
                    <th>Delhi Refill</th>
                    <th>Bangalore Max</th>
                    <th>Bangalore R1</th>
                    <th>Bangalore R2</th>
                    <th>Bangalore R3</th>
                    <th>Bangalore R4</th>
                    <th>Bangalore Refill</th>
                    <th>Save</th>
                  </tr>
                </thead>
                <tbody>
                  ${items
                    .map(
                      (item) => `<tr>
                        <td>${item.sku}</td>
                        <td>${item.boxSize}</td>
                        ${DESTINATIONS.map(
                          (warehouse) => {
                            const warehouseEnabled = isRefillEnabled(warehouse, catalogue);
                            return skuWarehouseSettingCells(warehouse, catalogue, item.sku, warehouseEnabled);
                          },
                        ).join("")}
                        <td><button class="compact-save" data-save-catalogue-sku="${item.sku}">Save</button></td>
                      </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </details>
          </td>
        </tr>`;
      })
      .join("") || emptyRow(6);
}

function catalogueBulkControls(warehouse, catalogue) {
  const enabled = isRefillEnabled(warehouse, catalogue);
  const fields = [
    ["Max", "bulk-max"],
    ["R1", "bulk-reorder-1"],
    ["R2", "bulk-reorder-2"],
    ["R3", "bulk-reorder-3"],
    ["R4", "bulk-reorder-4"],
  ];
  return fields
    .map(
      ([label, attr]) =>
        `<label>${warehouse} ${label}<input class="compact-number" type="number" min="0" data-${attr}="${warehouse}::${catalogue}" ${enabled ? "" : "disabled"} /></label>`,
    )
    .join("");
}

function skuWarehouseSettingCells(warehouse, catalogue, sku, warehouseEnabled) {
  const key = `${warehouse}::${sku}`;
  return `<td><input class="compact-number" type="number" min="0" value="${getMinimum(warehouse, sku)}" data-catalogue-max="${key}" ${warehouseEnabled ? "" : "disabled"} /></td>
    ${[1, 2, 3, 4]
      .map(
        (level) =>
          `<td><input class="compact-number" type="number" min="0" value="${getReorderPointLevel(warehouse, sku, level)}" data-catalogue-reorder-${level}="${key}" ${warehouseEnabled ? "" : "disabled"} /></td>`,
      )
      .join("")}
    <td>${skuRefillToggle(warehouse, sku, !warehouseEnabled)}</td>`;
}

function refillToggle(warehouse, catalogue) {
  return `<label class="toggle-switch">
    <input type="checkbox" data-refill-toggle="${warehouse}::${catalogue}" ${isRefillEnabled(warehouse, catalogue) ? "checked" : ""} />
    <span></span>
    <em>${isRefillEnabled(warehouse, catalogue) ? "On" : "Off"}</em>
  </label>`;
}

function skuRefillToggle(warehouse, sku, disabled = false) {
  const enabled = !disabled && isSkuRefillEnabled(warehouse, sku);
  return `<label class="toggle-switch compact-toggle">
    <input type="checkbox" data-sku-refill-toggle="${warehouse}::${sku}" ${enabled ? "checked" : ""} ${disabled ? "disabled" : ""} />
    <span></span>
    <em>${enabled ? "On" : "Off"}</em>
  </label>`;
}

function updateCatalogueWarehouseControls(catalogue, warehouse, enabled) {
  const catalogueSkus = state.catalogues.filter((item) => item.catalogue === catalogue).map((item) => item.sku);
  const bulkKey = `${warehouse}::${catalogue}`;
  [
    `[data-bulk-max="${CSS.escape(bulkKey)}"]`,
    `[data-bulk-reorder-1="${CSS.escape(bulkKey)}"]`,
    `[data-bulk-reorder-2="${CSS.escape(bulkKey)}"]`,
    `[data-bulk-reorder-3="${CSS.escape(bulkKey)}"]`,
    `[data-bulk-reorder-4="${CSS.escape(bulkKey)}"]`,
  ].forEach((selector) => {
    const input = document.querySelector(selector);
    if (input) input.disabled = !enabled;
  });

  catalogueSkus.forEach((sku) => {
    const key = `${warehouse}::${sku}`;
    [
      `[data-catalogue-max="${CSS.escape(key)}"]`,
      `[data-catalogue-reorder-1="${CSS.escape(key)}"]`,
      `[data-catalogue-reorder-2="${CSS.escape(key)}"]`,
      `[data-catalogue-reorder-3="${CSS.escape(key)}"]`,
      `[data-catalogue-reorder-4="${CSS.escape(key)}"]`,
    ].forEach((selector) => {
      const input = document.querySelector(selector);
      if (input) input.disabled = !enabled;
    });

    const toggle = document.querySelector(`[data-sku-refill-toggle="${CSS.escape(key)}"]`);
    if (!toggle) return;
    toggle.disabled = !enabled;
    toggle.checked = enabled && isSkuRefillEnabled(warehouse, sku);
    const text = toggle.closest(".toggle-switch")?.querySelector("em");
    if (text) text.textContent = toggle.checked ? "On" : "Off";
  });
}

function parseDashboardDate(value) {
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return new Date(8640000000000000);
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function renderDashboardOverview() {
  const delhiShortages = getDashboardRows("Delhi").filter((row) => row.status === "Recommended" || row.status === "Manual Dispatch");
  const bangaloreShortages = getDashboardRows("Bangalore").filter((row) => row.status === "Recommended");
  const activeTransitBatches = state.batches.filter((batch) => normalizeStatus(batch.status) === "in transit");
  const dispatchBatches = state.batches || [];
  const warehouseTotals = WAREHOUSES.map((warehouse) => ({
    warehouse,
    rolls: Object.values(state.stock[warehouse] || {}).reduce((sum, qty) => sum + Number(qty), 0),
  }));
  const totalStock = warehouseTotals.reduce((sum, item) => sum + item.rolls, 0);

  document.querySelector("#totalStockCount").textContent = totalStock.toLocaleString("en-IN");
  document.querySelector("#delhiShortageCount").textContent = delhiShortages.length;
  document.querySelector("#bangaloreShortageCount").textContent = bangaloreShortages.length;
  document.querySelector("#movementCount").textContent = `${state.palletReady.length} / ${activeTransitBatches.length}`;
  const dateChip = document.querySelector("#todayDateChip");
  if (dateChip) dateChip.textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  const panipat = warehouseTotals.find((item) => item.warehouse === "Panipat")?.rolls || 0;
  const delhi = warehouseTotals.find((item) => item.warehouse === "Delhi")?.rolls || 0;
  const panipatPct = totalStock ? Math.round((panipat / totalStock) * 100) : 0;
  const delhiPct = totalStock ? Math.round((delhi / totalStock) * 100) : 0;
  const bangalorePct = Math.max(0, 100 - panipatPct - delhiPct);

  document.querySelector("#dashboardWarehouseDonut").innerHTML = `
    <div class="donut-ring" style="--panipat:${panipatPct}; --delhi:${delhiPct}; --bangalore:${bangalorePct};"></div>
    <div class="donut-legend">
      ${warehouseTotals.map((item) => `<span><i class="legend-dot ${item.warehouse.toLowerCase()}"></i>${item.warehouse}<strong>${item.rolls.toLocaleString("en-IN")} rolls</strong></span>`).join("")}
      <span class="dashboard-total-line">Total Stock<strong>${totalStock.toLocaleString("en-IN")} rolls</strong></span>
    </div>`;

  const totalSkus = Math.max(1, state.catalogues.length);
  document.querySelector("#dashboardShortageOverview").innerHTML = [
    { warehouse: "Delhi", count: delhiShortages.length, pct: Math.round((delhiShortages.length / totalSkus) * 1000) / 10 },
    { warehouse: "Bangalore", count: bangaloreShortages.length, pct: Math.round((bangaloreShortages.length / totalSkus) * 1000) / 10 },
  ]
    .map(
      (item) => `<div class="dashboard-insight-row clickable-card" data-dashboard-warehouse="${item.warehouse}">
        <i class="insight-icon shortage-overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h16"></path><path d="M6.25 20V10.5h3.5V20"></path><path d="M10.75 20V7.5h3.5V20"></path><path d="M15.25 20v-8h3.5v8"></path><path d="M7.75 13h.01"></path><path d="M7.75 16h.01"></path><path d="M12.25 10h.01"></path><path d="M12.25 13h.01"></path><path d="M16.75 14.5h.01"></path><path d="M16.75 17h.01"></path></svg></i>
        <span><strong>${item.warehouse}</strong><small>${item.count} SKUs short</small></span>
        <b>${item.pct}%</b>
      </div>`,
    )
    .join("");

  document.querySelector("#dispatchTracker").innerHTML = [
    `<div class="dashboard-insight-row clickable-card" data-dashboard-movement-shortcut><i class="insight-icon stock-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4 5 7.5l7 3.5 7-3.5z"></path><path d="M5 7.5v8.25l7 3.75 7-3.75V7.5"></path><path d="M12 11v8.5"></path></svg></i><span><strong>Dispatch Batches</strong><small>${dispatchBatches.length} recent batches</small></span><b>${dispatchBatches.reduce((sum, batch) => sum + sumRolls(batch.lines), 0)} rolls</b></div>`,
    `<div class="dashboard-insight-row clickable-card" data-dashboard-movement-shortcut><i class="insight-icon pallet-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 18h16"></path><path d="M6 18V8h12v10"></path><path d="M8.5 11h7"></path><path d="M8.5 14h7"></path><path d="M8 21v-3"></path><path d="M16 21v-3"></path></svg></i><span><strong>Pallet Ready</strong><small>${state.palletReady.length} SOs ready</small></span><b>${state.palletReady.reduce((sum, so) => sum + sumRolls(so.lines), 0)} rolls</b></div>`,
    `<div class="dashboard-insight-row clickable-card" data-dashboard-movement-shortcut><i class="insight-icon movement-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3.5 7.5h10.25v8H3.5z"></path><path d="M13.75 10.5h3.25l3.5 3.5v1.5h-6.75z"></path><circle cx="7" cy="17.75" r="1.75"></circle><circle cx="17.25" cy="17.75" r="1.75"></circle></svg></i><span><strong>In Transit</strong><small>${activeTransitBatches.length} in-transit records</small></span><b>${activeTransitBatches.reduce((sum, batch) => sum + sumRolls(batch.lines), 0)} rolls</b></div>`,
  ].join("");
}

function renderDashboard() {
  document.querySelector("#activeSkuCount").textContent = state.catalogues.length;
  document.querySelector("#delhiShortageCount").textContent = getDashboardRows("Delhi").filter((row) => row.status === "Recommended").length;
  document.querySelector("#bangaloreShortageCount").textContent = getDashboardRows("Bangalore").filter((row) => row.status === "Recommended").length;
  const activeTransitCount = state.batches.filter((batch) => normalizeStatus(batch.status) === "in transit").length;
  document.querySelector("#movementCount").textContent = `${state.palletReady.length} / ${activeTransitCount}`;

  const warehouseTotals = WAREHOUSES.map((warehouse) => ({
    warehouse,
    rolls: Object.values(state.stock[warehouse] || {}).reduce((sum, qty) => sum + Number(qty), 0),
  }));
  const maxWarehouseRolls = Math.max(1, ...warehouseTotals.map((item) => item.rolls));
  const chart = document.querySelector("#warehouseStockChart");
  if (chart) {
    chart.innerHTML = warehouseTotals
      .map(
        (item) => `<div class="warehouse-bar-row">
          <span>${item.warehouse}</span>
          <div class="warehouse-bar-track"><i style="width: ${Math.max(4, (item.rolls / maxWarehouseRolls) * 100)}%"></i></div>
          <strong>${item.rolls.toLocaleString("en-IN")}</strong>
        </div>`,
      )
      .join("");
  }

  document.querySelector("#stockSummary").innerHTML = WAREHOUSES.map((warehouse) => {
    const total = Object.values(state.stock[warehouse] || {}).reduce((sum, qty) => sum + Number(qty), 0);
    return `<div class="stock-line"><strong>${warehouse}</strong><span>${total} rolls across ${Object.keys(state.stock[warehouse] || {}).length} SKUs</span></div>`;
  }).join("");

  document.querySelector("#dispatchTracker").innerHTML =
    [
      ...state.palletReady.map(
        (so) =>
          `<div class="so-card"><header><strong>${so.soNumber}</strong>${statusPill("Pallet Ready")}</header><p class="muted">${so.destination} · ${so.lines.length} SKUs · ${sumRolls(so.lines)} rolls</p></div>`,
      ),
      ...state.batches.filter((batch) => normalizeStatus(batch.status) === "in transit").map(
        (batch) =>
          `<div class="batch"><header><strong>${batch.id}</strong>${statusPill(batch.status)}</header><p class="muted">${batch.destination} · ETA ${batch.eta} · ${batch.lines.length} SKUs · SOs: ${batch.soNumbers.join(", ")}</p></div>`,
      ),
    ].join("") || `<div class="notice">No Pallet Ready or In Transit records yet.</div>`;

  const movementRows = [
    ...state.palletReady.map((so) => ({ id: so.id, warehouse: so.destination })),
    ...state.batches
      .filter((batch) => normalizeStatus(batch.status) === "in transit")
      .map((batch) => ({ id: batch.id, warehouse: batch.destination })),
  ];
  document.querySelectorAll("#dispatchTracker .so-card, #dispatchTracker .batch").forEach((card, index) => {
    const movement = movementRows[index];
    if (!movement) return;
    card.classList.add("clickable-card");
    card.dataset.dashboardMovement = movement.id;
    card.dataset.dashboardMovementWarehouse = movement.warehouse;
  });
}

function recommendationText(row) {
  if (row.rolls) return formatBoxRollSummary(row.rolls, row.boxSize);
  if (row.status === "Waiting Panipat Stock" && row.neededBoxes) {
    return `Pending ${row.neededBoxes} box / ${row.neededRolls} rolls`;
  }
  if (row.status === "Unmet shortage" && row.neededBoxes) {
    return `Need ${row.neededBoxes} box / ${row.neededRolls} rolls`;
  }
  if (row.status === "Manual Dispatch") return `Available ${row.panipatAvailable} rolls`;
  return "-";
}

function renderUnmetShortages() {
  const query = unmetSearch.trim().toLowerCase();
  const rows = getUnmetShortages(currentUnmetWarehouse).filter(
    (row) => !query || row.sku.toLowerCase().includes(query) || row.catalogue.toLowerCase().includes(query),
  );
  const body = document.querySelector("#unmetShortageRows");
  if (!body) return;
  body.innerHTML =
    rows
      .map(
        (row) => `<tr>
          <td>${row.sku}</td>
          <td>${row.catalogue}</td>
          <td>${row.actual}</td>
          <td>${row.pallet}</td>
          <td>${row.transit}</td>
          <td>${row.boxSize}</td>
          <td>${row.panipatAvailable}</td>
          <td>${statusPill(row.status)}</td>
        </tr>`,
      )
      .join("") || emptyRow(8);
}

function dispatchRecommendationControl(row) {
  if (currentTransferWarehouse === "Delhi") {
    const maxRolls = Math.max(0, Number(row.panipatAvailable || 0));
    const value = Math.min(maxRolls, Math.max(0, Number(row.rolls || 0)));
    return `<div class="summary-recommendation-edit roll-edit">
      <input type="number" min="0" max="${maxRolls}" value="${value}" data-summary-rolls-input="${row.sku}" data-box-size="${row.boxSize}" data-panipat-stock="${maxRolls}" />
      <span class="roll-summary-text" data-summary-rolls="${row.sku}">${formatBoxRollSummary(value, row.boxSize)}</span>
    </div>`;
  }

  if (row.boxes > 0) {
    return `<div class="summary-recommendation-edit">
      <input type="number" min="0" value="${row.boxes}" data-summary-boxes="${row.sku}" data-box-size="${row.boxSize}" />
      <span class="roll-summary-text" data-summary-rolls="${row.sku}">${formatBoxRollSummary(row.rolls, row.boxSize)}</span>
    </div>`;
  }

  return recommendationText(row);
}

function updateDispatchTotals() {
  const footer = document.querySelector("#dispatchActionSummaryTotals");
  if (!footer) return;
  const rows = [...document.querySelectorAll("#dispatchActionSummaryRows tr[data-summary-row]")];
  if (!rows.length) {
    footer.innerHTML = "";
    return;
  }

  const totals = rows.reduce(
    (sum, row) => {
      const rollsInput = row.querySelector("[data-summary-rolls-input]");
      const boxesInput = row.querySelector("[data-summary-boxes]");
      const boxSize = Number(row.dataset.boxSize || rollsInput?.dataset.boxSize || boxesInput?.dataset.boxSize || 0);
      const dispatchRolls = rollsInput
        ? Number(rollsInput.value || 0)
        : Number(boxesInput?.value || 0) * boxSize;

      sum.actual += Number(row.dataset.actual || 0);
      sum.pallet += Number(row.dataset.pallet || 0);
      sum.transit += Number(row.dataset.transit || 0);
      sum.panipat += Number(row.dataset.panipat || 0);
      if (dispatchRolls > 0) {
        sum.dispatchRolls += dispatchRolls;
        sum.dispatchBoxes += fullBoxesForRolls(dispatchRolls, boxSize);
        sum.looseRolls += looseRollsForRolls(dispatchRolls, boxSize);
      }
      if (row.querySelector("[data-summary-rec]")?.checked) {
        sum.selectedCount += 1;
        if (dispatchRolls > 0) {
          sum.selectedRolls += dispatchRolls;
          sum.selectedBoxes += fullBoxesForRolls(dispatchRolls, boxSize);
          sum.selectedLooseRolls += looseRollsForRolls(dispatchRolls, boxSize);
        }
      }
      return sum;
    },
    {
      actual: 0,
      pallet: 0,
      transit: 0,
      panipat: 0,
      dispatchRolls: 0,
      dispatchBoxes: 0,
      looseRolls: 0,
      selectedCount: 0,
      selectedRolls: 0,
      selectedBoxes: 0,
      selectedLooseRolls: 0,
    },
  );

  const boxSummary = `${totals.dispatchBoxes} box${totals.dispatchBoxes === 1 ? "" : "es"}${totals.looseRolls ? ` + ${totals.looseRolls} loose rolls` : ""}`;
  const selectedBoxSummary = `${totals.selectedBoxes} box${totals.selectedBoxes === 1 ? "" : "es"}${totals.selectedLooseRolls ? ` + ${totals.selectedLooseRolls} loose rolls` : ""}`;
  footer.innerHTML = `<tr class="dispatch-total-row">
    <td colspan="3"><strong>Total</strong><small>${totals.selectedCount} selected &middot; ${selectedBoxSummary} / ${totals.selectedRolls} rolls</small></td>
    <td>${totals.actual}</td>
    <td>${totals.pallet}</td>
    <td>${totals.transit}</td>
    <td>${totals.panipat}</td>
    <td><strong>${totals.dispatchRolls} rolls</strong><small>${boxSummary}</small></td>
    <td></td>
  </tr>`;
}

function renderUploads() {
  const latest = state.uploadWarnings[0];
  document.querySelector("#uploadMessages").innerHTML = latest
    ? `<div class="notice"><strong>Last import:</strong> ${latest.warehouse} - ${latest.imported} SKUs - ${latest.at}. Full history is in Logs.</div>`
    : "";
}

function renderNotifications() {
  const latestByWarehouse = Object.fromEntries(
    WAREHOUSES.map((warehouse) => [
      warehouse,
      state.uploadWarnings.find((item) => item.warehouse === warehouse),
    ]),
  );

  document.querySelector("#panipatLastUpdate").textContent = latestByWarehouse.Panipat?.at || "-";
  document.querySelector("#delhiLastUpdate").textContent = latestByWarehouse.Delhi?.at || "-";
  document.querySelector("#bangaloreLastUpdate").textContent = latestByWarehouse.Bangalore?.at || "-";
  const unreadCount = (state.notifications || []).filter((item) => item.read !== true).length;
  const markReadButton = document.querySelector("#markNotificationsRead");
  if (markReadButton) {
    markReadButton.hidden = unreadCount === 0;
  }

  document.querySelector("#notificationRows").innerHTML =
    (state.notifications || [])
      .map(
        (item) => `<tr>
          <td>${item.at}</td>
          <td>${item.type}</td>
          <td>${item.warehouse || "-"}</td>
          <td>${item.message}</td>
          <td>${item.detail || "-"}</td>
        </tr>`,
      )
      .join("") || emptyRow(5);

  const issueRows = state.issueReports || [];
  const issueBody = document.querySelector("#issueReportRows");
  if (issueBody) {
    issueBody.innerHTML =
      issueRows
        .map(
          (issue) => `<tr>
            <td>${escapeHtml(issue.at)}</td>
            <td>${escapeHtml(issue.reporter || "-")}</td>
            <td>${escapeHtml(issue.warehouse || "-")}</td>
            <td>${escapeHtml(issue.page || "-")}</td>
            <td><strong>${escapeHtml(issue.title || "Issue Report")}</strong><br><span class="muted">${escapeHtml(issue.message)}</span></td>
            <td>${formatScreenshotLinks(issue.screenshots || [])}</td>
            <td>${statusPill(issue.status || "open")}</td>
          </tr>`,
        )
        .join("") || emptyRow(7);
  }
}

function renderTransfers() {
  const query = transferSearch.trim().toLowerCase();
  const catalogueFilter = currentTransferCatalogue;
  const statusFilters = new Set(currentTransferStatuses);
  const exportButton = document.querySelector("#exportSelectedShortage");
  if (exportButton) exportButton.textContent = `Export ${currentTransferWarehouse} Shortage CSV`;
  const catalogueSelect = document.querySelector("#transferCatalogueFilter");
  if (catalogueSelect) {
    const options = getCatalogueNames()
      .map((catalogue) => `<option value="${catalogue}" ${catalogue === currentTransferCatalogue ? "selected" : ""}>${catalogue}</option>`)
      .join("");
    catalogueSelect.innerHTML = `<option value="">All catalogues</option>${options}`;
    catalogueSelect.value = currentTransferCatalogue;
  }
  document.querySelectorAll("[data-transfer-status-filter]").forEach((input) => {
    input.checked = statusFilters.has(input.value);
  });
  const summaryRows = getDashboardRows(currentTransferWarehouse).filter(
    (row) =>
      (!query || row.sku.toLowerCase().includes(query) || row.catalogue.toLowerCase().includes(query)) &&
      (!catalogueFilter || row.catalogue === catalogueFilter) &&
      (!statusFilters.size || statusFilters.has(row.status)),
  );
  document.querySelector("#dispatchActionSummaryRows").innerHTML =
    summaryRows
      .map(
        (row) => `<tr data-summary-row="${row.sku}" data-actual="${row.actual}" data-pallet="${row.pallet}" data-transit="${row.transit}" data-panipat="${row.panipatAvailable}" data-box-size="${row.boxSize}">
          <td><input type="checkbox" data-summary-rec="${row.sku}" ${getDispatchSelection(currentTransferWarehouse, row) ? "checked" : ""} /></td>
          <td>${row.sku}</td>
          <td>${row.catalogue}</td>
          <td>${row.actual}</td>
          <td>${row.pallet}</td>
          <td>${row.transit}</td>
          <td>${row.panipatAvailable}</td>
          <td>${dispatchRecommendationControl(row)}</td>
          <td>${statusPill(row.status)}</td>
        </tr>`,
      )
      .join("") || emptyRow(9);
  updateDispatchTotals();

  const selectAll = document.querySelector("#selectAllSummary");
  if (selectAll) {
    const checkboxes = [...document.querySelectorAll("[data-summary-rec]")];
    selectAll.checked = checkboxes.length > 0 && checkboxes.every((item) => item.checked);
    selectAll.disabled = checkboxes.length === 0;
  }

  document.querySelector("#palletReadyList").innerHTML =
    state.palletReady
      .filter((so) => so.destination === currentTransferWarehouse)
      .map(
        (so) =>
          `<details class="so-card" data-movement-detail="${so.id}" ${pendingOpenMovementId === so.id ? "open" : ""}>
            <summary><span class="so-title"><input type="checkbox" data-so="${so.id}" onclick="event.stopPropagation()" /> <strong>${so.soNumber}</strong></span><span class="so-actions">${statusPill("Pallet Ready")}<button type="button" class="void-action" data-void-so="${so.id}">Void</button></span></summary>
            <p class="muted">${formatDateTime(so.createdAt)} &middot; ${so.lines.length} SKUs &middot; ${linesBoxRollSummary(so.lines)}</p>
            <table>
              <thead><tr><th>SKU</th><th>Catalogue</th><th>Boxes</th><th>Rolls</th></tr></thead>
              <tbody>${so.lines.map((line) => `<tr><td>${line.sku}</td><td>${line.catalogue}</td><td>${lineBoxDisplay(line)}</td><td>${line.rolls}</td></tr>`).join("")}</tbody>
            </table>
          </details>`,
      )
      .join("") || `<div class="notice">No Pallet Ready SOs for ${currentTransferWarehouse}.</div>`;

  document.querySelector("#batchList").innerHTML =
    state.batches
      .filter((batch) => batch.destination === currentTransferWarehouse)
      .map(
        (batch) =>
          `<details class="batch" data-movement-detail="${batch.id}" ${pendingOpenMovementId === batch.id ? "open" : ""}>
            <summary><strong>${batch.id}</strong> · ${batch.destination} · ${sumRolls(batch.lines)} rolls · ${normalizeStatus(batch.status) === "received" ? `Received ${formatDispatchReceivedDate(batch.receivedAt)}${batch.receivedBy ? ` by ${batch.receivedBy}` : ""}` : `ETA ${formatDateOnly(batch.eta)}`}</summary>
            <p class="muted">SO Numbers: ${batch.soNumbers.join(", ")}</p>
            <p>${statusPill(batch.status)}</p>
            ${batch.receiptEvidence ? `<p class="muted">Receipt matched ${batch.receiptEvidence.confirmedLines} of ${batch.receiptEvidence.totalLines} SKU lines from the latest inventory upload.</p>` : ""}
            <table>
              <thead><tr><th>SKU</th><th>Catalogue</th><th>Boxes</th><th>Rolls</th></tr></thead>
              <tbody>${batch.lines.map((line) => `<tr><td>${line.sku}</td><td>${line.catalogue}</td><td>${lineBoxDisplay(line)}</td><td>${line.rolls}</td></tr>`).join("")}</tbody>
            </table>
            ${
              normalizeStatus(batch.status) === "in transit"
                ? `<button class="small-action mark-received" data-receive-batch="${batch.id}">Mark as Received</button>`
                : ""
            }
          </details>`,
      )
      .join("") || `<div class="notice">No dispatch batches for ${currentTransferWarehouse}.</div>`;

  document.querySelector("#voidedSoList").innerHTML =
    (state.voidedPalletReady || [])
      .filter((so) => so.destination === currentTransferWarehouse)
      .map(
        (so) =>
          `<details class="so-card voided-so-card">
            <summary><span class="so-title"><strong>${so.soNumber}</strong></span><span class="so-actions">${statusPill("Voided")}</span></summary>
            <p class="muted">${formatDateTime(so.voidedAt)} &middot; ${so.lines.length} SKUs &middot; ${sumRolls(so.lines)} rolls restored to Panipat</p>
            <table>
              <thead><tr><th>SKU</th><th>Catalogue</th><th>Boxes</th><th>Rolls</th></tr></thead>
              <tbody>${so.lines.map((line) => `<tr><td>${line.sku}</td><td>${line.catalogue}</td><td>${lineBoxDisplay(line)}</td><td>${line.rolls}</td></tr>`).join("")}</tbody>
            </table>
          </details>`,
      )
      .join("") || `<div class="notice">No voided ASOs for ${currentTransferWarehouse}.</div>`;
}

function emptyRow(colspan) {
  return `<tr><td colspan="${colspan}" class="empty">No records yet.</td></tr>`;
}

function statusPill(status) {
  const cls =
    status === "Recommended" || status === "Unmet shortage"
      ? "short"
      : status === "Voided"
        ? "short"
      : status === "Waiting Panipat Stock"
        ? "transit"
      : status === "Pallet Ready"
        ? "ready"
        : status === "In Transit"
          ? "transit"
          : status === "Covered" || status === "Projected OK"
            ? "ready"
          : "ok";
  return `<span class="pill ${cls}">${status}</span>`;
}

function sumRolls(lines) {
  return lines.reduce((sum, line) => sum + Number(line.rolls), 0);
}

function lineBoxDisplay(line) {
  const boxes = Number(line.boxes || fullBoxesForRolls(line.rolls, line.boxSize));
  const loose = looseRollsForRolls(line.rolls, line.boxSize);
  return `${boxes}${loose ? ` + ${loose} loose` : ""}`;
}

function linesBoxRollSummary(lines) {
  const totals = lines.reduce(
    (sum, line) => {
      sum.boxes += Number(line.boxes || fullBoxesForRolls(line.rolls, line.boxSize));
      sum.loose += Number(line.looseRolls || looseRollsForRolls(line.rolls, line.boxSize));
      sum.rolls += Number(line.rolls || 0);
      return sum;
    },
    { boxes: 0, loose: 0, rolls: 0 },
  );
  const boxText = `${totals.boxes} box${totals.boxes === 1 ? "" : "es"}${totals.loose ? ` + ${totals.loose} loose rolls` : ""}`;
  return `${boxText} / ${totals.rolls} rolls`;
}

function dispatchSelectionKey(warehouse, sku) {
  return `${warehouse}::${sku}`;
}

function getDispatchSelection(warehouse, row) {
  const key = dispatchSelectionKey(warehouse, row.sku);
  if (Object.prototype.hasOwnProperty.call(state.dispatchSelections || {}, key)) {
    return Boolean(state.dispatchSelections[key]);
  }
  return Number(row.rolls || 0) > 0;
}

function setDispatchSelection(warehouse, sku, checked) {
  if (!state.dispatchSelections) state.dispatchSelections = {};
  state.dispatchSelections[dispatchSelectionKey(warehouse, sku)] = Boolean(checked);
}

function selectedRecommendations() {
  const rows = getDashboardRows(currentTransferWarehouse);
  return rows
    .filter((row) => document.querySelector(`[data-summary-rec="${CSS.escape(row.sku)}"]`)?.checked)
    .map((row) => {
      const rollInput = document.querySelector(`[data-summary-rolls-input="${CSS.escape(row.sku)}"]`);
      if (currentTransferWarehouse === "Delhi" && rollInput) {
        const rolls = Number(rollInput.value || 0);
        return { ...row, boxes: fullBoxesForRolls(rolls, row.boxSize), rolls, looseRolls: looseRollsForRolls(rolls, row.boxSize) };
      }
      const boxes = Number(document.querySelector(`[data-summary-boxes="${CSS.escape(row.sku)}"]`)?.value || row.boxes);
      return { ...row, boxes, rolls: boxes * row.boxSize, looseRolls: 0 };
    })
    .filter((row) => row.rolls > 0);
}

function showView(viewId, title) {
  document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  const nav = document.querySelector(`.nav-link[data-view="${viewId}"]`);
  const view = document.querySelector(`#${viewId}`);
  if (nav) nav.classList.add("active");
  if (view) view.classList.add("active");
  document.querySelector("#viewTitle").textContent = title || nav?.dataset.title || nav?.textContent.trim() || "";
  currentView = viewId;
  render();
}

function openDispatchPlanning(warehouse, movementId = "") {
  currentTransferWarehouse = warehouse || currentTransferWarehouse;
  pendingOpenMovementId = movementId;
  document.querySelectorAll("[data-transfer-warehouse]").forEach((button) => {
    button.classList.toggle("active", button.dataset.transferWarehouse === currentTransferWarehouse);
  });
  showView("transfers", "Dispatch Planning");
}

function bindEvents() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      pendingOpenMovementId = "";
      showView(button.dataset.view, button.dataset.title || button.textContent.trim());
    });
  });

  document.querySelector("#dashboard").addEventListener("click", (event) => {
    const viewCard = event.target.closest("[data-dashboard-view]");
    if (viewCard) {
      const targetButton = document.querySelector(`.nav-link[data-view="${CSS.escape(viewCard.dataset.dashboardView)}"]`);
      showView(viewCard.dataset.dashboardView, targetButton?.dataset.title || targetButton?.textContent.trim() || "Dashboard");
      return;
    }

    const shortageCard = event.target.closest("[data-dashboard-warehouse]");
    if (shortageCard) {
      openDispatchPlanning(shortageCard.dataset.dashboardWarehouse);
      return;
    }

    const movementCard = event.target.closest("[data-dashboard-movement]");
    if (movementCard) {
      openDispatchPlanning(movementCard.dataset.dashboardMovementWarehouse, movementCard.dataset.dashboardMovement);
      return;
    }

    const movementShortcut = event.target.closest("[data-dashboard-movement-shortcut]");
    if (movementShortcut) {
      const firstMovement = state.palletReady[0] || state.batches.find((batch) => normalizeStatus(batch.status) === "in transit");
      openDispatchPlanning(firstMovement?.destination || currentTransferWarehouse, firstMovement?.id || "");
      return;
    }

    const overdueCard = event.target.closest("[data-dashboard-overdue]");
    if (overdueCard) {
      const firstOverdue = state.batches.find((batch) => normalizeStatus(batch.status) === "in transit" && parseDashboardDate(batch.eta) < new Date());
      openDispatchPlanning(firstOverdue?.destination || currentTransferWarehouse, firstOverdue?.id || "");
    }
  });

  document.querySelector("#catalogueForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addCatalogue(
      document.querySelector("#catalogueName").value,
      document.querySelector("#boxSize").value,
      document.querySelector("#skuList").value,
    );
    event.target.reset();
    renderSkuPreview();
  });

  document.querySelector("#catalogueImportFile").addEventListener("change", (event) => {
    document.querySelector("#catalogueImportName").textContent =
      event.target.files[0]?.name || "No file chosen";
  });

  document.querySelector("#catalogueImportBtn").addEventListener("click", async () => {
    const fileInput = document.querySelector("#catalogueImportFile");
    const fileName = document.querySelector("#catalogueImportName");
    const file = fileInput.files[0];
    if (!file) {
      showCatalogueImportMessage("Please choose an Excel or CSV file.", "warn");
      return;
    }
    try {
      const result = importCatalogueRows(await parseCatalogueFile(file));
      fileInput.value = "";
      fileName.textContent = "No file chosen";
      showCatalogueImportMessage(
        `Imported ${result.added} SKUs. Skipped ${result.skipped} duplicate or incomplete rows.`,
        "ok",
      );
    } catch (error) {
      showCatalogueImportMessage(error.message, "warn");
    }
  });

  document.querySelector("#downloadCatalogueCsv").addEventListener("click", downloadCatalogueSampleCsv);
  document.querySelector("#downloadCatalogueExcel").addEventListener("click", downloadCatalogueSampleExcel);

  document.querySelector("#skuList").addEventListener("input", renderSkuPreview);
  document.querySelector("#clearSkuPreview").addEventListener("click", () => {
    document.querySelector("#skuList").value = "";
    renderSkuPreview();
  });

  document.querySelector("#transferSearch").addEventListener("input", (event) => {
    transferSearch = event.target.value;
    renderTransfers();
  });

  document.querySelector("#transferCatalogueFilter").addEventListener("change", (event) => {
    currentTransferCatalogue = event.target.value;
    renderTransfers();
  });

  document.querySelectorAll("[data-transfer-status-filter]").forEach((input) => {
    input.addEventListener("change", () => {
      currentTransferStatuses = [...document.querySelectorAll("[data-transfer-status-filter]:checked")].map((item) => item.value);
      renderTransfers();
    });
  });

  document.querySelector("#unmetSearch").addEventListener("input", (event) => {
    unmetSearch = event.target.value;
    renderUnmetShortages();
  });

  document.querySelector("#catalogueRows").addEventListener("toggle", requestCatalogueStickySync, true);

  document.querySelector("#catalogueRows").addEventListener("change", (event) => {
    const input = event.target.closest("[data-refill-toggle]");
    if (!input) return;
    const divider = input.dataset.refillToggle.indexOf("::");
    const warehouse = input.dataset.refillToggle.slice(0, divider);
    const catalogue = input.dataset.refillToggle.slice(divider + 2);
    setRefillEnabled(warehouse, catalogue, input.checked);
    saveState();
    const label = input.closest(".toggle-switch");
    const text = label?.querySelector("em");
    if (text) text.textContent = input.checked ? "On" : "Off";
    updateCatalogueWarehouseControls(catalogue, warehouse, input.checked);
  });

  document.querySelector("#catalogueRows").addEventListener("change", (event) => {
    const input = event.target.closest("[data-sku-refill-toggle]");
    if (!input) return;
    const divider = input.dataset.skuRefillToggle.indexOf("::");
    const warehouse = input.dataset.skuRefillToggle.slice(0, divider);
    const sku = input.dataset.skuRefillToggle.slice(divider + 2);
    setSkuRefillEnabled(warehouse, sku, input.checked);
    saveState();
    const label = input.closest(".toggle-switch");
    const text = label?.querySelector("em");
    if (text) text.textContent = input.checked ? "On" : "Off";
  });

  document.querySelector("#catalogueRows").addEventListener("click", (event) => {
    const applyButton = event.target.closest("[data-apply-catalogue]");
    if (applyButton) {
      const catalogue = applyButton.dataset.applyCatalogue;
      const catalogueSkus = state.catalogues.filter((item) => item.catalogue === catalogue).map((item) => item.sku);
      DESTINATIONS.forEach((warehouse) => {
        if (!isRefillEnabled(warehouse, catalogue)) return;
        const bulkKey = `${warehouse}::${catalogue}`;
        const maxInput = document.querySelector(`[data-bulk-max="${CSS.escape(bulkKey)}"]`);
        const maxValue = maxInput?.value === "" ? null : Number(maxInput?.value || 0);
        const reorderValues = [1, 2, 3, 4].map((level) => {
          const input = document.querySelector(`[data-bulk-reorder-${level}="${CSS.escape(bulkKey)}"]`);
          return input?.value === "" ? null : Number(input?.value || 0);
        });
        catalogueSkus.forEach((sku) => {
          if (maxValue !== null) setMinimum(warehouse, sku, maxValue, true);
          reorderValues.forEach((value, index) => {
            if (value !== null) setReorderPointLevel(warehouse, sku, index + 1, value, true);
          });
        });
      });
      saveState();
      catalogueSkus.forEach((sku) => {
        DESTINATIONS.forEach((warehouse) => {
          const bulkKey = `${warehouse}::${catalogue}`;
          const skuKeyValue = `${warehouse}::${sku}`;
          const maxInput = document.querySelector(`[data-bulk-max="${CSS.escape(bulkKey)}"]`);
          const skuMaxInput = document.querySelector(`[data-catalogue-max="${CSS.escape(skuKeyValue)}"]`);
          if (maxInput?.value !== "" && skuMaxInput) skuMaxInput.value = maxInput.value;
          [1, 2, 3, 4].forEach((level) => {
            const reorderInput = document.querySelector(`[data-bulk-reorder-${level}="${CSS.escape(bulkKey)}"]`);
            const skuReorderInput = document.querySelector(`[data-catalogue-reorder-${level}="${CSS.escape(skuKeyValue)}"]`);
            if (reorderInput?.value !== "" && skuReorderInput) skuReorderInput.value = reorderInput.value;
          });
        });
      });
      return;
    }

    const button = event.target.closest("[data-save-catalogue-sku]");
    if (!button) return;
    const sku = button.dataset.saveCatalogueSku;
    const master = getSku(sku);
    DESTINATIONS.forEach((warehouse) => {
      if (master && !isRefillEnabled(warehouse, master.catalogue)) return;
      const key = `${warehouse}::${sku}`;
      const maxInput = document.querySelector(`[data-catalogue-max="${CSS.escape(key)}"]`);
      if (maxInput) setMinimum(warehouse, sku, Number(maxInput.value || 0), true);
      [1, 2, 3, 4].forEach((level) => {
        const reorderInput = document.querySelector(`[data-catalogue-reorder-${level}="${CSS.escape(key)}"]`);
        if (reorderInput) setReorderPointLevel(warehouse, sku, level, reorderInput.value, true);
      });
    });
    saveState();
  });

  document.querySelectorAll("[data-import]").forEach((button) => {
    button.addEventListener("click", async () => {
      const warehouse = button.dataset.import;
      const input = document.querySelector(`[data-upload="${warehouse}"]`);
      if (input.files[0]) {
        try {
          importInventoryRows(warehouse, await parseUploadFile(input.files[0]));
          input.value = "";
          updateSelectedFile(warehouse, null);
        } catch (error) {
          alert(error.message);
        }
        return;
      }
      alert("Choose or drag an Excel/CSV file first.");
    });
  });

  document.querySelectorAll("[data-upload]").forEach((input) => {
    input.addEventListener("change", () => {
      updateSelectedFile(input.dataset.upload, input.files[0]);
    });
  });

  document.querySelectorAll("[data-drop]").forEach((zone) => {
    const warehouse = zone.dataset.drop;
    const input = document.querySelector(`[data-upload="${warehouse}"]`);

    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("drag-over");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      const file = event.dataTransfer.files[0];
      if (!file) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      updateSelectedFile(warehouse, file);
    });
  });

  document.querySelectorAll("[data-clear-file]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const warehouse = button.dataset.clearFile;
      const input = document.querySelector(`[data-upload="${warehouse}"]`);
      input.value = "";
      updateSelectedFile(warehouse, null);
    });
  });

  document.querySelectorAll("[data-transfer-warehouse]").forEach((button) => {
    button.addEventListener("click", () => {
      currentTransferWarehouse = button.dataset.transferWarehouse;
      pendingOpenMovementId = "";
      document.querySelectorAll("[data-transfer-warehouse]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderTransfers();
    });
  });

  document.querySelectorAll("[data-unmet-warehouse]").forEach((button) => {
    button.addEventListener("click", () => {
      currentUnmetWarehouse = button.dataset.unmetWarehouse;
      document.querySelectorAll("[data-unmet-warehouse]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderUnmetShortages();
    });
  });

  document.querySelector("#createPalletBtn").addEventListener("click", () => {
    createPalletReady(currentTransferWarehouse, document.querySelector("#soNumber").value, selectedRecommendations());
    document.querySelector("#soNumber").value = "";
  });

  document.querySelector("#dispatchActionSummaryRows").addEventListener("input", (event) => {
    const rollInput = event.target.closest("[data-summary-rolls-input]");
    if (rollInput) {
      const sku = rollInput.dataset.summaryRollsInput;
      const maxRolls = Number(rollInput.dataset.panipatStock || 0);
      let rolls = Number(rollInput.value || 0);
      if (rolls > maxRolls) {
        alert(`${sku} has only ${maxRolls} rolls available in Panipat.`);
        rolls = maxRolls;
        rollInput.value = maxRolls;
      }
      if (rolls < 0) {
        rolls = 0;
        rollInput.value = 0;
      }
      const rollsCell = document.querySelector(`[data-summary-rolls="${CSS.escape(sku)}"]`);
      if (rollsCell) rollsCell.textContent = formatBoxRollSummary(rolls, Number(rollInput.dataset.boxSize || 0));
      const checkbox = document.querySelector(`[data-summary-rec="${CSS.escape(sku)}"]`);
      if (checkbox && rolls > 0 && !checkbox.checked) {
        checkbox.checked = true;
        setDispatchSelection(currentTransferWarehouse, sku, true);
        saveState();
      }
      updateDispatchTotals();
      return;
    }

    const input = event.target.closest("[data-summary-boxes]");
    if (!input) return;
    const sku = input.dataset.summaryBoxes;
    const rollsCell = document.querySelector(`[data-summary-rolls="${CSS.escape(sku)}"]`);
    if (rollsCell) rollsCell.textContent = formatBoxRollSummary(Number(input.value || 0) * Number(input.dataset.boxSize || 0), Number(input.dataset.boxSize || 0));
    updateDispatchTotals();
  });

  document.querySelector("#dispatchActionSummaryRows").addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-summary-rec]");
    if (!checkbox) return;
    setDispatchSelection(currentTransferWarehouse, checkbox.dataset.summaryRec, checkbox.checked);
    saveState();
    const checkboxes = [...document.querySelectorAll("[data-summary-rec]")];
    const selectAll = document.querySelector("#selectAllSummary");
    selectAll.checked = checkboxes.length > 0 && checkboxes.every((input) => input.checked);
    updateDispatchTotals();
  });

  document.querySelector("#selectAllSummary").addEventListener("change", (event) => {
    document.querySelectorAll("[data-summary-rec]").forEach((input) => {
      input.checked = event.target.checked;
      setDispatchSelection(currentTransferWarehouse, input.dataset.summaryRec, input.checked);
    });
    saveState();
    updateDispatchTotals();
  });

  document.querySelector("#createBatchBtn").addEventListener("click", () => {
    const selectedSoIds = [...document.querySelectorAll("[data-so]:checked")].map((input) => input.dataset.so);
    createDispatchBatch(currentTransferWarehouse, selectedSoIds);
  });

  document.querySelector("#palletReadyList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-void-so]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    voidPalletReadySO(button.dataset.voidSo);
  });

  document.querySelector("#batchList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-receive-batch]");
    if (!button) return;
    markBatchReceived(button.dataset.receiveBatch);
  });

  document.querySelector("#markNotificationsRead").addEventListener("click", () => {
    state.notifications = (state.notifications || []).map((item) => ({ ...item, read: true }));
    saveState();
    render();
  });

  document.querySelector("#exportSelectedShortage").addEventListener("click", exportSelectedDispatchShortage);

  document.querySelector("#loginForm").addEventListener("submit", handleLogin);
  document.querySelector("#logoutBtn").addEventListener("click", handleLogout);
  document.querySelector("#reportIssueBtn").addEventListener("click", reportIssue);
  document.querySelector("#issueForm").addEventListener("submit", submitIssueReport);
  document.querySelector("#closeIssueModal").addEventListener("click", closeIssueModal);
  document.querySelector("#cancelIssueReport").addEventListener("click", closeIssueModal);
  document.querySelector("#issueModal").addEventListener("click", (event) => {
    if (event.target.id === "issueModal") closeIssueModal();
  });
  document.querySelector("#issueScreenshots").addEventListener("change", (event) => {
    issueScreenshotFiles = [...issueScreenshotFiles, ...event.target.files];
    event.target.value = "";
    updateIssueAttachmentList();
  });
  document.querySelector("#issueAttachmentList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-issue-file]");
    if (!button) return;
    issueScreenshotFiles.splice(Number(button.dataset.removeIssueFile), 1);
    const input = document.querySelector("#issueScreenshots");
    if (input) input.value = "";
    updateIssueAttachmentList();
  });
  window.addEventListener("scroll", requestCatalogueStickySync, { passive: true });
  window.addEventListener("resize", requestCatalogueStickySync);
}

function updateSelectedFile(warehouse, file) {
  const label = document.querySelector(`[data-file-name="${warehouse}"]`);
  const zone = document.querySelector(`[data-drop="${warehouse}"]`);
  if (!label || !zone) return;
  label.textContent = file?.name || "No file chosen or drag file here";
  zone.classList.toggle("has-file", Boolean(file));
}

normalizeDefaultMaximums();
bindEvents();
installErrorMonitoring();
initializeAuth();
