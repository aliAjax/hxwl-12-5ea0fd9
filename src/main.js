import './styles.css';

const key = 'hxwl-12-plant-growth';
const careKey = 'hxwl-12-plant-care';
const seed = [
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-01', height: 12, leaves: 18, water: 80, light: 5.5, photo: '', state: '新叶展开' },
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-03', height: 13.4, leaves: 22, water: 60, light: 4.8, photo: '', state: '叶色稳定' },
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-06', height: 15.1, leaves: 27, water: 90, light: 6, photo: '', state: '侧芽明显' },
  { id: crypto.randomUUID(), plant: '迷你龟背竹', date: '2026-06-02', height: 21, leaves: 5, water: 120, light: 3.5, photo: '', state: '叶片舒展' },
  { id: crypto.randomUUID(), plant: '迷你龟背竹', date: '2026-06-06', height: 21.8, leaves: 6, water: 100, light: 4.2, photo: '', state: '长出新叶尖' },
  { id: crypto.randomUUID(), plant: '小番茄苗', date: '2026-06-04', height: 9.5, leaves: 8, water: 70, light: 7, photo: '', state: '茎秆直立' }
];

let records = JSON.parse(localStorage.getItem(key) || 'null') || seed;
let careCompleted = JSON.parse(localStorage.getItem(careKey) || 'null') || {};
let editingId = null;
let careCalendarOpen = false;
let carePlantFilter = '';
let careShowOverdue = false;

document.querySelector('#app').innerHTML = `
  <main class="shell">
    <header class="hero">
      <div>
        <p>hxwl-12 · port 5112</p>
        <h1>微型植物生长板</h1>
        <span>高度、叶片、浇水和光照的本地记录闭环</span>
      </div>
      <button id="sample">载入示例</button>
    </header>

    <section class="layout">
      <form id="form" class="panel">
        <h2>生长记录</h2>
        <input name="plant" placeholder="植物名称" required />
        <input name="date" type="date" required />
        <div class="pair">
          <input name="height" type="number" min="0" step="0.1" placeholder="高度cm" required />
          <input name="leaves" type="number" min="0" step="1" placeholder="叶片数" required />
        </div>
        <div class="pair">
          <input name="water" type="number" min="0" step="1" placeholder="浇水ml" required />
          <input name="light" type="number" min="0" step="0.1" placeholder="光照h" required />
        </div>
        <input name="photo" placeholder="状态照片链接" />
        <textarea name="state" placeholder="状态描述" required></textarea>
        <button class="primary">保存记录</button>
      </form>

      <div class="mainArea">
        <section class="summary" id="summary"></section>
        <section class="panel">
          <div class="panelHead">
            <h2>生长曲线</h2>
            <select id="plantFilter"></select>
          </div>
          <div class="chart" id="heightChart"></div>
        </section>
      </div>
    </section>

    <section class="cards">
      <div class="panel"><h2>浇水与光照</h2><div class="chart small" id="careChart"></div></div>
      <div class="panel"><h2>叶片数量</h2><div class="chart small" id="leafChart"></div></div>
    </section>

    <section class="panel">
      <div class="panelHead">
        <h2>记录列表</h2>
        <div class="careEntry">
          <button id="toggleCare" class="primary">📅 养护日历</button>
          <input id="search" placeholder="搜索植物或状态" />
        </div>
      </div>
      <div class="careCalendar" id="careCalendar" hidden>
        <div class="careFilters">
          <select id="carePlantFilter">
            <option value="">全部植物</option>
          </select>
          <label class="checkLabel"><input type="checkbox" id="careShowOverdue" /> 仅看逾期</label>
          <span class="careStats" id="careStats"></span>
        </div>
        <div class="careGrid" id="careGrid"></div>
      </div>
      <div class="records" id="records"></div>
    </section>
  </main>
`;

const form = document.querySelector('#form');
const filter = document.querySelector('#plantFilter');
const search = document.querySelector('#search');
const toggleCareBtn = document.querySelector('#toggleCare');
const careCalendar = document.querySelector('#careCalendar');
const carePlantFilterEl = document.querySelector('#carePlantFilter');
const careShowOverdueEl = document.querySelector('#careShowOverdue');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const item = { ...data, height: Number(data.height), leaves: Number(data.leaves), water: Number(data.water), light: Number(data.light), id: editingId || crypto.randomUUID() };
  records = editingId ? records.map((record) => (record.id === editingId ? item : record)) : [item, ...records];
  editingId = null;
  form.reset();
  save();
  render();
});

filter.addEventListener('change', render);
search.addEventListener('input', render);
document.querySelector('#sample').addEventListener('click', () => {
  records = seed;
  save();
  render();
});

toggleCareBtn.addEventListener('click', () => {
  careCalendarOpen = !careCalendarOpen;
  careCalendar.hidden = !careCalendarOpen;
  renderCare();
});

