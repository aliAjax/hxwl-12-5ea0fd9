import './styles.css';

const key = 'hxwl-12-plant-growth';
const careKey = 'hxwl-12-plant-care';
const archiveKey = 'hxwl-12-plant-archive';
const goalsKey = 'hxwl-12-plant-goals';
const experimentsKey = 'hxwl-12-experiments';

const LOCAL_IMAGE_PREFIX = 'local-image://';
const DB_NAME = 'hxwl-12-photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

const PhotoStorage = {
  db: null,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('recordId', 'recordId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  },

  async save(photoData) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({
        id: photoData.id,
        recordId: photoData.recordId,
        data: photoData.data,
        thumbnail: photoData.thumbnail,
        type: photoData.type,
        size: photoData.size,
        createdAt: photoData.createdAt || Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async deleteByRecordId(recordId) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('recordId');
      const request = index.openCursor(IDBKeyRange.only(recordId));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getAll() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async clearOrphanedPhotos(activeRecordIds) {
    const allPhotos = await this.getAll();
    const activeIds = new Set(activeRecordIds);
    const deleted = [];
    for (const photo of allPhotos) {
      if (photo.recordId && !activeIds.has(photo.recordId)) {
        await this.delete(photo.id);
        deleted.push(photo.id);
      }
    }
    return deleted;
  }
};

const ImageCompressor = {
  async compress(file, options = {}) {
    const {
      maxWidth = 1200,
      maxHeight = 1200,
      quality = 0.8,
      thumbnailMaxWidth = 200,
      thumbnailMaxHeight = 200,
      thumbnailQuality = 0.7
    } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const thumbCanvas = document.createElement('canvas');

          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressedData = canvas.toDataURL('image/jpeg', quality);

          let thumbWidth = img.width;
          let thumbHeight = img.height;
          if (thumbWidth > thumbnailMaxWidth || thumbHeight > thumbnailMaxHeight) {
            const thumbRatio = Math.min(thumbnailMaxWidth / thumbWidth, thumbnailMaxHeight / thumbHeight);
            thumbWidth = Math.round(thumbWidth * thumbRatio);
            thumbHeight = Math.round(thumbHeight * thumbRatio);
          }

          thumbCanvas.width = thumbWidth;
          thumbCanvas.height = thumbHeight;
          const thumbCtx = thumbCanvas.getContext('2d');
          thumbCtx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
          const thumbnailData = thumbCanvas.toDataURL('image/jpeg', thumbnailQuality);

          const originalSize = file.size;
          const compressedSize = Math.round((compressedData.length - 'data:image/jpeg;base64,'.length) * 0.75);

          resolve({
            data: compressedData,
            thumbnail: thumbnailData,
            type: 'image/jpeg',
            originalSize,
            compressedSize,
            compressionRatio: ((1 - compressedSize / originalSize) * 100).toFixed(1)
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};

const PhotoManager = {
  isLocalImage(photoUrl) {
    return photoUrl && photoUrl.startsWith(LOCAL_IMAGE_PREFIX);
  },

  getImageId(photoUrl) {
    if (this.isLocalImage(photoUrl)) {
      return photoUrl.slice(LOCAL_IMAGE_PREFIX.length);
    }
    return null;
  },

  buildLocalUrl(imageId) {
    return `${LOCAL_IMAGE_PREFIX}${imageId}`;
  },

  async getImageUrl(photoUrl) {
    if (!photoUrl) return null;
    if (!this.isLocalImage(photoUrl)) return photoUrl;

    const imageId = this.getImageId(photoUrl);
    const photo = await PhotoStorage.get(imageId);
    if (photo) {
      return photo.data;
    }
    return null;
  },

  async getThumbnailUrl(photoUrl) {
    if (!photoUrl) return null;
    if (!this.isLocalImage(photoUrl)) return photoUrl;

    const imageId = this.getImageId(photoUrl);
    const photo = await PhotoStorage.get(imageId);
    if (photo) {
      return photo.thumbnail || photo.data;
    }
    return null;
  },

  async handleFileUpload(file, recordId) {
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('请选择图片文件');
    }

    const compressed = await ImageCompressor.compress(file);
    const imageId = crypto.randomUUID();

    await PhotoStorage.save({
      id: imageId,
      recordId: recordId,
      data: compressed.data,
      thumbnail: compressed.thumbnail,
      type: compressed.type,
      size: compressed.compressedSize,
      createdAt: Date.now()
    });

    return {
      url: this.buildLocalUrl(imageId),
      imageId,
      ...compressed
    };
  },

  async deleteByPhotoUrl(photoUrl) {
    if (this.isLocalImage(photoUrl)) {
      const imageId = this.getImageId(photoUrl);
      if (imageId) {
        await PhotoStorage.delete(imageId);
      }
    }
  },

  async deleteByRecordId(recordId) {
    await PhotoStorage.deleteByRecordId(recordId);
  },

  async cleanupOrphanedPhotos() {
    const activeRecordIds = new Set();
    records.forEach(r => {
      if (r.id) activeRecordIds.add(r.id);
    });
    return await PhotoStorage.clearOrphanedPhotos(activeRecordIds);
  }
};

let pendingPhotoUpload = null;
let photoRemovedByUser = false;

PhotoStorage.init()
  .then(() => {
    return PhotoManager.cleanupOrphanedPhotos();
  })
  .then(deleted => {
    if (deleted && deleted.length > 0) {
      console.log(`清理了 ${deleted.length} 张孤立照片`);
    }
  })
  .catch(err => console.warn('PhotoStorage init/cleanup failed:', err));

const seed = [
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-01', height: 12, leaves: 18, water: 80, light: 5.5, photo: 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?auto=format&fit=crop&w=600&q=80', state: '新叶展开，长势良好' },
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-03', height: 13.4, leaves: 22, water: 60, light: 4.8, photo: 'https://images.unsplash.com/photo-1598437279683-6384d16c32cc?auto=format&fit=crop&w=600&q=80', state: '叶色稳定，边缘锯齿清晰' },
  { id: crypto.randomUUID(), plant: '窗台薄荷', date: '2026-06-06', height: 15.1, leaves: 27, water: 90, light: 6, photo: 'https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?auto=format&fit=crop&w=600&q=80', state: '侧芽明显，植株茂盛' },
  { id: crypto.randomUUID(), plant: '迷你龟背竹', date: '2026-06-02', height: 21, leaves: 5, water: 120, light: 3.5, photo: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=600&q=80', state: '叶片舒展，叶脉清晰' },
  { id: crypto.randomUUID(), plant: '迷你龟背竹', date: '2026-06-06', height: 21.8, leaves: 6, water: 100, light: 4.2, photo: '', state: '长出新叶尖，期待开裂' },
  { id: crypto.randomUUID(), plant: '小番茄苗', date: '2026-06-04', height: 9.5, leaves: 8, water: 70, light: 7, photo: '', state: '茎秆直立，子叶健康' }
];

function migratePlantArchiveData(archive) {
  return archive.map((plant) => ({
    waterIntervalDays: null,
    waterAmount: null,
    lightMin: null,
    lightMax: null,
    defaultNotes: '',
    ...plant
  }));
}

let records = JSON.parse(localStorage.getItem(key) || 'null') || seed;
let careCompleted = JSON.parse(localStorage.getItem(careKey) || 'null') || {};
let plantArchive = migratePlantArchiveData(JSON.parse(localStorage.getItem(archiveKey) || 'null') || []);
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

let experiments = JSON.parse(localStorage.getItem(experimentsKey) || 'null') || [];
let experimentEditingId = null;
let experimentFormType = 'plant';
let experimentGroups = [];
let experimentViewingId = null;
let experimentExpanded = true;
let experimentAlignMode = 'relative';

let diagnosisFilterPlant = '';
let diagnosisCache = null;
let diagnosisCacheTime = 0;

document.querySelector('#app').innerHTML = `
  <main class="shell">
    <header class="hero">
      <div>
        <p>hxwl-12 · port 5112</p>
        <h1>微型植物生长板</h1>
        <span>高度、叶片、浇水和光照的本地记录闭环</span>
      </div>
      <div class="heroActions">
        <button id="sample">载入示例</button>
        <button id="exportBtn" class="heroSecondary">📤 导出数据</button>
        <button id="importBtn" class="heroSecondary">📥 导入数据</button>
        <input type="file" id="importFile" accept=".json" style="display: none;" />
      </div>
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
          <div class="careTemplateSection">
            <h4 class="careTemplateTitle">🌱 养护模板设置</h4>
            <div class="careTemplateGrid">
              <div class="careTemplateItem">
                <label>浇水间隔（天）</label>
                <input name="waterIntervalDays" type="number" min="1" step="1" placeholder="例如：3" />
              </div>
              <div class="careTemplateItem">
                <label>单次浇水量（ml）</label>
                <input name="waterAmount" type="number" min="0" step="10" placeholder="例如：100" />
              </div>
              <div class="careTemplateItem">
                <label>理想光照（最少小时）</label>
                <input name="lightMin" type="number" min="0" step="0.5" placeholder="例如：3" />
              </div>
              <div class="careTemplateItem">
                <label>理想光照（最多小时）</label>
                <input name="lightMax" type="number" min="0" step="0.5" placeholder="例如：6" />
              </div>
            </div>
          </div>
          <textarea name="defaultNotes" placeholder="默认养护备注（保存生长记录时自动带出）"></textarea>
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
        <div class="photoUploadSection">
          <div class="photoUploadTabs">
            <button type="button" class="photoTab active" data-tab="upload">📷 上传照片</button>
            <button type="button" class="photoTab" data-tab="url">🔗 照片链接</button>
          </div>
          <div class="photoTabContent" data-tab-content="upload">
            <div class="photoUploadArea" id="photoUploadArea">
              <input type="file" id="photoFileInput" accept="image/*" style="display: none;" />
              <div class="photoUploadPlaceholder">
                <div class="uploadIcon">📸</div>
                <p>点击或拖拽图片到此处上传</p>
                <span class="uploadHint">支持 JPG、PNG、WebP 格式，将自动压缩</span>
              </div>
              <div class="photoPreviewContainer" id="photoPreviewContainer" style="display: none;">
                <img id="photoPreview" alt="预览" />
                <div class="photoPreviewInfo" id="photoPreviewInfo"></div>
                <button type="button" class="photoRemoveBtn" id="photoRemoveBtn">× 移除</button>
              </div>
            </div>
          </div>
          <div class="photoTabContent" data-tab-content="url" style="display: none;">
            <input name="photo" id="photoUrlInput" placeholder="粘贴状态照片链接" />
          </div>
        </div>
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

    <section class="panel experimentPanel" id="experimentPanel">
      <div class="panelHead experimentHead">
        <div class="experimentTitle">
          <h2>🧪 生长实验对比</h2>
          <span class="experimentBadge" id="experimentBadge"></span>
        </div>
        <button class="experimentToggle" id="experimentToggle">收起</button>
      </div>
      <div class="experimentBody" id="experimentBody">
        <form id="experimentForm" class="experimentForm">
          <h3 id="experimentFormTitle">创建对比实验</h3>
          <div class="experimentFormGrid">
            <input name="name" placeholder="实验名称 *" required />
            <div class="experimentTypeSelector">
              <label class="experimentTypeOption">
                <input type="radio" name="expType" value="plant" checked />
                <span>按植物对比</span>
              </label>
              <label class="experimentTypeOption">
                <input type="radio" name="expType" value="dateRange" />
                <span>按时间段对比</span>
              </label>
            </div>
          </div>
          <textarea name="description" placeholder="实验说明（养护条件、变量控制等）"></textarea>
          <div class="experimentGroupsSection">
            <div class="experimentGroupsHead">
              <h4>实验组</h4>
              <button type="button" class="experimentAddGroup" id="experimentAddGroup">+ 添加实验组</button>
            </div>
            <div class="experimentGroupsList" id="experimentGroupsList"></div>
          </div>
          <div class="experimentFormActions">
            <button type="submit" class="primary" id="experimentSaveBtn">创建实验</button>
            <button type="button" class="experimentCancel" id="experimentCancelBtn" style="display: none;">取消</button>
          </div>
        </form>

        <div class="experimentView" id="experimentView" style="display: none;">
          <div class="experimentViewHead">
            <button class="experimentBackBtn" id="experimentBackBtn">← 返回实验列表</button>
            <div class="experimentViewControls">
              <label class="alignModeLabel">
                对齐方式：
                <select id="experimentAlignMode">
                  <option value="relative">按相对天数</option>
                  <option value="date">按实际日期</option>
                </select>
              </label>
            </div>
          </div>
          <div class="experimentViewInfo" id="experimentViewInfo"></div>
          <div class="experimentCharts" id="experimentCharts"></div>
        </div>

        <div class="experimentList" id="experimentList"></div>
      </div>
    </section>

    <section class="panel diagnosisPanel" id="diagnosisPanel">
      <div class="panelHead diagnosisHead">
        <div class="diagnosisTitle">
          <h2>🔍 植物状态诊断</h2>
          <span class="diagnosisBadge" id="diagnosisBadge"></span>
        </div>
        <div class="diagnosisControls">
          <select id="diagnosisPlantFilter">
            <option value="">全部植物</option>
          </select>
          <button class="diagnosisRefresh" id="diagnosisRefresh">🔄 重新诊断</button>
        </div>
      </div>
      <div class="diagnosisBody" id="diagnosisBody"></div>
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

  <div class="importModal" id="importModal" style="display: none;">
    <div class="importModalContent">
      <div class="importModalHead">
        <h3>📥 数据导入预览</h3>
        <button class="importClose" id="importClose">&times;</button>
      </div>
      <div class="importModalBody" id="importModalBody"></div>
      <div class="importModalFoot" id="importModalFoot">
        <button type="button" class="importCancel" id="importCancelBtn">取消</button>
        <button type="button" class="primary" id="importConfirmBtn" disabled>确认导入</button>
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

const exportBtn = document.querySelector('#exportBtn');
const importBtn = document.querySelector('#importBtn');
const importFile = document.querySelector('#importFile');
const importModal = document.querySelector('#importModal');
const importClose = document.querySelector('#importClose');
const importCancelBtn = document.querySelector('#importCancelBtn');
const importConfirmBtn = document.querySelector('#importConfirmBtn');
const importModalBody = document.querySelector('#importModalBody');

const experimentForm = document.querySelector('#experimentForm');
const experimentFormTitle = document.querySelector('#experimentFormTitle');
const experimentGroupsList = document.querySelector('#experimentGroupsList');
const experimentAddGroupBtn = document.querySelector('#experimentAddGroup');
const experimentCancelBtn = document.querySelector('#experimentCancelBtn');
const experimentSaveBtn = document.querySelector('#experimentSaveBtn');
const experimentToggle = document.querySelector('#experimentToggle');
const experimentList = document.querySelector('#experimentList');
const experimentView = document.querySelector('#experimentView');
const experimentBackBtn = document.querySelector('#experimentBackBtn');
const experimentViewInfo = document.querySelector('#experimentViewInfo');
const experimentCharts = document.querySelector('#experimentCharts');
const experimentAlignModeSelect = document.querySelector('#experimentAlignMode');

const diagnosisPlantFilter = document.querySelector('#diagnosisPlantFilter');
const diagnosisRefreshBtn = document.querySelector('#diagnosisRefresh');

const photoFileInput = document.querySelector('#photoFileInput');
const photoUploadArea = document.querySelector('#photoUploadArea');
const photoPreviewContainer = document.querySelector('#photoPreviewContainer');
const photoPreview = document.querySelector('#photoPreview');
const photoPreviewInfo = document.querySelector('#photoPreviewInfo');
const photoRemoveBtn = document.querySelector('#photoRemoveBtn');
const photoUrlInput = document.querySelector('#photoUrlInput');
const photoTabs = document.querySelectorAll('.photoTab');
const photoTabContents = document.querySelectorAll('.photoTabContent');

let currentPhotoTab = 'upload';

const EXPERIMENT_COLORS = ['#2f855a', '#7c3aed', '#dc2626', '#d97706', '#2563eb', '#0891b2', '#4f46e5', '#be185d'];

let pendingImportData = null;
let importValidationResult = null;
let importStrategy = 'skip';
let importModalVisible = false;

function saveArchive() {
  localStorage.setItem(archiveKey, JSON.stringify(plantArchive));
}

function saveGoals() {
  localStorage.setItem(goalsKey, JSON.stringify(plantGoals));
}

function saveExperiments() {
  localStorage.setItem(experimentsKey, JSON.stringify(experiments));
}

const EXPORT_VERSION = '1.1';
const EXPORT_APP_ID = 'hxwl-12';

const RECORD_SCHEMA = ['id', 'plant', 'date', 'height', 'leaves', 'water', 'light', 'photo', 'state'];
const RECORD_REQUIRED_FIELDS = ['id', 'plant', 'date', 'height', 'leaves', 'water', 'light', 'state'];
const RECORD_OPTIONAL_FIELDS = ['photo'];

const ARCHIVE_SCHEMA = ['id', 'nickname', 'variety', 'acquisitionDate', 'location', 'defaultNotes', 'waterIntervalDays', 'waterAmount', 'lightMin', 'lightMax', 'autoImported', 'createdAt'];
const ARCHIVE_REQUIRED_FIELDS = ['id', 'nickname'];
const ARCHIVE_OPTIONAL_FIELDS = ['variety', 'acquisitionDate', 'location', 'defaultNotes', 'waterIntervalDays', 'waterAmount', 'lightMin', 'lightMax', 'autoImported', 'createdAt'];

const GOAL_SCHEMA = ['id', 'plantName', 'targetHeight', 'targetLeaves', 'targetDate', 'createdAt', 'achieved', 'achievedAt', 'startHeight', 'startLeaves'];
const GOAL_REQUIRED_FIELDS = ['id', 'plantName', 'targetHeight', 'targetLeaves', 'targetDate'];
const GOAL_OPTIONAL_FIELDS = ['createdAt', 'achieved', 'achievedAt', 'startHeight', 'startLeaves'];

const EXPERIMENT_SCHEMA = ['id', 'name', 'description', 'type', 'groups', 'createdAt'];
const EXPERIMENT_REQUIRED_FIELDS = ['id', 'name', 'type', 'groups'];
const EXPERIMENT_OPTIONAL_FIELDS = ['description', 'createdAt'];
const EXPERIMENT_GROUP_SCHEMA = ['id', 'name', 'type', 'plantName', 'dateStart', 'dateEnd', 'color'];
const EXPERIMENT_GROUP_REQUIRED_FIELDS = ['id', 'name', 'type'];

function exportData() {
  const exportObj = {
    _meta: {
      appId: EXPORT_APP_ID,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      exportedFrom: window.location.hostname
    },
    records: records,
    plantArchive: plantArchive,
    plantGoals: plantGoals,
    careCompleted: careCompleted,
    experiments: experiments
  };

  const jsonStr = JSON.stringify(exportObj, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = formatDate(new Date());
  const a = document.createElement('a');
  a.href = url;
  a.download = `hxwl-12-植物数据-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function validateImportData(data) {
  const result = {
    valid: false,
    canImport: false,
    errors: [],
    warnings: [],
    info: [],
    stats: {
      records: 0,
      archive: 0,
      goals: 0,
      careCompleted: 0,
      experiments: 0,
      duplicateRecords: 0,
      duplicateArchive: 0,
      duplicateGoals: 0,
      duplicateCare: 0,
      duplicateExperiments: 0,
      fileInternalDuplicateRecords: 0,
      fileInternalDuplicateArchive: 0,
      fileInternalDuplicateGoals: 0,
      fileInternalDuplicateCare: 0,
      fileInternalDuplicateExperiments: 0,
      missingRequiredFields: 0,
      missingOptionalFields: 0,
      blockedRecords: 0,
      blockedArchive: 0,
      blockedGoals: 0,
      blockedExperiments: 0,
      newRecords: 0,
      newArchive: 0,
      newGoals: 0,
      newCare: 0,
      newExperiments: 0
    },
    duplicates: {
      records: [],
      archive: [],
      goals: [],
      care: [],
      experiments: []
    },
    fileInternalDuplicates: {
      records: [],
      archive: [],
      goals: [],
      care: [],
      experiments: []
    },
    missingRequired: {
      records: [],
      archive: [],
      goals: [],
      experiments: []
    },
    missingOptional: {
      records: [],
      archive: [],
      goals: [],
      experiments: []
    },
    blocked: {
      records: [],
      archive: [],
      goals: [],
      experiments: []
    }
  };

  if (!data || typeof data !== 'object') {
    result.errors.push({ type: 'danger', title: '文件格式错误', details: '不是有效的JSON对象' });
    return result;
  }

  if (!data._meta) {
    result.warnings.push({ type: 'warning', title: '缺少元数据', details: '该文件没有导出元数据，可能不是本应用导出的文件' });
  } else {
    if (data._meta.appId !== EXPORT_APP_ID) {
      result.errors.push({ type: 'danger', title: '应用标识不匹配', details: `期望 "${EXPORT_APP_ID}"，实际为 "${data._meta.appId}"` });
      return result;
    }
    if (data._meta.version !== EXPORT_VERSION) {
      result.warnings.push({ type: 'warning', title: '版本不匹配', details: `期望版本 ${EXPORT_VERSION}，实际为 ${data._meta.version}，可能存在兼容性问题` });
    }
  }

  if (!Array.isArray(data.records)) {
    result.errors.push({ type: 'danger', title: '数据结构错误', details: 'records 字段不是数组' });
    return result;
  }
  if (!Array.isArray(data.plantArchive)) {
    result.errors.push({ type: 'danger', title: '数据结构错误', details: 'plantArchive 字段不是数组' });
    return result;
  }
  if (!Array.isArray(data.plantGoals)) {
    result.errors.push({ type: 'danger', title: '数据结构错误', details: 'plantGoals 字段不是数组' });
    return result;
  }
  if (!data.careCompleted || typeof data.careCompleted !== 'object') {
    result.errors.push({ type: 'danger', title: '数据结构错误', details: 'careCompleted 字段不是对象' });
    return result;
  }

  if (data.experiments && !Array.isArray(data.experiments)) {
    result.errors.push({ type: 'danger', title: '数据结构错误', details: 'experiments 字段不是数组' });
    return result;
  }

  const existingRecordIds = new Set(records.map(r => r.id));
  const existingArchiveIds = new Set(plantArchive.map(p => p.id));
  const existingGoalIds = new Set(plantGoals.map(g => g.id));
  const existingCareKeys = new Set(Object.keys(careCompleted));
  const existingExperimentIds = new Set(experiments.map(e => e.id));

  result.stats.records = data.records.length;
  result.stats.archive = data.plantArchive.length;
  result.stats.goals = data.plantGoals.length;
  result.stats.careCompleted = Object.keys(data.careCompleted).length;
  result.stats.experiments = data.experiments ? data.experiments.length : 0;

  const fileRecordIds = {};
  data.records.forEach((record, index) => {
    let isBlocked = false;
    let blockReasons = [];

    const missingRequired = RECORD_REQUIRED_FIELDS.filter(field => !(field in record));
    const missingOptional = RECORD_OPTIONAL_FIELDS.filter(field => !(field in record));

    if (missingRequired.length > 0) {
      result.stats.missingRequiredFields++;
      result.missingRequired.records.push({ index, id: record.id || '未知ID', missing: missingRequired });
      isBlocked = true;
      blockReasons.push(`缺失必填字段: ${missingRequired.join(', ')}`);
    }

    if (missingOptional.length > 0) {
      result.stats.missingOptionalFields++;
      result.missingOptional.records.push({ index, id: record.id || '未知ID', missing: missingOptional });
    }

    if (record.id) {
      if (Object.prototype.hasOwnProperty.call(fileRecordIds, record.id)) {
        result.stats.fileInternalDuplicateRecords++;
        result.fileInternalDuplicates.records.push({ id: record.id, plant: record.plant, date: record.date, firstIndex: fileRecordIds[record.id], duplicateIndex: index });
        isBlocked = true;
        blockReasons.push('文件内ID重复');
      } else {
        fileRecordIds[record.id] = index;
      }
    } else {
      isBlocked = true;
      blockReasons.push('缺少ID字段');
    }

    if (isBlocked) {
      result.stats.blockedRecords++;
      result.blocked.records.push({ index, id: record.id || '未知ID', plant: record.plant, reasons: blockReasons });
    } else {
      if (existingRecordIds.has(record.id)) {
        result.stats.duplicateRecords++;
        result.duplicates.records.push({ id: record.id, plant: record.plant, date: record.date });
      } else {
        result.stats.newRecords++;
      }
    }
  });

  const fileArchiveIds = {};
  data.plantArchive.forEach((plant, index) => {
    let isBlocked = false;
    let blockReasons = [];

    const missingRequired = ARCHIVE_REQUIRED_FIELDS.filter(field => !(field in plant));
    const missingOptional = ARCHIVE_OPTIONAL_FIELDS.filter(field => !(field in plant));

    if (missingRequired.length > 0) {
      result.stats.missingRequiredFields++;
      result.missingRequired.archive.push({ index, id: plant.id || '未知ID', nickname: plant.nickname, missing: missingRequired });
      isBlocked = true;
      blockReasons.push(`缺失必填字段: ${missingRequired.join(', ')}`);
    }

    if (missingOptional.length > 0) {
      result.stats.missingOptionalFields++;
      result.missingOptional.archive.push({ index, id: plant.id || '未知ID', nickname: plant.nickname, missing: missingOptional });
    }

    if (plant.id) {
      if (Object.prototype.hasOwnProperty.call(fileArchiveIds, plant.id)) {
        result.stats.fileInternalDuplicateArchive++;
        result.fileInternalDuplicates.archive.push({ id: plant.id, nickname: plant.nickname, firstIndex: fileArchiveIds[plant.id], duplicateIndex: index });
        isBlocked = true;
        blockReasons.push('文件内ID重复');
      } else {
        fileArchiveIds[plant.id] = index;
      }
    } else {
      isBlocked = true;
      blockReasons.push('缺少ID字段');
    }

    if (isBlocked) {
      result.stats.blockedArchive++;
      result.blocked.archive.push({ index, id: plant.id || '未知ID', nickname: plant.nickname, reasons: blockReasons });
    } else {
      if (existingArchiveIds.has(plant.id)) {
        result.stats.duplicateArchive++;
        result.duplicates.archive.push({ id: plant.id, nickname: plant.nickname });
      } else {
        result.stats.newArchive++;
      }
    }
  });

  const fileGoalIds = {};
  data.plantGoals.forEach((goal, index) => {
    let isBlocked = false;
    let blockReasons = [];

    const missingRequired = GOAL_REQUIRED_FIELDS.filter(field => !(field in goal));
    const missingOptional = GOAL_OPTIONAL_FIELDS.filter(field => !(field in goal));

    if (missingRequired.length > 0) {
      result.stats.missingRequiredFields++;
      result.missingRequired.goals.push({ index, id: goal.id || '未知ID', plantName: goal.plantName, missing: missingRequired });
      isBlocked = true;
      blockReasons.push(`缺失必填字段: ${missingRequired.join(', ')}`);
    }

    if (missingOptional.length > 0) {
      result.stats.missingOptionalFields++;
      result.missingOptional.goals.push({ index, id: goal.id || '未知ID', plantName: goal.plantName, missing: missingOptional });
    }

    if (goal.id) {
      if (Object.prototype.hasOwnProperty.call(fileGoalIds, goal.id)) {
        result.stats.fileInternalDuplicateGoals++;
        result.fileInternalDuplicates.goals.push({ id: goal.id, plantName: goal.plantName, firstIndex: fileGoalIds[goal.id], duplicateIndex: index });
        isBlocked = true;
        blockReasons.push('文件内ID重复');
      } else {
        fileGoalIds[goal.id] = index;
      }
    } else {
      isBlocked = true;
      blockReasons.push('缺少ID字段');
    }

    if (isBlocked) {
      result.stats.blockedGoals++;
      result.blocked.goals.push({ index, id: goal.id || '未知ID', plantName: goal.plantName, reasons: blockReasons });
    } else {
      if (existingGoalIds.has(goal.id)) {
        result.stats.duplicateGoals++;
        result.duplicates.goals.push({ id: goal.id, plantName: goal.plantName });
      } else {
        result.stats.newGoals++;
      }
    }
  });

  const fileCareKeys = {};
  Object.keys(data.careCompleted).forEach((key, index) => {
    if (fileCareKeys[key]) {
      result.stats.fileInternalDuplicateCare++;
      result.fileInternalDuplicates.care.push({ key, firstIndex: fileCareKeys[key], duplicateIndex: index });
    } else {
      fileCareKeys[key] = index;
    }

    if (existingCareKeys.has(key)) {
      result.stats.duplicateCare++;
      result.duplicates.care.push(key);
    } else {
      result.stats.newCare++;
    }
  });

  if (data.experiments) {
    const fileExperimentIds = {};
    data.experiments.forEach((exp, index) => {
      let isBlocked = false;
      let blockReasons = [];

      const missingRequired = EXPERIMENT_REQUIRED_FIELDS.filter(field => !(field in exp));
      const missingOptional = EXPERIMENT_OPTIONAL_FIELDS.filter(field => !(field in exp));

      if (missingRequired.length > 0) {
        result.stats.missingRequiredFields++;
        result.missingRequired.experiments.push({ index, id: exp.id || '未知ID', name: exp.name, missing: missingRequired });
        isBlocked = true;
        blockReasons.push(`缺失必填字段: ${missingRequired.join(', ')}`);
      }

      if (missingOptional.length > 0) {
        result.stats.missingOptionalFields++;
        result.missingOptional.experiments.push({ index, id: exp.id || '未知ID', name: exp.name, missing: missingOptional });
      }

      if (exp.groups && Array.isArray(exp.groups)) {
        exp.groups.forEach((group, gIdx) => {
          const groupMissing = EXPERIMENT_GROUP_REQUIRED_FIELDS.filter(field => !(field in group));
          if (groupMissing.length > 0) {
            result.stats.missingRequiredFields++;
            result.missingRequired.experiments.push({ index, id: exp.id, name: `${exp.name} - 实验组${gIdx + 1}`, missing: groupMissing });
            isBlocked = true;
            blockReasons.push(`实验组${gIdx + 1}缺失必填字段: ${groupMissing.join(', ')}`);
          }
        });
      }

      if (exp.id) {
        if (Object.prototype.hasOwnProperty.call(fileExperimentIds, exp.id)) {
          result.stats.fileInternalDuplicateExperiments++;
          result.fileInternalDuplicates.experiments.push({ id: exp.id, name: exp.name, firstIndex: fileExperimentIds[exp.id], duplicateIndex: index });
          isBlocked = true;
          blockReasons.push('文件内ID重复');
        } else {
          fileExperimentIds[exp.id] = index;
        }
      } else {
        isBlocked = true;
        blockReasons.push('缺少ID字段');
      }

      if (isBlocked) {
        result.stats.blockedExperiments++;
        result.blocked.experiments.push({ index, id: exp.id || '未知ID', name: exp.name, reasons: blockReasons });
      } else {
        if (existingExperimentIds.has(exp.id)) {
          result.stats.duplicateExperiments++;
          result.duplicates.experiments.push({ id: exp.id, name: exp.name });
        } else {
          result.stats.newExperiments++;
        }
      }
    });
  }

  const totalBlocked = result.stats.blockedRecords + result.stats.blockedArchive + result.stats.blockedGoals + result.stats.blockedExperiments;
  if (totalBlocked > 0) {
    result.errors.push({
      type: 'danger',
      title: `发现 ${totalBlocked} 条记录将被阻止导入`,
      details: '这些记录缺失必填字段或文件内ID重复，将不会被写入本地存储'
    });
  }

  const totalFileInternalDuplicates = result.stats.fileInternalDuplicateRecords + result.stats.fileInternalDuplicateArchive + result.stats.fileInternalDuplicateGoals + result.stats.fileInternalDuplicateCare + result.stats.fileInternalDuplicateExperiments;
  if (totalFileInternalDuplicates > 0) {
    result.errors.push({
      type: 'danger',
      title: `发现 ${totalFileInternalDuplicates} 条文件内重复记录`,
      details: '同一个导入文件内存在重复ID，这些记录将被阻止导入'
    });
  }

  if (result.stats.missingRequiredFields > 0) {
    result.errors.push({
      type: 'danger',
      title: `发现 ${result.stats.missingRequiredFields} 条记录缺失必填字段`,
      details: '这些记录将被阻止导入，请修复后重试'
    });
  }

  if (result.stats.missingOptionalFields > 0) {
    result.warnings.push({
      type: 'warning',
      title: `发现 ${result.stats.missingOptionalFields} 条记录缺失可选字段`,
      details: '这些记录可以正常导入，缺失字段将使用默认值'
    });
  }

  const totalDuplicates = result.stats.duplicateRecords + result.stats.duplicateArchive + result.stats.duplicateGoals + result.stats.duplicateCare + result.stats.duplicateExperiments;
  if (totalDuplicates > 0) {
    result.warnings.push({
      type: 'warning',
      title: `发现 ${totalDuplicates} 条与现有数据重复的记录`,
      details: '请选择处理策略：跳过重复、覆盖现有或全部导入为新记录'
    });
  }

  const totalNew = result.stats.newRecords + result.stats.newArchive + result.stats.newGoals + result.stats.newCare + result.stats.newExperiments;
  if (totalNew > 0) {
    result.info.push({
      type: 'info',
      title: `发现 ${totalNew} 条新记录`,
      details: '这些记录将被添加到现有数据中'
    });
  }

  const validatableRecords = result.stats.records - result.stats.blockedRecords;
  const validatableArchive = result.stats.archive - result.stats.blockedArchive;
  const validatableGoals = result.stats.goals - result.stats.blockedGoals;
  const validatableExperiments = result.stats.experiments - result.stats.blockedExperiments;

  result.valid = true;
  result.canImport = (validatableRecords > 0 || validatableArchive > 0 || validatableGoals > 0 || result.stats.careCompleted > 0 || validatableExperiments > 0);

  return result;
}

function renderImportPreview() {
  if (!pendingImportData || !importValidationResult) {
    importModalBody.innerHTML = `
      <div class="importEmpty">
        <div class="importEmptyIcon">📁</div>
        <h4>选择要导入的文件</h4>
        <p>点击下方按钮选择JSON格式的数据文件</p>
      </div>
    `;
    importConfirmBtn.disabled = true;
    return;
  }

  const result = importValidationResult;
  const data = pendingImportData;

  let fileInfoHtml = '';
  if (data._meta) {
    fileInfoHtml = `
      <div class="importFileInfo">
        <strong>文件信息：</strong>
        ${data._meta.exportedAt ? `导出时间: ${new Date(data._meta.exportedAt).toLocaleString('zh-CN')}` : ''}
        ${data._meta.exportedFrom ? ` · 来源: ${data._meta.exportedFrom}` : ''}
        ${data._meta.version ? ` · 版本: v${data._meta.version}` : ''}
      </div>
    `;
  }

  let issuesHtml = '';
  const allIssues = [...result.errors, ...result.warnings, ...result.info];
  if (allIssues.length > 0) {
    issuesHtml = `
      <div class="importIssues">
        ${allIssues.map(issue => `
          <div class="importIssueItem ${issue.type}">
            <span class="importIssueIcon">
              ${issue.type === 'danger' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <div class="importIssueContent">
              <strong>${issue.title}</strong>
              ${issue.details ? `<div>${issue.details}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  let missingRequiredDetailsHtml = '';
  if (result.missingRequired.records.length > 0 || result.missingRequired.archive.length > 0 || result.missingRequired.goals.length > 0) {
    const recordMissing = result.missingRequired.records.slice(0, 3).map(m =>
      `<div class="importIssueDetails">记录 #${m.index} ${m.id}: 缺失必填字段 [${m.missing.join(', ')}]</div>`
    ).join('');
    const archiveMissing = result.missingRequired.archive.slice(0, 3).map(m =>
      `<div class="importIssueDetails">档案 #${m.index} ${m.nickname || m.id}: 缺失必填字段 [${m.missing.join(', ')}]</div>`
    ).join('');
    const goalMissing = result.missingRequired.goals.slice(0, 3).map(m =>
      `<div class="importIssueDetails">目标 #${m.index} ${m.plantName || m.id}: 缺失必填字段 [${m.missing.join(', ')}]</div>`
    ).join('');

    missingRequiredDetailsHtml = `
      <div class="importIssueItem danger">
        <span class="importIssueIcon">🚫</span>
        <div class="importIssueContent">
          <strong>缺失必填字段详情（最多显示前3条/类型）</strong>
          ${recordMissing}
          ${archiveMissing}
          ${goalMissing}
          <div class="importIssueDetails" style="margin-top: 8px; font-weight: 600;">⚠️ 这些记录将被阻止导入</div>
        </div>
      </div>
    `;
  }

  let missingOptionalDetailsHtml = '';
  if (result.missingOptional.records.length > 0 || result.missingOptional.archive.length > 0 || result.missingOptional.goals.length > 0) {
    const recordMissing = result.missingOptional.records.slice(0, 3).map(m =>
      `<div class="importIssueDetails">记录 #${m.index} ${m.id}: 缺失可选字段 [${m.missing.join(', ')}]</div>`
    ).join('');
    const archiveMissing = result.missingOptional.archive.slice(0, 3).map(m =>
      `<div class="importIssueDetails">档案 #${m.index} ${m.nickname || m.id}: 缺失可选字段 [${m.missing.join(', ')}]</div>`
    ).join('');
    const goalMissing = result.missingOptional.goals.slice(0, 3).map(m =>
      `<div class="importIssueDetails">目标 #${m.index} ${m.plantName || m.id}: 缺失可选字段 [${m.missing.join(', ')}]</div>`
    ).join('');

    missingOptionalDetailsHtml = `
      <div class="importIssueItem warning">
        <span class="importIssueIcon">📋</span>
        <div class="importIssueContent">
          <strong>缺失可选字段详情（最多显示前3条/类型）</strong>
          ${recordMissing}
          ${archiveMissing}
          ${goalMissing}
          <div class="importIssueDetails" style="margin-top: 8px;">ℹ️ 这些记录可以正常导入，缺失字段将使用默认值</div>
        </div>
      </div>
    `;
  }

  let fileInternalDuplicateDetailsHtml = '';
  const totalFileInternalDuplicates = result.stats.fileInternalDuplicateRecords + result.stats.fileInternalDuplicateArchive + result.stats.fileInternalDuplicateGoals + result.stats.fileInternalDuplicateCare;
  if (totalFileInternalDuplicates > 0) {
    const recordDup = result.fileInternalDuplicates.records.slice(0, 3).map(d =>
      `<div class="importIssueDetails">记录 ID ${d.id} (${d.plant}): 第 ${d.firstIndex} 行与第 ${d.duplicateIndex} 行重复</div>`
    ).join('');
    const archiveDup = result.fileInternalDuplicates.archive.slice(0, 3).map(d =>
      `<div class="importIssueDetails">档案 ID ${d.id} (${d.nickname}): 第 ${d.firstIndex} 行与第 ${d.duplicateIndex} 行重复</div>`
    ).join('');
    const goalDup = result.fileInternalDuplicates.goals.slice(0, 3).map(d =>
      `<div class="importIssueDetails">目标 ID ${d.id} (${d.plantName}): 第 ${d.firstIndex} 行与第 ${d.duplicateIndex} 行重复</div>`
    ).join('');
    const careDup = result.fileInternalDuplicates.care.slice(0, 3).map(d =>
      `<div class="importIssueDetails">养护 ${d.key}: 第 ${d.firstIndex} 行与第 ${d.duplicateIndex} 行重复</div>`
    ).join('');

    fileInternalDuplicateDetailsHtml = `
      <div class="importIssueItem danger">
        <span class="importIssueIcon">🔄</span>
        <div class="importIssueContent">
          <strong>文件内重复记录详情（最多显示前3条/类型）</strong>
          ${recordDup}
          ${archiveDup}
          ${goalDup}
          ${careDup}
          <div class="importIssueDetails" style="margin-top: 8px; font-weight: 600;">⚠️ 这些重复记录将被阻止导入</div>
        </div>
      </div>
    `;
  }

  let existingDuplicateDetailsHtml = '';
  const totalExistingDuplicates = result.stats.duplicateRecords + result.stats.duplicateArchive + result.stats.duplicateGoals + result.stats.duplicateCare;
  if (totalExistingDuplicates > 0) {
    const recordDup = result.duplicates.records.slice(0, 3).map(d =>
      `<div class="importIssueDetails">记录: ${d.plant} (${d.date})</div>`
    ).join('');
    const archiveDup = result.duplicates.archive.slice(0, 3).map(d =>
      `<div class="importIssueDetails">档案: ${d.nickname}</div>`
    ).join('');
    const goalDup = result.duplicates.goals.slice(0, 3).map(d =>
      `<div class="importIssueDetails">目标: ${d.plantName}</div>`
    ).join('');
    const careDup = result.duplicates.care.slice(0, 3).map(d =>
      `<div class="importIssueDetails">养护: ${d}</div>`
    ).join('');

    existingDuplicateDetailsHtml = `
      <div class="importIssueItem warning">
        <span class="importIssueIcon">🔄</span>
        <div class="importIssueContent">
          <strong>与现有数据重复记录详情（最多显示前3条/类型）</strong>
          ${recordDup}
          ${archiveDup}
          ${goalDup}
          ${careDup}
          <div class="importIssueDetails" style="margin-top: 8px;">ℹ️ 可选择处理策略决定如何处理这些记录</div>
        </div>
      </div>
    `;
  }

  let blockedDetailsHtml = '';
  const totalBlocked = result.stats.blockedRecords + result.stats.blockedArchive + result.stats.blockedGoals;
  if (totalBlocked > 0) {
    const recordBlocked = result.blocked.records.slice(0, 3).map(b =>
      `<div class="importIssueDetails">记录 #${b.index} ${b.plant || b.id}: ${b.reasons.join('; ')}</div>`
    ).join('');
    const archiveBlocked = result.blocked.archive.slice(0, 3).map(b =>
      `<div class="importIssueDetails">档案 #${b.index} ${b.nickname || b.id}: ${b.reasons.join('; ')}</div>`
    ).join('');
    const goalBlocked = result.blocked.goals.slice(0, 3).map(b =>
      `<div class="importIssueDetails">目标 #${b.index} ${b.plantName || b.id}: ${b.reasons.join('; ')}</div>`
    ).join('');

    blockedDetailsHtml = `
      <div class="importIssueItem danger">
        <span class="importIssueIcon">🚫</span>
        <div class="importIssueContent">
          <strong>被阻止导入的记录（最多显示前3条/类型）</strong>
          ${recordBlocked}
          ${archiveBlocked}
          ${goalBlocked}
          <div class="importIssueDetails" style="margin-top: 8px; font-weight: 600;">⚠️ 共 ${totalBlocked} 条记录不会被写入本地存储</div>
        </div>
      </div>
    `;
  }

  let strategyHtml = '';
  if (totalExistingDuplicates > 0 && result.canImport) {
    strategyHtml = `
      <div class="importStrategySelector">
        <label>请选择与现有数据重复的记录处理策略：</label>
        <div class="importStrategyOptions">
          <label class="importStrategyOption">
            <input type="radio" name="importStrategy" value="skip" ${importStrategy === 'skip' ? 'checked' : ''} />
            <div>
              <div class="strategyLabel">⏭️ 跳过重复（推荐）</div>
              <div class="strategyDesc">保留现有数据，只导入不重复的新记录</div>
            </div>
          </label>
          <label class="importStrategyOption">
            <input type="radio" name="importStrategy" value="overwrite" ${importStrategy === 'overwrite' ? 'checked' : ''} />
            <div>
              <div class="strategyLabel">🔄 覆盖现有</div>
              <div class="strategyDesc">用导入的数据覆盖现有的重复记录</div>
            </div>
          </label>
          <label class="importStrategyOption">
            <input type="radio" name="importStrategy" value="duplicate" ${importStrategy === 'duplicate' ? 'checked' : ''} />
            <div>
              <div class="strategyLabel">➕ 全部作为新记录</div>
              <div class="strategyDesc">重新生成ID，将所有导入数据作为新记录添加</div>
            </div>
          </label>
        </div>
      </div>
    `;
  }

  const totalNew = result.stats.newRecords + result.stats.newArchive + result.stats.newGoals + result.stats.newCare + result.stats.newExperiments;
  const totalMissingRequired = result.stats.missingRequiredFields;
  const totalMissingOptional = result.stats.missingOptionalFields;

  importModalBody.innerHTML = `
    <div class="importSummary">
      ${fileInfoHtml}

      <div class="importSummarySection">
        <h4>📊 数据概览</h4>
        <div class="importSummaryGrid">
          <div class="importSummaryItem">
            <span class="importSummaryLabel">生长记录</span>
            <span class="importSummaryValue">${result.stats.records}</span>
          </div>
          <div class="importSummaryItem">
            <span class="importSummaryLabel">植物档案</span>
            <span class="importSummaryValue">${result.stats.archive}</span>
          </div>
          <div class="importSummaryItem">
            <span class="importSummaryLabel">生长目标</span>
            <span class="importSummaryValue">${result.stats.goals}</span>
          </div>
          <div class="importSummaryItem">
            <span class="importSummaryLabel">养护完成</span>
            <span class="importSummaryValue">${result.stats.careCompleted}</span>
          </div>
          <div class="importSummaryItem">
            <span class="importSummaryLabel">对比实验</span>
            <span class="importSummaryValue">${result.stats.experiments}</span>
          </div>
        </div>
      </div>

      <div class="importSummarySection">
        <h4>🔍 导入分析</h4>
        <div class="importSummaryGrid">
          <div class="importSummaryItem success">
            <span class="importSummaryLabel">新增记录</span>
            <span class="importSummaryValue">${totalNew}</span>
          </div>
          <div class="importSummaryItem ${totalExistingDuplicates > 0 ? 'warning' : ''}">
            <span class="importSummaryLabel">与现有重复</span>
            <span class="importSummaryValue">${totalExistingDuplicates}</span>
          </div>
          <div class="importSummaryItem ${totalFileInternalDuplicates > 0 ? 'danger' : ''}">
            <span class="importSummaryLabel">文件内重复</span>
            <span class="importSummaryValue">${totalFileInternalDuplicates}</span>
          </div>
          <div class="importSummaryItem ${totalMissingRequired > 0 ? 'danger' : ''}">
            <span class="importSummaryLabel">缺失必填字段</span>
            <span class="importSummaryValue">${totalMissingRequired}</span>
          </div>
          <div class="importSummaryItem ${totalMissingOptional > 0 ? 'warning' : ''}">
            <span class="importSummaryLabel">缺失可选字段</span>
            <span class="importSummaryValue">${totalMissingOptional}</span>
          </div>
          <div class="importSummaryItem ${totalBlocked > 0 ? 'danger' : 'success'}">
            <span class="importSummaryLabel">被阻止导入</span>
            <span class="importSummaryValue">${totalBlocked}</span>
          </div>
        </div>
      </div>

      ${issuesHtml}
      ${fileInternalDuplicateDetailsHtml}
      ${missingRequiredDetailsHtml}
      ${missingOptionalDetailsHtml}
      ${existingDuplicateDetailsHtml}
      ${blockedDetailsHtml}
      ${strategyHtml}
    </div>
  `;

  importConfirmBtn.disabled = !result.canImport;

  document.querySelectorAll('input[name="importStrategy"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      importStrategy = e.target.value;
    });
  });
}

function openImportModal() {
  importModalVisible = true;
  importModal.style.display = 'flex';
  pendingImportData = null;
  importValidationResult = null;
  importStrategy = 'skip';
  renderImportPreview();
}

function closeImportModal() {
  importModalVisible = false;
  importModal.style.display = 'none';
  pendingImportData = null;
  importValidationResult = null;
  importFile.value = '';
}

function processImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      pendingImportData = data;
      importValidationResult = validateImportData(data);
      renderImportPreview();
    } catch (err) {
      pendingImportData = null;
      importValidationResult = {
        valid: false,
        canImport: false,
        errors: [{ type: 'danger', title: 'JSON解析失败', details: err.message }],
        warnings: [],
        info: [],
        stats: { records: 0, archive: 0, goals: 0, careCompleted: 0, duplicateRecords: 0, duplicateArchive: 0, duplicateGoals: 0, duplicateCare: 0, missingFields: 0, newRecords: 0, newArchive: 0, newGoals: 0, newCare: 0 },
        duplicates: { records: [], archive: [], goals: [], care: [] },
        missing: { records: [], archive: [], goals: [] }
      };
      renderImportPreview();
    }
  };
  reader.onerror = () => {
    pendingImportData = null;
    importValidationResult = {
      valid: false,
      canImport: false,
      errors: [{ type: 'danger', title: '文件读取失败', details: '无法读取选中的文件' }],
      warnings: [],
      info: [],
      stats: { records: 0, archive: 0, goals: 0, careCompleted: 0, duplicateRecords: 0, duplicateArchive: 0, duplicateGoals: 0, duplicateCare: 0, fileInternalDuplicateRecords: 0, fileInternalDuplicateArchive: 0, fileInternalDuplicateGoals: 0, fileInternalDuplicateCare: 0, missingRequiredFields: 0, missingOptionalFields: 0, blockedRecords: 0, blockedArchive: 0, blockedGoals: 0, newRecords: 0, newArchive: 0, newGoals: 0, newCare: 0 },
      duplicates: { records: [], archive: [], goals: [], care: [] },
      fileInternalDuplicates: { records: [], archive: [], goals: [], care: [] },
      missingRequired: { records: [], archive: [], goals: [] },
      missingOptional: { records: [], archive: [], goals: [] },
      blocked: { records: [], archive: [], goals: [] }
    };
    renderImportPreview();
  };
  reader.readAsText(file);
}

