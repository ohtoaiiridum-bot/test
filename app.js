const STORAGE_KEY = "gamelist.v1";
const CATEGORIES = [
  { id: "planned", name: "计划中" },
  { id: "liked", name: "好玩" },
  { id: "disliked", name: "不好玩" },
];

const state = {
  games: [],
  query: "",
  hideDupesInMain: true,
  editingId: null,
};

const els = {
  board: document.getElementById("board"),
  dupes: document.getElementById("dupes"),
  dupeGroups: document.getElementById("dupe-groups"),
  similar: document.getElementById("similar"),
  similarGroups: document.getElementById("similar-groups"),
  stats: document.getElementById("stats"),
  search: document.getElementById("search"),
  hideDupes: document.getElementById("hide-dupes"),
  editor: document.getElementById("editor"),
  form: document.getElementById("editor-form"),
  editorTitle: document.getElementById("editor-title"),
  toast: document.getElementById("toast"),
};

function cloneSeed() {
  return (window.SEED_GAMES || []).map((game) => ({ ...game }));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneSeed();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneSeed();
    return parsed.map((game, index) => ({
      id: String(game.id || `g${index + 1}`),
      title: String(game.title || "").trim(),
      note: String(game.note || "").trim(),
      category: CATEGORIES.some((item) => item.id === game.category)
        ? game.category
        : "planned",
    })).filter((game) => game.title);
  } catch {
    return cloneSeed();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.games));
}

function uid() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function categoryName(id) {
  return CATEGORIES.find((item) => item.id === id)?.name || id;
}

function normalizeTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/[（）()【】\[\].,，。!！?？:：·\-—_]/g, "")
    .replace(/\s+/g, "");
}

function matchesQuery(game, query) {
  if (!query) return true;
  const hay = `${game.title} ${game.note}`.toLowerCase();
  return hay.includes(query);
}