carePlantFilterEl.addEventListener('change', (e) => {
  carePlantFilter = e.target.value;
  renderCare();
});

careShowOverdueEl.addEventListener('change', (e) => {
  careShowOverdue = e.target.checked;
  renderCare();
});

function save() {
  localStorage.setItem(key, JSON.stringify(records));
}

function saveCare() {
  localStorage.setItem(careKey, JSON.stringify(careCompleted));
}

function getDaysDiff(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function generateCareSchedule() {
  const plantLastRecord = {};
  records.forEach((record) => {
    if (!plantLastRecord[record.plant] || record.date > plantLastRecord[record.plant].date) {
      plantLastRecord[record.plant] = record;
    }
  });

  const schedule = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  Object.entries(plantLastRecord).forEach(([plant, lastRecord]) => {
    const lastWaterDate = new Date(lastRecord.date);
    lastWaterDate.setHours(0, 0, 0, 0);
    const avgWater = lastRecord.water;
    const interval = Math.max(2, Math.round(100 / avgWater * 3));

    for (let i = -7; i <= 7; i++) {
      const scheduleDate = new Date(today);
      scheduleDate.setDate(today.getDate() + i);
      const scheduleDateStr = scheduleDate.toISOString().slice(0, 10);

      const daysSinceLastWater = Math.round((scheduleDate - lastWaterDate) / (1000 * 60 * 60 * 24));

      if (daysSinceLastWater > 0 && daysSinceLastWater % interval === 0) {
        const daysDiff = getDaysDiff(scheduleDateStr);
        const completed = careCompleted[`${plant}-${scheduleDateStr}`];
        schedule.push({
          id: `${plant}-${scheduleDateStr}`,
          plant,
          date: scheduleDateStr,
          water: avgWater,
          daysDiff,
          isOverdue: daysDiff < 0 && !completed,
          isToday: daysDiff === 0
        });
      }

      if (daysSinceLastWater === 0 && lastRecord.water > 0) {
        schedule.push({
          id: `${plant}-${scheduleDateStr}`,
          plant,
          date: scheduleDateStr,
          water: avgWater,
          daysDiff: 0,
          isOverdue: false,
          isToday: false,
          isHistory: true
        });
      }
    }
  });

  schedule.sort((a, b) => a.date.localeCompare(b.date) || a.plant.localeCompare(b.plant));
  return schedule;
}

function renderCare() {
  if (!careCalendarOpen) return;

  const plants = [...new Set(records.map((record) => record.plant))].sort();
  carePlantFilterEl.innerHTML = `<option value="">全部植物</option>${plants.map((plant) => `<option ${carePlantFilter === plant ? 'selected' : ''}>${plant}</option>`).join('')}`;
  carePlantFilterEl.value = carePlantFilter && plants.includes(carePlantFilter) ? carePlantFilter : '';
  careShowOverdueEl.checked = careShowOverdue;

  let schedule = generateCareSchedule();

  if (carePlantFilter) {
    schedule = schedule.filter((item) => item.plant === carePlantFilter);
  }

  if (careShowOverdue) {
    schedule = schedule.filter((item) => item.isOverdue);
  }

  const totalTasks = schedule.length;
  const completedCount = schedule.filter((item) => careCompleted[item.id]).length;
  const overdueCount = schedule.filter((item) => item.isOverdue).length;

  document.querySelector('#careStats').textContent = `共 ${totalTasks} 项，已完成 ${completedCount} 项，逾期 ${overdueCount} 项`;

  const byDate = {};
  schedule.forEach((item) => {
    if (!byDate[item.date]) byDate[item.date] = [];
    byDate[item.date].push(item);
  });

  const gridEl = document.querySelector('#careGrid');
  const dates = Object.keys(byDate).sort();

  if (!dates.length) {
    gridEl.innerHTML = '<p class="careEmpty">暂无养护安排</p>';
    return;
  }

  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  gridEl.innerHTML = dates.map((date) => {
    const items = byDate[date];
    const daysDiff = getDaysDiff(date);
    let dayClass = '';
    let tagText = '';
    let tagClass = '';

    if (daysDiff === 0) {
      dayClass = 'today';
      tagText = '今天';
      tagClass = 'today';
    } else if (daysDiff < 0) {
      const hasOverdue = items.some((item) => item.isOverdue);
      if (hasOverdue) {
        dayClass = 'overdue';
        tagText = '逾期';
        tagClass = 'overdue';
      } else {
        tagText = '过去';
        tagClass = 'future';
      }
    } else {
      tagText = `还有 ${daysDiff} 天`;
      tagClass = 'future';
    }

    const dateObj = new Date(date);
    const dateDisplay = `${date.slice(5)} ${weekDays[dateObj.getDay()]}`;

    return `
      <div class="careDay ${dayClass}">
        <div class="careDayHeader">
          <span class="careDayDate">${dateDisplay}</span>
          <span class="careDayTag ${tagClass}">${tagText}</span>
        </div>
        <div class="careTasks">
          ${items.map((item) => {
            const completed = careCompleted[item.id];
            return `
              <div class="careTask ${completed ? 'completed' : ''}">
                <input type="checkbox" data-care-id="${item.id}" ${completed ? 'checked' : ''} ${item.isHistory ? 'checked disabled' : ''} />
                <div class="careTaskText">
                  <span class="careTaskPlant">${item.plant}</span>
                  <br />
                  <span class="careTaskWater">浇水 ${item.water}ml ${item.isHistory ? '（已记录）' : ''}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  gridEl.querySelectorAll('[data-care-id]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const id = e.target.dataset.careId;
      careCompleted[id] = e.target.checked;
      saveCare();
      renderCare();
    });
  });
}