function isRecordBlocked(record, result) {
  return result.blocked.records.some(r => r.id === record.id);
}

function isArchiveBlocked(plant, result) {
  return result.blocked.archive.some(p => p.id === plant.id);
}

function isGoalBlocked(goal, result) {
  return result.blocked.goals.some(g => g.id === goal.id);
}

function performImport() {
  if (!pendingImportData || !importValidationResult || !importValidationResult.canImport) {
    alert('无法导入：数据验证失败');
    return;
  }

  const backup = {
    records: [...records],
    plantArchive: [...plantArchive],
    plantGoals: [...plantGoals],
    careCompleted: { ...careCompleted },
    experiments: [...experiments]
  };

  try {
    const data = pendingImportData;
    const result = importValidationResult;
    const strategy = importStrategy;

    const existingRecordIds = new Set(records.map(r => r.id));
    const existingArchiveIds = new Set(plantArchive.map(p => p.id));
    const existingGoalIds = new Set(plantGoals.map(g => g.id));
    const existingCareKeys = new Set(Object.keys(careCompleted));
    const existingExperimentIds = new Set(experiments.map(e => e.id));

    const fileInternalDuplicateRecordIds = new Set(result.fileInternalDuplicates.records.map(d => d.id));
    const fileInternalDuplicateArchiveIds = new Set(result.fileInternalDuplicates.archive.map(d => d.id));
    const fileInternalDuplicateGoalIds = new Set(result.fileInternalDuplicates.goals.map(d => d.id));
    const fileInternalDuplicateCareKeys = new Set(result.fileInternalDuplicates.care.map(d => d.key));
    const fileInternalDuplicateExperimentIds = new Set(result.fileInternalDuplicates.experiments.map(d => d.id));

    let importedRecords = 0;
    let importedArchive = 0;
    let importedGoals = 0;
    let importedCare = 0;
    let importedExperiments = 0;

    data.records.forEach(record => {
      if (!record.id) return;
      if (fileInternalDuplicateRecordIds.has(record.id)) return;
      if (isRecordBlocked(record, result)) return;

      const missingRequired = RECORD_REQUIRED_FIELDS.filter(field => !(field in record));
      if (missingRequired.length > 0) return;

      const hasId = existingRecordIds.has(record.id);
      if (strategy === 'skip' && hasId) return;
      if (strategy === 'overwrite' && hasId) {
        records = records.map(r => r.id === record.id ? { ...record } : r);
      } else if (strategy === 'duplicate' && hasId) {
        records.unshift({ ...record, id: crypto.randomUUID() });
      } else {
        records.unshift({ ...record });
      }
      importedRecords++;
    });

    data.plantArchive.forEach(plant => {
      if (!plant.id) return;
      if (fileInternalDuplicateArchiveIds.has(plant.id)) return;
      if (isArchiveBlocked(plant, result)) return;

      const missingRequired = ARCHIVE_REQUIRED_FIELDS.filter(field => !(field in plant));
      if (missingRequired.length > 0) return;

      const migratedPlant = migratePlantArchiveData([plant])[0];

      const hasId = existingArchiveIds.has(plant.id);
      if (strategy === 'skip' && hasId) return;
      if (strategy === 'overwrite' && hasId) {
        plantArchive = plantArchive.map(p => p.id === plant.id ? { ...migratedPlant } : p);
      } else if (strategy === 'duplicate' && hasId) {
        plantArchive.push({ ...migratedPlant, id: crypto.randomUUID() });
      } else {
        const existsByNickname = plantArchive.find(p => p.nickname === plant.nickname);
        if (!existsByNickname) {
          plantArchive.push({ ...migratedPlant });
        }
      }
      importedArchive++;
    });

    data.plantGoals.forEach(goal => {
      if (!goal.id) return;
      if (fileInternalDuplicateGoalIds.has(goal.id)) return;
      if (isGoalBlocked(goal, result)) return;

      const missingRequired = GOAL_REQUIRED_FIELDS.filter(field => !(field in goal));
      if (missingRequired.length > 0) return;

      const hasId = existingGoalIds.has(goal.id);
      if (strategy === 'skip' && hasId) return;
      if (strategy === 'overwrite' && hasId) {
        plantGoals = plantGoals.map(g => g.id === goal.id ? { ...goal } : g);
      } else if (strategy === 'duplicate' && hasId) {
        plantGoals.push({ ...goal, id: crypto.randomUUID() });
      } else {
        plantGoals.push({ ...goal });
      }
      importedGoals++;
    });

    Object.entries(data.careCompleted).forEach(([key, value]) => {
      if (fileInternalDuplicateCareKeys.has(key)) return;

      const hasKey = existingCareKeys.has(key);
      if (strategy === 'skip' && hasKey) return;
      careCompleted[key] = value;
      importedCare++;
    });

    if (data.experiments) {
      data.experiments.forEach(exp => {
        if (!exp.id) return;
        if (fileInternalDuplicateExperimentIds.has(exp.id)) return;
        if (result.blocked.experiments.some(e => e.id === exp.id)) return;

        const missingRequired = EXPERIMENT_REQUIRED_FIELDS.filter(field => !(field in exp));
        if (missingRequired.length > 0) return;

        const hasId = existingExperimentIds.has(exp.id);
        if (strategy === 'skip' && hasId) return;
        if (strategy === 'overwrite' && hasId) {
          experiments = experiments.map(e => e.id === exp.id ? { ...exp } : e);
        } else if (strategy === 'duplicate' && hasId) {
          experiments.unshift({ ...exp, id: crypto.randomUUID() });
        } else {
          experiments.unshift({ ...exp });
        }
        importedExperiments++;
      });
    }

    save();
    saveArchive();
    saveGoals();
    saveCare();
    saveExperiments();
    clearDiagnosisCache();

    const totalBlocked = result.stats.blockedRecords + result.stats.blockedArchive + result.stats.blockedGoals + result.stats.blockedExperiments;
    const totalFileInternalDuplicates = result.stats.fileInternalDuplicateRecords + result.stats.fileInternalDuplicateArchive + result.stats.fileInternalDuplicateGoals + result.stats.fileInternalDuplicateCare + result.stats.fileInternalDuplicateExperiments;

    let message = `导入完成！\n\n`;
    message += `✅ 成功导入:\n`;
    message += `  生长记录: ${importedRecords} 条\n`;
    message += `  植物档案: ${importedArchive} 条\n`;
    message += `  生长目标: ${importedGoals} 条\n`;
    message += `  养护完成: ${importedCare} 项\n`;
    message += `  对比实验: ${importedExperiments} 个\n\n`;
    message += `处理策略: ${strategy === 'skip' ? '跳过重复' : strategy === 'overwrite' ? '覆盖现有' : '全部作为新记录'}\n`;

    if (totalBlocked > 0 || totalFileInternalDuplicates > 0) {
      message += `\n⚠️  被阻止的记录:\n`;
      if (totalBlocked > 0) {
        message += `  缺失必填字段: ${result.stats.blockedRecords + result.stats.blockedArchive + result.stats.blockedGoals} 条\n`;
      }
      if (totalFileInternalDuplicates > 0) {
        message += `  文件内ID重复: ${totalFileInternalDuplicates} 条\n`;
      }
      message += `\n这些记录未被写入本地存储。`;
    }

    alert(message);

    closeImportModal();
    render();
  } catch (err) {
    console.error('Import error:', err);

    records = backup.records;
    plantArchive = backup.plantArchive;
    plantGoals = backup.plantGoals;
    careCompleted = backup.careCompleted;
    experiments = backup.experiments;

    save();
    saveArchive();
    saveGoals();
    saveCare();
    saveExperiments();
    clearDiagnosisCache();

    alert(`导入失败，已回滚到之前的数据状态。\n\n错误信息: ${err.message}`);
  }
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

function getGroupRecords(group) {
  if (group.type === 'plant') {
    return records
      .filter(r => r.plant === group.plantName)
      .sort((a, b) => a.date.localeCompare(b.date));
  } else {
    return records
      .filter(r => r.plant === group.plantName && r.date >= group.dateStart && r.date <= group.dateEnd)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

function getGroupDateRange(group) {
  const groupRecords = getGroupRecords(group);
  if (groupRecords.length === 0) return { start: null, end: null, days: 0 };
  const start = groupRecords[0].date;
  const end = groupRecords[groupRecords.length - 1].date;
  return { start, end, days: daysBetween(start, end) + 1 };
}

function alignExperimentData(experiment, alignMode) {
  const alignedData = [];
  const groupsData = [];

  experiment.groups.forEach((group, groupIndex) => {
    const groupRecords = getGroupRecords(group);
    if (groupRecords.length === 0) {
      groupsData.push({ group, records: [], alignedPoints: [] });
      return;
    }

    const baseDate = groupRecords[0].date;
    const points = groupRecords.map(record => {
      const dayOffset = alignMode === 'relative' ? daysBetween(baseDate, record.date) : null;
      return {
        ...record,
        dayOffset,
        sortKey: alignMode === 'relative' ? dayOffset : record.date
      };
    });

    groupsData.push({ group, records: groupRecords, alignedPoints: points });
  });

  const allSortKeys = new Set();
  groupsData.forEach(gd => {
    gd.alignedPoints.forEach(p => allSortKeys.add(p.sortKey));
  });

  const sortedKeys = Array.from(allSortKeys).sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  });

  sortedKeys.forEach(key => {
    const dataPoint = { key, label: alignMode === 'relative' ? `Day ${key}` : String(key).slice(5) };
    groupsData.forEach((gd, idx) => {
      const point = gd.alignedPoints.find(p => p.sortKey === key);
      dataPoint[`group_${idx}`] = point || null;
      if (point) {
        if (!dataPoint.groups) dataPoint.groups = [];
        dataPoint.groups.push(idx);
      }
    });
    alignedData.push(dataPoint);
  });

  return { alignedData, groupsData, sortedKeys };
}

function calculateGrowthMetrics(group, records) {
  if (records.length < 2) {
    return {
      heightGrowth: 0,
      heightGrowthRate: 0,
      leavesGrowth: 0,
      leavesGrowthRate: 0,
      totalWater: 0,
      avgWater: 0,
      totalLight: 0,
      avgLight: 0,
      recordCount: records.length,
      durationDays: 0
    };
  }

  const first = records[0];
  const last = records[records.length - 1];
  const durationDays = daysBetween(first.date, last.date) || 1;

  const heightGrowth = last.height - first.height;
  const leavesGrowth = last.leaves - first.leaves;
  const totalWater = records.reduce((sum, r) => sum + (r.water || 0), 0);
  const totalLight = records.reduce((sum, r) => sum + (r.light || 0), 0);

  return {
    heightGrowth: Number(heightGrowth.toFixed(1)),
    heightGrowthRate: Number((heightGrowth / durationDays).toFixed(2)),
    leavesGrowth,
    leavesGrowthRate: Number((leavesGrowth / durationDays).toFixed(2)),
    totalWater: Number(totalWater.toFixed(0)),
    avgWater: Number((totalWater / records.length).toFixed(0)),
    totalLight: Number(totalLight.toFixed(1)),
    avgLight: Number((totalLight / records.length).toFixed(1)),
    recordCount: records.length,
    durationDays
  };
}

function drawMultiLineCompare(selector, alignedData, groupsData, field, unit, yAxisLabel) {
  const el = document.querySelector(selector);
  if (alignedData.length === 0) {
    el.innerHTML = '<p class="empty">暂无对比数据</p>';
    return;
  }

  const width = 600;
  const height = 240;
  const paddingLeft = 50;
  const paddingRight = 120;
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  let maxValue = 0;
  groupsData.forEach(gd => {
    gd.alignedPoints.forEach(p => {
      if (p[field] > maxValue) maxValue = p[field];
    });
  });
  maxValue = Math.max(maxValue * 1.2, 1);

  const xStep = alignedData.length > 1 ? chartWidth / (alignedData.length - 1) : chartWidth;

  let linesSvg = '';
  let dotsSvg = '';

  groupsData.forEach((gd, groupIndex) => {
    const color = gd.group.color;
    const validPoints = [];

    alignedData.forEach((dp, i) => {
      const point = dp[`group_${groupIndex}`];
      if (point && point[field] !== null && point[field] !== undefined) {
        const x = paddingLeft + i * xStep;
        const y = paddingTop + chartHeight - (point[field] / maxValue) * chartHeight;
        validPoints.push({ x, y, value: point[field], label: dp.label });
      }
    });

    if (validPoints.length > 1) {
      const pathD = validPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      linesSvg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    validPoints.forEach(p => {
      dotsSvg += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${color}" stroke="white" stroke-width="2"/>`;
    });
  });

  let axisSvg = '';
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = paddingTop + chartHeight - (i / yTicks) * chartHeight;
    const value = (maxValue * i / yTicks).toFixed(1);
    axisSvg += `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + chartWidth}" y2="${y}" stroke="#e5eee5" stroke-width="1"/>`;
    axisSvg += `<text x="${paddingLeft - 8}" y="${y + 4}" text-anchor="end" fill="#60715f" font-size="11">${value}</text>`;
  }

  alignedData.forEach((dp, i) => {
    const x = paddingLeft + i * xStep;
    axisSvg += `<text x="${x}" y="${height - 15}" text-anchor="middle" fill="#60715f" font-size="11">${dp.label}</text>`;
  });

  let legendSvg = '';
  groupsData.forEach((gd, idx) => {
    const y = paddingTop + idx * 25;
    legendSvg += `<rect x="${paddingLeft + chartWidth + 15}" y="${y}" width="14" height="14" rx="3" fill="${gd.group.color}"/>`;
    legendSvg += `<text x="${paddingLeft + chartWidth + 35}" y="${y + 11}" text-anchor="start" fill="#1f2a22" font-size="12">${gd.group.name}</text>`;
  });

  axisSvg += `<text x="${paddingLeft - 30}" y="${paddingTop + chartHeight / 2}" text-anchor="middle" fill="#60715f" font-size="11" transform="rotate(-90 ${paddingLeft - 30} ${paddingTop + chartHeight / 2})">${yAxisLabel || unit}</text>`;

  el.innerHTML = `<svg viewBox="0 0 ${width} ${height}">${axisSvg}${linesSvg}${dotsSvg}${legendSvg}</svg>`;
}

function drawGroupedBarCompare(selector, alignedData, groupsData, field1, field2, unit1, unit2, label1, label2) {
  const el = document.querySelector(selector);
  if (alignedData.length === 0) {
    el.innerHTML = '<p class="empty">暂无对比数据</p>';
    return;
  }

  const width = 650;
  const height = 260;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 50;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const groupCount = groupsData.length;
  const barGroupWidth = Math.min(80, chartWidth / alignedData.length - 10);
  const barWidth = barGroupWidth / (groupCount * 2 + 1);

  let maxValue = 0;
  groupsData.forEach(gd => {
    gd.alignedPoints.forEach(p => {
      if (p[field1] > maxValue) maxValue = p[field1];
      if (p[field2] * 20 > maxValue) maxValue = p[field2] * 20;
    });
  });
  maxValue = Math.max(maxValue * 1.2, 1);

  let barsSvg = '';
  let legendSvg = '';

  alignedData.forEach((dp, dataIndex) => {
    const groupBaseX = paddingLeft + dataIndex * (chartWidth / alignedData.length) + 5;

    groupsData.forEach((gd, groupIndex) => {
      const point = dp[`group_${groupIndex}`];
      const color = gd.group.color;

      if (point) {
        const value1 = point[field1] || 0;
        const value2 = (point[field2] || 0) * 20;

        const bar1X = groupBaseX + groupIndex * (barWidth * 2 + 4);
        const bar2X = bar1X + barWidth;

        const bar1Height = (value1 / maxValue) * chartHeight;
        const bar2Height = (value2 / maxValue) * chartHeight;

        const bar1Y = paddingTop + chartHeight - bar1Height;
        const bar2Y = paddingTop + chartHeight - bar2Height;

        barsSvg += `<rect x="${bar1X}" y="${bar1Y}" width="${barWidth - 2}" height="${bar1Height}" rx="3" fill="${color}" opacity="0.9"/>`;
        barsSvg += `<rect x="${bar2X}" y="${bar2Y}" width="${barWidth - 2}" height="${bar2Height}" rx="3" fill="${color}" opacity="0.5"/>`;
      }
    });

    const labelX = groupBaseX + (barGroupWidth - 10) / 2;
    barsSvg += `<text x="${labelX}" y="${height - 20}" text-anchor="middle" fill="#60715f" font-size="11">${dp.label}</text>`;
  });

  let axisSvg = '';
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = paddingTop + chartHeight - (i / yTicks) * chartHeight;
    const value1 = (maxValue * i / yTicks).toFixed(0);
    const value2 = (maxValue * i / yTicks / 20).toFixed(1);
    axisSvg += `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + chartWidth}" y2="${y}" stroke="#e5eee5" stroke-width="1"/>`;
    axisSvg += `<text x="${paddingLeft - 8}" y="${y + 4}" text-anchor="end" fill="#2f855a" font-size="11">${value1}${unit1}</text>`;
    axisSvg += `<text x="${paddingLeft + chartWidth + 8}" y="${y + 4}" text-anchor="start" fill="#f59e0b" font-size="11">${value2}${unit2}</text>`;
  }

  legendSvg += `<rect x="${paddingLeft + 20}" y="${8}" width="14" height="14" rx="3" fill="#2f855a" opacity="0.9"/>`;
  legendSvg += `<text x="${paddingLeft + 40}" y="${19}" text-anchor="start" fill="#1f2a22" font-size="12">${label1}</text>`;
  legendSvg += `<rect x="${paddingLeft + 120}" y="${8}" width="14" height="14" rx="3" fill="#f59e0b" opacity="0.5"/>`;
  legendSvg += `<text x="${paddingLeft + 140}" y="${19}" text-anchor="start" fill="#1f2a22" font-size="12">${label2}</text>`;

  groupsData.forEach((gd, idx) => {
    const x = paddingLeft + 240 + idx * 130;
    legendSvg += `<rect x="${x}" y="${8}" width="14" height="14" rx="3" fill="${gd.group.color}"/>`;
    legendSvg += `<text x="${x + 20}" y="${19}" text-anchor="start" fill="#1f2a22" font-size="12">${gd.group.name}</text>`;
  });

  el.innerHTML = `<svg viewBox="0 0 ${width} ${height}">${axisSvg}${barsSvg}${legendSvg}</svg>`;
}

