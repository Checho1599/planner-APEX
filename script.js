(function() {
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

    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- CONFIGURACIÓN ---
    const MIN_DATE = new Date(2026, 7, 1);
    const MAX_DATE = new Date(2027, 11, 31);
    const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const COLOR_PALETTE = [
        '#2a7de1', '#d97706', '#dc2626', '#16a34a', '#7c3aed',
        '#db2777', '#0891b2', '#ea580c', '#4f46e5', '#059669'
    ];
    const DEFAULT_COLOR = '#2a7de1';

    // --- TAREAS POR DEFECTO (como patrones) ---
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
    let currentTasks = {}; // { '2026-08-17': [tasks] }
    let patterns = []; // Patrones guardados
    let isSyncing = false;
    let initialLoadDone = false;
    let modalContext = null; // { mode: 'add'|'edit'|'delete', task, dateKey, index, patternId }

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

    function dateToStr(date) {
        return dateToKey(date);
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
        // Verificar si ya existe una tarea igual (por texto y tiempo)
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
        // Aplicar el patrón
        const added = applyPattern(pattern);
        savePatterns();
        return { pattern, added };
    }

    function updatePattern(patternId, updates) {
        const index = patterns.findIndex(p => p.id === patternId);
        if (index === -1) return null;
        
        const oldPattern = patterns[index];
        const newPattern = { ...oldPattern, ...updates };
        
        // Eliminar las tareas del patrón antiguo
        removePatternFromDates(patternId, null, null);
        
        // Actualizar el patrón
        patterns[index] = newPattern;
        
        // Reaplicar el patrón
        const added = applyPattern(newPattern);
        savePatterns();
        return { pattern: newPattern, added };
    }

    function deletePattern(patternId, options = {}) {
        const pattern = patterns.find(p => p.id === patternId);
        if (!pattern) return null;

        // Si se especifica, eliminar solo desde una fecha
        if (options.fromDate) {
            removePatternFromDates(patternId, options.fromDate, null);
            // Actualizar el patrón para que empiece después de esa fecha
            const newStart = new Date(strToDate(options.fromDate));
            newStart.setDate(newStart.getDate() + 1);
            pattern.startDate = dateToKey(newStart);
            if (pattern.startDate > (pattern.endDate || dateToKey(new Date(MAX_DATE)))) {
                // Si el patrón ya no tiene días válidos, eliminarlo
                patterns = patterns.filter(p => p.id !== patternId);
            }
            savePatterns();
            return { deleted: false, updated: true };
        } else {
            // Eliminar completamente
            removePatternFromDates(patternId, null, null);
            patterns = patterns.filter(p => p.id !== patternId);
            savePatterns();
            return { deleted: true };
        }
    }

    function savePatterns() {
        database.ref('patterns').set(patterns)
            .catch(err => console.error('Error saving patterns:', err));
    }

    function loadPatterns() {
        return database.ref('patterns').once('value')
            .then(snapshot => {
                const data = snapshot.val();
                if (data && Array.isArray(data)) {
                    patterns = data;
                } else {
                    // Cargar patrones por defecto
                    patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
                    savePatterns();
                    // Aplicar patrones a todas las fechas
                    patterns.forEach(p => applyPattern(p));
                }
                return patterns;
            });
    }

    // --- SINCRONIZACIÓN ---
    function updateSyncStatus(status, message) {
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
        if (isSyncing) return;
        isSyncing = true;
        updateSyncStatus('syncing', 'Guardando...');
        
        const dataToSave = {
            tasks: currentTasks,
            patterns: patterns
        };
        
        database.ref().set(dataToSave)
            .then(() => {
                isSyncing = false;
                updateSyncStatus('synced', 'Guardado ✓');
                setTimeout(() => updateSyncStatus('synced', 'Sincronizado ✓'), 3000);
            })
            .catch((error) => {
                isSyncing = false;
                updateSyncStatus('error', 'Error al guardar');
                console.error('Error:', error);
            });
    }

    function loadFromFirebase() {
        updateSyncStatus('syncing', 'Cargando...');
        
        database.ref().once('value')
            .then((snapshot) => {
                const data = snapshot.val();
                if (data) {
                    // Cargar tareas
                    if (data.tasks && typeof data.tasks === 'object') {
                        currentTasks = data.tasks;
                    } else {
                        initializeDefaultTasks();
                    }
                    
                    // Cargar patrones
                    if (data.patterns && Array.isArray(data.patterns)) {
                        patterns = data.patterns;
                    } else {
                        patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
                        savePatterns();
                    }
                    
                    updateSyncStatus('synced', 'Datos cargados ✓');
                } else {
                    initializeDefaultTasks();
                    patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
                    savePatterns();
                    updateSyncStatus('synced', 'Datos iniciales ✓');
                }
                initialLoadDone = true;
                renderView(currentView);
            })
            .catch((error) => {
                updateSyncStatus('error', 'Error al cargar');
                console.error('Error:', error);
                initializeDefaultTasks();
                patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
                initialLoadDone = true;
                renderView(currentView);
            });
    }

    function initializeDefaultTasks() {
        currentTasks = {};
        // Aplicar patrones por defecto
        patterns = DEFAULT_PATTERNS.map(p => ({ ...p, id: p.id || generatePatternId() }));
        patterns.forEach(p => applyPattern(p));
        savePatterns();
    }

    function forceSync() {
        if (isSyncing) return;
        saveToFirebase();
    }

    function autoSave() {
        if (initialLoadDone) {
            saveToFirebase();
        }
    }

    // --- MODAL PARA AGREGAR/EDITAR TAREA ---
    function showTaskModal(options) {
        const { mode, task, dateKey, index, patternId } = options;
        modalContext = { mode, task, dateKey, index, patternId };
        
        const date = keyToDate(dateKey);
        const dayName = getDayName(date);
        const isEdit = mode === 'edit' || mode === 'delete';
        
        if (mode === 'delete') {
            modalTitle.innerHTML = '<i class="fas fa-trash" style="color:#dc2626;"></i> Eliminar tarea';
            modalBody.innerHTML = `
                <p style="margin-bottom:1rem;">¿Cómo quieres eliminar esta tarea?</p>
                <div class="modal-options">
                    <div class="modal-option" data-action="delete-single">
                        <div class="option-icon"><i class="fas fa-calendar-day"></i></div>
                        <div class="option-text">
                            <strong>Solo este día</strong>
                            <small>Eliminar solo esta fecha</small>
                        </div>
                    </div>
                    <div class="modal-option" data-action="delete-from-now">
                        <div class="option-icon"><i class="fas fa-forward"></i></div>
                        <div class="option-text">
                            <strong>Desde hoy en adelante</strong>
                            <small>Eliminar este día y todos los futuros</small>
                        </div>
                    </div>
                    <div class="modal-option" data-action="delete-all">
                        <div class="option-icon"><i class="fas fa-globe"></i></div>
                        <div class="option-text">
                            <strong>Todas las ocurrencias</strong>
                            <small>Eliminar esta tarea en todas las fechas</small>
                        </div>
                    </div>
                    ${task.patternId ? `
                    <div class="modal-option" data-action="delete-pattern">
                        <div class="option-icon"><i class="fas fa-list"></i></div>
                        <div class="option-text">
                            <strong>Eliminar el patrón completo</strong>
                            <small>Eliminar todas las tareas de este patrón y el patrón</small>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" id="modalCancelBtn">Cancelar</button>
                </div>
            `;
        } else {
            const titleText = isEdit ? 'Editar tarea' : 'Agregar tarea';
            const btnText = isEdit ? 'Actualizar' : 'Agregar';
            modalTitle.innerHTML = `<i class="fas fa-${isEdit ? 'pen' : 'plus'}"></i> ${titleText}`;
            
            const daysCheckboxes = DAYS.map(d => `
                <label style="display:inline-flex;align-items:center;gap:4px;margin:4px 8px 4px 0;font-size:0.85rem;cursor:pointer;">
                    <input type="checkbox" class="pattern-day-check" value="${d}" ${d === dayName ? 'checked' : ''}>
                    ${d}
                </label>
            `).join('');

            modalBody.innerHTML = `
                <div class="modal-input-group">
                    <label>Tarea</label>
                    <input type="text" id="modalTaskText" value="${isEdit ? task.text : ''}" placeholder="Nombre de la tarea..." />
                </div>
                <div class="modal-input-group">
                    <label>Horario</label>
                    <input type="text" id="modalTaskTime" value="${isEdit ? (task.time || '') : '18:00-21:00'}" placeholder="Ej: 9:00-17:00" />
                </div>
                <div class="modal-input-group">
                    <label>Color</label>
                    <div class="color-selector" id="modalColorSelector">
                        ${COLOR_PALETTE.map(c => `
                            <div class="color-option ${(isEdit ? task.color : DEFAULT_COLOR) === c ? 'selected' : ''}" 
                                 style="background-color:${c};" data-color="${c}"></div>
                        `).join('')}
                    </div>
                </div>
                <div style="border-top:1px solid #e9edf4;margin:1rem 0;padding-top:1rem;">
                    <p style="font-weight:600;font-size:0.9rem;color:#0b2a3e;margin-bottom:8px;">
                        <i class="fas fa-cog"></i> Opciones de aplicación
                    </p>
                    <div class="modal-options">
                        <div class="modal-option selected" data-action="apply-single">
                            <div class="option-icon"><i class="fas fa-calendar-day"></i></div>
                            <div class="option-text">
                                <strong>Solo este día</strong>
                                <small>La tarea solo aparecerá en ${formatDate(date)}</small>
                            </div>
                            <span class="option-badge">Puntual</span>
                        </div>
                        <div class="modal-option" data-action="apply-week">
                            <div class="option-icon"><i class="fas fa-calendar-week"></i></div>
                            <div class="option-text">
                                <strong>Toda la semana</strong>
                                <small>Del ${formatDate(getWeekDays(date)[0])} al ${formatDate(getWeekDays(date)[6])}</small>
                            </div>
                            <span class="option-badge">Semanal</span>
                        </div>
                        <div class="modal-option" data-action="apply-pattern">
                            <div class="option-icon"><i class="fas fa-redo"></i></div>
                            <div class="option-text">
                                <strong>Crear patrón recurrente</strong>
                                <small>Se aplicará automáticamente en los días seleccionados</small>
                            </div>
                            <span class="option-badge">Recurrente</span>
                        </div>
                    </div>
                    <div id="patternDaysContainer" style="margin-top:10px;display:none;background:#f8faff;padding:12px;border-radius:12px;">
                        <p style="font-size:0.85rem;color:#5f7d9c;margin-bottom:6px;">Selecciona los días de la semana:</p>
                        ${daysCheckboxes}
                        <div style="margin-top:8px;">
                            <label style="font-size:0.8rem;color:#5f7d9c;display:flex;align-items:center;gap:6px;cursor:pointer;">
                                <input type="date" id="patternStartDate" value="${dateToKey(date)}" />
                                <span>Inicio</span>
                            </label>
                            <label style="font-size:0.8rem;color:#5f7d9c;display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px;">
                                <input type="date" id="patternEndDate" placeholder="Opcional" />
                                <span>Fin (opcional)</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn-primary" id="modalConfirmBtn">${btnText}</button>
                    <button class="btn-secondary" id="modalCancelBtn">Cancelar</button>
                </div>
            `;

            // Eventos del modal
            const colorOptions = modalBody.querySelectorAll('.color-selector .color-option');
            colorOptions.forEach(el => {
                el.addEventListener('click', () => {
                    colorOptions.forEach(c => c.classList.remove('selected'));
                    el.classList.add('selected');
                });
            });

            // Mostrar/ocultar selector de días para patrón
            const applyOptions = modalBody.querySelectorAll('.modal-option[data-action]');
            const patternContainer = document.getElementById('patternDaysContainer');
            applyOptions.forEach(el => {
                el.addEventListener('click', () => {
                    applyOptions.forEach(o => o.classList.remove('selected'));
                    el.classList.add('selected');
                    if (el.dataset.action === 'apply-pattern') {
                        patternContainer.style.display = 'block';
                    } else {
                        patternContainer.style.display = 'none';
                    }
                });
            });

            // Confirmar
            document.getElementById('modalConfirmBtn').addEventListener('click', () => {
                const text = document.getElementById('modalTaskText').value.trim();
                const time = document.getElementById('modalTaskTime').value.trim();
                const color = modalBody.querySelector('.color-option.selected')?.dataset.color || DEFAULT_COLOR;
                const selectedOption = modalBody.querySelector('.modal-option.selected');
                const action = selectedOption?.dataset.action || 'apply-single';

                if (!text) {
                    alert('Por favor, ingresa un nombre para la tarea.');
                    return;
                }

                const taskData = { text, time, color };

                if (action === 'apply-single') {
                    // Solo este día
                    if (isEdit) {
                        updateTaskInDate(dateKey, index, taskData);
                    } else {
                        addTaskToDate(dateKey, { ...taskData, fixed: false });
                    }
                } else if (action === 'apply-week') {
                    // Toda la semana
                    const weekDays = getWeekDays(date);
                    weekDays.forEach(d => {
                        const key = dateToKey(d);
                        if (isEdit && d.getTime() === date.getTime()) {
                            updateTaskInDate(key, index, taskData);
                        } else {
                            addTaskToDate(key, { ...taskData, fixed: false, patternId: null });
                        }
                    });
                } else if (action === 'apply-pattern') {
                    // Crear patrón
                    const selectedDays = [];
                    modalBody.querySelectorAll('.pattern-day-check:checked').forEach(cb => {
                        selectedDays.push(cb.value);
                    });
                    if (selectedDays.length === 0) {
                        alert('Selecciona al menos un día de la semana.');
                        return;
                    }
                    const startDate = document.getElementById('patternStartDate').value;
                    const endDate = document.getElementById('patternEndDate').value || null;
                    
                    const pattern = {
                        text: text,
                        time: time,
                        color: color,
                        type: 'weekly',
                        days: selectedDays,
                        startDate: startDate,
                        endDate: endDate,
                        active: true
                    };
                    const result = addPattern(pattern);
                    // Si es edición, eliminar la tarea original
                    if (isEdit) {
                        removeTaskFromDate(dateKey, index);
                    }
                    alert(`✅ Patrón creado. Se agregaron ${result.added} tareas.`);
                }

                closeModal();
                renderView(currentView);
            });
        }

        // Eventos comunes del modal
        document.getElementById('modalCancelBtn')?.addEventListener('click', closeModal);
        
        // Eventos de acciones de eliminación
        modalBody.querySelectorAll('.modal-option[data-action]')?.forEach(el => {
            el.addEventListener('click', () => {
                const action = el.dataset.action;
                const task = modalContext.task;
                const dateKey = modalContext.dateKey;
                const index = modalContext.index;
                const patternId = modalContext.patternId;

                if (action === 'delete-single') {
                    removeTaskFromDate(dateKey, index);
                } else if (action === 'delete-from-now') {
                    // Eliminar desde hoy en adelante (buscar tareas iguales)
                    const taskText = task.text;
                    const taskTime = task.time;
                    const currentDateObj = keyToDate(dateKey);
                    const allDates = Object.keys(currentTasks);
                    allDates.forEach(key => {
                        const date = keyToDate(key);
                        if (date >= currentDateObj) {
                            const tasks = getTasksForDate(key);
                            const newTasks = tasks.filter(t => !(t.text === taskText && t.time === taskTime));
                            setTasksForDate(key, newTasks);
                        }
                    });
                } else if (action === 'delete-all') {
                    // Eliminar todas las ocurrencias
                    const taskText = task.text;
                    const taskTime = task.time;
                    const allDates = Object.keys(currentTasks);
                    allDates.forEach(key => {
                        const tasks = getTasksForDate(key);
                        const newTasks = tasks.filter(t => !(t.text === taskText && t.time === taskTime));
                        setTasksForDate(key, newTasks);
                    });
                } else if (action === 'delete-pattern' && patternId) {
                    const pattern = patterns.find(p => p.id === patternId);
                    if (pattern && confirm(`¿Eliminar el patrón "${pattern.text}" y todas sus tareas?`)) {
                        deletePattern(patternId);
                    }
                }
                closeModal();
                renderView(currentView);
            });
        });

        mainModal.classList.add('show');
    }

    function showPatternsModal() {
        let html = `
            <div style="margin-bottom:1rem;">
                <button class="btn-primary" id="addPatternBtn" style="padding:8px 16px;border:none;border-radius:40px;background:#2a7de1;color:white;cursor:pointer;">
                    <i class="fas fa-plus"></i> Nuevo patrón
                </button>
            </div>
            <div id="patternsList">
        `;

        if (patterns.length === 0) {
            html += `
                <div class="pattern-empty">
                    <i class="fas fa-list"></i>
                    No hay patrones configurados
                </div>
            `;
        } else {
            patterns.forEach(p => {
                const daysStr = p.days ? p.days.join(', ') : 'Todos';
                const dateRange = `${p.startDate || 'Inicio'} ${p.endDate ? '→ ' + p.endDate : '→ ∞'}`;
                const badgeClass = p.type === 'weekly' ? 'weekly' : p.type === 'range' ? 'range' : 'days';
                const badgeText = p.type === 'weekly' ? '♻️ Semanal' : p.type === 'range' ? '📅 Rango' : '📋 Días';
                
                html += `
                    <div class="pattern-item">
                        <div class="pattern-info">
                            <strong>${p.text} <span class="pattern-badge ${badgeClass}">${badgeText}</span></strong>
                            <small>${p.time || 'Sin horario'} · ${daysStr} · ${dateRange}</small>
                        </div>
                        <div class="pattern-actions">
                            <button class="btn-edit-pattern" data-pattern-id="${p.id}">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="btn-delete-pattern" data-pattern-id="${p.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        patternsModalBody.innerHTML = html;
        patternsModal.classList.add('show');

        // Eventos
        patternsModalBody.querySelectorAll('.btn-delete-pattern').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.patternId;
                if (confirm('¿Eliminar este patrón y todas sus tareas?')) {
                    deletePattern(id);
                    showPatternsModal();
                    renderView(currentView);
                }
            });
        });

        patternsModalBody.querySelectorAll('.btn-edit-pattern').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.patternId;
                const pattern = patterns.find(p => p.id === id);
                if (pattern) {
                    // Mostrar formulario de edición
                    const newText = prompt('Nuevo nombre:', pattern.text);
                    if (newText !== null && newText.trim() !== '') {
                        const newTime = prompt('Nuevo horario:', pattern.time || '');
                        const result = updatePattern(id, {
                            text: newText.trim(),
                            time: newTime ? newTime.trim() : ''
                        });
                        if (result) {
                            showPatternsModal();
                            renderView(currentView);
                        }
                    }
                }
            });
        });

        document.getElementById('addPatternBtn')?.addEventListener('click', () => {
            patternsModal.classList.remove('show');
            // Abrir modal de agregar tarea con opción de patrón
            const todayKey = dateToKey(new Date());
            showTaskModal({
                mode: 'add',
                dateKey: todayKey,
                index: -1
            });
        });
    }

    function closeModal() {
        mainModal.classList.remove('show');
        patternsModal.classList.remove('show');
        modalContext = null;
    }

    // --- RENDERIZAR ---
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
                const el = createTaskElementHTML(task, dateKey, idx);
                html += el;
            });
        }
        html += `</div>
            <div class="add-task-form" data-date="${dateKey}">
                <button class="add-task-btn" style="width:100%;justify-content:center;padding:12px;background:#f0f6ff;color:#2a7de1;border:2px dashed #c6d7eb;">
                    <i class="fas fa-plus"></i> Agregar tarea
                </button>
            </div>
        </div>`;

        viewContainer.innerHTML = html;

        // Evento del botón agregar
        viewContainer.querySelector('.add-task-btn')?.addEventListener('click', () => {
            showTaskModal({ mode: 'add', dateKey: dateKey, index: -1 });
        });

        // Eventos de tareas
        viewContainer.querySelectorAll('.task-item').forEach(item => {
            const dateKey = item.dataset.date;
            const idx = parseInt(item.dataset.idx);
            const tasksData = getTasksForDate(dateKey);
            if (tasksData && tasksData[idx]) {
                const task = tasksData[idx];
                // Editar
                item.querySelector('.edit-task')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showTaskModal({ mode: 'edit', task, dateKey, index: idx });
                });
                // Eliminar
                item.querySelector('.remove-task')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showTaskModal({ mode: 'delete', task, dateKey, index: idx, patternId: task.patternId });
                });
                // Color
                item.querySelector('.color-picker-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleColorPalette(item, task, dateKey, idx);
                });
            }
        });
    }

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
            option.addEventListener('click', (e) => {
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

        // Eventos
        viewContainer.querySelectorAll('.clickable-cell, .clickable-date').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.task-actions') || e.target.closest('.add-task-form')) return;
                const dateKey = el.dataset.date;
                if (dateKey) {
                    goToDayView(dateKey);
                }
            });
        });

        // Botones agregar
        viewContainer.querySelectorAll('.add-task-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dateKey = btn.closest('.add-task-form').dataset.date;
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
                item.querySelector('.edit-task')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showTaskModal({ mode: 'edit', task, dateKey, index: idx });
                });
                item.querySelector('.remove-task')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showTaskModal({ mode: 'delete', task, dateKey, index: idx, patternId: task.patternId });
                });
                item.querySelector('.color-picker-btn')?.addEventListener('click', (e) => {
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
            el.addEventListener('click', () => {
                const dateKey = el.dataset.date;
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
            el.addEventListener('click', () => {
                const dateKey = el.dataset.date;
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
        const today = new Date();
        if (!isDateInRange(today)) {
            currentDate = new Date(MIN_DATE);
        } else {
            currentDate = today;
        }

        // Eventos de vistas
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setView(btn.dataset.view);
            });
        });

        // Navegación
        prevBtn.addEventListener('click', () => navigate(-1));
        nextBtn.addEventListener('click', () => navigate(1));
        todayBtn.addEventListener('click', goToToday);

        // Date picker
        datePickerToggle.addEventListener('click', toggleDatePicker);
        pickerPrevMonth.addEventListener('click', () => {
            pickerDate.setMonth(pickerDate.getMonth() - 1);
            renderDatePicker();
        });
        pickerNextMonth.addEventListener('click', () => {
            pickerDate.setMonth(pickerDate.getMonth() + 1);
            renderDatePicker();
        });
        pickerTodayBtn.addEventListener('click', goToToday);

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.date-picker-wrapper')) {
                closeDatePicker();
            }
        });

        // Modal
        modalClose.addEventListener('click', closeModal);
        patternsModalClose.addEventListener('click', () => patternsModal.classList.remove('show'));
        
        // Cerrar modales al hacer clic fuera
        mainModal.addEventListener('click', (e) => {
            if (e.target === mainModal) closeModal();
        });
        patternsModal.addEventListener('click', (e) => {
            if (e.target === patternsModal) patternsModal.classList.remove('show');
        });

        // Botones
        document.getElementById('resetDefaultBtn').addEventListener('click', resetToDefault);
        forceSyncBtn.addEventListener('click', forceSync);
        showPatternsBtn.addEventListener('click', showPatternsModal);

        // Cargar datos
        loadFromFirebase();
    }

    init();
})();