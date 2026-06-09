import './styles.css';

const key = 'hxwl-12-plant-growth';
const careKey = 'hxwl-12-plant-care';
const archiveKey = 'hxwl-12-plant-archive';
const goalsKey = 'hxwl-12-plant-goals';

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
let plantArchive = JSON.parse(localStorage.getItem(archiveKey) || 'null') || [];
let plantGoals = JSON.parse(localStorage.getItem(goalsKey) || 'null') || [];
let editingId = null;
let careExpanded = true;
let careFilterPlant = '';
let careFilterStatus = 'all';
let timelinePlant = '';
let comparePhoto1 = null;
let comparePhoto2 = null;
let compareModalVisible = false;
let archiveEditingId = null;
let archiveExpanded = true;
let goalEditingId = null;
let goalModalVisible = false;
let goalModalPlant = '';

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

    <section id="goalReminder" class="goalReminder" style="display: none;"></section>

    <section class="panel archivePanel" id="archivePanel">
      <div class="panelHead archiveHead">
        <div class="archiveTitle">
          <h2>🌿 植物档案</h2>
          <span class="archiveBadge" id="archiveBadge"></span>
        </div>
        <button class="archiveToggle" id="archiveToggle">收起</button>
      </div>
      <div class="archiveBody" id="archiveBody">
        <form id="archiveForm" class="archiveForm">
          <h3 id="archiveFormTitle">新增植物档案</h3>
          <div class="archiveFormGrid">
            <input name="nickname" placeholder="植物昵称 *" required />
            <input name="variety" placeholder="品种" />
            <input name="acquisitionDate" type="date" />
            <input name="location" placeholder="摆放位置" />
          </div>
          <textarea name="defaultNotes" placeholder="默认养护备注"></textarea>
          <div class="archiveFormActions">
            <button type="submit" class="primary" id="archiveSaveBtn">保存档案</button>
            <button type="button" class="archiveCancel" id="archiveCancelBtn" style="display: none;">取消</button>
          </div>
        </form>
        <div class="archiveList" id="archiveList"></div>
      </div>
    </section>

    <section class="layout">
      <form id="form" class="panel">
        <h2>生长记录</h2>
        <div class="plantSelectWrap">
          <select name="plant" id="plantSelect" required>
            <option value="">选择植物</option>
          </select>
          <button type="button" class="quickAddPlant" id="quickAddPlant" title="快速新增植物">+ 新增</button>
        </div>
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
        <div id="plantNotesHint" class="plantNotesHint" style="display: none;"></div>
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

  <div class="goalModal" id="goalModal" style="display: none;">
    <div class="goalModalContent">
      <div class="goalModalHead">
        <h3 id="goalModalTitle">设置生长目标</h3>
        <button class="goalClose" id="goalClose">&times;</button>
      </div>
      <form id="goalForm" class="goalModalBody">
        <div class="goalPlantName" id="goalPlantName"></div>
        <div class="goalFormGrid">
          <div class="goalFormItem">
            <label>目标高度 (cm)</label>
            <input name="targetHeight" type="number" min="0" step="0.1" placeholder="例如：20" required />
          </div>
          <div class="goalFormItem">
            <label>目标叶片数</label>
            <input name="targetLeaves" type="number" min="0" step="1" placeholder="例如：30" required />
          </div>
          <div class="goalFormItem">
            <label>目标日期</label>
            <input name="targetDate" type="date" required />
          </div>
        </div>
        <div class="goalCurrentInfo" id="goalCurrentInfo"></div>
        <div class="goalModalFoot">
          <button type="button" class="goalCancel" id="goalCancelBtn">取消</button>
          <button type="submit" class="primary">保存目标</button>
        </div>
      </form>
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
const archiveForm = document.querySelector('#archiveForm');
const archiveToggle = document.querySelector('#archiveToggle');
const plantSelect = document.querySelector('#plantSelect');
const quickAddPlant = document.querySelector('#quickAddPlant');
const plantNotesHint = document.querySelector('#plantNotesHint');
const archiveCancelBtn = document.querySelector('#archiveCancelBtn');
const archiveFormTitle = document.querySelector('#archiveFormTitle');
const goalModal = document.querySelector('#goalModal');
const goalClose = document.querySelector('#goalClose');
const goalForm = document.querySelector('#goalForm');
const goalCancelBtn = document.querySelector('#goalCancelBtn');
const goalModalTitle = document.querySelector('#goalModalTitle');
const goalPlantName = document.querySelector('#goalPlantName');
const goalCurrentInfo = document.querySelector('#goalCurrentInfo');