function renderExperimentGroupsForm() {
  const plants = [...new Set(records.map(r => r.plant))].sort();

  if (experimentGroups.length === 0) {
    experimentGroups.push({
      id: crypto.randomUUID(),
      name: '',
      type: experimentFormType,
      plantName: plants[0] || '',
      dateStart: '',
      dateEnd: '',
      color: EXPERIMENT_COLORS[0]
    });
  }

  experimentGroupsList.innerHTML = experimentGroups.map((group, index) => {
    const color = group.color || EXPERIMENT_COLORS[index % EXPERIMENT_COLORS.length];
    const typeOptions = experimentFormType === 'plant'
      ? `<select name="plantName_${index}" required>
           <option value="">选择植物</option>
           ${plants.map(p => `<option value="${p}" ${group.plantName === p ? 'selected' : ''}>${p}</option>`).join('')}
         </select>`
      : `<div class="dateRangeInputs">
           <select name="plantName_${index}" required>
             <option value="">选择植物</option>
             ${plants.map(p => `<option value="${p}" ${group.plantName === p ? 'selected' : ''}>${p}</option>`).join('')}
           </select>
           <input type="date" name="dateStart_${index}" placeholder="开始日期" value="${group.dateStart}" required />
           <input type="date" name="dateEnd_${index}" placeholder="结束日期" value="${group.dateEnd}" required />
         </div>`;

    return `
      <div class="experimentGroupItem" data-group-index="${index}">
        <div class="experimentGroupHead">
          <div class="experimentGroupColor" style="background: ${color}"></div>
          <input type="text" name="groupName_${index}" placeholder="实验组名称" value="${group.name}" required />
          <button type="button" class="experimentRemoveGroup" data-remove-group="${index}" ${experimentGroups.length <= 2 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>×</button>
        </div>
        <div class="experimentGroupBody">
          ${typeOptions}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-remove-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.removeGroup);
      experimentGroups.splice(idx, 1);
      renderExperimentGroupsForm();
    });
  });
}

function getExperimentFormData() {
  const formData = new FormData(experimentForm);
  const data = {
    name: formData.get('name'),
    description: formData.get('description'),
    type: experimentFormType,
    groups: []
  };

  experimentGroups.forEach((group, index) => {
    const name = formData.get(`groupName_${index}`);
    const plantName = formData.get(`plantName_${index}`);

    const groupData = {
      id: group.id,
      name: name || `实验组${index + 1}`,
      type: experimentFormType,
      plantName,
      color: group.color || EXPERIMENT_COLORS[index % EXPERIMENT_COLORS.length]
    };

    if (experimentFormType === 'dateRange') {
      groupData.dateStart = formData.get(`dateStart_${index}`);
      groupData.dateEnd = formData.get(`dateEnd_${index}`);
    }

    data.groups.push(groupData);
  });

  return data;
}

function validateExperimentForm(data) {
  if (!data.name || data.name.trim() === '') {
    alert('请输入实验名称');
    return false;
  }
  if (data.groups.length < 2) {
    alert('至少需要2个实验组才能进行对比');
    return false;
  }

  const plantNames = new Set();
  for (const group of data.groups) {
    if (!group.plantName) {
      alert(`请为「${group.name}」选择植物`);
      return false;
    }
    if (group.type === 'dateRange') {
      if (!group.dateStart || !group.dateEnd) {
        alert(`请为「${group.name}」选择日期范围`);
        return false;
      }
      if (group.dateStart > group.dateEnd) {
        alert(`「${group.name}」的开始日期不能晚于结束日期`);
        return false;
      }
    }

    const groupRecords = getGroupRecords(group);
    if (groupRecords.length === 0) {
      alert(`「${group.name}」没有找到任何记录，请检查选择条件`);
      return false;
    }

    const key = group.type === 'plant' ? group.plantName : `${group.plantName}-${group.dateStart}-${group.dateEnd}`;
    if (plantNames.has(key)) {
      alert(`存在重复的实验组：${group.name}`);
      return false;
    }
    plantNames.add(key);
  }

  return true;
}

function saveExperiment(data) {
  if (experimentEditingId) {
    experiments = experiments.map(exp =>
      exp.id === experimentEditingId ? { ...exp, ...data, updatedAt: formatDate(new Date()) } : exp
    );
  } else {
    experiments.unshift({
      ...data,
      id: crypto.randomUUID(),
      createdAt: formatDate(new Date())
    });
  }
  saveExperiments();
}

function deleteExperiment(expId) {
  const exp = experiments.find(e => e.id === expId);
  if (!exp) return;

  if (confirm(`确定要删除实验「${exp.name}」吗？`)) {
    experiments = experiments.filter(e => e.id !== expId);
    saveExperiments();
    if (experimentViewingId === expId) {
      experimentViewingId = null;
    }
    renderExperiments();
  }
}

function viewExperiment(expId) {
  experimentViewingId = expId;
  renderExperiments();
}

function editExperiment(expId) {
  const exp = experiments.find(e => e.id === expId);
  if (!exp) return;

  experimentEditingId = expId;
  experimentFormType = exp.type;
  experimentGroups = exp.groups.map(g => ({ ...g }));
  experimentFormTitle.textContent = '编辑对比实验';
  experimentSaveBtn.textContent = '保存修改';
  experimentCancelBtn.style.display = 'inline-block';

  experimentForm.elements.name.value = exp.name;
  experimentForm.elements.description.value = exp.description || '';
  experimentForm.elements.expType.value = exp.type;

  renderExperimentGroupsForm();
  experimentForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderExperimentList() {
  if (experiments.length === 0) {
    experimentList.innerHTML = '<p class="empty">暂无对比实验，创建第一个实验开始对比吧</p>';
    return;
  }

  experimentList.innerHTML = `
    <h4 class="experimentListTitle">已有实验（${experiments.length}）</h4>
    <div class="experimentCards">
      ${experiments.map(exp => {
        const metrics = exp.groups.map(group => {
          const records = getGroupRecords(group);
          return calculateGrowthMetrics(group, records);
        });

        return `
          <div class="experimentCard">
            <div class="experimentCardHead">
              <div class="experimentCardTitle">
                <h5>${exp.name}</h5>
                <span class="experimentTypeTag">${exp.type === 'plant' ? '植物对比' : '时段对比'}</span>
              </div>
              <span class="experimentDate">${exp.createdAt}</span>
            </div>
            ${exp.description ? `<p class="experimentCardDesc">${exp.description}</p>` : ''}
            <div class="experimentCardGroups">
              ${exp.groups.map((g, idx) => `
                <div class="experimentCardGroup">
                  <span class="experimentGroupDot" style="background: ${g.color}"></span>
                  <span class="experimentGroupName">${g.name}</span>
                  <span class="experimentGroupMeta">${g.plantName}${g.dateStart ? ` · ${g.dateStart.slice(5)}~${g.dateEnd.slice(5)}` : ''} · ${metrics[idx].recordCount}条</span>
                  <span class="experimentGroupGrowth">📏+${metrics[idx].heightGrowth}cm 🍃+${metrics[idx].leavesGrowth}片</span>
                </div>
              `).join('')}
            </div>
            <div class="experimentCardActions">
              <button class="experimentViewBtn" data-view="${exp.id}">查看对比</button>
              <button class="experimentEditBtn" data-edit="${exp.id}">编辑</button>
              <button class="experimentDelBtn" data-del="${exp.id}">删除</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => viewExperiment(btn.dataset.view));
  });
  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => editExperiment(btn.dataset.edit));
  });
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteExperiment(btn.dataset.del));
  });
}

function renderExperimentView() {
  const exp = experiments.find(e => e.id === experimentViewingId);
  if (!exp) {
    experimentView.style.display = 'none';
    return;
  }

  experimentView.style.display = 'block';
  experimentAlignModeSelect.value = experimentAlignMode;

  const { alignedData, groupsData } = alignExperimentData(exp, experimentAlignMode);

  const groupMetrics = groupsData.map(gd => calculateGrowthMetrics(gd.group, gd.records));

  experimentViewInfo.innerHTML = `
    <div class="experimentViewHeader">
      <div>
        <h3>${exp.name}</h3>
        <p class="experimentViewDesc">${exp.description || '暂无实验说明'}</p>
        <div class="experimentViewTags">
          <span class="experimentTypeTag">${exp.type === 'plant' ? '植物对比' : '时段对比'}</span>
          <span>共 ${exp.groups.length} 组</span>
          <span>${alignedData.length} 个数据点</span>
        </div>
      </div>
    </div>

    <div class="experimentMetricsGrid">
      ${groupsData.map((gd, idx) => {
        const m = groupMetrics[idx];
        return `
          <div class="experimentMetricCard" style="border-left: 4px solid ${gd.group.color}">
            <div class="experimentMetricHead">
              <span class="experimentMetricDot" style="background: ${gd.group.color}"></span>
              <strong>${gd.group.name}</strong>
            </div>
            <div class="experimentMetricStats">
              <div class="experimentMetricItem">
                <span class="metricLabel">高度增长</span>
                <span class="metricValue">+${m.heightGrowth}cm</span>
                <span class="metricRate">${m.heightGrowthRate}cm/天</span>
              </div>
              <div class="experimentMetricItem">
                <span class="metricLabel">叶片增长</span>
                <span class="metricValue">+${m.leavesGrowth}片</span>
                <span class="metricRate">${m.leavesGrowthRate}片/天</span>
              </div>
              <div class="experimentMetricItem">
                <span class="metricLabel">累计浇水</span>
                <span class="metricValue">${m.totalWater}ml</span>
                <span class="metricRate">${m.avgWater}ml/次</span>
              </div>
              <div class="experimentMetricItem">
                <span class="metricLabel">累计光照</span>
                <span class="metricValue">${m.totalLight}h</span>
                <span class="metricRate">${m.avgLight}h/天</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="experimentDataNotice" id="experimentDataNotice"></div>
  `;

  const noticeEl = document.querySelector('#experimentDataNotice');
  const issues = [];
  groupsData.forEach((gd, idx) => {
    if (gd.records.length < 2) {
      issues.push(`「${gd.group.name}」记录不足2条，增长率计算可能不准确`);
    }
    const missingPoints = alignedData.length - gd.alignedPoints.length;
    if (missingPoints > 0) {
      issues.push(`「${gd.group.name}」缺失 ${missingPoints} 个时间点的数据`);
    }
  });

  if (issues.length > 0) {
    noticeEl.innerHTML = `
      <div class="dataNotice">
        <span class="dataNoticeIcon">⚠️</span>
        <div class="dataNoticeContent">
          <strong>数据提示</strong>
          <ul>${issues.map(i => `<li>${i}</li>`).join('')}</ul>
        </div>
      </div>
    `;
  }

  experimentCharts.innerHTML = `
    <div class="panel">
      <div class="panelHead"><h3>📏 高度增长对比</h3></div>
      <div class="chart" id="expHeightChart"></div>
    </div>
    <div class="panel">
      <div class="panelHead"><h3>🍃 叶片数量对比</h3></div>
      <div class="chart" id="expLeafChart"></div>
    </div>
    <div class="panel">
      <div class="panelHead"><h3>💧 ☀️ 浇水与光照对比</h3></div>
      <div class="chart" id="expCareChart"></div>
    </div>
  `;

  drawMultiLineCompare('#expHeightChart', alignedData, groupsData, 'height', 'cm', '高度 (cm)');
  drawMultiLineCompare('#expLeafChart', alignedData, groupsData, 'leaves', '片', '叶片数');
  drawGroupedBarCompare('#expCareChart', alignedData, groupsData, 'water', 'light', 'ml', 'h', '浇水量(ml)', '光照(h)');
}

function renderExperiments() {
  document.querySelector('#experimentBadge').textContent = `共 ${experiments.length} 个实验`;
  document.querySelector('#experimentBody').style.display = experimentExpanded ? 'block' : 'none';
  experimentToggle.textContent = experimentExpanded ? '收起' : '展开';

  if (experimentViewingId) {
    experimentForm.style.display = 'none';
    experimentList.style.display = 'none';
    renderExperimentView();
  } else {
    experimentForm.style.display = 'grid';
    experimentView.style.display = 'none';
    experimentList.style.display = 'block';
    renderExperimentGroupsForm();
    renderExperimentList();
  }
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
        waterIntervalDays: null,
        waterAmount: null,
        lightMin: null,
        lightMax: null,
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
    const stateTextarea = form.elements.state;
    const hasContent = stateTextarea && stateTextarea.value.trim() !== '';
    const isEditing = editingId !== null;

    let insertBtn = '';
    if (hasContent && !isEditing) {
      insertBtn = `<button type="button" class="notesInsertBtn" id="notesInsertBtn" data-notes="${encodeURIComponent(plant.defaultNotes)}">插入备注</button>`;
    }

    plantNotesHint.innerHTML = `<span class="notesHintIcon">📝</span><span class="notesHintText">养护备注：${plant.defaultNotes}</span>${insertBtn}`;
    plantNotesHint.style.display = 'flex';

    if (stateTextarea && !hasContent && !isEditing) {
      stateTextarea.value = plant.defaultNotes;
    }

    const insertBtnEl = document.querySelector('#notesInsertBtn');
    if (insertBtnEl) {
      insertBtnEl.addEventListener('click', () => {
        const notes = decodeURIComponent(insertBtnEl.dataset.notes);
        if (stateTextarea) {
          const currentValue = stateTextarea.value;
          const separator = currentValue.trim() ? '\n\n' : '';
          stateTextarea.value = currentValue + separator + notes;
          stateTextarea.focus();
        }
      });
    }
  } else {
    plantNotesHint.style.display = 'none';
  }
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

archiveForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(archiveForm).entries());
  const templateData = {
    waterIntervalDays: parseOptionalNumber(data.waterIntervalDays),
    waterAmount: parseOptionalNumber(data.waterAmount),
    lightMin: parseOptionalNumber(data.lightMin),
    lightMax: parseOptionalNumber(data.lightMax)
  };
  const cleanData = { ...data, ...templateData };

  if (templateData.lightMin !== null && templateData.lightMax !== null && templateData.lightMin > templateData.lightMax) {
    alert('理想光照范围：最小值不能大于最大值');
    return;
  }

  if (archiveEditingId) {
    plantArchive = plantArchive.map((p) =>
      p.id === archiveEditingId ? { ...p, ...cleanData, autoImported: false } : p
    );
  } else {
    const exists = plantArchive.find((p) => p.nickname === data.nickname);
    if (exists) {
      alert(`已存在名为「${data.nickname}」的植物档案`);
      return;
    }
    plantArchive.push({
      ...cleanData,
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
  renderCareCalendar();
});

archiveCancelBtn.addEventListener('click', () => {
  archiveEditingId = null;
  archiveForm.reset();
  archiveCancelBtn.style.display = 'none';
  archiveFormTitle.textContent = '新增植物档案';
});

experimentToggle.addEventListener('click', () => {
  experimentExpanded = !experimentExpanded;
  renderExperiments();
});

experimentAddGroupBtn.addEventListener('click', () => {
  const plants = [...new Set(records.map(r => r.plant))].sort();
  experimentGroups.push({
    id: crypto.randomUUID(),
    name: '',
    type: experimentFormType,
    plantName: plants[0] || '',
    dateStart: '',
    dateEnd: '',
    color: EXPERIMENT_COLORS[experimentGroups.length % EXPERIMENT_COLORS.length]
  });
  renderExperimentGroupsForm();
});

experimentCancelBtn.addEventListener('click', () => {
  experimentEditingId = null;
  experimentForm.reset();
  experimentGroups = [];
  experimentFormType = 'plant';
  experimentForm.elements.expType[0].checked = true;
  experimentCancelBtn.style.display = 'none';
  experimentFormTitle.textContent = '创建对比实验';
  experimentSaveBtn.textContent = '创建实验';
  renderExperimentGroupsForm();
});

experimentForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = getExperimentFormData();
  if (!validateExperimentForm(data)) return;
  saveExperiment(data);
  experimentEditingId = null;
  experimentForm.reset();
  experimentGroups = [];
  experimentCancelBtn.style.display = 'none';
  experimentFormTitle.textContent = '创建对比实验';
  experimentSaveBtn.textContent = '创建实验';
  renderExperiments();
});

document.querySelectorAll('input[name="expType"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    experimentFormType = e.target.value;
    experimentGroups = experimentGroups.map(g => ({
      ...g,
      type: experimentFormType,
      dateStart: experimentFormType === 'dateRange' ? (g.dateStart || '') : undefined,
      dateEnd: experimentFormType === 'dateRange' ? (g.dateEnd || '') : undefined
    }));
    renderExperimentGroupsForm();
  });
});

experimentBackBtn.addEventListener('click', () => {
  experimentViewingId = null;
  renderExperiments();
});

experimentAlignModeSelect.addEventListener('change', (e) => {
  experimentAlignMode = e.target.value;
  if (experimentViewingId) {
    renderExperimentView();
  }
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

photoTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    currentPhotoTab = tabName;
    photoTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    photoTabContents.forEach(content => {
      content.style.display = content.dataset.tabContent === tabName ? 'block' : 'none';
    });
  });
});

photoUploadArea.addEventListener('click', (e) => {
  if (e.target !== photoRemoveBtn && !photoRemoveBtn.contains(e.target)) {
    photoFileInput.click();
  }
});

photoUploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  photoUploadArea.style.borderColor = '#2f855a';
  photoUploadArea.style.background = '#f0fff4';
});

