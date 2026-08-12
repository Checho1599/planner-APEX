(function() {
    console.log('🔍 Iniciando Planner APEX...');

    // --- FIREBASE CONFIG ---
    const firebaseConfig = {
        apiKey: "AIzaSyA39XX6TmHx19Mi02KtJaI9mZbKJytiExs",
        authDomain: "planner-apex.firebaseapp.com",
        databaseURL: "https://planner-apex-default-rtdb.firebaseio.com",
        projectId: "planner-apex",
        storageBucket: "planner-apex.firebasestorage.app",
        messagingSenderId: "443183395131",
        appId: "1:443183395131:web:23fd4a27a5a58e7d01471e"
    };

    // --- VERIFICAR FIREBASE ---
    console.log('📡 Verificando Firebase...');
    console.log('📦 firebase disponible:', typeof firebase !== 'undefined');

    let database = null;
    let firebaseReady = false;

    try {
        if (typeof firebase !== 'undefined') {
            if (!firebase.apps.length) {
                console.log('🔥 Inicializando Firebase...');
                firebase.initializeApp(firebaseConfig);
                console.log('✅ Firebase inicializado');
            } else {
                console.log('✅ Firebase ya estaba inicializado');
            }
            database = firebase.database();
            firebaseReady = true;
            console.log('✅ Database obtenida correctamente');
        } else {
            console.error('❌ Firebase NO está cargado. Verifica que los scripts se cargaron.');
            document.getElementById('syncText').textContent = '⚠️ Firebase no disponible';
            document.getElementById('syncStatus').className = 'sync-status error';
        }
    } catch (error) {
        console.error('❌ Error al inicializar Firebase:', error);
        document.getElementById('syncText').textContent = '⚠️ Error: ' + error.message;
        document.getElementById('syncStatus').className = 'sync-status error';
    }

    // Si Firebase no está disponible, crear un objeto dummy para que no falle
    if (!database) {
        console.warn('⚠️ Usando database dummy (sin conexión)');
        database = {
            ref: () => ({
                set: () => Promise.resolve(),
                once: () => Promise.resolve({ val: () => null }),
                on: () => {},
                child: () => ({ set: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }) })
            })
        };
    }

    // --- CONFIGURACIÓN ---
    const MIN_DATE = new Date(2026, 7, 1);
    const MAX_DATE = new Date(2027, 11, 31);
    const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const COLOR_PALETTE = [
        '#2a7de1', '#d97706', '#dc2626', '#16a34a', '#7c3aed',
        '#db2777', '#0891b2', '#ea580c', '#4f46e5', '#059669'
    ];
    const DEFAULT_COLOR = '#2a7de1';

    // --- TAREAS POR DEFECTO ---
    const DEFAULT_PATTERNS = [
        {
            id: 'trabajo_lunes',
            text: 'Trabajo Tecnomel',
            time: '8:00-17:00',
            color: '#2a7de1',
            type: 'weekly',
            days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
            startDate: '2026-08-01',
            endDate: null,
            active: true
        },
        {
            id: 'grabacion',
            text: 'Grabación de contenido',
            time: '18:00-21:00',
            color: '#7c3aed',
            type: 'weekly',
            days: ['Martes'],
            startDate: '2026-08-01',
            endDate: null,
            active: true
        },
        {
            id: 'canto',
            text: 'Canto',
            time: '18:00-21:00',
            color: '#db2777',
            type: 'weekly',
            days: ['Jueves'],
            startDate: '2026-08-01',
            endDate: null,
            active: true
        }
    ];

    // --- ESTADO ---
    let currentTasks = {};
    let patterns = [];
    let isSyncing = false;
    let initialLoadDone = false;
    let modalContext = null;

    // Referencias DOM
    const viewContainer = document.getElementById('viewContainer');
    const viewBtns = document.querySelectorAll('.view-btn');
    const navTitle = document.getElementById('navTitle');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const todayBtn = document.getElementById('todayBtn');
    const syncStatus = document.getElementById('syncStatus');
    const syncText = document.getElementById('syncText');
    const forceSyncBtn = document.getElementById('forceSyncBtn');
    const showPatternsBtn = document.getElementById('showPatternsBtn');

    // Modal principal
    const mainModal = document.getElementById('mainModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.getElementById('modalClose');

    // Modal de patrones
    const patternsModal = document.getElementById('patternsModal');
    const patternsModalBody = document.getElementById('patternsModalBody');
    const patternsModalClose = document.getElementById('patternsModalClose');

    // Date picker
    const datePickerToggle = document.getElementById('datePickerToggle');
    const datePickerDropdown = document.getElementById('datePickerDropdown');
    const pickerMonthYear = document.getElementById('pickerMonthYear');
    const pickerGrid = document.getElementById('datePickerGrid');
    const pickerPrevMonth = document.getElementById('pickerPrevMonth');
    const pickerNextMonth = document.getElementById('pickerNextMonth');
    const pickerTodayBtn = document.getElementById('pickerTodayBtn');

    let currentView = 'day';
    let currentDate = new Date();
    let pickerDate = new Date();

    // --- FUNCIONES DE FECHA ---
    function dateToKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function keyToDate(key) {
        const parts = key.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function getDayName(date) {
        return DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
    }

    function getWeekDays(date) {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            weekDays.push(d);
        }
        return weekDays;
    }

    function isDateInRange(date) {
        return date >= MIN_DATE && date <= MAX_DATE;
    }

    function formatDate(date) {
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    function getWeekNumber(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    }

    function strToDate(str) {
        return keyToDate(str);
    }

    // --- FUNCIONES DE TAREAS ---
    function getTasksForDate(dateKey) {
        return currentTasks[dateKey] || [];
    }

    function setTasksForDate(dateKey, tasks) {
        if (tasks && tasks.length > 0) {
            currentTasks[dateKey] = tasks;
        } else {
            delete currentTasks[dateKey];
        }
        autoSave();
    }

    function addTaskToDate(dateKey, task) {
        const tasks = getTasksForDate(dateKey);
        const exists = tasks.some(t => t.text === task.text && t.time === task.time);
        if (!exists) {
            tasks.push(task);
            setTasksForDate(dateKey, tasks);
            return true;
        }
        return false;
    }

    function removeTaskFromDate(dateKey, index) {
        const tasks = getTasksForDate(dateKey);
        tasks.splice(index, 1);
        setTasksForDate(dateKey, tasks);
    }

    function updateTaskInDate(dateKey, index, updates) {
        const tasks = getTasksForDate(dateKey);
        tasks[index] = { ...tasks[index], ...updates };
        setTasksForDate(dateKey, tasks);
    }

    function getTaskPattern(task) {
        if (!task.patternId) return null;
        return patterns.find(p => p.id === task.patternId);
    }

    // --- APLICAR PATRONES ---
    function applyPatternToDateRange(pattern, startDate, endDate) {
        const current = new Date(startDate);
        const daysSet = new Set(pattern.days || []);
        let addedCount = 0;

        while (current <= endDate) {
            const dayName = getDayName(current);
            const dateKey = dateToKey(current);
            
            if (isDateInRange(current) && daysSet.has(dayName)) {
                const task = {
                    text: pattern.text,
                    time: pattern.time || '',
                    color: pattern.color || DEFAULT_COLOR,
                    patternId: pattern.id,
                    fixed: true
                };
                const added = addTaskToDate(dateKey, task);
                if (added) addedCount++;
            }
            current.setDate(current.getDate() + 1);
        }
        return addedCount;
    }

    function applyPattern(pattern) {
        const startDate = strToDate(pattern.startDate || dateToKey(new Date()));
        const endDate = pattern.endDate ? strToDate(pattern.endDate) : new Date(MAX_DATE);
        return applyPatternToDateRange(pattern, startDate, endDate);
    }

    function removePatternFromDates(patternId, fromDate, toDate) {
        const start = fromDate ? strToDate(fromDate) : new Date(MIN_DATE);
        const end = toDate ? strToDate(toDate) : new Date(MAX_DATE);
        let removedCount = 0;
        const current = new Date(start);

        while (current <= end) {
            const dateKey = dateToKey(current);
            const tasks = getTasksForDate(dateKey);
            const newTasks = tasks.filter(t => t.patternId !== patternId);
            if (newTasks.length !== tasks.length) {
                removedCount += tasks.length - newTasks.length;
                setTasksForDate(dateKey, newTasks);
            }
            current.setDate(current.getDate() + 1);
        }
        return removedCount;
    }

    // --- GESTIÓN DE PATRONES ---
    function generatePatternId() {
        return 'pattern_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    }

    function addPattern(patternData) {
        const pattern = {
            id: generatePatternId(),
            ...patternData,
            active: true
        };
        patterns.push(pattern);
        const added = applyPattern(pattern);
        savePatterns();
        autoSave();
        return { pattern, added };
    }

    function updatePattern(patternId, updates) {
        const index = patterns.findIndex(p => p.id === patternId);
        if (index === -1) return null;
        
        const oldPattern = patterns[index];
        const newPattern = { ...oldPattern, ...updates };
        
        removePatternFromDates(patternId, null, null);
        patterns[index] = newPattern;
        const added = applyPattern(newPattern);
        savePatterns();
        autoSave();
        return { pattern: newPattern, added };
    }

    function deletePattern(patternId, options = {}) {
        const pattern = patterns.find(p => p.id === patternId);
        if (!pattern) return null;

        if (options.fromDate) {
            removePatternFromDates(patternId, options.fromDate, null);
            const newStart = new Date(strToDate(options.fromDate));
            newStart.setDate(newStart.getDate() + 1);
            pattern.startDate = dateToKey(newStart);
            if (pattern.startDate > (pattern.endDate || dateToKey(new Date(MAX_DATE)))) {
                patterns = patterns.filter(p => p.id !== patternId);
            }
            savePatterns();
            autoSave();
            return { deleted: false, updated: true };
        } else {
            removePatternFromDates(patternId, null, null);
            patterns = patterns.filter(p => p.id !== patternId);
            savePatterns();
            autoSave();
            return { deleted: true };
        }
    }

    function savePatterns() {
        if (database && database.ref && firebaseReady) {
            database.ref('patterns').set(patterns)
                .catch(err => console.error('Error saving patterns:', err));
        }
    }

    // --- SINCRONIZACIÓN ---
    function updateSyncStatus(status, message) {
        console.log('📊 Sync status:', status, message);
        syncStatus.className = 'sync-status';
        if (status === 'synced') {
            syncStatus.classList.add('synced');
            syncText.textContent = message || 'Sincronizado ✓';
        } else if (status === 'syncing') {
            syncStatus.classList.add('syncing');
            syncText.textContent = message || 'Sincronizando...';
        } else if (status === 'error') {
            syncStatus.classList.add('error');
            syncText.textContent = message || 'Error de sincronización';
        } else {
            syncText.textContent = message || 'Conectado';
        }
    }

    function saveToFirebase() {
        if (isSyncing || !firebaseReady || !database || !database.ref) {
            console.log('⏭️ Guardado omitido (Firebase no listo)');
            return;
        }
        isSyncing = true;
        updateSyncStatus('syncing', 'Guardando...');
        
        const dataToSave = {
            tasks: currentTasks,
            patterns: patterns
        };
        
        console.log('💾 Guardando en Firebase:', Object.keys(currentTasks).length, 'días con tareas');
        
        database.ref().set(dataToSave)
            .then(() => {
                isSyncing = false;
                updateSyncStatus('synced', 'Guardado ✓');
                setTimeout(() => updateSyncStatus('synced', 'Sincronizado ✓'), 3000);
            })
            .catch((error) => {
                isSyncing = false;
                updateSyncStatus('error', 'Error al guardar');
                console.error('Error saving:', error);
            });
    }

    function loadFromFirebase() {
        console.log('📥 Cargando desde Firebase...');
        
        if (!firebaseReady || !database || !database.ref) {
            console.warn('⚠️ Firebase no disponible, usando datos locales');
            initializeDefaultTasks();
            initialLoadDone = true;
            renderView(currentView);
            updateSyncStatus('error', 'Firebase no disponible');
            return;
        }

        updateSyncStatus('syncing', 'Cargando datos...');
        
        database.ref().once('value')
            .then((snapshot) => {
                console.log('📥 Datos recibidos de Firebase');
                const data = snapshot.val();
                if (data) {
                    console.log('📋 Datos encontrados:', Object.keys(data));
                    if (data.tasks && typeof data.tasks === 'object') {
                        currentTasks = data.tasks;
                        console.log('📋 Tareas cargadas:', Object.keys(currentTasks).length, 'días');
                    } else {
                        console.log('📋 No hay tareas guardadas');
                        currentTasks = {};
                    }
                    
                    if (data.patterns && Array.isArray(data.patterns)) {
                        patterns = data.patterns;
                        console.log('📋 Patrones cargados:', patterns.length);
                    } else {
                        console.log('📋 No hay patrones guardados');
                        patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
                        savePatterns();
                        if (Object.keys(currentTasks).length === 0) {
                            patterns.forEach(p => applyPattern(p));
                        }
                    }
                    
                    updateSyncStatus('synced', 'Datos cargados ✓');
                } else {
                    console.log('📋 No hay datos en Firebase, inicializando...');
                    currentTasks = {};
                    patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
                    savePatterns();
                    patterns.forEach(p => applyPattern(p));
                    updateSyncStatus('synced', 'Datos iniciales ✓');
                }
                initialLoadDone = true;
                console.log('✅ Renderizando vista...');
                renderView(currentView);
            })
            .catch((error) => {
                console.error('❌ Error cargando datos:', error);
                updateSyncStatus('error', 'Error al cargar');
                initializeDefaultTasks();
                initialLoadDone = true;
                renderView(currentView);
            });
    }

    function initializeDefaultTasks() {
        console.log('📋 Inicializando tareas por defecto');
        currentTasks = {};
        if (patterns.length === 0) {
            patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
            patterns.forEach(p => applyPattern(p));
            savePatterns();
        }
    }

    function forceSync() {
        console.log('🔄 Forzando sincronización...');
        if (isSyncing) return;
        saveToFirebase();
    }

    function autoSave() {
        if (initialLoadDone && firebaseReady) {
            saveToFirebase();
        }
    }

    // --- FUNCIONES DEL MODAL ---
    function showTaskModal(options) {
        console.log('📝 Abriendo modal:', options);
        // ... (código del modal - mismo que antes)
        // Por brevedad, mantén el código que ya tenías
    }

    function handleConfirmAction(isEdit, dateKey, index) {
        // ... (mismo código que antes)
    }

    function handleDeleteAction(e) {
        // ... (mismo código que antes)
    }

    function closeModal() {
        mainModal.classList.remove('show');
        patternsModal.classList.remove('show');
        modalContext = null;
    }

    function showPatternsModal() {
        // ... (mismo código que antes)
    }

    // --- RENDERIZAR ---
    function createTaskElementHTML(task, dateKey, idx) {
        const color = task.color || DEFAULT_COLOR;
        const fixedClass = task.fixed ? 'fixed-task' : '';
        const pattern = getTaskPattern(task);
        const badge = pattern ? 
            `<span class="task-pattern-badge ${pattern.type}">${pattern.type === 'weekly' ? '♻️' : pattern.type === 'range' ? '📅' : '📋'} ${pattern.text}</span>` :
            (task.patternId ? `<span class="task-pattern-badge">🔗</span>` : '');

        return `<div class="task-item ${fixedClass}" style="border-left-color:${color};" data-date="${dateKey}" data-idx="${idx}">
            <span class="task-text">${task.text} ${badge}</span>
            ${task.time ? `<span class="task-time">${task.time}</span>` : ''}
            <div class="task-actions">
                <i class="fas fa-palette color-picker-btn" title="Cambiar color"></i>
                <i class="fas fa-pen edit-task" title="Editar"></i>
                <i class="fas fa-times remove-task" title="Eliminar"></i>
            </div>
        </div>`;
    }

    function toggleColorPalette(taskElement, task, dateKey, index) {
        document.querySelectorAll('.color-palette').forEach(p => p.remove());

        const palette = document.createElement('div');
        palette.className = 'color-palette show';
        palette.style.position = 'absolute';
        palette.style.right = '120px';
        palette.style.top = '50%';
        palette.style.transform = 'translateY(-50%)';

        COLOR_PALETTE.forEach(color => {
            const option = document.createElement('div');
            option.className = 'color-option';
            option.style.backgroundColor = color;
            if (task.color === color) option.classList.add('selected');
            option.addEventListener('click', function(e) {
                e.stopPropagation();
                updateTaskInDate(dateKey, index, { color: color });
                renderView(currentView);
            });
            palette.appendChild(option);
        });

        taskElement.style.position = 'relative';
        taskElement.appendChild(palette);

        setTimeout(() => {
            document.addEventListener('click', function closePalette(e) {
                if (!palette.contains(e.target) && !taskElement.querySelector('.color-picker-btn').contains(e.target)) {
                    palette.remove();
                    document.removeEventListener('click', closePalette);
                }
            });
        }, 10);
    }

    function renderDayView() {
        const dateKey = dateToKey(currentDate);
        const dayName = getDayName(currentDate);
        const dateStr = formatDate(currentDate);
        
        navTitle.textContent = `${dayName} · ${dateStr}`;

        let html = `<div class="day-view-card">
            <div class="day-title"><i class="fas fa-calendar-day"></i> ${dayName} · ${dateStr}</div>
            <div class="task-list" data-date="${dateKey}">`;
        
        const tasks = getTasksForDate(dateKey);
        if (tasks.length === 0) {
            html += `<div class="empty-tasks">Sin tareas programadas</div>`;
        } else {
            tasks.forEach((task, idx) => {
                html += createTaskElementHTML(task, dateKey, idx);
            });
        }
        html += `</div>
            <div class="add-task-form" data-date="${dateKey}">
                <button class="add-task-btn" style="width:100%;justify-content:center;padding:12px;background:#f0f6ff;color:#2a7de1;border:2px dashed #c6d7eb;border-radius:16px;cursor:pointer;">
                    <i class="fas fa-plus"></i> Agregar tarea
                </button>
            </div>
        </div>`;

        viewContainer.innerHTML = html;

        viewContainer.querySelector('.add-task-btn')?.addEventListener('click', function() {
            const dateKey = this.closest('.add-task-form').dataset.date;
            showTaskModal({ mode: 'add', dateKey: dateKey, index: -1 });
        });

        viewContainer.querySelectorAll('.task-item').forEach(item => {
            const dateKey = item.dataset.date;
            const idx = parseInt(item.dataset.idx);
            const tasksData = getTasksForDate(dateKey);
            if (tasksData && tasksData[idx]) {
                const task = tasksData[idx];
                item.querySelector('.edit-task')?.addEventListener('click', function(e) {
                    e.stopPropagation();
                    showTaskModal({ mode: 'edit', task, dateKey, index: idx });
                });
                item.querySelector('.remove-task')?.addEventListener('click', function(e) {
                    e.stopPropagation();
                    showTaskModal({ mode: 'delete', task, dateKey, index: idx, patternId: task.patternId });
                });
                item.querySelector('.color-picker-btn')?.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleColorPalette(item, task, dateKey, idx);
                });
            }
        });
    }

    function renderWeekView() {
        const weekDays = getWeekDays(currentDate);
        const weekNumber = getWeekNumber(currentDate);
        const year = currentDate.getFullYear();
        
        navTitle.textContent = `Semana ${weekNumber} · ${year}`;

        let html = `<div class="table-wrapper"><table class="planner-grid"><thead><tr>`;
        weekDays.forEach(date => {
            const dayName = getDayName(date);
            const dayNum = date.getDate();
            const dateKey = dateToKey(date);
            html += `<th>
                        <div class="clickable-date" data-date="${dateKey}">
                            <i class="fas fa-calendar-day"></i> ${dayName}<br><small>${dayNum}</small>
                        </div>
                    </th>`;
        });
        html += `</tr></thead><tbody><tr>`;
        
        weekDays.forEach(date => {
            const dateKey = dateToKey(date);
            const tasks = getTasksForDate(dateKey) || [];
            html += `<td class="clickable-cell" data-date="${dateKey}"><div class="task-list" data-date="${dateKey}">`;
            if (tasks.length === 0) {
                html += `<div class="empty-tasks">—</div>`;
            } else {
                tasks.forEach((task, idx) => {
                    html += createTaskElementHTML(task, dateKey, idx);
                });
            }
            html += `</div>`;
            html += `<div class="add-task-form" data-date="${dateKey}">
                        <button class="add-task-btn" style="width:100%;justify-content:center;padding:6px;background:#f8faff;border:1px dashed #c6d7eb;border-radius:12px;color:#2a7de1;cursor:pointer;">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>`;
            html += `</td>`;
        });
        html += `</tr></tbody></table></div>`;

        viewContainer.innerHTML = html;

        viewContainer.querySelectorAll('.clickable-cell, .clickable-date').forEach(el => {
            el.addEventListener('click', function(e) {
                if (e.target.closest('.task-actions') || e.target.closest('.add-task-form')) return;
                const dateKey = this.dataset.date;
                if (dateKey) {
                    goToDayView(dateKey);
                }
            });
        });

        viewContainer.querySelectorAll('.add-task-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const dateKey = this.closest('.add-task-form').dataset.date;
                showTaskModal({ mode: 'add', dateKey: dateKey, index: -1 });
            });
        });

        attachTaskEvents();
    }

    function attachTaskEvents() {
        viewContainer.querySelectorAll('.task-item').forEach(item => {
            const dateKey = item.dataset.date;
            const idx = parseInt(item.dataset.idx);
            const tasksData = getTasksForDate(dateKey);
            if (tasksData && tasksData[idx]) {
                const task = tasksData[idx];
                item.querySelector('.edit-task')?.addEventListener('click', function(e) {
                    e.stopPropagation();
                    showTaskModal({ mode: 'edit', task, dateKey, index: idx });
                });
                item.querySelector('.remove-task')?.addEventListener('click', function(e) {
                    e.stopPropagation();
                    showTaskModal({ mode: 'delete', task, dateKey, index: idx, patternId: task.patternId });
                });
                item.querySelector('.color-picker-btn')?.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleColorPalette(item, task, dateKey, idx);
                });
            }
        });
    }

    function renderMonthView() {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        navTitle.textContent = `${monthNames[month]} ${year}`;

        let html = `<div class="month-view"><div class="month-grid">`;
        const weekDays = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
        weekDays.forEach(d => html += `<div class="month-day" style="font-weight:600; background:transparent; border:none;">${d}</div>`);

        for (let i = 0; i < firstDay; i++) {
            html += `<div class="month-day no-day"></div>`;
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const dayOfWeek = date.getDay();
            const dateKey = dateToKey(date);
            const tasks = getTasksForDate(dateKey) || [];
            const hasTasks = tasks.length > 0;
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const isToday = date.toDateString() === new Date().toDateString();
            
            html += `<div class="month-day ${isWeekend ? 'weekend' : ''}" style="${isToday ? 'border: 2px solid #2a7de1;' : ''}" data-date="${dateKey}">
                        <div class="day-number">${d}</div>`;
            if (hasTasks) {
                tasks.slice(0, 2).forEach(t => {
                    const color = t.color || DEFAULT_COLOR;
                    const pattern = getTaskPattern(t);
                    const icon = pattern ? (pattern.type === 'weekly' ? '♻️' : pattern.type === 'range' ? '📅' : '📋') : '';
                    html += `<div class="event-badge" style="background-color:${color};">${icon} ${t.text}</div>`;
                });
                if (tasks.length > 2) html += `<div class="event-badge" style="background-color:#7a95b5;">+${tasks.length - 2}</div>`;
            } else {
                html += `<div style="font-size:0.6rem; color:#b0c7dd;">—</div>`;
            }
            html += `</div>`;
        }
        html += `</div></div>`;
        viewContainer.innerHTML = html;

        viewContainer.querySelectorAll('.month-day:not(.no-day)').forEach(el => {
            el.addEventListener('click', function() {
                const dateKey = this.dataset.date;
                if (dateKey) {
                    goToDayView(dateKey);
                }
            });
        });
    }

    // --- NAVEGACIÓN ---
    function navigate(direction) {
        if (currentView === 'day') {
            const newDate = new Date(currentDate);
            newDate.setDate(newDate.getDate() + direction);
            if (isDateInRange(newDate)) {
                currentDate = newDate;
                renderView(currentView);
            }
        } else if (currentView === 'week') {
            const newDate = new Date(currentDate);
            newDate.setDate(newDate.getDate() + (direction * 7));
            if (isDateInRange(newDate)) {
                currentDate = newDate;
                renderView(currentView);
            }
        } else if (currentView === 'month') {
            const newDate = new Date(currentDate);
            newDate.setMonth(newDate.getMonth() + direction);
            if (isDateInRange(newDate)) {
                currentDate = newDate;
                renderView(currentView);
            }
        }
    }

    function goToToday() {
        const today = new Date();
        if (isDateInRange(today)) {
            currentDate = today;
        } else {
            currentDate = new Date(MIN_DATE);
        }
        renderView(currentView);
        closeDatePicker();
    }

    function goToDayView(dateKey) {
        currentView = 'day';
        updateViewButtons('day');
        currentDate = keyToDate(dateKey);
        renderView('day');
        closeDatePicker();
    }

    // --- DATE PICKER ---
    function renderDatePicker() {
        const year = pickerDate.getFullYear();
        const month = pickerDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        pickerMonthYear.textContent = `${monthNames[month]} ${year}`;

        let html = '';
        const weekDays = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
        weekDays.forEach(d => {
            html += `<div class="picker-day-header">${d}</div>`;
        });

        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            html += `<div class="picker-day other-month disabled">${day}</div>`;
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = date.toDateString() === currentDate.toDateString();
            const isInRange = isDateInRange(date);
            const classes = `picker-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${!isInRange ? ' disabled' : ''}`;
            
            html += `<div class="${classes}" data-date="${dateToKey(date)}">${d}</div>`;
        }

        const totalCells = firstDay + daysInMonth;
        const remaining = (7 - (totalCells % 7)) % 7;
        for (let d = 1; d <= remaining; d++) {
            html += `<div class="picker-day other-month disabled">${d}</div>`;
        }

        pickerGrid.innerHTML = html;

        pickerGrid.querySelectorAll('.picker-day:not(.disabled)').forEach(el => {
            el.addEventListener('click', function() {
                const dateKey = this.dataset.date;
                if (dateKey) {
                    currentDate = keyToDate(dateKey);
                    renderView(currentView);
                    closeDatePicker();
                }
            });
        });
    }

    function toggleDatePicker() {
        datePickerDropdown.classList.toggle('show');
        if (datePickerDropdown.classList.contains('show')) {
            pickerDate = new Date(currentDate);
            renderDatePicker();
        }
    }

    function closeDatePicker() {
        datePickerDropdown.classList.remove('show');
    }

    // --- CONTROL DE VISTAS ---
    function renderView(view) {
        console.log('🖥️ Renderizando vista:', view);
        if (view === 'day') {
            renderDayView();
        } else if (view === 'week') {
            renderWeekView();
        } else if (view === 'month') {
            renderMonthView();
        }
        updateViewButtons(view);
    }

    function updateViewButtons(view) {
        viewBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
    }

    function setView(view) {
        currentView = view;
        renderView(view);
    }

    // --- RESET ---
    function resetToDefault() {
        if (confirm('⚠️ Esto eliminará TODOS los cambios guardados y restaurará las tareas por defecto. ¿Continuar?')) {
            patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
            currentTasks = {};
            patterns.forEach(p => applyPattern(p));
            savePatterns();
            autoSave();
            renderView(currentView);
        }
    }

    // --- INICIALIZACIÓN ---
    function init() {
        console.log('🚀 Inicializando Planner APEX...');
        
        const today = new Date();
        if (!isDateInRange(today)) {
            currentDate = new Date(MIN_DATE);
        } else {
            currentDate = today;
        }

        console.log('📅 Fecha actual:', currentDate.toLocaleDateString());
        console.log('📊 Firebase listo:', firebaseReady);
        console.log('📊 Database:', database ? '✅ Disponible' : '❌ No disponible');

        // Actualizar estado inicial
        if (firebaseReady) {
            updateSyncStatus('syncing', 'Conectando...');
        } else {
            updateSyncStatus('error', 'Firebase no disponible');
        }

        // Eventos de vistas
        viewBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                setView(this.dataset.view);
            });
        });

        // Navegación
        prevBtn.addEventListener('click', function() { navigate(-1); });
        nextBtn.addEventListener('click', function() { navigate(1); });
        todayBtn.addEventListener('click', goToToday);

        // Date picker
        datePickerToggle.addEventListener('click', toggleDatePicker);
        pickerPrevMonth.addEventListener('click', function() {
            pickerDate.setMonth(pickerDate.getMonth() - 1);
            renderDatePicker();
        });
        pickerNextMonth.addEventListener('click', function() {
            pickerDate.setMonth(pickerDate.getMonth() + 1);
            renderDatePicker();
        });
        pickerTodayBtn.addEventListener('click', goToToday);

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.date-picker-wrapper')) {
                closeDatePicker();
            }
        });

        // Modales
        modalClose.addEventListener('click', closeModal);
        patternsModalClose.addEventListener('click', function() { patternsModal.classList.remove('show'); });
        
        mainModal.addEventListener('click', function(e) {
            if (e.target === mainModal) closeModal();
        });
        patternsModal.addEventListener('click', function(e) {
            if (e.target === patternsModal) patternsModal.classList.remove('show');
        });

        // Botones
        document.getElementById('resetDefaultBtn').addEventListener('click', resetToDefault);
        forceSyncBtn.addEventListener('click', forceSync);
        showPatternsBtn.addEventListener('click', showPatternsModal);

        // Cargar datos
        console.log('📥 Iniciando carga de datos...');
        loadFromFirebase();
    }

    // Esperar a que el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();