function saveArchive() {
  localStorage.setItem(archiveKey, JSON.stringify(plantArchive));
}

function saveGoals() {
  localStorage.setItem(goalsKey, JSON.stringify(plantGoals));
}

function getPlantLatestRecord(plantName) {
  const plantRecords = records
    .filter((r) => r.plant === plantName)
    .sort((a, b) => b.date.localeCompare(a.date));
  return plantRecords[0] || null;
}

function getPlantGoal(plantName) {
  return plantGoals
    .filter((g) => g.plantName === plantName)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}

function calculateGoalProgress(goal, latestRecord) {
  if (!goal || !latestRecord) return null;

  const heightProgress = goal.targetHeight > goal.startHeight
    ? Math.min(100, Math.max(0, ((latestRecord.height - goal.startHeight) / (goal.targetHeight - goal.startHeight)) * 100))
    : 100;

  const leavesProgress = goal.targetLeaves > goal.startLeaves
    ? Math.min(100, Math.max(0, ((latestRecord.leaves - goal.startLeaves) / (goal.targetLeaves - goal.startLeaves)) * 100))
    : 100;

  const overallProgress = (heightProgress + leavesProgress) / 2;

  const daysRemaining = daysBetween(formatDate(new Date()), goal.targetDate);

  const heightRemaining = Math.max(0, goal.targetHeight - latestRecord.height);
  const leavesRemaining = Math.max(0, goal.targetLeaves - latestRecord.leaves);

  const heightAchieved = latestRecord.height >= goal.targetHeight;
  const leavesAchieved = latestRecord.leaves >= goal.targetLeaves;
  const fullyAchieved = heightAchieved && leavesAchieved;

  const isOverdue = daysRemaining < 0 && !fullyAchieved;

  return {
    heightProgress,
    leavesProgress,
    overallProgress,
    daysRemaining,
    heightRemaining,
    leavesRemaining,
    heightAchieved,
    leavesAchieved,
    fullyAchieved,
    isOverdue
  };
}

function checkAndUpdateGoalAchievement(plantName) {
  const goal = getPlantGoal(plantName);
  if (!goal || goal.achieved) return;

  const latestRecord = getPlantLatestRecord(plantName);
  if (!latestRecord) return;

  const progress = calculateGoalProgress(goal, latestRecord);
  if (progress.fullyAchieved) {
    goal.achieved = true;
    goal.achievedAt = formatDate(new Date());
    saveGoals();
  }
}

function getAllGoalsSummary() {
  const plants = [...new Set(records.map((r) => r.plant))];
  let activeGoals = 0;
  let achievedGoals = 0;
  let overdueGoals = 0;
  let avgProgress = 0;

  plants.forEach((plant) => {
    const goal = getPlantGoal(plant);
    if (!goal) return;

    activeGoals++;
    if (goal.achieved) {
      achievedGoals++;
    }

    const latestRecord = getPlantLatestRecord(plant);
    const progress = calculateGoalProgress(goal, latestRecord);
    if (progress) {
      avgProgress += progress.overallProgress;
      if (progress.isOverdue) {
        overdueGoals++;
      }
    }
  });

  if (activeGoals > 0) {
    avgProgress = avgProgress / activeGoals;
  }

  return {
    totalGoals: plantGoals.length,
    activeGoals,
    achievedGoals,
    overdueGoals,
    avgProgress
  };
}

function getOverdueGoalsWithDetails() {
  const plants = [...new Set(records.map((r) => r.plant))];
  const overdue = [];

  plants.forEach((plant) => {
    const goal = getPlantGoal(plant);
    if (!goal || goal.achieved) return;

    const latestRecord = getPlantLatestRecord(plant);
    const progress = calculateGoalProgress(goal, latestRecord);

    if (progress && progress.isOverdue) {
      overdue.push({
        plantName: plant,
        goal,
        progress,
        daysOverdue: Math.abs(progress.daysRemaining)
      });
    }
  });

  return overdue;
}

