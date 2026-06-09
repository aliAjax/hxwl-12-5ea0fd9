import './styles.css';

const key = 'hxwl-12-plant-growth';
const careKey = 'hxwl-12-plant-care';
const seed = [
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-01', height: 12, leaves: 18, water: 80, light: 5.5, photo: 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?auto=format&fit=crop&w=600&q=80', state: '新叶展开，长势良好' },
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-03', height: 13.4, leaves: 22, water: 60, light: 4.8, photo: 'https://images.unsplash.com/photo-1598437279683-6384d16c32cc?auto=format&fit=crop&w=600&q=80', state: '叶色稳定，边缘锯齿清晰' },
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-06', height: 15.1, leaves: 27, water: 90, light: 6, photo: 'https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?auto=format&fit=crop&w=600&q=80', state: '侧芽明显，植株茂盛' },
  { id: crypto.randomUUID(), plant: '迷你龟背竹', date: '2026-06-02', height: 21, leaves: 5, water: 120, light: 3.5, photo: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=600&q=80', state: '叶片舒展，叶脉清晰' },
  { id: crypto.randomUUID(), plant: '迷你龟背竹', date: '2026-06-06', height: 21.8, leaves: 6, water: 100, light: 4.2, photo: '', state: '长出新叶尖，期待开裂' },
  { id: crypto.randomUUID(), plant: '小番茄苗', date: '2026-06-04', height: 9.5, leaves: 8, water: 70, light: 7, photo: '', state: '茎秆直立，子叶健康' }
];

let records = JSON.parse(localStorage.getItem(key) || 'null') || seed;
let careCompleted = JSON.parse(localStorage.getItem(careKey) || 'null') || {};
let editingId = null;
let careExpanded = true;
let careFilterPlant = '';
let careFilterStatus = 'all';
let timelinePlant = '';
let comparePhoto1 = null;
let comparePhoto2 = null;
let compareModalVisible = false;

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

    <section class="panel carePanel" id="carePanel">
      <div class="panelHead careHead">
        <div class="careTitle">
          <h2>📅 养护日历</h2>
          <span class="careBadge" id="careBadge"></span>
        </div>
        <button class="careToggle" id="careToggle">收起</button>
      </div>
      <div class="careBody" id="careBody">
        <div class="careFilters">
          <select id="carePlantFilter"></select>
          <select id="careStatusFilter">
            <option value="all">全部状态</option>
            <option value="overdue">逾期未完成</option>
            <option value="today">今日待办</option>
            <option value="upcoming">即将到来</option>
            <option value="completed">已完成</option>
          </select>
        </div>
        <div class="careContent" id="careContent"></div>
      </div>
    </section>

    <section class="panel timelinePanel">
      <div class="panelHead">
        <h2>📸 照片时间轴</h2>
        <select id="timelinePlantFilter"></select>
      </div>
      <div class="timelineContent" id="timelineContent"></div>
    </section>

    <section class="panel">
      <div class="panelHead"><h2>记录列表</h2><input id="search" placeholder="搜索植物或状态" /></div>
      <div class="records" id="records"></div>
    </section>
  </main>

  <div class="compareModal" id="compareModal" style="display: none;">
    <div class="compareModalContent">
      <div class="compareModalHead">
        <h3>照片对比</h3>
        <button class="compareClose" id="compareClose">&times;</button>
      </div>
      <div class="compareModalBody">
        <div class="compareItem" id="compareItem1">
          <div class="comparePlaceholder" id="comparePlaceholder1">点击时间轴照片选择第1张</div>
        </div>
        <div class="compareItem" id="compareItem2">
          <div class="comparePlaceholder" id="comparePlaceholder2">点击时间轴照片选择第2张</div>
        </div>
      </div>
      <div class="compareModalFoot">
        <button class="compareClear" id="compareClear">清除选择</button>
      </div>
    </div>
  </div>