function exactDuplicateGroups(games) {
  const groups = new Map();
  for (const game of games) {
    const key = normalizeTitle(game.title);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(game);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarGroups(games) {
  const unique = [];
  const seen = new Set();
  for (const game of games) {
    const key = normalizeTitle(game.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({ key, title: game.title });
  }

  const used = new Set();
  const groups = [];
  for (let i = 0; i < unique.length; i += 1) {
    if (used.has(unique[i].key)) continue;
    const cluster = [unique[i]];
    for (let j = i + 1; j < unique.length; j += 1) {
      if (used.has(unique[j].key)) continue;
      const a = unique[i].key;
      const b = unique[j].key;
      const maxLen = Math.max(a.length, b.length);
      const dist = levenshtein(a, b);
      const close = maxLen >= 7 && dist <= 2;
      if (close) cluster.push(unique[j]);
    }
    if (cluster.length > 1) {
      cluster.forEach((item) => used.add(item.key));
      groups.push(
        cluster.flatMap((item) =>
          games.filter((game) => normalizeTitle(game.title) === item.key)
        )
      );
    }
  }
  return groups;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 1800);
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toMarkdown(games) {
  const blocks = ["# 游戏概述", ""];
  for (const category of CATEGORIES) {
    blocks.push(`## ${category.name}`, "");
    games
      .filter((game) => game.category === category.id)
      .forEach((game) => {
        blocks.push(game.note ? `${game.title} ${game.note}` : game.title);
        blocks.push("");
      });
  }
  return blocks.join("\n").trim() + "\n";
}

function fillCategorySelect(select, current) {
  select.innerHTML = CATEGORIES.map(
    (category) =>
      `<option value="${category.id}" ${category.id === current ? "selected" : ""}>${category.name}</option>`
  ).join("");
}

function openEditor(game) {
  state.editingId = game?.id || null;
  els.editorTitle.textContent = game?.id ? "编辑游戏" : "添加游戏";
  els.form.title.value = game?.title || "";
  els.form.note.value = game?.note || "";
  fillCategorySelect(els.form.category, game?.category || "planned");
  els.editor.showModal();
  els.form.title.focus();
}

function upsertFromForm(event) {
  event.preventDefault();
  const title = els.form.title.value.trim();
  const note = els.form.note.value.trim();
  const category = els.form.category.value;
  if (!title) return;

  if (state.editingId) {
    state.games = state.games.map((game) =>
      game.id === state.editingId ? { ...game, title, note, category } : game
    );
    toast("已更新");
  } else {
    state.games.push({ id: uid(), title, note, category });
    toast("已添加");
  }
  save();
  els.editor.close();
  render();
}

function removeGame(id) {
  const game = state.games.find((item) => item.id === id);
  if (!game) return;
  if (!confirm(`删除「${game.title}」？`)) return;
  state.games = state.games.filter((item) => item.id !== id);
  save();
  toast("已删除");
  render();
}

function moveGame(id, category) {
  state.games = state.games.map((game) =>
    game.id === id ? { ...game, category } : game
  );
  save();
  render();
}

function keepOnly(id, groupIds) {
  const keep = state.games.find((game) => game.id === id);
  state.games = state.games.filter((game) => !groupIds.includes(game.id) || game.id === id);
  save();
  toast(`已只保留「${keep.title}」`);
  render();
}

function keepFirstInGroups(groups) {
  const remove = new Set();
  groups.forEach((group) => {
    group.slice(1).forEach((game) => remove.add(game.id));
  });
  if (!remove.size) return;
  if (!confirm(`将删除 ${remove.size} 条重复记录，每组只留第一条。继续？`)) return;
  state.games = state.games.filter((game) => !remove.has(game.id));
  save();
  toast("已按组去重");
  render();
}

function duplicateIdSet(groups) {
  return new Set(groups.flatMap((group) => group.map((game) => game.id)));
}

function renderStats(dupes) {
  const counts = CATEGORIES.map(
    (category) => `${category.name} ${state.games.filter((game) => game.category === category.id).length}`
  );
  const extra = dupes.length ? ` · 重复组 ${dupes.length}` : " · 无完全重复";
  els.stats.textContent = `共 ${state.games.length} 款 · ${counts.join(" · ")}${extra}`;
}

function actionButtons(game, extra = "") {
  const moves = CATEGORIES.filter((category) => category.id !== game.category)
    .map(
      (category) =>
        `<button type="button" class="btn tiny" data-move="${game.id}" data-category="${category.id}">移到${category.name}</button>`
    )
    .join("");
  return `
    <div class="item-actions">
      <button type="button" class="btn tiny" data-edit="${game.id}">编辑</button>
      ${moves}
      <button type="button" class="btn tiny danger" data-delete="${game.id}">删除</button>
      ${extra}
    </div>
  `;
}

function gameCard(game, { duplicate = false } = {}) {
  const note = game.note ? `<span class="note">${escapeHtml(game.note)}</span>` : "";
  const badge = duplicate ? `<span class="badge dupe">重复</span>` : "";
  return `
    <article class="item" draggable="true" data-id="${game.id}">
      <h3 class="item-title">${escapeHtml(game.title)} ${note} ${badge}</h3>
      ${actionButtons(game)}
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderDupes(dupes, similar) {
  const query = state.query;
  const visibleDupes = dupes
    .map((group) => group.filter((game) => matchesQuery(game, query)))
    .filter((group) => group.length);

  if (!dupes.length && !similar.length) {
    els.dupes.hidden = true;
    return;
  }

  els.dupes.hidden = false;
  document.getElementById("keep-first-all").hidden = !dupes.length;
  if (!visibleDupes.length && query) {
    els.dupeGroups.innerHTML = `<p class="empty">没有匹配搜索的重复项</p>`;
  } else {
    els.dupeGroups.innerHTML = visibleDupes
      .map((group) => {
        const ids = group.map((game) => game.id);
        const copies = group
          .map(
            (game) => `
              <div class="copy">
                <div>
                  <strong>${escapeHtml(game.title)}</strong>
                  ${game.note ? `<span class="note">${escapeHtml(game.note)}</span>` : ""}
                  <div class="count">${categoryName(game.category)}</div>
                </div>
                <div class="dupe-actions">
                  <button type="button" class="btn tiny primary" data-keep="${game.id}" data-group="${ids.join(",")}">只留这条</button>
                  <button type="button" class="btn tiny" data-edit="${game.id}">编辑</button>
                  <button type="button" class="btn tiny danger" data-delete="${game.id}">删除</button>
                </div>
              </div>
            `
          )
          .join("");
        return `
          <article class="dupe-card">
            <div class="dupe-title">
              <h3>${escapeHtml(group[0].title)}</h3>
              <span class="count">${group.length} 条</span>
            </div>
            <div class="copies">${copies}</div>
          </article>
        `;
      })
      .join("");
  }

  const visibleSimilar = similar
    .map((group) => group.filter((game) => matchesQuery(game, query)))
    .filter((group) => group.length > 1);

  if (!visibleSimilar.length) {
    els.similar.hidden = true;
    els.similarGroups.innerHTML = "";
    return;
  }

  els.similar.hidden = false;
  els.similarGroups.innerHTML = visibleSimilar
    .map((group) => {
      const names = [...new Set(group.map((game) => game.title))].join(" / ");
      const copies = group
        .map(
          (game) => `
            <div class="copy">
              <div>
                <strong>${escapeHtml(game.title)}</strong>
                ${game.note ? `<span class="note">${escapeHtml(game.note)}</span>` : ""}
                <div class="count">${categoryName(game.category)}</div>
              </div>
              ${actionButtons(game)}
            </div>
          `
        )
        .join("");
      return `
        <article class="similar-card">
          <div class="dupe-title">
            <h3>${escapeHtml(names)}</h3>
            <span class="count">近似 ${group.length} 条</span>
          </div>
          <div class="copies">${copies}</div>
        </article>
      `;
    })
    .join("");
}

function renderBoard(dupes) {
  const query = state.query;
  const dupeIds = duplicateIdSet(dupes);
  els.board.innerHTML = CATEGORIES.map((category) => {
    const games = state.games.filter((game) => {
      if (game.category !== category.id) return false;
      if (!matchesQuery(game, query)) return false;
      if (state.hideDupesInMain && dupeIds.has(game.id)) return false;
      return true;
    });
    const cards = games.length
      ? games.map((game) => gameCard(game, { duplicate: dupeIds.has(game.id) })).join("")
      : `<p class="empty">${query ? "没有匹配项" : "还没有游戏"}</p>`;
    const hiddenCount = state.hideDupesInMain
      ? state.games.filter((game) => game.category === category.id && dupeIds.has(game.id)).length
      : 0;
    const hiddenHint = hiddenCount ? ` · 重复已移出 ${hiddenCount}` : "";
    return `
      <section class="col ${category.id}" data-category="${category.id}">
        <div class="col-head">
          <div>
            <h2>${category.name}</h2>
            <p class="count">${games.length} 款${hiddenHint}</p>
          </div>
          <button type="button" class="btn tiny" data-add="${category.id}">添加</button>
        </div>
        <div class="list">${cards}</div>
      </section>
    `;
  }).join("");
}

function bindDrag() {
  let draggingId = null;
  els.board.querySelectorAll(".item").forEach((item) => {
    item.addEventListener("dragstart", () => {
      draggingId = item.dataset.id;
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      draggingId = null;
      item.classList.remove("dragging");
    });
  });
  els.board.querySelectorAll(".col").forEach((col) => {
    col.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    col.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!draggingId) return;
      moveGame(draggingId, col.dataset.category);
      toast("已移动分类");
    });
  });
}

function render() {
  const dupes = exactDuplicateGroups(state.games);
  const similar = similarGroups(state.games).filter((group) => {
    const keys = new Set(group.map((game) => normalizeTitle(game.title)));
    return keys.size > 1;
  });
  renderStats(dupes);
  renderDupes(dupes, similar);
  renderBoard(dupes);
  bindDrag();
}

function onClick(event) {
  const keep = event.target.closest("[data-keep]");
  if (keep) {
    keepOnly(keep.dataset.keep, keep.dataset.group.split(","));
    return;
  }
  const edit = event.target.closest("[data-edit]");
  if (edit) {
    openEditor(state.games.find((game) => game.id === edit.dataset.edit));
    return;
  }
  const remove = event.target.closest("[data-delete]");
  if (remove) {
    removeGame(remove.dataset.delete);
    return;
  }
  const move = event.target.closest("[data-move]");
  if (move) {
    moveGame(move.dataset.move, move.dataset.category);
    toast("已移动分类");
    return;
  }
  const add = event.target.closest("[data-add]");
  if (add) {
    openEditor({ category: add.dataset.add });
  }
}

function exportMarkdown() {
  download("GameList.md", toMarkdown(state.games), "text/markdown");
}

function exportJson() {
  download("GameList.json", JSON.stringify(state.games, null, 2), "application/json");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error("not array");
      state.games = parsed.map((game, index) => ({
        id: String(game.id || uid()),
        title: String(game.title || "").trim(),
        note: String(game.note || "").trim(),
        category: CATEGORIES.some((item) => item.id === game.category)
          ? game.category
          : "planned",
      })).filter((game) => game.title);
      save();
      render();
      toast("导入完成");
    } catch {
      toast("导入失败，请检查 JSON");
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm("恢复成最初的 Markdown 列表？当前改动会丢掉。")) return;
  state.games = cloneSeed();
  save();
  render();
  toast("已恢复原文");
}

function init() {
  fillCategorySelect(els.form.category, "planned");
  state.games = load();
  state.hideDupesInMain = els.hideDupes.checked;
  render();

  els.search.addEventListener("input", () => {
    state.query = els.search.value.trim().toLowerCase();
    render();
  });
  els.hideDupes.addEventListener("change", () => {
    state.hideDupesInMain = els.hideDupes.checked;
    render();
  });
  document.getElementById("add-game").addEventListener("click", () => openEditor());
  document.getElementById("cancel-edit").addEventListener("click", () => els.editor.close());
  els.form.addEventListener("submit", upsertFromForm);
  document.body.addEventListener("click", onClick);
  document.getElementById("keep-first-all").addEventListener("click", () => {
    keepFirstInGroups(exactDuplicateGroups(state.games));
  });
  document.getElementById("export-md").addEventListener("click", exportMarkdown);
  document.getElementById("export-json").addEventListener("click", exportJson);
  document.getElementById("import-json").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importJson(file);
    event.target.value = "";
  });
  document.getElementById("reset-data").addEventListener("click", resetData);
}

init();