function renderGoalReminder() {
  const overdueGoals = getOverdueGoalsWithDetails();
  const reminderEl = document.querySelector('#goalReminder');

  if (overdueGoals.length === 0) {
    reminderEl.style.display = 'none';
    return;
  }

  const messages = overdueGoals.map((item) => {
    const encouragement = item.daysOverdue <= 7
      ? '稍微慢了一点点，加油！'
      : item.daysOverdue <= 14
        ? '进度稍缓，调整下养护节奏吧'
        : '可以考虑调整目标或多关注一下哦';

    return `
      <div class="goalReminderItem">
        <span class="goalReminderEmoji">🌱</span>
        <span class="goalReminderText">
          <strong>${item.plantName}</strong> 的目标已过期 ${item.daysOverdue} 天，
          还差 ${item.progress.heightRemaining > 0 ? `${item.progress.heightRemaining.toFixed(1)}cm ` : ''}
          ${item.progress.leavesRemaining > 0 ? `${item.progress.leavesRemaining}片叶` : ''}。
          ${encouragement}
        </span>
      </div>
    `;
  }).join('');

  reminderEl.innerHTML = `
    <div class="goalReminderHeader">
      <span class="goalReminderTitle">⏰ 温和提示</span>
      <span class="goalReminderCount">${overdueGoals.length} 个目标已过期</span>
    </div>
    <div class="goalReminderList">${messages}</div>
  `;
  reminderEl.style.display = 'block';
}

function syncPlantsFromRecords() {
  const recordPlants = [...new Set(records.map((r) => r.plant))];
  const archivePlants = plantArchive.map((p) => p.nickname);
  let changed = false;
  recordPlants.forEach((plantName) => {
    if (!archivePlants.includes(plantName)) {
      plantArchive.push({
        id: crypto.randomUUID(),
        nickname: plantName,
        variety: '',
        acquisitionDate: '',
        location: '',
        defaultNotes: '',
        autoImported: true,
        createdAt: formatDate(new Date())
      });
      changed = true;
    }
  });
  if (changed) {
    saveArchive();
  }
}

function updatePlantSelect() {
  const plants = plantArchive
    .slice()
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
  plantSelect.innerHTML = `<option value="">选择植物</option>${plants.map((p) => `<option value="${p.nickname}">${p.nickname}${p.variety ? ` (${p.variety})` : ''}</option>`).join('')}`;
}

function showPlantNotesHint(plantName) {
  const plant = plantArchive.find((p) => p.nickname === plantName);
  if (plant && plant.defaultNotes) {
    plantNotesHint.innerHTML = `<span class="notesHintIcon">📝</span><span class="notesHintText">养护备注：${plant.defaultNotes}</span>`;
    plantNotesHint.style.display = 'block';
  } else {
    plantNotesHint.style.display = 'none';
  }
}

archiveForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(archiveForm).entries());
  if (archiveEditingId) {
    plantArchive = plantArchive.map((p) =>
      p.id === archiveEditingId ? { ...p, ...data, autoImported: false } : p
    );
  } else {
    const exists = plantArchive.find((p) => p.nickname === data.nickname);
    if (exists) {
      alert(`已存在名为「${data.nickname}」的植物档案`);
      return;
    }
    plantArchive.push({
      ...data,
      id: crypto.randomUUID(),
      autoImported: false,
      createdAt: formatDate(new Date())
    });
  }
  archiveEditingId = null;
  archiveForm.reset();
  archiveCancelBtn.style.display = 'none';
  archiveFormTitle.textContent = '新增植物档案';
  saveArchive();
  renderArchive();
  updatePlantSelect();
});

archiveCancelBtn.addEventListener('click', () => {
  archiveEditingId = null;
  archiveForm.reset();
  archiveCancelBtn.style.display = 'none';
  archiveFormTitle.textContent = '新增植物档案';
});

