(function() {
    // --- FIREBASE CONFIG (TU CONFIGURACIÓN) ---
    const firebaseConfig = {
        apiKey: "AIzaSyA39XX6TmHx19Mi02KtJaI9mZbKJytiExs",
        authDomain: "planner-apex.firebaseapp.com",
        databaseURL: "https://planner-apex-default-rtdb.firebaseio.com",
        projectId: "planner-apex",
        storageBucket: "planner-apex.firebasestorage.app",
        messagingSenderId: "443183395131",
        appId: "1:443183395131:web:23fd4a27a5a58e7d01471e"
    };

    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- CONFIGURACIÓN ---
    const MIN_DATE = new Date(2026, 7, 1);
    const MAX_DATE = new Date(2027, 11, 31);

    // --- PALETA DE COLORES ---
    const COLOR_PALETTE = [
        '#2a7de1', // Azul
        '#d97706', // Ámbar
        '#dc2626', // Rojo
        '#16a34a', // Verde
        '#7c3aed', // Púrpura
        '#db2777', // Rosa
        '#0891b2', // Cian
        '#ea580c', // Naranja
        '#4f46e5', // Índigo
        '#059669', // Esmeralda
    ];

    const DEFAULT_COLOR = '#2a7de1';

    // --- DATOS INICIALES ---
    const DEFAULT_TASKS = {
        'Lunes': [
            { text: 'Trabajo Tecnomel', time: '8:00-17:00', fixed: true, color: '#2a7de1' }
        ],
        'Martes': [
            { text: 'Trabajo Tecnomel', time: '8:00-17:00', fixed: true, color: '#2a7de1' },
            { text: 'Grabación de contenido', time: '18:00-21:00', fixed: true, color: '#7c3aed' }
        ],
        'Miércoles': [
            { text: 'Trabajo Tecnomel', time: '8:00-17:00', fixed: true, color: '#2a7de1' }
        ],
        'Jueves': [
            { text: 'Trabajo Tecnomel', time: '8:00-17:00', fixed: true, color: '#2a7de1' },
            { text: 'Canto', time: '18:00-21:00', fixed: true, color: '#db2777' }
        ],
        'Viernes': [
            { text: 'Trabajo Tecnomel', time: '8:00-17:00', fixed: true, color: '#2a7de1' }
        ],
        'Sábado': [],
        'Domingo': []
    };

    let currentTasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
    let isSyncing = false;
    let initialLoadDone = false;
    let syncTimeout = null;

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

    // --- FUNCIONES DE SINCRONIZACIÓN ---
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
        updateSyncStatus('syncing', 'Guardando cambios...');
        
        const dataToSave = JSON.parse(JSON.stringify(currentTasks));
        
        database.ref('tasks').set(dataToSave)
            .then(() => {
                isSyncing = false;
                updateSyncStatus('synced', 'Guardado ✓');
                clearTimeout(syncTimeout);
                syncTimeout = setTimeout(() => {
                    updateSyncStatus('synced', 'Sincronizado ✓');
                }, 3000);
            })
            .catch((error) => {
                isSyncing = false;
                updateSyncStatus('error', 'Error al guardar');
                console.error('Error saving to Firebase:', error);
            });
    }

    function loadFromFirebase() {
        updateSyncStatus('syncing', 'Cargando datos...');
        
        database.ref('tasks').once('value')
            .then((snapshot) => {
                const data = snapshot.val();
                if (data) {
                    // Verificar que los datos tengan la estructura correcta
                    const validData = {};
                    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
                    days.forEach(day => {
                        if (data[day] && Array.isArray(data[day])) {
                            validData[day] = data[day].filter(task => task && typeof task === 'object');
                        } else {
                            validData[day] = JSON.parse(JSON.stringify(DEFAULT_TASKS[day] || []));
                        }
                    });
                    currentTasks = validData;
                    updateSyncStatus('synced', 'Datos cargados ✓');
                } else {
                    // No hay datos en Firebase, guardar los datos por defecto
                    currentTasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
                    saveToFirebase();
                    updateSyncStatus('synced', 'Datos iniciales guardados ✓');
                }
                initialLoadDone = true;
                renderView(currentView);
            })
            .catch((error) => {
                updateSyncStatus('error', 'Error al cargar datos');
                console.error('Error loading from Firebase:', error);
                // Cargar datos por defecto
                currentTasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
                initialLoadDone = true;
                renderView(currentView);
            });
    }

    function forceSync() {
        if (isSyncing) return;
        saveToFirebase();
    }

    // Guardar automáticamente después de cada cambio
    function autoSave() {
        if (initialLoadDone) {
            saveToFirebase();
        }
    }

    // --- Funciones auxiliares ---
    function getTasksForDay(day) {
        return currentTasks[day] || [];
    }

    function setTasksForDay(day, tasks) {
        currentTasks[day] = tasks;
        autoSave();
    }

    function getDayName(date) {
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        return days[date.getDay()];
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

    function dateToKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function goToDate(date) {
        if (isDateInRange(date)) {
            currentDate = new Date(date);
            renderView(currentView);
            closeDatePicker();
        }
    }

    function goToDayView(date) {
        currentView = 'day';
        updateViewButtons('day');
        currentDate = new Date(date);
        renderView('day');
        closeDatePicker();
    }

    // --- Crear elemento de tarea ---
    function createTaskElement(task, dayName, index) {
        const div = document.createElement('div');
        div.className = `task-item ${task.fixed ? 'fixed-task' : ''}`;
        div.style.borderLeftColor = task.color || DEFAULT_COLOR;
        
        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = task.text;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'task-time';
        timeSpan.textContent = task.time || '';

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'task-actions';

        const colorBtn = document.createElement('i');
        colorBtn.className = 'fas fa-palette color-picker-btn';
        colorBtn.title = 'Cambiar color';
        colorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleColorPalette(div, task, dayName, index);
        });
        actionsDiv.appendChild(colorBtn);

        const editBtn = document.createElement('i');
        editBtn.className = 'fas fa-pen edit-task';
        editBtn.title = 'Editar tarea';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newText = prompt('Editar texto de la tarea:', task.text);
            if (newText !== null && newText.trim() !== '') {
                const newTime = prompt('Editar horario (ej: 18:00-21:00):', task.time);
                const tasks = getTasksForDay(dayName);
                tasks[index].text = newText.trim();
                tasks[index].time = newTime ? newTime.trim() : '';
                setTasksForDay(dayName, tasks);
                renderView(currentView);
            }
        });
        actionsDiv.appendChild(editBtn);

        const removeBtn = document.createElement('i');
        removeBtn.className = 'fas fa-times remove-task';
        removeBtn.title = 'Eliminar tarea';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (task.fixed) {
                if (!confirm('Esta es una tarea fija, ¿seguro que quieres eliminarla?')) return;
            }
            const tasks = getTasksForDay(dayName);
            tasks.splice(index, 1);
            setTasksForDay(dayName, tasks);
            renderView(currentView);
        });
        actionsDiv.appendChild(removeBtn);

        div.appendChild(textSpan);
        if (task.time) div.appendChild(timeSpan);
        div.appendChild(actionsDiv);

        return div;
    }

    // --- Paleta de colores ---
    function toggleColorPalette(taskElement, task, dayName, index) {
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
                const tasks = getTasksForDay(dayName);
                tasks[index].color = color;
                setTasksForDay(dayName, tasks);
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

    function toggleColorPaletteWeek(taskElement, task, dayName, index) {
        document.querySelectorAll('.color-palette').forEach(p => p.remove());

        const palette = document.createElement('div');
        palette.className = 'color-palette show';
        palette.style.position = 'absolute';
        palette.style.right = '100px';
        palette.style.top = '50%';
        palette.style.transform = 'translateY(-50%)';

        COLOR_PALETTE.forEach(color => {
            const option = document.createElement('div');
            option.className = 'color-option';
            option.style.backgroundColor = color;
            if (task.color === color) option.classList.add('selected');
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const tasks = getTasksForDay(dayName);
                tasks[index].color = color;
                setTasksForDay(dayName, tasks);
                renderView(currentView);
            });
            palette.appendChild(option);
        });

        taskElement.style.position = 'relative';
        taskElement.appendChild(palette);

        setTimeout(() => {
            document.addEventListener('click', function closePalette(e) {
                if (!palette.contains(e.target)) {
                    palette.remove();
                    document.removeEventListener('click', closePalette);
                }
            });
        }, 10);
    }

    // --- Date Picker ---
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
                const [year, month, day] = el.dataset.date.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                goToDate(date);
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

    // --- Renderizar Día ---
    function renderDayView() {
        const dayName = getDayName(currentDate);
        const dateStr = formatDate(currentDate);
        
        navTitle.textContent = `${dayName} · ${dateStr}`;

        let html = `<div class="day-view-card">
            <div class="day-title"><i class="fas fa-calendar-day"></i> ${dayName} · ${dateStr}</div>
            <div class="task-list" data-day="${dayName}">`;
        
        const tasks = getTasksForDay(dayName);
        if (tasks.length === 0) {
            html += `<div class="empty-tasks">Sin tareas programadas</div>`;
        }
        html += `</div>
            <div class="add-task-form" data-day="${dayName}">
                <input type="text" class="new-task-text" placeholder="Nueva tarea..." />
                <input type="text" class="new-task-time" placeholder="Horario" value="18:00-21:00" />
                <div class="color-selector">`;
        
        COLOR_PALETTE.slice(0, 5).forEach(color => {
            html += `<div class="color-option" style="background-color:${color};" data-color="${color}"></div>`;
        });
        html += `<span style="font-size:0.7rem; color:#8ba0b9;">+</span>`;
        html += `</div>
                <button class="add-task-btn"><i class="fas fa-plus"></i> Agregar</button>
            </div>
        </div>`;

        viewContainer.innerHTML = html;

        const form = viewContainer.querySelector('.add-task-form');
        if (form) {
            const day = form.dataset.day;
            const inputText = form.querySelector('.new-task-text');
            const inputTime = form.querySelector('.new-task-time');
            const btn = form.querySelector('.add-task-btn');
            let selectedColor = DEFAULT_COLOR;

            form.querySelectorAll('.color-option').forEach(el => {
                el.addEventListener('click', () => {
                    form.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
                    el.classList.add('selected');
                    selectedColor = el.dataset.color;
                });
                if (el === form.querySelector('.color-option:first-child')) {
                    el.classList.add('selected');
                    selectedColor = el.dataset.color;
                }
            });

            const addTask = () => {
                const text = inputText.value.trim();
                const time = inputTime.value.trim();
                if (text === '') return;
                const tasks = getTasksForDay(day);
                tasks.push({ text, time, fixed: false, color: selectedColor });
                setTasksForDay(day, tasks);
                renderView(currentView);
            };
            btn.addEventListener('click', addTask);
            inputText.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(); });
        }

        const taskList = viewContainer.querySelector('.task-list');
        if (taskList) {
            const items = taskList.querySelectorAll('.task-item');
            items.forEach(el => el.remove());
            const empty = taskList.querySelector('.empty-tasks');
            if (empty) empty.remove();

            const tasksData = getTasksForDay(dayName);
            if (tasksData.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'empty-tasks';
                emptyDiv.textContent = 'Sin tareas programadas';
                taskList.appendChild(emptyDiv);
            } else {
                tasksData.forEach((task, idx) => {
                    const el = createTaskElement(task, dayName, idx);
                    taskList.appendChild(el);
                });
            }
        }
    }

    // --- Renderizar Semana ---
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
            const dayName = getDayName(date);
            const dateKey = dateToKey(date);
            const tasks = getTasksForDay(dayName) || [];
            html += `<td class="clickable-cell" data-date="${dateKey}"><div class="task-list" data-day="${dayName}">`;
            if (tasks.length === 0) {
                html += `<div class="empty-tasks">—</div>`;
            } else {
                tasks.forEach((task, idx) => {
                    const fixedClass = task.fixed ? 'fixed-task' : '';
                    const color = task.color || DEFAULT_COLOR;
                    html += `<div class="task-item ${fixedClass}" style="border-left-color:${color};" data-day="${dayName}" data-idx="${idx}">
                                <span class="task-text">${task.text}</span>
                                ${task.time ? `<span class="task-time">${task.time}</span>` : ''}
                                <div class="task-actions">
                                    <i class="fas fa-palette color-picker-btn"></i>
                                    <i class="fas fa-pen edit-task"></i>
                                    <i class="fas fa-times remove-task"></i>
                                </div>
                            </div>`;
                });
            }
            html += `</div>`;
            html += `<div class="add-task-form" data-day="${dayName}">
                        <input type="text" class="new-task-text" placeholder="Tarea..." />
                        <input type="text" class="new-task-time" placeholder="Horario" value="18:00" />
                        <div class="color-selector">`;
            COLOR_PALETTE.slice(0, 5).forEach(color => {
                html += `<div class="color-option" style="background-color:${color};" data-color="${color}"></div>`;
            });
            html += `</div>
                        <button class="add-task-btn"><i class="fas fa-plus"></i></button>
                    </div>`;
            html += `</td>`;
        });
        html += `</tr></tbody></table></div>`;

        viewContainer.innerHTML = html;

        viewContainer.querySelectorAll('.clickable-cell, .clickable-date').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.task-actions') || e.target.closest('.add-task-form')) return;
                const dateKey = el.dataset.date;
                if (dateKey) {
                    const [year, month, day] = dateKey.split('-').map(Number);
                    const date = new Date(year, month - 1, day);
                    goToDayView(date);
                }
            });
        });

        attachWeekEvents();
    }

    function attachWeekEvents() {
        document.querySelectorAll('.add-task-form').forEach(form => {
            const day = form.dataset.day;
            const inputText = form.querySelector('.new-task-text');
            const inputTime = form.querySelector('.new-task-time');
            const btn = form.querySelector('.add-task-btn');
            let selectedColor = DEFAULT_COLOR;

            form.querySelectorAll('.color-option').forEach(el => {
                el.addEventListener('click', () => {
                    form.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
                    el.classList.add('selected');
                    selectedColor = el.dataset.color;
                });
                if (el === form.querySelector('.color-option:first-child')) {
                    el.classList.add('selected');
                    selectedColor = el.dataset.color;
                }
            });

            const addTask = () => {
                const text = inputText.value.trim();
                const time = inputTime.value.trim();
                if (text === '') return;
                const tasks = getTasksForDay(day);
                tasks.push({ text, time, fixed: false, color: selectedColor });
                setTasksForDay(day, tasks);
                renderView(currentView);
            };
            btn.addEventListener('click', addTask);
            inputText.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(); });
            inputTime.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(); });
        });

        document.querySelectorAll('.task-list').forEach(list => {
            const day = list.dataset.day;
            list.addEventListener('click', (e) => {
                const target = e.target;
                const item = target.closest('.task-item');
                if (!item) return;
                const tasks = getTasksForDay(day);
                const idx = Array.from(item.parentElement.children).indexOf(item);
                if (idx === -1 || idx >= tasks.length) return;

                if (target.classList.contains('remove-task')) {
                    if (tasks[idx].fixed && !confirm('Tarea fija, ¿eliminar?')) return;
                    tasks.splice(idx, 1);
                    setTasksForDay(day, tasks);
                    renderView(currentView);
                } else if (target.classList.contains('edit-task')) {
                    const task = tasks[idx];
                    const newText = prompt('Editar texto:', task.text);
                    if (newText !== null && newText.trim() !== '') {
                        const newTime = prompt('Editar horario:', task.time);
                        tasks[idx].text = newText.trim();
                        tasks[idx].time = newTime ? newTime.trim() : '';
                        setTasksForDay(day, tasks);
                        renderView(currentView);
                    }
                } else if (target.classList.contains('color-picker-btn') || target.closest('.color-picker-btn')) {
                    const colorBtn = target.classList.contains('color-picker-btn') ? target : target.closest('.color-picker-btn');
                    if (colorBtn) {
                        const task = tasks[idx];
                        toggleColorPaletteWeek(item, task, day, idx);
                    }
                }
            });
        });
    }

    // --- Renderizar Mes ---
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
            const dayName = getDayName(date);
            const tasks = getTasksForDay(dayName) || [];
            const hasTasks = tasks.length > 0;
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const isToday = date.toDateString() === new Date().toDateString();
            const dateKey = dateToKey(date);
            
            html += `<div class="month-day ${isWeekend ? 'weekend' : ''}" style="${isToday ? 'border: 2px solid #2a7de1;' : ''}" data-date="${dateKey}">
                        <div class="day-number">${d}</div>`;
            if (hasTasks) {
                tasks.slice(0, 2).forEach(t => {
                    const color = t.color || DEFAULT_COLOR;
                    html += `<div class="event-badge" style="background-color:${color};">${t.text}</div>`;
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
                    const [year, month, day] = dateKey.split('-').map(Number);
                    const date = new Date(year, month - 1, day);
                    goToDayView(date);
                }
            });
        });
    }

    // --- Navegación ---
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

    // --- Control de vistas ---
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

    // --- Reset ---
    function resetToDefault() {
        if (confirm('⚠️ Esto eliminará TODOS los cambios guardados y restaurará las tareas por defecto. ¿Continuar?')) {
            currentTasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
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

        // Botones de acción
        document.getElementById('resetDefaultBtn').addEventListener('click', resetToDefault);
        forceSyncBtn.addEventListener('click', forceSync);

        // Cargar datos desde Firebase
        loadFromFirebase();
    }

    init();
})();