`;

const form = document.querySelector('#form');
const filter = document.querySelector('#plantFilter');
const search = document.querySelector('#search');
const carePlantFilter = document.querySelector('#carePlantFilter');
const careStatusFilter = document.querySelector('#careStatusFilter');
const careToggle = document.querySelector('#careToggle');
const timelinePlantFilter = document.querySelector('#timelinePlantFilter');
const compareModal = document.querySelector('#compareModal');
const compareClose = document.querySelector('#compareClose');
const compareClear = document.querySelector('#compareClear');

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

carePlantFilter.addEventListener('change', () => {
  careFilterPlant = carePlantFilter.value;
  renderCareCalendar();
});
careStatusFilter.addEventListener('change', () => {
  careFilterStatus = careStatusFilter.value;
  renderCareCalendar();
});
careToggle.addEventListener('click', () => {
  careExpanded = !careExpanded;
  document.querySelector('#careBody').style.display = careExpanded ? 'block' : 'none';
  careToggle.textContent = careExpanded ? '收起' : '展开';
});

timelinePlantFilter.addEventListener('change', () => {
  timelinePlant = timelinePlantFilter.value;
  renderTimeline();
});

compareClose.addEventListener('click', closeCompareModal);
compareClear.addEventListener('click', clearCompareSelection);
compareModal.addEventListener('click', (e) => {
  if (e.target === compareModal) closeCompareModal();
});

function save() {
  localStorage.setItem(key, JSON.stringify(records));
}

function saveCare() {
  localStorage.setItem(careKey, JSON.stringify(careCompleted));
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(date1, date2) {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function getPlantCareInfo() {
  const today = formatDate(new Date());
  const plants = [...new Set(records.map((r) => r.plant))];
  const result = [];

  plants.forEach((plant) => {
    const plantRecords = records
      .filter((r) => r.plant === plant && r.water > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (plantRecords.length === 0) return;

    const intervals = [];
    for (let i = 1; i < plantRecords.length; i++) {
      const diff = daysBetween(plantRecords[i - 1].date, plantRecords[i].date);
      if (diff > 0) intervals.push(diff);
    }

    const avgInterval = intervals.length > 0
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : 3;

    const lastRecord = plantRecords[plantRecords.length - 1];
    const lastWaterDate = lastRecord.date;
    const avgWater = Math.round(plantRecords.reduce((a, b) => a + b.water, 0) / plantRecords.length);
    const nextWaterDate = formatDate(new Date(parseDate(lastWaterDate).getTime() + avgInterval * 24 * 60 * 60 * 1000));

    result.push({
      plant,
      lastWaterDate,
      avgInterval,
      avgWater,
      nextWaterDate,
      sourceRecordId: lastRecord.id
    });
  });

  return result;
}

function generateCareSchedule() {
  const today = formatDate(new Date());
  const todayDate = parseDate(today);
  const startDate = formatDate(new Date(todayDate.getTime() - 7 * 24 * 60 * 60 * 1000));
  const endDate = formatDate(new Date(todayDate.getTime() + 14 * 24 * 60 * 60 * 1000));

  const plantInfo = getPlantCareInfo();
  const schedule = [];

  plantInfo.forEach((info) => {
    let currentDate = info.nextWaterDate;
    let iterCount = 0;

    while (currentDate <= endDate && iterCount < 10) {
      if (currentDate >= startDate) {
        const status = getCareStatus(currentDate);
        const careId = `${info.plant}-${currentDate}`;
        schedule.push({
          id: careId,
          plant: info.plant,
          date: currentDate,
          water: info.avgWater,
          status,
          completed: careCompleted[careId] || false,
          sourceRecordId: info.sourceRecordId
        });
      }
      currentDate = formatDate(new Date(parseDate(currentDate).getTime() + info.avgInterval * 24 * 60 * 60 * 1000));
      iterCount++;
    }

    if (info.nextWaterDate < today && !careCompleted[`${info.plant}-${info.nextWaterDate}`]) {
      const exists = schedule.some((s) => s.plant === info.plant && s.date === info.nextWaterDate);
      if (!exists) {
        schedule.push({
          id: `${info.plant}-${info.nextWaterDate}`,
          plant: info.plant,
          date: info.nextWaterDate,
          water: info.avgWater,
          status: 'overdue',
          completed: false,
          sourceRecordId: info.sourceRecordId
        });
      }
    }
  });

  return schedule.sort((a, b) => a.date.localeCompare(b.date));
}

function getCareStatus(dateStr) {
  const today = formatDate(new Date());
  if (dateStr < today) return 'overdue';
  if (dateStr === today) return 'today';
  const diff = daysBetween(today, dateStr);
  if (diff <= 3) return 'upcoming';
  return 'future';
}

function getStatusLabel(status) {
  const labels = {
    overdue: { text: '逾期', class: 'status-overdue' },
    today: { text: '今日', class: 'status-today' },
    upcoming: { text: '即将', class: 'status-upcoming' },
    future: { text: '待办', class: 'status-future' },
    completed: { text: '已完成', class: 'status-completed' }
  };
  return labels[status] || labels.future;
}

function getDayOfWeek(dateStr) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days[parseDate(dateStr).getDay()];
}

function getPlantPhotoRecords() {
  const plants = [...new Set(records.map((r) => r.plant))].sort();
  const result = {};

  plants.forEach((plant) => {
    const plantRecords = records
      .filter((r) => r.plant === plant)
      .sort((a, b) => a.date.localeCompare(b.date));

    const photoRecords = plantRecords.filter((r) => r.photo && r.photo.trim() !== '');
    const totalRecords = plantRecords.length;
    const photoCount = photoRecords.length;

    result[plant] = {
      plant,
      records: plantRecords,
      photoRecords,
      totalRecords,
      photoCount,
      hasPhotos: photoCount > 0
    };
  });

  return result;
}

function renderTimeline() {
  const plantData = getPlantPhotoRecords();
  const plants = Object.keys(plantData);

  timelinePlantFilter.innerHTML = `<option value="">选择植物查看时间轴</option>${plants.map((plant) => {
    const data = plantData[plant];
    const photoInfo = data.hasPhotos ? ` (${data.photoCount}张照片)` : ' (暂无照片)';
    return `<option value="${plant}">${plant}${photoInfo}</option>`;
  }).join('')}`;

  if (timelinePlant && plants.includes(timelinePlant)) {
    timelinePlantFilter.value = timelinePlant;
  } else {
    timelinePlant = '';
  }

  const content = document.querySelector('#timelineContent');

  if (!timelinePlant) {
    content.innerHTML = `
      <div class="timelineEmpty">
        <div class="timelineEmptyIcon">🌱</div>
        <h4>选择一株植物开始查看</h4>
        <p>从上方下拉菜单中选择植物，即可查看按时间排列的生长照片和记录</p>
      </div>
    `;
    return;
  }

  const data = plantData[timelinePlant];

  if (!data.hasPhotos) {
    content.innerHTML = `
      <div class="timelineEmpty">
        <div class="timelineEmptyIcon">📷</div>
        <h4>「${timelinePlant}」暂无照片记录</h4>
        <p>在添加生长记录时上传照片链接，即可在此处查看时间轴</p>
        <div class="timelineNoPhotosList">
          <h5>已有记录（${data.totalRecords}条）：</h5>
          ${data.records.map((r) => `
            <div class="timelineNoPhotoItem">
              <span class="timelineDate">${r.date}</span>
              <span class="timelineMeta">${r.height}cm · ${r.leaves}片叶</span>
              <span class="timelineState">${r.state}</span>
              <span class="muted">无照片</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="timelineHeader">
      <div class="timelinePlantInfo">
        <h3>${timelinePlant}</h3>
        <span class="timelineStats">共 ${data.photoCount} 张照片 · ${data.totalRecords} 条记录</span>
      </div>
      <button class="compareBtn" id="openCompareBtn">开启对比模式</button>
    </div>
    <div class="timeline">
      ${data.records.map((record, index) => {
        const hasPhoto = record.photo && record.photo.trim() !== '';
        const isFirst = index === 0;
        const isLast = index === data.records.length - 1;

        return `
          <div class="timelineItem ${hasPhoto ? 'hasPhoto' : 'noPhoto'}">
            <div class="timelineLine ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}">
              <div class="timelineDot ${hasPhoto ? 'photoDot' : 'noPhotoDot'}"></div>
            </div>
            <div class="timelineCard ${hasPhoto ? 'photoCard' : 'infoCard'}">
              <div class="timelineCardHead">
                <span class="timelineDate">${record.date}</span>
                ${hasPhoto ? '<span class="photoBadge">有照片</span>' : '<span class="noPhotoBadge">无照片</span>'}
              </div>
              ${hasPhoto ? `
                <div class="timelinePhotoWrap">
                  <img 
                    src="${record.photo}" 
                    alt="${timelinePlant} - ${record.date}" 
                    class="timelinePhoto timelinePhotoClickable"
                    data-compare='${JSON.stringify({ id: record.id, date: record.date, photo: record.photo, plant: timelinePlant })}'
                  />
                  <a href="${record.photo}" target="_blank" class="photoLink">查看大图 ↗</a>
                </div>
              ` : ''}
              <div class="timelineMeta">
                <span class="metaItem">📏 ${record.height}cm</span>
                <span class="metaItem">🍃 ${record.leaves}片叶</span>
              </div>
              <p class="timelineState">${record.state}</p>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  const openCompareBtn = document.querySelector('#openCompareBtn');
  if (openCompareBtn) {
    openCompareBtn.addEventListener('click', () => {
      openCompareModal();
    });
  }

  document.querySelectorAll('.timelinePhotoClickable').forEach((img) => {
    img.addEventListener('click', () => selectForCompare(img));
  });
}

function selectForCompare(imgEl) {
  const data = JSON.parse(imgEl.dataset.compare);

  if (!comparePhoto1) {
    comparePhoto1 = data;
    imgEl.classList.add('selectedForCompare');
  } else if (!comparePhoto2) {
    comparePhoto2 = data;
    imgEl.classList.add('selectedForCompare');
  } else {
    document.querySelectorAll('.selectedForCompare').forEach((el) => {
      el.classList.remove('selectedForCompare');
    });
    comparePhoto1 = data;
    comparePhoto2 = null;
    imgEl.classList.add('selectedForCompare');
  }

  updateCompareModal();

  if (comparePhoto1 && comparePhoto2) {
    setTimeout(() => openCompareModal(), 300);
  }
}

function updateCompareModal() {
  const item1 = document.querySelector('#compareItem1');
  const item2 = document.querySelector('#compareItem2');
  const placeholder1 = document.querySelector('#comparePlaceholder1');
  const placeholder2 = document.querySelector('#comparePlaceholder2');

  if (comparePhoto1) {
    item1.innerHTML = `
      <div class="comparePhotoContainer">
        <img src="${comparePhoto1.photo}" alt="${comparePhoto1.plant} - ${comparePhoto1.date}" class="comparePhoto" />
        <div class="comparePhotoInfo">
          <div class="compareDate">${comparePhoto1.date}</div>
          <div class="comparePlant">${comparePhoto1.plant}</div>
        </div>
      </div>
    `;
  } else {
    item1.innerHTML = '<div class="comparePlaceholder" id="comparePlaceholder1">点击时间轴照片选择第1张</div>';
  }

  if (comparePhoto2) {
    item2.innerHTML = `
      <div class="comparePhotoContainer">
        <img src="${comparePhoto2.photo}" alt="${comparePhoto2.plant} - ${comparePhoto2.date}" class="comparePhoto" />
        <div class="comparePhotoInfo">
          <div class="compareDate">${comparePhoto2.date}</div>
          <div class="comparePlant">${comparePhoto2.plant}</div>
        </div>
      </div>
    `;
  } else {
    item2.innerHTML = '<div class="comparePlaceholder" id="comparePlaceholder2">点击时间轴照片选择第2张</div>';
  }
}

function openCompareModal() {
  compareModalVisible = true;
  compareModal.style.display = 'flex';
  updateCompareModal();
}

function closeCompareModal() {
  compareModalVisible = false;
  compareModal.style.display = 'none';
}

function clearCompareSelection() {
  comparePhoto1 = null;
  comparePhoto2 = null;
  document.querySelectorAll('.selectedForCompare').forEach((el) => {
    el.classList.remove('selectedForCompare');
  });
  updateCompareModal();
}

function renderCareCalendar() {
  const schedule = generateCareSchedule();
  const plants = [...new Set(records.map((r) => r.plant))].sort();

  carePlantFilter.innerHTML = `<option value="">全部植物</option>${plants.map((p) => `<option>${p}</option>`).join('')}`;
  carePlantFilter.value = plants.includes(careFilterPlant) ? careFilterPlant : '';
  careStatusFilter.value = careFilterStatus;

  const filtered = schedule.filter((item) => {
    if (careFilterPlant && item.plant !== careFilterPlant) return false;
    const displayStatus = item.completed ? 'completed' : item.status;
    if (careFilterStatus === 'all') return true;
    if (careFilterStatus === 'completed') return item.completed;
    return !item.completed && item.status === careFilterStatus;
  });

  const overdueCount = schedule.filter((s) => s.status === 'overdue' && !s.completed).length;
  const todayCount = schedule.filter((s) => s.status === 'today' && !s.completed).length;
  document.querySelector('#careBadge').textContent = overdueCount > 0 ? `${overdueCount}项逾期` : (todayCount > 0 ? `${todayCount}项今日` : '已安排');
  document.querySelector('#careBadge').className = `careBadge ${overdueCount > 0 ? 'badge-overdue' : (todayCount > 0 ? 'badge-today' : 'badge-ok')}`;

  const grouped = {};
  filtered.forEach((item) => {
    if (!grouped[item.date]) grouped[item.date] = [];
    grouped[item.date].push(item);
  });

  if (filtered.length === 0) {
    document.querySelector('#careContent').innerHTML = '<p class="empty">暂无养护安排</p>';
    return;
  }

  document.querySelector('#careContent').innerHTML = Object.entries(grouped).map(([date, items]) => {
    const dateLabel = date === formatDate(new Date()) ? '今天' : getDayOfWeek(date);
    const dateClass = items.some((i) => i.status === 'overdue' && !i.completed) ? 'date-group overdue' :
                     items.some((i) => i.status === 'today') ? 'date-group today' : 'date-group';
    return `
      <div class="${dateClass}">
        <div class="date-header">
          <span class="date-text">${date.slice(5)} ${dateLabel}</span>
          <span class="date-count">${items.length}项</span>
        </div>
        <div class="care-items">
          ${items.map((item) => {
            const status = item.completed ? 'completed' : item.status;
            const statusInfo = getStatusLabel(status);
            return `
              <div class="care-item ${item.completed ? 'item-completed' : ''}">
                <div class="care-item-main">
                  <span class="care-plant">${item.plant}</span>
                  <span class="status-tag ${statusInfo.class}">${statusInfo.text}</span>
                </div>
                <div class="care-item-detail">
                  <span class="care-water">💧 ${item.water}ml</span>
                </div>
                <div class="care-item-actions">
                  ${item.completed
                    ? `<button class="care-undo" data-undo="${item.id}">撤销</button>`
                    : `<button class="care-done" data-done="${item.id}">标记完成</button>`
                  }
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-done]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.done;
      careCompleted[id] = true;
      saveCare();
      renderCareCalendar();
    });
  });

  document.querySelectorAll('[data-undo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.undo;
      delete careCompleted[id];
      saveCare();
      renderCareCalendar();
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
  renderCareCalendar();
  renderTimeline();
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