archiveToggle.addEventListener('click', () => {
  archiveExpanded = !archiveExpanded;
  document.querySelector('#archiveBody').style.display = archiveExpanded ? 'block' : 'none';
  archiveToggle.textContent = archiveExpanded ? '收起' : '展开';
});

plantSelect.addEventListener('change', () => {
  showPlantNotesHint(plantSelect.value);
});

quickAddPlant.addEventListener('click', () => {
  document.querySelector('#archivePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  archiveForm.elements.nickname.focus();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const item = { ...data, height: Number(data.height), leaves: Number(data.leaves), water: Number(data.water), light: Number(data.light), id: editingId || crypto.randomUUID() };
  records = editingId ? records.map((record) => (record.id === editingId ? item : record)) : [item, ...records];
  editingId = null;
  form.reset();
  plantNotesHint.style.display = 'none';
  save();
  syncPlantsFromRecords();
  checkAndUpdateGoalAchievement(data.plant);
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

function openGoalModal(plantName) {
  goalModalPlant = plantName;
  const goal = getPlantGoal(plantName);
  const latestRecord = getPlantLatestRecord(plantName);

  goalModalTitle.textContent = goal ? '编辑生长目标' : '设置生长目标';
  goalPlantName.innerHTML = `<strong>${plantName}</strong>`;

  if (latestRecord) {
    goalCurrentInfo.innerHTML = `
      <div class="goalCurrentInfoTitle">当前状态（基于最新记录 ${latestRecord.date}）</div>
      <div class="goalCurrentInfoStats">
        <span>📏 ${latestRecord.height}cm</span>
        <span>🍃 ${latestRecord.leaves}片叶</span>
      </div>
    `;
  } else {
    goalCurrentInfo.innerHTML = `
      <div class="goalCurrentInfoHint">⚠️ 该植物暂无生长记录，请先添加记录后再设置目标</div>
    `;
  }

  if (goal) {
    goalEditingId = goal.id;
    goalForm.elements.targetHeight.value = goal.targetHeight;
    goalForm.elements.targetLeaves.value = goal.targetLeaves;
    goalForm.elements.targetDate.value = goal.targetDate;
  } else {
    goalEditingId = null;
    goalForm.reset();
    if (latestRecord) {
      goalForm.elements.targetHeight.value = (latestRecord.height * 1.5).toFixed(1);
      goalForm.elements.targetLeaves.value = Math.round(latestRecord.leaves * 1.5);
    }
    const today = new Date();
    const defaultDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    goalForm.elements.targetDate.value = formatDate(defaultDate);
  }

  goalModalVisible = true;
  goalModal.style.display = 'flex';
}

function closeGoalModal() {
  goalModalVisible = false;
  goalModal.style.display = 'none';
  goalEditingId = null;
  goalModalPlant = '';
  goalForm.reset();
}

goalClose.addEventListener('click', closeGoalModal);
goalCancelBtn.addEventListener('click', closeGoalModal);
goalModal.addEventListener('click', (e) => {
  if (e.target === goalModal) closeGoalModal();
});

goalForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(goalForm).entries());
  const latestRecord = getPlantLatestRecord(goalModalPlant);

  if (!latestRecord) {
    alert('请先添加该植物的生长记录后再设置目标');
    return;
  }

  const targetHeight = Number(data.targetHeight);
  const targetLeaves = Number(data.targetLeaves);

  if (targetHeight <= latestRecord.height) {
    alert(`目标高度必须大于当前高度 ${latestRecord.height}cm`);
    return;
  }
  if (targetLeaves <= latestRecord.leaves) {
    alert(`目标叶片数必须大于当前叶片数 ${latestRecord.leaves}片`);
    return;
  }

  const today = formatDate(new Date());
  if (data.targetDate < today) {
    alert('目标日期不能早于今天');
    return;
  }

  const newGoal = {
    id: goalEditingId || crypto.randomUUID(),
    plantName: goalModalPlant,
    targetHeight,
    targetLeaves,
    targetDate: data.targetDate,
    createdAt: today,
    achieved: false,
    achievedAt: null,
    startHeight: latestRecord.height,
    startLeaves: latestRecord.leaves
  };

  if (goalEditingId) {
    plantGoals = plantGoals.map((g) => (g.id === goalEditingId ? newGoal : g));
  } else {
    plantGoals.push(newGoal);
  }

  saveGoals();
  checkAndUpdateGoalAchievement(goalModalPlant);
  closeGoalModal();
  render();
});