photoUploadArea.addEventListener('dragleave', () => {
  photoUploadArea.style.borderColor = '';
  photoUploadArea.style.background = '';
});

photoUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  photoUploadArea.style.borderColor = '';
  photoUploadArea.style.background = '';
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type.startsWith('image/')) {
    handlePhotoFile(files[0]);
  }
});

photoFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    handlePhotoFile(file);
  }
});

photoRemoveBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (pendingPhotoUpload && pendingPhotoUpload.imageId) {
    PhotoManager.deleteByPhotoUrl(pendingPhotoUpload.url).catch(err => console.warn('清理临时图片失败:', err));
  }
  pendingPhotoUpload = null;
  photoRemovedByUser = true;
  photoPreviewContainer.style.display = 'none';
  photoUploadArea.querySelector('.photoUploadPlaceholder').style.display = 'flex';
  photoFileInput.value = '';
});

async function handlePhotoFile(file) {
  try {
    photoUploadArea.style.opacity = '0.6';
    photoUploadArea.style.pointerEvents = 'none';

    const tempRecordId = 'pending-' + crypto.randomUUID();
    const result = await PhotoManager.handleFileUpload(file, tempRecordId);
    pendingPhotoUpload = { ...result, tempRecordId };

    photoPreview.src = result.thumbnail || result.data;
    const sizeKB = (result.compressedSize / 1024).toFixed(1);
    const origSizeKB = (result.originalSize / 1024).toFixed(1);
    photoPreviewInfo.innerHTML = `压缩: ${origSizeKB}KB → ${sizeKB}KB (节省${result.compressionRatio}%)`;
    photoPreviewContainer.style.display = 'block';
    photoUploadArea.querySelector('.photoUploadPlaceholder').style.display = 'none';
  } catch (err) {
    alert('图片上传失败：' + err.message);
    console.error('Photo upload error:', err);
  } finally {
    photoUploadArea.style.opacity = '';
    photoUploadArea.style.pointerEvents = '';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const newRecordId = editingId || crypto.randomUUID();

  let photoUrl = '';
  if (currentPhotoTab === 'upload' && pendingPhotoUpload) {
    photoUrl = pendingPhotoUpload.url;
    try {
      const oldRecord = editingId ? records.find(r => r.id === editingId) : null;
      if (oldRecord && oldRecord.photo && PhotoManager.isLocalImage(oldRecord.photo) && oldRecord.photo !== photoUrl) {
        await PhotoManager.deleteByPhotoUrl(oldRecord.photo);
      }
      const photo = await PhotoStorage.get(PhotoManager.getImageId(photoUrl));
      if (photo) {
        photo.recordId = newRecordId;
        await PhotoStorage.save(photo);
      }
    } catch (err) {
      console.warn('更新图片关联失败:', err);
    }
  } else if (currentPhotoTab === 'url') {
    photoUrl = data.photo || '';
    if (editingId) {
      const oldRecord = records.find(r => r.id === editingId);
      if (oldRecord && oldRecord.photo && PhotoManager.isLocalImage(oldRecord.photo) && oldRecord.photo !== photoUrl) {
        await PhotoManager.deleteByPhotoUrl(oldRecord.photo).catch(err => console.warn('清理旧图片失败:', err));
      }
    }
  } else if (editingId) {
    const oldRecord = records.find(r => r.id === editingId);
    if (photoRemovedByUser) {
      photoUrl = '';
      if (oldRecord && oldRecord.photo && PhotoManager.isLocalImage(oldRecord.photo)) {
        await PhotoManager.deleteByPhotoUrl(oldRecord.photo).catch(err => console.warn('清理已移除的旧图片失败:', err));
      }
    } else {
      photoUrl = oldRecord ? (oldRecord.photo || '') : '';
    }
  }

  const item = {
    ...data,
    height: Number(data.height),
    leaves: Number(data.leaves),
    water: Number(data.water),
    light: Number(data.light),
    photo: photoUrl,
    id: newRecordId
  };

  records = editingId ? records.map((record) => (record.id === editingId ? item : record)) : [item, ...records];
  editingId = null;
  pendingPhotoUpload = null;
  photoRemovedByUser = false;
  form.reset();
  photoPreviewContainer.style.display = 'none';
  photoUploadArea.querySelector('.photoUploadPlaceholder').style.display = 'flex';
  photoFileInput.value = '';
  currentPhotoTab = 'upload';
  photoTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'upload'));
  photoTabContents.forEach(content => {
    content.style.display = content.dataset.tabContent === 'upload' ? 'block' : 'none';
  });
  plantNotesHint.style.display = 'none';
  save();
  syncPlantsFromRecords();
  checkAndUpdateGoalAchievement(data.plant);
  clearDiagnosisCache();
  render();
});