function render() {
  const selectedPlant = filter.value;
  const plants = [...new Set(records.map((record) => record.plant))].sort();
  filter.innerHTML = `<option value="">全部植物</option>${plants.map((plant) => `<option>${plant}</option>`).join('')}`;
  filter.value = selectedPlant && plants.includes(selectedPlant) ? selectedPlant : '';
  const scoped = records
    .filter((record) => !filter.value || record.plant === filter.value)
    .filter((record) => [record.plant, record.state].join(' ').includes(search.value.trim()))
    .sort((a, b) => a.date.localeCompare(b.date));
  document.querySelector('#summary').innerHTML = [
    ['植物数', plants.length],
    ['记录数', records.length],
    ['最高高度', `${Math.max(...records.map((record) => record.height), 0).toFixed(1)}cm`]
  ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join('');
  drawLine('#heightChart', scoped.map((record) => ({ label: record.date.slice(5), value: record.height })), 'cm', '#2f855a');
  drawMultiBars('#careChart', scoped.map((record) => ({ label: record.date.slice(5), water: record.water, light: record.light * 20 })));
  drawLine('#leafChart', scoped.map((record) => ({ label: record.date.slice(5), value: record.leaves })), '片', '#7c3aed');
  document.querySelector('#records').innerHTML = scoped.slice().reverse().map((record) => `
    <article class="record">
      <div><strong>${record.plant}</strong><span>${record.date} · ${record.height}cm · ${record.leaves}片叶</span><p>${record.state}</p></div>
      ${record.photo ? `<a href="${record.photo}" target="_blank">照片</a>` : '<span class="muted">无照片</span>'}
      <div><button data-edit="${record.id}">编辑</button><button data-del="${record.id}">删除</button></div>
    </article>
  `).join('') || '<p class="empty">暂无记录</p>';
  document.querySelectorAll('[data-del]').forEach((button) => button.addEventListener('click', () => {
    records = records.filter((record) => record.id !== button.dataset.del);
    save();
    render();
  }));
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => {
    const record = records.find((item) => item.id === button.dataset.edit);
    editingId = record.id;
    Object.entries(record).forEach(([name, value]) => {
      if (form.elements[name]) form.elements[name].value = value;
    });
  }));
  renderCare();
}

function drawLine(selector, data, unit, color) {
  const el = document.querySelector(selector);
  if (!data.length) return (el.innerHTML = '<p class="empty">暂无数据</p>');
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data.map((item, index) => `${42 + index * (420 / Math.max(data.length - 1, 1))},${178 - (item.value / max) * 132}`).join(' ');
  el.innerHTML = `<svg viewBox="0 0 500 220"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>${data.map((item, index) => `<circle cx="${42 + index * (420 / Math.max(data.length - 1, 1))}" cy="${178 - (item.value / max) * 132}" r="5" fill="${color}"/><text x="${42 + index * (420 / Math.max(data.length - 1, 1))}" y="205">${item.label}</text><text x="${42 + index * (420 / Math.max(data.length - 1, 1))}" y="${166 - (item.value / max) * 132}">${item.value}${unit}</text>`).join('')}</svg>`;
}

function drawMultiBars(selector, data) {
  const el = document.querySelector(selector);
  if (!data.length) return (el.innerHTML = '<p class="empty">暂无数据</p>');
  const max = Math.max(...data.flatMap((item) => [item.water, item.light]), 1);
  el.innerHTML = `<svg viewBox="0 0 500 220">${data.slice(-5).map((item, index) => {
    const x = 56 + index * 86;
    return `<text x="${x + 20}" y="205">${item.label}</text><rect x="${x}" y="${180 - (item.water / max) * 140}" width="18" height="${(item.water / max) * 140}" rx="4" fill="#2f855a"/><rect x="${x + 24}" y="${180 - (item.light / max) * 140}" width="18" height="${(item.light / max) * 140}" rx="4" fill="#f59e0b"/>`;
  }).join('')}<text x="372" y="28">绿=浇水 橙=光照</text></svg>`;
}

render();