function renderArchive() {
  const autoImportedCount = plantArchive.filter((p) => p.autoImported).length;
  const totalCount = plantArchive.length;
  document.querySelector('#archiveBadge').textContent = `共 ${totalCount} 株${autoImportedCount > 0 ? ` · ${autoImportedCount} 株待完善` : ''}`;
  document.querySelector('#archiveBadge').className = `archiveBadge ${autoImportedCount > 0 ? 'badge-pending' : 'badge-ok'}`;

  const sorted = plantArchive.slice().sort((a, b) => {
    if (a.autoImported && !b.autoImported) return -1;
    if (!a.autoImported && b.autoImported) return 1;
    return a.nickname.localeCompare(b.nickname);
  });

  const archiveList = document.querySelector('#archiveList');
  if (sorted.length === 0) {
    archiveList.innerHTML = '<p class="empty">暂无植物档案，添加第一株植物开始记录吧</p>';
    return;
  }

  archiveList.innerHTML = sorted.map((plant) => {
    const recordCount = records.filter((r) => r.plant === plant.nickname).length;
    const goal = getPlantGoal(plant.nickname);
    const latestRecord = getPlantLatestRecord(plant.nickname);
    const progress = calculateGoalProgress(goal, latestRecord);

    let goalSection = '';
    if (goal) {
      const statusClass = goal.achieved ? 'goal-achieved' : (progress && progress.isOverdue ? 'goal-overdue' : 'goal-active');
      const statusText = goal.achieved ? '🎉 已达成' : (progress && progress.isOverdue ? '⏰ 已过期' : '🎯 进行中');
      const progressPercent = progress ? progress.overallProgress.toFixed(0) : 0;
      const daysText = progress && progress.daysRemaining >= 0
        ? `剩余 ${progress.daysRemaining} 天`
        : (progress && progress.daysRemaining < 0 ? `已过期 ${Math.abs(progress.daysRemaining)} 天` : '');

      goalSection = `
        <div class="plantGoalSection ${statusClass}">
          <div class="plantGoalHeader">
            <span class="goalStatusTag ${statusClass}">${statusText}</span>
            <span class="goalTargetInfo">
              目标: ${goal.targetHeight}cm · ${goal.targetLeaves}片叶 · ${goal.targetDate.slice(5)}
            </span>
          </div>
          <div class="goalProgressBar">
            <div class="goalProgressFill" style="width: ${progressPercent}%"></div>
          </div>
          <div class="goalProgressInfo">
            <span>完成度: ${progressPercent}%</span>
            <span>${daysText}</span>
          </div>
          ${progress && !goal.achieved ? `
            <div class="goalRemainingInfo">
              还需: ${progress.heightRemaining > 0 ? `${progress.heightRemaining.toFixed(1)}cm ` : ''}
              ${progress.leavesRemaining > 0 ? `${progress.leavesRemaining}片叶` : ''}
              ${progress.heightRemaining === 0 && progress.leavesRemaining === 0 ? '目标已达成！' : ''}
            </div>
          ` : ''}
          ${goal.achieved && goal.achievedAt ? `
            <div class="goalAchievedInfo">
              ✨ 于 ${goal.achievedAt} 达成目标
            </div>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="archiveCard ${plant.autoImported ? 'auto-imported' : ''}">
        <div class="archiveCardHead">
          <div class="archivePlantName">
            <strong>${plant.nickname}</strong>
            ${plant.variety ? `<span class="archiveVariety">${plant.variety}</span>` : ''}
            ${plant.autoImported ? '<span class="autoImportedTag">待完善</span>' : ''}
          </div>
          <div class="archiveRecordCount">${recordCount} 条记录</div>
        </div>
        <div class="archiveCardBody">
          ${plant.acquisitionDate ? `<div class="archiveInfoItem"><span class="archiveInfoLabel">入手日期</span><span>${plant.acquisitionDate}</span></div>` : ''}
          ${plant.location ? `<div class="archiveInfoItem"><span class="archiveInfoLabel">摆放位置</span><span>${plant.location}</span></div>` : ''}
          ${plant.defaultNotes ? `<div class="archiveInfoItem"><span class="archiveInfoLabel">养护备注</span><span>${plant.defaultNotes}</span></div>` : ''}
          ${goalSection}
          ${plant.autoImported && !plant.acquisitionDate && !plant.location && !plant.defaultNotes ? '<div class="archiveHint">点击「完善信息」补充植物详情</div>' : ''}
        </div>
        <div class="archiveCardActions">
          <button class="archiveEditBtn" data-archive-edit="${plant.id}">${plant.autoImported ? '完善信息' : '编辑'}</button>
          <button class="archiveGoalBtn" data-archive-goal="${plant.nickname}">${goal ? '编辑目标' : '设置目标'}</button>
          <button class="archiveDelBtn" data-archive-del="${plant.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-archive-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plant = plantArchive.find((p) => p.id === btn.dataset.archiveEdit);
      if (plant) {
        archiveEditingId = plant.id;
        archiveForm.elements.nickname.value = plant.nickname;
        archiveForm.elements.variety.value = plant.variety || '';
        archiveForm.elements.acquisitionDate.value = plant.acquisitionDate || '';
        archiveForm.elements.location.value = plant.location || '';
        archiveForm.elements.defaultNotes.value = plant.defaultNotes || '';
        archiveCancelBtn.style.display = 'inline-block';
        archiveFormTitle.textContent = '编辑植物档案';
        archiveForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  document.querySelectorAll('[data-archive-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plant = plantArchive.find((p) => p.id === btn.dataset.archiveDel);
      if (plant) {
        const recordCount = records.filter((r) => r.plant === plant.nickname).length;
        let confirmMsg = `确定要删除「${plant.nickname}」的档案吗？`;
        if (recordCount > 0) {
          confirmMsg += `\n\n该植物有 ${recordCount} 条生长记录，删除档案后这些记录仍会保留，但该植物将从下拉选择中消失。`;
        }
        if (confirm(confirmMsg)) {
          plantArchive = plantArchive.filter((p) => p.id !== btn.dataset.archiveDel);
          saveArchive();
          renderArchive();
          updatePlantSelect();
        }
      }
    });
  });

  document.querySelectorAll('[data-archive-goal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plantName = btn.dataset.archiveGoal;
      openGoalModal(plantName);
    });
  });
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
  syncPlantsFromRecords();
  updatePlantSelect();
  renderGoalReminder();
  renderArchive();

  const selectedPlant = filter.value;
  const plants = [...new Set(records.map((record) => record.plant))].sort();
  filter.innerHTML = `<option value="">全部植物</option>${plants.map((plant) => `<option>${plant}</option>`).join('')}`;
  filter.value = selectedPlant && plants.includes(selectedPlant) ? selectedPlant : '';
  const scoped = records
    .filter((record) => !filter.value || record.plant === filter.value)
    .filter((record) => [record.plant, record.state].join(' ').includes(search.value.trim()))
    .sort((a, b) => a.date.localeCompare(b.date));
  const goalsSummary = getAllGoalsSummary();
  const goalItems = [];
  if (goalsSummary.activeGoals > 0) {
    goalItems.push(['进行中目标', goalsSummary.activeGoals]);
    goalItems.push(['平均完成度', `${goalsSummary.avgProgress.toFixed(0)}%`]);
    if (goalsSummary.achievedGoals > 0) {
      goalItems.push(['已达成', goalsSummary.achievedGoals]);
    }
    if (goalsSummary.overdueGoals > 0) {
      goalItems.push(['已过期', goalsSummary.overdueGoals]);
    }
  }

  const summaryItems = [
    ['植物数', plants.length],
    ['记录数', records.length],
    ['最高高度', `${Math.max(...records.map((record) => record.height), 0).toFixed(1)}cm`],
    ...goalItems
  ];

  document.querySelector('#summary').innerHTML = summaryItems.map(([label, value]) => {
    let extraClass = '';
    if (label === '已过期') extraClass = 'summary-warning';
    if (label === '已达成') extraClass = 'summary-success';
    if (label === '平均完成度') extraClass = 'summary-progress';
    return `<article class="${extraClass}"><span>${label}</span><strong>${value}</strong></article>`;
  }).join('');
  const selectedPlantForGoal = filter.value;
  let heightGoal = null;
  let leafGoal = null;
  if (selectedPlantForGoal) {
    const goal = getPlantGoal(selectedPlantForGoal);
    if (goal) {
      const latestRecord = getPlantLatestRecord(selectedPlantForGoal);
      const progress = calculateGoalProgress(goal, latestRecord);
      heightGoal = {
        target: goal.targetHeight,
        targetDate: goal.targetDate.slice(5),
        achieved: goal.achieved,
        isOverdue: progress ? progress.isOverdue : false
      };
      leafGoal = {
        target: goal.targetLeaves,
        targetDate: goal.targetDate.slice(5),
        achieved: goal.achieved,
        isOverdue: progress ? progress.isOverdue : false
      };
    }
  }

  drawLine('#heightChart', scoped.map((record) => ({ label: record.date.slice(5), value: record.height })), 'cm', '#2f855a', heightGoal);
  drawMultiBars('#careChart', scoped.map((record) => ({ label: record.date.slice(5), water: record.water, light: record.light * 20 })));
  drawLine('#leafChart', scoped.map((record) => ({ label: record.date.slice(5), value: record.leaves })), '片', '#7c3aed', leafGoal);
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
      if (form.elements[name]) {
        form.elements[name].value = value;
        if (name === 'plant') {
          showPlantNotesHint(value);
        }
      }
    });
  }));
  renderCareCalendar();
  renderTimeline();
}