filter.addEventListener('change', render);
search.addEventListener('input', render);
document.querySelector('#sample').addEventListener('click', () => {
  records = seed;
  save();
  clearDiagnosisCache();
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
  const recordPlants = [...new Set(records.map((r) => r.plant))];
  const templatePlants = plantArchive
    .filter((p) => p.waterIntervalDays !== null || p.waterAmount !== null)
    .map((p) => p.nickname);
  const allPlants = [...new Set([...recordPlants, ...templatePlants])];
  const result = [];

  allPlants.forEach((plant) => {
    const plantInfo = plantArchive.find((p) => p.nickname === plant);
    const hasTemplate = plantInfo && (plantInfo.waterIntervalDays !== null || plantInfo.waterAmount !== null);

    const plantRecords = records
      .filter((r) => r.plant === plant && r.water > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    let avgInterval, avgWater, lastWaterDate, lastRecord, sourceRecordId;

    if (plantRecords.length > 0) {
      const intervals = [];
      for (let i = 1; i < plantRecords.length; i++) {
        const diff = daysBetween(plantRecords[i - 1].date, plantRecords[i].date);
        if (diff > 0) intervals.push(diff);
      }

      avgInterval = intervals.length > 0
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : 3;
      avgWater = Math.round(plantRecords.reduce((a, b) => a + b.water, 0) / plantRecords.length);

      lastRecord = plantRecords[plantRecords.length - 1];
      lastWaterDate = lastRecord.date;
      sourceRecordId = lastRecord.id;
    } else if (hasTemplate) {
      avgInterval = plantInfo.waterIntervalDays || 3;
      avgWater = plantInfo.waterAmount || 50;
      lastWaterDate = today;
      lastRecord = null;
      sourceRecordId = null;
    } else {
      return;
    }

    if (plantInfo && plantInfo.waterIntervalDays !== null) {
      avgInterval = plantInfo.waterIntervalDays;
    }
    if (plantInfo && plantInfo.waterAmount !== null) {
      avgWater = plantInfo.waterAmount;
    }

    const nextWaterDate = formatDate(new Date(parseDate(lastWaterDate).getTime() + avgInterval * 24 * 60 * 60 * 1000));

    result.push({
      plant,
      lastWaterDate,
      avgInterval,
      avgWater,
      nextWaterDate,
      sourceRecordId,
      fromTemplate: hasTemplate,
      template: hasTemplate ? {
        waterIntervalDays: plantInfo.waterIntervalDays,
        waterAmount: plantInfo.waterAmount,
        lightMin: plantInfo.lightMin,
        lightMax: plantInfo.lightMax,
        defaultNotes: plantInfo.defaultNotes
      } : null
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
          sourceRecordId: info.sourceRecordId,
          fromTemplate: info.fromTemplate,
          template: info.template
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
          sourceRecordId: info.sourceRecordId,
          fromTemplate: info.fromTemplate,
          template: info.template
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
        <p>在添加生长记录时上传照片，即可在此处查看时间轴</p>
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
        const isLocalPhoto = hasPhoto && PhotoManager.isLocalImage(record.photo);

        return `
          <div class="timelineItem ${hasPhoto ? 'hasPhoto' : 'noPhoto'}">
            <div class="timelineLine ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}">
              <div class="timelineDot ${hasPhoto ? 'photoDot' : 'noPhotoDot'}"></div>
            </div>
            <div class="timelineCard ${hasPhoto ? 'photoCard' : 'infoCard'}">
              <div class="timelineCardHead">
                <span class="timelineDate">${record.date}</span>
                ${hasPhoto ? `<span class="photoBadge">${isLocalPhoto ? '📷 本地照片' : '🔗 照片链接'}</span>` : '<span class="noPhotoBadge">无照片</span>'}
              </div>
              ${hasPhoto ? `
                <div class="timelinePhotoWrap">
                  <img
                    data-role="timeline-photo"
                    data-photo="${record.photo}"
                    data-record-id="${record.id}"
                    data-record-date="${record.date}"
                    data-record-plant="${timelinePlant}"
                    alt="${timelinePlant} - ${record.date}"
                    class="timelinePhoto timelinePhotoClickable ${isLocalPhoto ? 'timelinePhotoPending' : ''}"
                  />
                  <a href="#" class="photoLink" data-role="timeline-view-big" data-photo="${record.photo}">查看大图 ↗</a>
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

  loadTimelinePhotos();
  bindTimelinePhotoEvents();
}

async function loadTimelinePhotos() {
  const imgs = document.querySelectorAll('img[data-role="timeline-photo"]');
  for (const img of imgs) {
    const photoUrl = img.dataset.photo;
    if (!photoUrl) continue;
    try {
      const resolvedUrl = await resolveThumbnailUrl(photoUrl);
      if (resolvedUrl) {
        img.src = resolvedUrl;
        img.classList.remove('timelinePhotoPending');
      }
    } catch (err) {
      console.warn('加载时间轴照片失败:', err);
    }
  }
}

function bindTimelinePhotoEvents() {
  document.querySelectorAll('img[data-role="timeline-photo"]').forEach((img) => {
    img.addEventListener('click', async () => {
      const photoUrl = img.dataset.photo;
      const recordId = img.dataset.recordId;
      const date = img.dataset.recordDate;
      const plant = img.dataset.recordPlant;
      try {
        const resolvedPhoto = await resolvePhotoUrl(photoUrl);
        const compareData = {
          id: recordId,
          date,
          photo: resolvedPhoto,
          plant,
          originalPhoto: photoUrl
        };
        if (!comparePhoto1) {
          comparePhoto1 = compareData;
          img.classList.add('selectedForCompare');
        } else if (!comparePhoto2) {
          comparePhoto2 = compareData;
          img.classList.add('selectedForCompare');
        } else {
          document.querySelectorAll('.selectedForCompare').forEach((el) => {
            el.classList.remove('selectedForCompare');
          });
          comparePhoto1 = compareData;
          comparePhoto2 = null;
          img.classList.add('selectedForCompare');
        }
        updateCompareModal();
        if (comparePhoto1 && comparePhoto2) {
          setTimeout(() => openCompareModal(), 300);
        }
      } catch (err) {
        console.error('选择对比照片失败:', err);
      }
    });
  });

  document.querySelectorAll('[data-role="timeline-view-big"]').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const photoUrl = link.dataset.photo;
      if (!photoUrl) return;
      try {
        const resolvedUrl = await resolvePhotoUrl(photoUrl);
        if (resolvedUrl) {
          const w = window.open();
          if (w) {
            w.document.write(`<html><head><title>照片查看</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;object-fit:contain;}</style></head><body><img src="${resolvedUrl}" alt="照片"/></body></html>`);
          }
        }
      } catch (err) {
        console.error('打开大图失败:', err);
      }
    });
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

exportBtn.addEventListener('click', exportData);

importBtn.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    openImportModal();
    processImportFile(file);
  }
});

importClose.addEventListener('click', closeImportModal);
importCancelBtn.addEventListener('click', closeImportModal);
importModal.addEventListener('click', (e) => {
  if (e.target === importModal) closeImportModal();
});

importConfirmBtn.addEventListener('click', performImport);

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

    let templateSection = '';
    const hasTemplate = plant.waterIntervalDays !== null || plant.waterAmount !== null || plant.lightMin !== null || plant.lightMax !== null;
    if (hasTemplate) {
      const templateItems = [];
      if (plant.waterIntervalDays !== null) {
        templateItems.push(`<span class="templateTag template-water">💧 每${plant.waterIntervalDays}天浇水</span>`);
      }
      if (plant.waterAmount !== null) {
        templateItems.push(`<span class="templateTag template-amount">🚿 ${plant.waterAmount}ml/次</span>`);
      }
      if (plant.lightMin !== null && plant.lightMax !== null) {
        templateItems.push(`<span class="templateTag template-light">☀️ ${plant.lightMin}-${plant.lightMax}h光照</span>`);
      } else if (plant.lightMin !== null) {
        templateItems.push(`<span class="templateTag template-light">☀️ ≥${plant.lightMin}h光照</span>`);
      } else if (plant.lightMax !== null) {
        templateItems.push(`<span class="templateTag template-light">☀️ ≤${plant.lightMax}h光照</span>`);
      }
      templateSection = `
        <div class="plantTemplateSection">
          <div class="templateLabel">养护模板</div>
          <div class="templateTags">${templateItems.join('')}</div>
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
          ${templateSection}
          ${plant.defaultNotes ? `<div class="archiveInfoItem"><span class="archiveInfoLabel">养护备注</span><span>${plant.defaultNotes}</span></div>` : ''}
          ${goalSection}
          ${plant.autoImported && !plant.acquisitionDate && !plant.location && !hasTemplate && !plant.defaultNotes ? '<div class="archiveHint">点击「完善信息」补充植物详情和养护模板</div>' : ''}
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
        archiveForm.elements.waterIntervalDays.value = plant.waterIntervalDays !== null && plant.waterIntervalDays !== undefined ? plant.waterIntervalDays : '';
        archiveForm.elements.waterAmount.value = plant.waterAmount !== null && plant.waterAmount !== undefined ? plant.waterAmount : '';
        archiveForm.elements.lightMin.value = plant.lightMin !== null && plant.lightMin !== undefined ? plant.lightMin : '';
        archiveForm.elements.lightMax.value = plant.lightMax !== null && plant.lightMax !== undefined ? plant.lightMax : '';
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
  const recordPlants = records.map((r) => r.plant);
  const templatePlants = plantArchive
    .filter((p) => p.waterIntervalDays !== null || p.waterAmount !== null)
    .map((p) => p.nickname);
  const plants = [...new Set([...recordPlants, ...templatePlants])].sort();

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
            const templateBadge = item.fromTemplate ? '<span class="template-badge" title="按养护模板生成">📋</span>' : '';
            let detailHtml = `<span class="care-water">💧 ${item.water}ml</span>`;
            if (item.fromTemplate && item.template) {
              const lightTags = [];
              if (item.template.lightMin !== null && item.template.lightMax !== null) {
                lightTags.push(`<span class="care-light">☀️ ${item.template.lightMin}-${item.template.lightMax}h</span>`);
              } else if (item.template.lightMin !== null) {
                lightTags.push(`<span class="care-light">☀️ ≥${item.template.lightMin}h</span>`);
              } else if (item.template.lightMax !== null) {
                lightTags.push(`<span class="care-light">☀️ ≤${item.template.lightMax}h</span>`);
              }
              if (lightTags.length > 0) {
                detailHtml += ' ' + lightTags.join('');
              }
            }
            const notesHtml = (item.fromTemplate && item.template && item.template.defaultNotes)
              ? `<div class="care-item-notes" title="养护备注">📝 ${item.template.defaultNotes}</div>`
              : '';
            return `
              <div class="care-item ${item.completed ? 'item-completed' : ''}">
                <div class="care-item-main">
                  <span class="care-plant">${item.plant} ${templateBadge}</span>
                  <span class="status-tag ${statusInfo.class}">${statusInfo.text}</span>
                </div>
                <div class="care-item-detail">
                  ${detailHtml}
                </div>
                ${notesHtml}
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

async function loadRecordThumbnails() {
  const thumbs = document.querySelectorAll('img[data-role="record-thumb"]');
  for (const img of thumbs) {
    const photoUrl = img.dataset.photo;
    if (!photoUrl) continue;
    try {
      if (PhotoManager.isLocalImage(photoUrl)) {
        const thumbUrl = await PhotoManager.getThumbnailUrl(photoUrl);
        if (thumbUrl) {
          img.src = thumbUrl;
          img.classList.remove('recordThumbPending');
        } else {
          img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23e5eee5" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23a0aec0" font-size="12">丢失</text></svg>';
          img.classList.remove('recordThumbPending');
        }
      } else {
        img.src = photoUrl;
        img.classList.remove('recordThumbPending');
      }
    } catch (err) {
      console.warn('加载缩略图失败:', err);
      img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23fef2f2" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23dc2626" font-size="10">错误</text></svg>';
      img.classList.remove('recordThumbPending');
    }
  }
}

function bindRecordPhotoLinks() {
  document.querySelectorAll('[data-role="record-photo-link"]').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const photoUrl = link.dataset.photoLink;
      if (!photoUrl) return;
      try {
        if (PhotoManager.isLocalImage(photoUrl)) {
          const fullUrl = await PhotoManager.getImageUrl(photoUrl);
          if (fullUrl) {
            const w = window.open();
            if (w) {
              w.document.write(`<html><head><title>照片查看</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;object-fit:contain;}</style></head><body><img src="${fullUrl}" alt="照片"/></body></html>`);
            }
          } else {
            alert('照片数据丢失或损坏');
          }
        } else {
          window.open(photoUrl, '_blank');
        }
      } catch (err) {
        console.error('打开照片失败:', err);
      }
    });
  });
}