function drawLine(selector, data, unit, color, goal) {
  const el = document.querySelector(selector);
  if (!data.length) return (el.innerHTML = '<p class="empty">暂无数据</p>');

  let max = Math.max(...data.map((item) => item.value), 1);
  if (goal && goal.target > max) {
    max = goal.target;
  }

  const points = data.map((item, index) => `${42 + index * (420 / Math.max(data.length - 1, 1))},${178 - (item.value / max) * 132}`).join(' ');

  let goalSvg = '';
  if (goal) {
    const goalY = 178 - (goal.target / max) * 132;
    const goalLineStyle = goal.achieved
      ? 'stroke="#16a34a" stroke-dasharray="0"'
      : goal.isOverdue
        ? 'stroke="#d97706" stroke-dasharray="6,4"'
        : 'stroke="#7c3aed" stroke-dasharray="6,4"';
    const goalLabelColor = goal.achieved ? '#16a34a' : (goal.isOverdue ? '#d97706' : '#7c3aed');
    const goalStatusText = goal.achieved ? '✓ 已达成' : (goal.isOverdue ? '⏰ 已过期' : '🎯 目标');

    goalSvg = `
      <line x1="42" y1="${goalY}" x2="462" y2="${goalY}" ${goalLineStyle} stroke-width="2"/>
      <rect x="462" y="${goalY - 18}" width="110" height="28" rx="4" fill="${goalLabelColor}" opacity="0.1"/>
      <rect x="462" y="${goalY - 18}" width="110" height="28" rx="4" fill="none" stroke="${goalLabelColor}" stroke-width="1"/>
      <text x="517" y="${goalY}" text-anchor="middle" fill="${goalLabelColor}" font-size="11" font-weight="600">${goalStatusText}</text>
      <text x="517" y="${goalY + 10}" text-anchor="middle" fill="${goalLabelColor}" font-size="10">${goal.target}${unit} · ${goal.targetDate}</text>
    `;
  }

  el.innerHTML = `<svg viewBox="0 0 600 220"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>${goalSvg}${data.map((item, index) => `<circle cx="${42 + index * (420 / Math.max(data.length - 1, 1))}" cy="${178 - (item.value / max) * 132}" r="5" fill="${color}"/><text x="${42 + index * (420 / Math.max(data.length - 1, 1))}" y="205">${item.label}</text><text x="${42 + index * (420 / Math.max(data.length - 1, 1))}" y="${166 - (item.value / max) * 132}">${item.value}${unit}</text>`).join('')}</svg>`;
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