async function resolvePhotoUrl(photoUrl) {
  if (!photoUrl) return null;
  if (PhotoManager.isLocalImage(photoUrl)) {
    return await PhotoManager.getImageUrl(photoUrl);
  }
  return photoUrl;
}

async function resolveThumbnailUrl(photoUrl) {
  if (!photoUrl) return null;
  if (PhotoManager.isLocalImage(photoUrl)) {
    return await PhotoManager.getThumbnailUrl(photoUrl);
  }
  return photoUrl;
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
        isOverdue: progress ? progress.isOverdue : false,
        remainingText: progress
          ? (progress.heightRemaining > 0 ? `还差 ${progress.heightRemaining.toFixed(1)}cm` : '高度已达标')
          : ''
      };
      leafGoal = {
        target: goal.targetLeaves,
        targetDate: goal.targetDate.slice(5),
        achieved: goal.achieved,
        isOverdue: progress ? progress.isOverdue : false,
        remainingText: progress
          ? (progress.leavesRemaining > 0 ? `还差 ${progress.leavesRemaining}片` : '叶片已达标')
          : ''
      };
    }
  }

  drawLine('#heightChart', scoped.map((record) => ({ label: record.date.slice(5), value: record.height })), 'cm', '#2f855a', heightGoal);
  drawMultiBars('#careChart', scoped.map((record) => ({ label: record.date.slice(5), water: record.water, light: record.light * 20 })));
  drawLine('#leafChart', scoped.map((record) => ({ label: record.date.slice(5), value: record.leaves })), '片', '#7c3aed', leafGoal);
  document.querySelector('#records').innerHTML = scoped.slice().reverse().map((record) => {
    const hasPhoto = record.photo && record.photo.trim() !== '';
    const isLocal = PhotoManager.isLocalImage(record.photo);
    return `
      <article class="record">
        <div class="recordMain">
          ${hasPhoto ? `
            <div class="recordThumbWrap">
              <img
                class="recordThumb ${isLocal ? 'recordThumbPending' : ''}"
                data-photo="${record.photo}"
                data-role="record-thumb"
                alt="缩略图"
              />
            </div>
          ` : ''}
          <div class="recordContent">
            <strong>${record.plant}</strong>
            <span>${record.date} · ${record.height}cm · ${record.leaves}片叶</span>
            <p>${record.state}</p>
          </div>
        </div>
        <div class="recordPhotoLink">
          ${hasPhoto ? `<a href="#" data-photo-link="${record.photo}" data-role="record-photo-link">${isLocal ? '📷 本地照片' : '🔗 照片链接'}</a>` : '<span class="muted">无照片</span>'}
        </div>
        <div><button data-edit="${record.id}">编辑</button><button data-del="${record.id}">删除</button></div>
      </article>
    `;
  }).join('') || '<p class="empty">暂无记录</p>';

  loadRecordThumbnails();
  bindRecordPhotoLinks();

  document.querySelectorAll('[data-del]').forEach((button) => button.addEventListener('click', async () => {
    const recordId = button.dataset.del;
    const record = records.find((r) => r.id === recordId);
    if (record && record.photo && PhotoManager.isLocalImage(record.photo)) {
      try {
        await PhotoManager.deleteByPhotoUrl(record.photo);
      } catch (err) {
        console.warn('删除关联图片失败:', err);
      }
    }
    records = records.filter((r) => r.id !== recordId);
    save();
    clearDiagnosisCache();
    render();
  }));
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', async () => {
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

    pendingPhotoUpload = null;
    photoRemovedByUser = false;
    if (record.photo) {
      if (PhotoManager.isLocalImage(record.photo)) {
        try {
          const thumbUrl = await PhotoManager.getThumbnailUrl(record.photo);
          const imgId = PhotoManager.getImageId(record.photo);
          const photoData = await PhotoStorage.get(imgId);
          if (thumbUrl && photoData) {
            pendingPhotoUpload = {
              url: record.photo,
              imageId: imgId,
              thumbnail: thumbUrl,
              data: photoData.data,
              compressedSize: photoData.size,
              originalSize: photoData.size
            };
            photoPreview.src = thumbUrl;
            const sizeKB = (photoData.size / 1024).toFixed(1);
            photoPreviewInfo.innerHTML = `本地照片 · ${sizeKB}KB`;
            photoPreviewContainer.style.display = 'block';
            photoUploadArea.querySelector('.photoUploadPlaceholder').style.display = 'none';
            currentPhotoTab = 'upload';
          }
        } catch (err) {
          console.warn('加载编辑预览失败:', err);
        }
      } else {
        currentPhotoTab = 'url';
      }
    } else {
      currentPhotoTab = 'upload';
      photoPreviewContainer.style.display = 'none';
      photoUploadArea.querySelector('.photoUploadPlaceholder').style.display = 'flex';
    }
    photoTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === currentPhotoTab));
    photoTabContents.forEach(content => {
      content.style.display = content.dataset.tabContent === currentPhotoTab ? 'block' : 'none';
    });
  }));
  setTimeout(loadRecordThumbnails, 50);
  setTimeout(loadRecordThumbnails, 300);
  renderCareCalendar();
  renderTimeline();
  renderExperiments();
  renderDiagnosis();
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
    const goalRemainingText = goal.achieved ? '目标已达成' : goal.remainingText;

    goalSvg = `
      <line x1="42" y1="${goalY}" x2="462" y2="${goalY}" ${goalLineStyle} stroke-width="2"/>
      <rect x="462" y="${goalY - 24}" width="116" height="46" rx="4" fill="${goalLabelColor}" opacity="0.1"/>
      <rect x="462" y="${goalY - 24}" width="116" height="46" rx="4" fill="none" stroke="${goalLabelColor}" stroke-width="1"/>
      <text x="520" y="${goalY - 7}" text-anchor="middle" fill="${goalLabelColor}" font-size="11" font-weight="600">${goalStatusText}</text>
      <text x="520" y="${goalY + 5}" text-anchor="middle" fill="${goalLabelColor}" font-size="10">${goal.target}${unit} · ${goal.targetDate}</text>
      <text x="520" y="${goalY + 17}" text-anchor="middle" fill="${goalLabelColor}" font-size="10" font-weight="600">${goalRemainingText}</text>
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

const DIAGNOSIS_CONFIG = {
  minRecords: 3,
  minDaysSpan: 7,
  cacheTTL: 5 * 60 * 1000,
  normalGrowthRate: {
    height: 0.15,
    leaves: 0.3
  },
  thresholds: {
    lowLight: 3,
    highLight: 8,
    lowWater: 30,
    highWater: 150
  }
};

const DIAGNOSIS_RULES = [
  {
    id: 'growth_stagnation',
    name: '增长停滞',
    icon: '📉',
    severity: 'high',
    check(plantRecords) {
      if (plantRecords.length < 3) return null;

      const recent = plantRecords.slice(-3);
      const totalDays = daysBetween(recent[0].date, recent[recent.length - 1].date) || 1;

      if (totalDays < DIAGNOSIS_CONFIG.minDaysSpan) return null;

      const totalHeightChange = recent[recent.length - 1].height - recent[0].height;
      const totalLeavesChange = recent[recent.length - 1].leaves - recent[0].leaves;
      const dailyHeightRate = totalHeightChange / totalDays;
      const dailyLeavesRate = totalLeavesChange / totalDays;

      const isStagnant = dailyHeightRate < DIAGNOSIS_CONFIG.normalGrowthRate.height * 0.3 &&
                         dailyLeavesRate < DIAGNOSIS_CONFIG.normalGrowthRate.leaves * 0.3;

      if (!isStagnant) return null;

      return {
        triggered: true,
        severity: 'high',
        reason: `最近${totalDays}天内，${recent[0].plant}的生长速度明显低于正常水平。`,
        evidence: `高度从 ${recent[0].height}cm 增长到 ${recent[recent.length - 1].height}cm，日均增长仅 ${dailyHeightRate.toFixed(2)}cm（正常约 ${DIAGNOSIS_CONFIG.normalGrowthRate.height}cm/天）\n` +
                  `叶片从 ${recent[0].leaves} 片增长到 ${recent[recent.length - 1].leaves} 片，日均增长仅 ${dailyLeavesRate.toFixed(2)}片（正常约 ${DIAGNOSIS_CONFIG.normalGrowthRate.leaves}片/天）\n` +
                  `时间跨度：${recent[0].date} ~ ${recent[recent.length - 1].date}（共 ${totalDays} 天）`,
        suggestion: '建议检查光照、浇水和温度条件，确保植物处于适宜的生长环境。可以考虑适当增加光照时间或调整浇水量。'
      };
    }
  },
  {
    id: 'overwatering',
    name: '浇水过量',
    icon: '💧',
    severity: 'medium',
    check(plantRecords) {
      if (plantRecords.length < 3) return null;

      const recent = plantRecords.slice(-3);
      const totalDays = daysBetween(recent[0].date, recent[recent.length - 1].date) || 1;

      if (totalDays < DIAGNOSIS_CONFIG.minDaysSpan) return null;

      const avgWater = recent.reduce((sum, r) => sum + r.water, 0) / recent.length;

      const heightChange = recent[recent.length - 1].height - recent[0].height;
      const dailyGrowth = heightChange / totalDays;

      const isOverwatering = avgWater > DIAGNOSIS_CONFIG.thresholds.highWater &&
                            dailyGrowth < DIAGNOSIS_CONFIG.normalGrowthRate.height * 0.5;

      if (!isOverwatering) return null;

      return {
        triggered: true,
        severity: 'medium',
        reason: `浇水量持续偏高（平均 ${avgWater.toFixed(0)}ml/次），但生长速度并未相应提升，可能存在浇水过量的情况。`,
        evidence: `最近3次记录平均浇水 ${avgWater.toFixed(0)}ml，阈值为 ${DIAGNOSIS_CONFIG.thresholds.highWater}ml。\n` +
                  `同期高度日均增长仅 ${dailyGrowth.toFixed(2)}cm，低于正常水平的50%。\n` +
                  `浇水记录：${recent.map(r => `${r.date}: ${r.water}ml`).join('、')}`,
        suggestion: '建议减少每次浇水量，延长浇水间隔。浇水前检查土壤湿度，确保土壤表面干燥后再浇水。如果叶片出现发黄、变软等症状，更需要控制浇水。'
      };
    }
  },
  {
    id: 'underwatering',
    name: '浇水不足',
    icon: '🏜️',
    severity: 'medium',
    check(plantRecords) {
      if (plantRecords.length < 3) return null;

      const recent = plantRecords.slice(-3);
      const totalDays = daysBetween(recent[0].date, recent[recent.length - 1].date) || 1;

      if (totalDays < DIAGNOSIS_CONFIG.minDaysSpan) return null;

      const avgWater = recent.reduce((sum, r) => sum + r.water, 0) / recent.length;

      const heightChange = recent[recent.length - 1].height - recent[0].height;
      const dailyGrowth = heightChange / totalDays;

      const isUnderwatering = avgWater < DIAGNOSIS_CONFIG.thresholds.lowWater &&
                             dailyGrowth < DIAGNOSIS_CONFIG.normalGrowthRate.height * 0.5;

      if (!isUnderwatering) return null;

      return {
        triggered: true,
        severity: 'medium',
        reason: `浇水量持续偏低（平均 ${avgWater.toFixed(0)}ml/次），同时生长速度也明显缓慢，可能存在浇水不足的情况。`,
        evidence: `最近3次记录平均浇水 ${avgWater.toFixed(0)}ml，低于建议阈值 ${DIAGNOSIS_CONFIG.thresholds.lowWater}ml。\n` +
                  `同期高度日均增长仅 ${dailyGrowth.toFixed(2)}cm，低于正常水平的50%。\n` +
                  `浇水记录：${recent.map(r => `${r.date}: ${r.water}ml`).join('、')}`,
        suggestion: '建议适当增加每次的浇水量，确保根系能够充分吸收水分。浇水时要浇透，直到盆底有水流出。同时观察植物状态，如果叶片出现萎蔫、下垂，需要及时补水。'
      };
    }
  },
  {
    id: 'low_light',
    name: '光照不足',
    icon: '🌥️',
    severity: 'medium',
    check(plantRecords) {
      if (plantRecords.length < 3) return null;

      const recent = plantRecords.slice(-3);
      const totalDays = daysBetween(recent[0].date, recent[recent.length - 1].date) || 1;

      if (totalDays < DIAGNOSIS_CONFIG.minDaysSpan) return null;

      const avgLight = recent.reduce((sum, r) => sum + r.light, 0) / recent.length;

      const leavesChange = recent[recent.length - 1].leaves - recent[0].leaves;
      const dailyLeavesGrowth = leavesChange / totalDays;

      const isLowLight = avgLight < DIAGNOSIS_CONFIG.thresholds.lowLight &&
                        dailyLeavesGrowth < DIAGNOSIS_CONFIG.normalGrowthRate.leaves * 0.5;

      if (!isLowLight) return null;

      return {
        triggered: true,
        severity: 'medium',
        reason: `光照时长持续不足（平均 ${avgLight.toFixed(1)}小时/天），且叶片增长缓慢，可能影响光合作用效率。`,
        evidence: `最近3次记录平均光照 ${avgLight.toFixed(1)}小时，低于建议阈值 ${DIAGNOSIS_CONFIG.thresholds.lowLight}小时。\n` +
                  `同期叶片日均增长仅 ${dailyLeavesGrowth.toFixed(2)}片，低于正常水平的50%。\n` +
                  `光照记录：${recent.map(r => `${r.date}: ${r.light}h`).join('、')}`,
        suggestion: '建议将植物移到光照更充足的位置，如南向窗台。如果自然光照不足，可以考虑使用植物补光灯。每天保证至少4-6小时的光照时间。'
      };
    }
  },
  {
    id: 'excessive_light',
    name: '光照过强',
    icon: '☀️',
    severity: 'low',
    check(plantRecords) {
      if (plantRecords.length < 3) return null;

      const recent = plantRecords.slice(-3);
      const avgLight = recent.reduce((sum, r) => sum + r.light, 0) / recent.length;

      const stateKeywords = ['晒伤', '焦边', '叶尖干枯', '叶片发白', '失去光泽'];
      const hasSunburnSymptoms = recent.some(r =>
        stateKeywords.some(kw => r.state.includes(kw))
      );

      const isExcessive = avgLight > DIAGNOSIS_CONFIG.thresholds.highLight && hasSunburnSymptoms;

      if (!isExcessive) return null;

      const matchedSymptom = stateKeywords.find(kw =>
        recent.some(r => r.state.includes(kw))
      );

      return {
        triggered: true,
        severity: 'low',
        reason: `光照时长持续偏长（平均 ${avgLight.toFixed(1)}小时/天），且状态描述中出现了「${matchedSymptom}」等疑似强光灼伤的症状。`,
        evidence: `最近3次记录平均光照 ${avgLight.toFixed(1)}小时，高于建议阈值 ${DIAGNOSIS_CONFIG.thresholds.highLight}小时。\n` +
                  `相关记录：${recent.filter(r => stateKeywords.some(kw => r.state.includes(kw))).map(r => `${r.date}: ${r.state}`).join('；')}`,
        suggestion: '建议在光照强烈的时段（中午11点-下午3点）适当遮阴，或调整植物位置避免强光直射。同时增加空气湿度，减少叶片水分蒸发。'
      };
    }
  },
  {
    id: 'leaf_abnormal',
    name: '叶片异常',
    icon: '🍂',
    severity: 'high',
    check(plantRecords) {
      if (plantRecords.length < 2) return null;

      const recent = plantRecords.slice(-3);
      const leafChanges = [];

      for (let i = 1; i < recent.length; i++) {
        leafChanges.push(recent[i].leaves - recent[i - 1].leaves);
      }

      const hasLeafLoss = leafChanges.some(c => c < 0);

      const abnormalKeywords = ['黄叶', '枯叶', '落叶', '掉叶', '叶片发黄', '叶片枯萎', '叶片脱落', '叶斑', '褐斑', '黑斑', '虫害', '蚜虫', '红蜘蛛'];
      const hasAbnormalState = recent.some(r =>
        abnormalKeywords.some(kw => r.state.includes(kw))
      );

      if (!hasLeafLoss && !hasAbnormalState) return null;

      const matchedKeywords = abnormalKeywords.filter(kw =>
        recent.some(r => r.state.includes(kw))
      );

      const lossRecords = leafChanges.map((c, i) => {
        if (c < 0) {
          return `${recent[i + 1].date} 比 ${recent[i].date} 减少了 ${Math.abs(c)} 片叶`;
        }
        return null;
      }).filter(Boolean);

      return {
        triggered: true,
        severity: 'high',
        reason: hasLeafLoss
          ? `叶片数量出现异常减少，${lossRecords.join('；')}。`
          : `状态描述中出现了「${matchedKeywords.join('、')}」等异常关键词，需要关注。`,
        evidence: hasLeafLoss
          ? `叶片变化记录：${lossRecords.join('；')}\n完整记录：${recent.map(r => `${r.date}: ${r.leaves}片叶`).join(' → ')}`
          : `异常记录：${recent.filter(r => abnormalKeywords.some(kw => r.state.includes(kw))).map(r => `${r.date}: ${r.state}`).join('；')}`,
        suggestion: hasLeafLoss
          ? '叶片异常脱落可能是由于环境剧变、浇水不当或病虫害引起。建议检查植物根部状态，确保养护环境稳定。如果持续掉叶，需要进一步排查是否有病虫害。'
          : '建议仔细检查叶片正反面，确认是否有病虫害迹象。保持良好的通风环境，避免叶片长时间潮湿。如果症状持续，可以考虑使用相应的药物治疗。'
      };
    }
  },
  {
    id: 'inconsistent_care',
    name: '养护不稳定',
    icon: '⚖️',
    severity: 'low',
    check(plantRecords) {
      if (plantRecords.length < 4) return null;

      const recent = plantRecords.slice(-4);

      const waterValues = recent.map(r => r.water);
      const waterMean = waterValues.reduce((a, b) => a + b, 0) / waterValues.length;
      const waterVariance = waterValues.reduce((sum, v) => sum + Math.pow(v - waterMean, 2), 0) / waterValues.length;
      const waterCV = Math.sqrt(waterVariance) / waterMean;

      const lightValues = recent.map(r => r.light);
      const lightMean = lightValues.reduce((a, b) => a + b, 0) / lightValues.length;
      const lightVariance = lightValues.reduce((sum, v) => sum + Math.pow(v - lightMean, 2), 0) / lightValues.length;
      const lightCV = Math.sqrt(lightVariance) / lightMean;

      const isInconsistent = waterCV > 0.6 || lightCV > 0.4;

      if (!isInconsistent) return null;

      const issues = [];
      if (waterCV > 0.6) {
        issues.push(`浇水量波动较大（变异系数 ${(waterCV * 100).toFixed(0)}%）`);
      }
      if (lightCV > 0.4) {
        issues.push(`光照时长波动较大（变异系数 ${(lightCV * 100).toFixed(0)}%）`);
      }

      return {
        triggered: true,
        severity: 'low',
        reason: `最近4次记录显示${issues.join('，')}，养护条件不够稳定可能影响植物健康生长。`,
        evidence: `浇水记录：${recent.map(r => `${r.date}: ${r.water}ml`).join('、')}\n` +
                  `光照记录：${recent.map(r => `${r.date}: ${r.light}h`).join('、')}`,
        suggestion: '建议建立规律的养护日程，保持浇水和光照条件的相对稳定。可以使用养护日历功能来提醒自己按时按量浇水，确保植物处于稳定的生长环境中。'
      };
    }
  }
];

function getPlantRecords(plantName) {
  return records
    .filter(r => r.plant === plantName)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function diagnosePlant(plantName) {
  const plantRecords = getPlantRecords(plantName);

  if (plantRecords.length < DIAGNOSIS_CONFIG.minRecords) {
    return {
      plantName,
      recordCount: plantRecords.length,
      sufficient: false,
      issues: [],
      overallStatus: 'insufficient',
      message: `该植物仅有 ${plantRecords.length} 条记录，建议至少记录 ${DIAGNOSIS_CONFIG.minRecords} 次后再进行诊断，以确保分析结果的准确性。`
    };
  }

  const issues = [];

  for (const rule of DIAGNOSIS_RULES) {
    try {
      const result = rule.check(plantRecords);
      if (result && result.triggered) {
        issues.push({
          ruleId: rule.id,
          name: rule.name,
          icon: rule.icon,
          ...result
        });
      }
    } catch (err) {
      console.warn(`规则 [${rule.id}] 执行出错:`, err);
    }
  }

  const severityOrder = { high: 3, medium: 2, low: 1 };
  issues.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  let overallStatus = 'healthy';
  if (issues.length > 0) {
    const hasHigh = issues.some(i => i.severity === 'high');
    const hasMedium = issues.some(i => i.severity === 'medium');
    overallStatus = hasHigh ? 'critical' : (hasMedium ? 'warning' : 'warning');
  }

  return {
    plantName,
    recordCount: plantRecords.length,
    sufficient: true,
    issues,
    overallStatus,
    dateRange: {
      start: plantRecords[0].date,
      end: plantRecords[plantRecords.length - 1].date,
      days: daysBetween(plantRecords[0].date, plantRecords[plantRecords.length - 1].date) + 1
    }
  };
}

function diagnoseAllPlants() {
  const now = Date.now();
  if (diagnosisCache && (now - diagnosisCacheTime) < DIAGNOSIS_CONFIG.cacheTTL) {
    return diagnosisCache;
  }

  const plants = [...new Set(records.map(r => r.plant))].sort();
  const results = plants.map(plant => diagnosePlant(plant));

  diagnosisCache = results;
  diagnosisCacheTime = now;

  return results;
}

function clearDiagnosisCache() {
  diagnosisCache = null;
  diagnosisCacheTime = 0;
}

function getOverallStatusText(status) {
  const texts = {
    healthy: { text: '生长良好', icon: '✅' },
    warning: { text: '需要关注', icon: '⚠️' },
    critical: { text: '存在问题', icon: '🚨' },
    insufficient: { text: '数据不足', icon: '📊' }
  };
  return texts[status] || texts.healthy;
}

function getSeverityText(severity) {
  const texts = {
    low: '轻微',
    medium: '中等',
    high: '严重'
  };
  return texts[severity] || severity;
}

function formatEvidence(evidence) {
  return evidence.split('\n').map(line =>
    line.trim() ? `<div>• ${line}</div>` : ''
  ).join('');
}

function renderDiagnosis() {
  const allResults = diagnoseAllPlants();
  const plants = [...new Set(records.map(r => r.plant))].sort();

  diagnosisPlantFilter.innerHTML = `<option value="">全部植物</option>${plants.map(p => `<option value="${p}">${p}</option>`).join('')}`;
  diagnosisPlantFilter.value = plants.includes(diagnosisFilterPlant) ? diagnosisFilterPlant : '';

  const filteredResults = diagnosisFilterPlant
    ? allResults.filter(r => r.plantName === diagnosisFilterPlant)
    : allResults;

  const totalIssues = allResults.reduce((sum, r) => sum + r.issues.length, 0);
  const criticalCount = allResults.filter(r => r.overallStatus === 'critical').length;
  const warningCount = allResults.filter(r => r.overallStatus === 'warning').length;

  const badgeEl = document.querySelector('#diagnosisBadge');
  if (totalIssues > 0) {
    badgeEl.textContent = `${criticalCount > 0 ? criticalCount + '项严重 ' : ''}${warningCount > 0 ? warningCount + '项关注' : ''}`;
    badgeEl.className = `diagnosisBadge ${criticalCount > 0 ? 'badge-overdue' : 'badge-today'}`;
  } else if (allResults.length > 0 && allResults.every(r => r.overallStatus === 'healthy')) {
    badgeEl.textContent = '全部健康';
    badgeEl.className = 'diagnosisBadge badge-ok';
  } else {
    badgeEl.textContent = `共 ${allResults.length} 株`;
    badgeEl.className = 'diagnosisBadge badge-ok';
  }

  const body = document.querySelector('#diagnosisBody');

  if (records.length === 0) {
    body.innerHTML = `
      <div class="diagnosisEmpty">
        <div class="diagnosisEmptyIcon">🌱</div>
        <h4>暂无生长记录</h4>
        <p>添加植物生长记录后，系统将自动分析植物状态并提供养护建议</p>
      </div>
    `;
    return;
  }

  if (filteredResults.length === 0) {
    body.innerHTML = `
      <div class="diagnosisEmpty">
        <div class="diagnosisEmptyIcon">🔍</div>
        <h4>未找到相关植物</h4>
        <p>请选择其他植物进行诊断</p>
      </div>
    `;
    return;
  }

  body.innerHTML = filteredResults.map(result => {
    const statusInfo = getOverallStatusText(result.overallStatus);
    const cardClass = result.overallStatus === 'critical' ? 'critical' :
                      result.overallStatus === 'warning' ? 'has-issues' : '';

    if (!result.sufficient) {
      return `
        <div class="diagnosisPlantCard">
          <div class="diagnosisPlantHeader">
            <div class="diagnosisPlantName">
              <strong>${result.plantName}</strong>
              <span class="diagnosisRecordCount">${result.recordCount} 条记录</span>
            </div>
            <span class="diagnosisOverallStatus status-insufficient">
              ${statusInfo.icon} ${statusInfo.text}
            </span>
          </div>
          <div class="diagnosisInsufficientHint">
            <span class="hintIcon">📋</span>
            <span>${result.message}</span>
          </div>
        </div>
      `;
    }

    let content = '';

    if (result.issues.length === 0) {
      content = `
        <div class="diagnosisHealthyMessage">
          <span class="healthyIcon">🎉</span>
          <span>
            <strong>${result.plantName}</strong> 状态良好！<br/>
            记录时段：${result.dateRange.start} ~ ${result.dateRange.end}（共 ${result.dateRange.days} 天）<br/>
            继续保持当前的养护习惯，定期记录观察。
          </span>
        </div>
      `;
    } else {
      content = `
        <div class="diagnosisIssuesList">
          ${result.issues.map(issue => `
            <div class="diagnosisIssueCard severity-${issue.severity}">
              <div class="diagnosisIssueHead">
                <div class="diagnosisIssueTitle">
                  <span class="diagnosisIssueIcon">${issue.icon}</span>
                  <span>${issue.name}</span>
                </div>
                <span class="diagnosisIssueSeverity">${getSeverityText(issue.severity)}</span>
              </div>
              <div class="diagnosisIssueReason">${issue.reason}</div>
              <div class="diagnosisIssueEvidence">
                <span class="evidenceLabel">📈 数据证据：</span>
                ${formatEvidence(issue.evidence)}
              </div>
              <div class="diagnosisIssueSuggestion">
                <span class="suggestionIcon">💡</span>
                <span>${issue.suggestion}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="diagnosisPlantCard ${cardClass}">
        <div class="diagnosisPlantHeader">
          <div class="diagnosisPlantName">
            <strong>${result.plantName}</strong>
            <span class="diagnosisRecordCount">
              ${result.recordCount} 条记录 · ${result.dateRange.start} ~ ${result.dateRange.end}
            </span>
          </div>
          <span class="diagnosisOverallStatus status-${result.overallStatus}">
            ${statusInfo.icon} ${statusInfo.text}
          </span>
        </div>
        ${content}
      </div>
    `;
  }).join('') + `
    <div class="diagnosisRulesInfo">
      <strong>📋 诊断规则说明：</strong>
      <ul>
        ${DIAGNOSIS_RULES.map(r => `<li>${r.icon} <strong>${r.name}</strong>：基于${r.severity === 'high' ? '高度' : r.severity === 'medium' ? '中度' : '轻度'}关联指标分析</li>`).join('')}
      </ul>
      <p style="margin: 6px 0 0 0;">
        * 诊断基于历史记录数据分析，仅供参考。实际养护请结合植物具体状态和环境条件判断。
        最少需要 ${DIAGNOSIS_CONFIG.minRecords} 条记录才能进行有效诊断。
      </p>
    </div>
  `;
}

diagnosisPlantFilter.addEventListener('change', () => {
  diagnosisFilterPlant = diagnosisPlantFilter.value;
  renderDiagnosis();
});

diagnosisRefreshBtn.addEventListener('click', () => {
  clearDiagnosisCache();
  renderDiagnosis();
});

render();
