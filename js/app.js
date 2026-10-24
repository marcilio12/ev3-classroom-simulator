/**
 * Inicialização, Gerenciador de Projetos Multi-Abas e Orquestração da Tela Inicial
 * RoboSim - Simulador virtual de robótica compatível com a linguagem de blocos
 */

document.addEventListener('DOMContentLoaded', () => {
  const railEl = document.getElementById('categoryRail');
  const flyoutEl = document.getElementById('flyoutScroll');
  const workspaceAreaEl = document.getElementById('workspaceArea');
  const workspaceCanvasEl = document.getElementById('workspaceCanvas');
  const steeringPopoverEl = document.getElementById('steeringPopover');
  const arenaCanvas = document.getElementById('arenaCanvas');

  const selectionBadge = document.getElementById('selectionBadge');
  const selectionBadgeText = document.getElementById('selectionBadgeText');
  const deleteSelectionBtn = document.getElementById('deleteSelectionBtn');
  const playFabBtn = document.getElementById('playFabBtn');
  const statusLogText = document.getElementById('statusLogText');

  const tabsContainer = document.getElementById('tabsContainer');
  const openHomeModalBtn = document.getElementById('openHomeModalBtn');
  const startScreen = document.getElementById('ev3StartScreen');
  const homeModal = document.getElementById('homeModal');
  const recentProjectsRow = document.getElementById('recentProjectsRow');
  const myProjectsGrid = document.getElementById('myProjectsGrid');
  const searchProjectsInput = document.getElementById('searchProjectsInput');
  const tabContextMenu = document.getElementById('tabContextMenu');
  const importProjectFileInput = document.getElementById('importProjectFileInput');

  let isEV3Connected = false; // Inicia desconectado; o simulador só abre após o aluno conectar!
  let isStartScreenActive = true; // A Tela Inicial é a primeira a ser exibida ao abrir o sistema

  // ==================== 1. INSTANCIAR WORKSPACE, ARENA 2D E RUNTIME ====================
  const workspace = new window.EV3Workspace({
    railEl,
    flyoutEl,
    workspaceAreaEl,
    canvasEl: workspaceCanvasEl,
    steeringPopoverEl,
    onChange: () => {
      syncActiveProjectFromWorkspace();
    },
    onSelectionChange: (sel) => {
      if (!selectionBadge || !selectionBadgeText) return;
      if (sel.count > 0) {
        selectionBadge.classList.add('visible');
        selectionBadgeText.textContent =
          sel.count === 1
            ? '1 bloco selecionado'
            : `Conjunto selecionado (${sel.count} blocos)`;
        if (statusLogText) {
          statusLogText.textContent =
            sel.count === 1
              ? 'Bloco selecionado. Pressione Delete para apagar ou arraste para mover.'
              : `Conjunto de ${sel.count} blocos selecionado. Pressione Delete para apagar todo o conjunto.`;
        }
      } else {
        selectionBadge.classList.remove('visible');
      }
    }
  });

  if (deleteSelectionBtn) {
    deleteSelectionBtn.addEventListener('click', () => {
      workspace.deleteSelectedBlocks();
      if (statusLogText) statusLogText.textContent = 'Seleção excluída (pressione Ctrl+Z para desfazer).';
    });
  }

  const arena = new window.EV3PhysicsArena(arenaCanvas, (robot) => {
    updateHUD(robot);
  });

  const runtime = new window.EV3Runtime(workspace, arena, {
    onStateChange: (running) => {
      if (running) {
        playFabBtn.classList.add('running');
        playFabBtn.title = 'Parar Programa (Stop)';
        playFabBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        `;
      } else {
        playFabBtn.classList.remove('running');
        playFabBtn.title = 'Executar Programa (Play)';
        playFabBtn.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z"/>
          </svg>
        `;
      }
    },
    onLog: (msg) => {
      if (statusLogText) statusLogText.textContent = msg;
    }
  });

  // ==================== 2. GERENCIADOR DE PROJETOS E ABAS (MULTI-TAB) ====================
  const STORAGE_KEY = 'ev3_classroom_simulator_projects_v2';
  const projectsMap = new Map(); // projectId -> { id, name, scenario, timeLabel, updatedAt, data }
  let openTabIds = [];           // Lista ordenada de IDs de projetos abertos na barra de abas
  let activeProjectId = null;    // ID do projeto ativo no momento
  let contextMenuTabId = null;   // ID da aba que abriu o menu ⋮

  /**
   * Constrói uma estrutura serializada de blocos/notas sem alterar o workspace atual.
   */
  function buildSerializedTemplate(stacksConfig, notesConfig = []) {
    const blocks = [];
    const notes = [];

    stacksConfig.forEach(stack => {
      const startX = stack.x || 32;
      const startY = stack.y || 140;
      const createdInStack = [];

      (stack.items || []).forEach((itemCfg, idx) => {
        const b = workspace.createDefaultBlockState(
          itemCfg.type,
          startX,
          startY + idx * 42,
          itemCfg.params || {}
        );
        if (idx > 0) {
          const prev = createdInStack[idx - 1];
          prev.nextId = b.id;
          b.prevId = prev.id;
        }
        blocks.push(b);
        createdInStack.push(b);

        // Suporte a substack dentro de bloco C (ex: repetir)
        if (itemCfg.substack && itemCfg.substack.length > 0) {
          const subCreated = [];
          itemCfg.substack.forEach((subCfg, sIdx) => {
            const sb = workspace.createDefaultBlockState(
              subCfg.type,
              startX + 18,
              b.y + 38 + sIdx * 40,
              subCfg.params || {}
            );
            if (sIdx === 0) {
              b.substackId = sb.id;
              sb.parentCId = b.id;
            } else {
              const prevSub = subCreated[sIdx - 1];
              prevSub.nextId = sb.id;
              sb.prevId = prevSub.id;
            }
            blocks.push(sb);
            subCreated.push(sb);
          });
        }
      });

      if (stack.note && createdInStack.length > 0) {
        notes.push({
          id: 'note_' + Math.random().toString(36).slice(2, 8),
          x: stack.note.x || 395,
          y: stack.note.y || startY,
          text: stack.note.text,
          anchorBlockId: createdInStack[0].id
        });
      }
    });

    notesConfig.forEach(n => {
      notes.push({
        id: 'note_' + Math.random().toString(36).slice(2, 8),
        x: n.x || 380,
        y: n.y || 90,
        text: n.text,
        anchorBlockId: null
      });
    });

    return { blocks, notes };
  }

  /**
   * Templates oficiais fiéis às capturas de tela do EV3 Classroom
   */
  function getDefaultProjectsCatalog() {
    const now = Date.now();
    return [
      {
        id: 'proj_8_ultrasonic',
        name: 'Projeto 8',
        subtitle: 'Sensor Ultrassônico e Desvio',
        scenario: 'pista_padrao',
        timeLabel: 'há 21 dias',
        updatedAt: now - 21 * 86400000,
        data: buildSerializedTemplate([
          {
            x: 32,
            y: 120,
            items: [
              { type: 'when_program_starts' },
              { type: 'move_set_speed', params: { speed: 50 } },
              { type: 'move_start_steer', params: { steering: 0 } },
              { type: 'sensor_wait_distance', params: { port: '4', comparator: 'lt', distance: 25 } },
              { type: 'move_stop' },
              { type: 'sound_beep', params: { note: 64, seconds: 0.3 } },
              { type: 'control_wait', params: { seconds: 0.5 } },
              { type: 'move_direction_for', params: { direction: 'backward', amount: 1, unit: 'rotations' } },
              { type: 'move_steer_for', params: { steering: 50, amount: 1, unit: 'rotations' } },
              { type: 'move_direction_for', params: { direction: 'forward', amount: 1.5, unit: 'rotations' } }
            ],
            note: {
              x: 390,
              y: 80,
              text: 'A Base Motriz avança até o Sensor Ultrassônico (Porta 4) detectar menos de 25 cm, para, recua 1 rotação e desvia do obstáculo.'
            }
          }
        ])
      },
      {
        id: 'proj_7_quadrado',
        name: 'Projeto 7',
        subtitle: 'Quadrado Perfeito em Loop',
        scenario: 'livre',
        timeLabel: 'há 21 dias',
        updatedAt: now - 22 * 86400000,
        data: buildSerializedTemplate([
          {
            x: 35,
            y: 130,
            items: [
              { type: 'when_program_starts' },
              { type: 'move_set_speed', params: { speed: 60 } },
              {
                type: 'control_repeat',
                params: { times: 4 },
                substack: [
                  { type: 'move_direction_for', params: { direction: 'forward', amount: 2, unit: 'rotations' } },
                  { type: 'move_steer_for', params: { steering: 50, amount: 1.08, unit: 'rotations' } },
                  { type: 'control_wait', params: { seconds: 0.3 } }
                ]
              }
            ],
            note: {
              x: 360,
              y: 120,
              text: 'Repete 4 vezes o deslocamento reto e o giro de 90° desenhando um quadrado na arena.'
            }
          }
        ])
      },
      {
        id: 'proj_3_basico',
        name: 'Projeto 3',
        subtitle: 'Primeiros Passos',
        scenario: 'pista_padrao',
        timeLabel: 'há um mês',
        updatedAt: now - 30 * 86400000,
        data: buildSerializedTemplate([
          {
            x: 32,
            y: 155,
            items: [
              { type: 'when_program_starts' }
            ]
          }
        ])
      },
      {
        id: 'proj_agarrar_cuboide',
        name: 'Agarrar e liberar',
        subtitle: 'Garra Motor A + Base Motriz',
        scenario: 'cuboide',
        timeLabel: 'há um mês',
        updatedAt: now - 32 * 86400000,
        data: buildSerializedTemplate([
          {
            x: 26,
            y: 150,
            items: [
              { type: 'when_program_starts' },
              { type: 'motor_set_speed', params: { port: 'A', speed: 30 } },
              { type: 'motor_run_for', params: { port: 'A', sense: 'counterclockwise', amount: 100, unit: 'degrees' } },
              { type: 'move_steer_for_at_speed', params: { steering: 50, amount: 1, unit: 'rotations', speed: -50 } },
              { type: 'motor_run_for', params: { port: 'A', sense: 'clockwise', amount: 100, unit: 'degrees' } }
            ],
            note: {
              x: 395,
              y: 115,
              text: 'Pressione Play (ou o botão esquerdo) para executar esta pilha de programação. Isso agarra o Cuboide, inverte a Base Motriz e libera o Cuboide.'
            }
          },
          {
            x: 26,
            y: 390,
            items: [
              { type: 'when_brick_button', params: { button: 'direita', action: 'pressionado' } },
              { type: 'motor_set_speed', params: { port: 'A', speed: 30 } },
              { type: 'move_direction_for', params: { direction: 'forward', amount: 1, unit: 'seconds' } },
              { type: 'motor_run_for', params: { port: 'A', sense: 'counterclockwise', amount: 100, unit: 'degrees' } },
              { type: 'control_wait', params: { seconds: 1 } },
              { type: 'motor_run_for', params: { port: 'A', sense: 'clockwise', amount: 100, unit: 'degrees' } }
            ],
            note: {
              x: 395,
              y: 390,
              text: 'Pressione o botão direito ("Dir ▶" no HUD) para executar esta pilha de programação. Isso move a Base Motriz para frente por algum tempo, antes de abaixar o braço.'
            }
          }
        ])
      },
      {
        id: 'proj_4_curvas',
        name: 'Projeto 4',
        subtitle: 'Movimento e Curvas',
        scenario: 'pista_padrao',
        timeLabel: 'há um mês',
        updatedAt: now - 35 * 86400000,
        data: buildSerializedTemplate([
          {
            x: 32,
            y: 140,
            items: [
              { type: 'when_program_starts' },
              { type: 'move_set_speed', params: { speed: 55 } },
              { type: 'move_direction_for', params: { direction: 'forward', amount: 1.5, unit: 'rotations' } },
              { type: 'move_steer_for', params: { steering: -50, amount: 1, unit: 'rotations' } },
              { type: 'move_direction_for', params: { direction: 'forward', amount: 1, unit: 'rotations' } }
            ]
          }
        ])
      },
      {
        id: 'proj_6_inicio',
        name: 'Projeto 6',
        subtitle: 'Bloco Inicial RoboSim',
        scenario: 'pista_padrao',
        timeLabel: 'há um mês',
        updatedAt: now - 40 * 86400000,
        data: buildSerializedTemplate([
          {
            x: 32,
            y: 165,
            items: [
              { type: 'when_program_starts' }
            ]
          }
        ])
      },
      {
        id: 'proj_cores_linhas',
        name: 'Cores e Linhas',
        subtitle: 'Sensor de Cor Porta 3',
        scenario: 'pista_padrao',
        timeLabel: 'há 9 meses',
        updatedAt: now - 270 * 86400000,
        data: buildSerializedTemplate([
          {
            x: 35,
            y: 130,
            items: [
              { type: 'when_program_starts' },
              { type: 'move_set_speed', params: { speed: 40 } },
              { type: 'move_start_steer', params: { steering: 0 } },
              { type: 'sensor_wait_color', params: { port: '3', color: 'black' } },
              { type: 'move_stop' },
              { type: 'brick_status_light', params: { lightColor: 'orange' } },
              { type: 'sound_beep', params: { note: 72, seconds: 0.4 } }
            ],
            note: {
              x: 375,
              y: 120,
              text: 'O robô avança até o Sensor de Cor (Porta 3) detectar a linha preta da pista e para automaticamente.'
            }
          }
        ])
      }
    ];
  }

  function loadProjectsFromStorage() {
    projectsMap.clear();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach(p => projectsMap.set(p.id, p));
          return;
        }
      }
    } catch (e) {
      // Ignora erro de localStorage
    }
    getDefaultProjectsCatalog().forEach(p => projectsMap.set(p.id, p));
    saveProjectsToStorage();
  }

  let saveDebounceTimer = null;
  function updateAutoSaveIndicator(state = 'saved') {
    const el = document.getElementById('autoSaveIndicator');
    if (!el) return;
    const label = el.querySelector('.save-label');
    if (state === 'saving') {
      el.classList.add('saving');
      if (label) label.textContent = 'Salvando...';
    } else {
      el.classList.remove('saving');
      if (label) label.textContent = 'Salvo';
    }
  }

  let toastTimer = null;
  function showToast(message, icon = 'ℹ️') {
    const toast = document.getElementById('ev3Toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.innerHTML = `<span class="ev3-toast-icon">${icon}</span> <span>${message}</span>`;
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  function saveProjectsToStorage() {
    updateAutoSaveIndicator('saving');
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      try {
        const arr = Array.from(projectsMap.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
        updateAutoSaveIndicator('saved');
      } catch (e) {
        // Ignora limite de quota
      }
    }, 200);
  }

  function getNextAvailableProjectName() {
    const existingNames = new Set(Array.from(projectsMap.values()).map(p => p.name.toLowerCase()));
    let num = 1;
    while (existingNames.has(`projeto ${num}`)) {
      num++;
    }
    return `Projeto ${num}`;
  }

  /**
   * Cria um NOVO PROJETO DO ZERO (workspace limpo apenas com "quando o programa iniciar"),
   * adiciona à lista de projetos recentes, abre uma nova aba e fecha a Tela Inicial.
   */
  function createNewProjectFromScratch() {
    runtime.stopProgram();
    syncActiveProjectFromWorkspace();

    const name = getNextAvailableProjectName();
    const id = 'proj_user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const blankData = buildSerializedTemplate([
      {
        x: 28,
        y: 165,
        items: [
          { type: 'when_program_starts' }
        ]
      }
    ]);

    const newProj = {
      id,
      name,
      subtitle: 'Criado pelo usuário',
      scenario: 'pista_padrao',
      timeLabel: 'agora mesmo',
      updatedAt: Date.now(),
      data: blankData
    };

    projectsMap.set(id, newProj);
    saveProjectsToStorage();
    openProjectInTab(id, true);
    if (statusLogText) {
      statusLogText.textContent = `${name} criado do zero! Arraste os blocos do menu esquerdo para programar.`;
    }
  }

  /**
   * Exibe a Tela Inicial branca ("IR PARA A PÁGINA INICIAL" | "NOVO PROJETO")
   */
  function showStartScreen() {
    runtime.stopProgram();
    syncActiveProjectFromWorkspace();
    isStartScreenActive = true;
    homeModal.classList.remove('open');
    if (startScreen) startScreen.classList.add('open');
    if (openHomeModalBtn) openHomeModalBtn.classList.add('active');
    renderTabsBar();
  }

  /**
   * Abre o modal da Página Inicial ("Comece aqui", Projetos recentes, Unidades, Construir, Meus Projetos)
   */
  function openHomePageModal(initialTab = 'homeViewMain') {
    runtime.stopProgram();
    syncActiveProjectFromWorkspace();
    renderHomeProjectsLists();
    switchHomeTab(initialTab);
    homeModal.classList.add('open');
  }

  /**
   * Abre um projeto existente (ou template) em uma aba da barra superior e ativa-o.
   */
  function openProjectInTab(projectId, closeHome = true) {
    if (!projectsMap.has(projectId)) return;

    runtime.stopProgram();
    syncActiveProjectFromWorkspace();

    if (!openTabIds.includes(projectId)) {
      openTabIds.push(projectId);
    }
    activeProjectId = projectId;
    isStartScreenActive = false;
    if (startScreen) startScreen.classList.remove('open');
    if (openHomeModalBtn) openHomeModalBtn.classList.remove('active');

    const proj = projectsMap.get(projectId);
    const scen = proj.scenario || 'pista_padrao';
    document.getElementById('scenarioSelect').value = scen;
    arena.loadScenario(scen);
    updateArenaChallengeHud(scen);
    hideVictoryOverlay();

    if (proj.id === 'proj_cores_linhas') {
      arena.robot.x = 160;
      arena.robot.y = 140;
      arena.robot.angle = -Math.PI / 2;
      arena.updateSensors();
    }

    workspace.resetZoom();
    workspace.deserialize(proj.data);
    workspace.undoStack = [];
    workspace.redoStack = [];

    renderTabsBar();
    renderHomeProjectsLists();

    if (closeHome) {
      homeModal.classList.remove('open');
      setTimeout(() => arena.resizeCanvas(), 30);
    }

    if (statusLogText) {
      statusLogText.textContent = `Projeto "${proj.name}" aberto. Clique no botão azul Play para simular.`;
    }
  }

  /**
   * Abre um template de atividade guiada (criando ou abrindo o projeto correspondente).
   */
  function openTemplateActivity(templateKey) {
    if (templateKey === 'ultrasonic_demo') {
      if (projectsMap.has('proj_8_ultrasonic')) {
        openProjectInTab('proj_8_ultrasonic', true);
        return;
      }
    } else if (templateKey === 'agarrar_cuboide') {
      if (projectsMap.has('proj_agarrar_cuboide')) {
        openProjectInTab('proj_agarrar_cuboide', true);
        return;
      }
    } else if (templateKey === 'quadrado_loop') {
      if (projectsMap.has('proj_7_quadrado')) {
        openProjectInTab('proj_7_quadrado', true);
        return;
      }
    } else if (templateKey === 'detector_linha') {
      if (projectsMap.has('proj_cores_linhas')) {
        openProjectInTab('proj_cores_linhas', true);
        return;
      }
    } else if (templateKey === 'activity_1_movement') {
      const actId = 'proj_act1_movimento';
      if (!projectsMap.has(actId)) {
        projectsMap.set(actId, {
          id: actId,
          name: 'Atividade 1: Movimento',
          subtitle: 'Primeiros Movimentos B+C',
          scenario: 'pista_padrao',
          timeLabel: 'agora mesmo',
          updatedAt: Date.now(),
          data: buildSerializedTemplate([
            {
              x: 32,
              y: 130,
              items: [
                { type: 'when_program_starts' },
                { type: 'move_set_speed', params: { speed: 50 } },
                { type: 'move_direction_for', params: { direction: 'forward', amount: 2, unit: 'rotations' } },
                { type: 'control_wait', params: { seconds: 0.5 } },
                { type: 'move_steer_for', params: { steering: 50, amount: 1, unit: 'rotations' } },
                { type: 'move_direction_for', params: { direction: 'backward', amount: 2, unit: 'rotations' } }
              ],
              note: {
                x: 385,
                y: 115,
                text: 'Atividade 1: Clique no botão Play azul para ver a Base Motriz avançar 2 rotações, girar e recuar!'
              }
            }
          ])
        });
        saveProjectsToStorage();
      }
      openProjectInTab(actId, true);
      return;
    }

    // Caso o projeto padrão tenha sido excluído pelo usuário, recria a partir do catálogo
    const defaults = getDefaultProjectsCatalog();
    defaults.forEach(d => {
      if (!projectsMap.has(d.id)) projectsMap.set(d.id, d);
    });
    saveProjectsToStorage();
    openProjectInTab('proj_8_ultrasonic', true);
  }

  /**
   * FECHAR PROJETO (Ao clicar no ✕ da aba, no menu ⋮ -> Fechar projeto, ou em Arquivo -> Fechar Projeto Atual):
   * - Salva automaticamente o estado atual do projeto.
   * - Remove a aba da barra superior.
   * - Se ainda houver outra aba aberta, alterna para ela.
   * - Se todas as abas forem fechadas, limpa o workspace e retorna à Tela Inicial (igual ao EV3 Classroom oficial)!
   */
  function closeProjectTab(projectId) {
    if (!projectId) return;
    runtime.stopProgram();
    if (projectId === activeProjectId) {
      syncActiveProjectFromWorkspace();
    }

    const idx = openTabIds.indexOf(projectId);
    if (idx !== -1) {
      openTabIds.splice(idx, 1);
    }

    if (openTabIds.length > 0) {
      const nextId = openTabIds[Math.max(0, idx - 1)];
      openProjectInTab(nextId, false);
    } else {
      activeProjectId = null;
      workspace.blocks.clear();
      workspace.notes.clear();
      workspace.clearSelection();
      workspace.renderWorkspace();
      renderHomeProjectsLists();
      // Retorna para a Tela Inicial quando todas as abas de projetos são fechadas
      showStartScreen();
      if (statusLogText) {
        statusLogText.textContent = 'Projeto fechado. Clique em NOVO PROJETO ou IR PARA A PÁGINA INICIAL.';
      }
    }
  }

  function syncActiveProjectFromWorkspace() {
    if (!activeProjectId || !projectsMap.has(activeProjectId)) return;
    const proj = projectsMap.get(activeProjectId);
    proj.data = JSON.parse(workspace.serialize());
    proj.scenario = document.getElementById('scenarioSelect').value || 'pista_padrao';
    proj.updatedAt = Date.now();
    proj.timeLabel = 'agora mesmo';
    saveProjectsToStorage();
  }

  function duplicateProject(projectId) {
    const orig = projectsMap.get(projectId);
    if (!orig) return;
    if (projectId === activeProjectId) {
      syncActiveProjectFromWorkspace();
    }
    const newId = 'proj_copy_' + Date.now();
    const copy = {
      id: newId,
      name: `${orig.name} (Cópia)`,
      subtitle: orig.subtitle || 'Projeto duplicado',
      scenario: orig.scenario || 'pista_padrao',
      timeLabel: 'agora mesmo',
      updatedAt: Date.now(),
      data: JSON.parse(JSON.stringify(orig.data))
    };
    projectsMap.set(newId, copy);
    saveProjectsToStorage();
    openProjectInTab(newId, true);
  }

  function deleteProjectFromStorage(projectId) {
    if (!projectsMap.has(projectId)) return;
    if (openTabIds.includes(projectId)) {
      closeProjectTab(projectId);
    }
    projectsMap.delete(projectId);
    saveProjectsToStorage();
    renderHomeProjectsLists();
  }

  function exportProjectJSON(projectId) {
    const targetId = projectId || activeProjectId;
    if (!targetId || !projectsMap.has(targetId)) return;
    if (targetId === activeProjectId) syncActiveProjectFromWorkspace();

    const proj = projectsMap.get(targetId);
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.robosim.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==================== 3. RENDERIZAÇÃO DA BARRA DE ABAS DE PROJETOS ====================
  function renderTabsBar() {
    tabsContainer.innerHTML = '';
    if (openHomeModalBtn) {
      openHomeModalBtn.classList.toggle('active', isStartScreenActive);
    }

    openTabIds.forEach(tabId => {
      const proj = projectsMap.get(tabId);
      if (!proj) return;

      const isActive = !isStartScreenActive && tabId === activeProjectId;
      const tabEl = document.createElement('div');
      tabEl.className = 'project-tab' + (isActive ? ' active' : '');
      tabEl.dataset.tabId = tabId;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'project-tab-title';
      titleSpan.textContent = proj.name;
      titleSpan.title = 'Duplo clique para renomear o projeto';

      // Duplo clique no título permite renomear inline
      titleSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineRenameTab(tabId, titleSpan);
      });

      const dotsBtn = document.createElement('button');
      dotsBtn.className = 'tab-dots-btn';
      dotsBtn.title = 'Opções do projeto';
      dotsBtn.textContent = '⋮';
      dotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTabOptionsDropdown(tabId, dotsBtn);
      });

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.title = 'Fechar projeto';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeProjectTab(tabId);
      });

      tabEl.addEventListener('click', () => {
        openProjectInTab(tabId, true);
      });

      tabEl.appendChild(titleSpan);
      tabEl.appendChild(dotsBtn);
      tabEl.appendChild(closeBtn);
      tabsContainer.appendChild(tabEl);
    });
  }

  function startInlineRenameTab(tabId, titleSpanEl) {
    const proj = projectsMap.get(tabId);
    if (!proj) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'project-title-input';
    input.value = proj.name;

    const commitRename = () => {
      const newName = input.value.trim() || proj.name;
      proj.name = newName;
      saveProjectsToStorage();
      renderTabsBar();
      renderHomeProjectsLists();
    };

    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') commitRename();
      if (ev.key === 'Escape') renderTabsBar();
    });
    input.addEventListener('click', e => e.stopPropagation());

    titleSpanEl.replaceWith(input);
    input.focus();
    input.select();
  }

  function openTabOptionsDropdown(tabId, anchorBtn) {
    contextMenuTabId = tabId;
    const rect = anchorBtn.getBoundingClientRect();
    tabContextMenu.style.left = `${Math.min(window.innerWidth - 210, rect.left)}px`;
    tabContextMenu.style.top = `${rect.bottom + 4}px`;
    tabContextMenu.classList.add('open');
  }

  document.getElementById('tabMenuRenameBtn').addEventListener('click', () => {
    tabContextMenu.classList.remove('open');
    if (!contextMenuTabId) return;
    const tabDom = tabsContainer.querySelector(`[data-tab-id="${contextMenuTabId}"] .project-tab-title`);
    if (tabDom) startInlineRenameTab(contextMenuTabId, tabDom);
  });

  document.getElementById('tabMenuDuplicateBtn').addEventListener('click', () => {
    tabContextMenu.classList.remove('open');
    if (contextMenuTabId) duplicateProject(contextMenuTabId);
  });

  document.getElementById('tabMenuAddNoteBtn').addEventListener('click', () => {
    tabContextMenu.classList.remove('open');
    workspace.addStickyNote('Comentário do projeto RoboSim...', 370, 80);
  });

  document.getElementById('tabMenuExportBtn').addEventListener('click', () => {
    tabContextMenu.classList.remove('open');
    if (contextMenuTabId) exportProjectJSON(contextMenuTabId);
  });

  document.getElementById('tabMenuCloseBtn').addEventListener('click', () => {
    tabContextMenu.classList.remove('open');
    if (contextMenuTabId) closeProjectTab(contextMenuTabId);
  });

  // ==================== 4. RENDERIZAÇÃO DINÂMICA DA TELA INICIAL E "MEUS PROJETOS" ====================
  /**
   * Gera a miniatura visual dos blocos reais do projeto para exibir nos cartões da Tela Inicial
   */
  function buildProjectPreviewHTML(proj) {
    const blocks = (proj.data && proj.data.blocks) || [];
    const notes = (proj.data && proj.data.notes) || [];

    if (blocks.length === 0) {
      return '';
    }

    if (blocks.length === 1 && blocks[0].type === 'when_program_starts') {
      return `<div style="width:86%; height:16px; background:#FFBF00; border-radius:4px; display:flex; align-items:center; padding-left:5px; color:#fff; font-size:6.5px; font-weight:700;">▶ quando o programa iniciar</div>`;
    }

    const colorMap = {
      events: '#FFBF00',
      motors: '#0084FF',
      movement: '#EC407A',
      control: '#FF8F00',
      sensors: '#00B0FF',
      sound: '#AB47BC',
      display: '#7E57C2'
    };

    const maxBars = Math.min(6, blocks.length);
    let barsHtml = '<div style="display:flex; width:100%; justify-content:space-between; align-items:flex-start; gap:4px;">';
    barsHtml += '<div style="display:flex; flex-direction:column; gap:3px; flex:1;">';

    for (let i = 0; i < maxBars; i++) {
      const b = blocks[i];
      const def = window.EV3_BLOCK_DEFINITIONS[b.type];
      const col = def ? (colorMap[def.category] || '#0084FF') : '#0084FF';
      const wPct = def && def.shape === 'hat' ? 62 : (68 + ((i * 13) % 28));
      const indent = b.parentCId ? 'margin-left:8px;' : '';
      barsHtml += `<div style="width:${wPct}%; height:6px; background:${col}; border-radius:2px; ${indent}"></div>`;
    }
    barsHtml += '</div>';

    if (notes.length > 0) {
      barsHtml += `<div style="width:24px; height:24px; background:#FFF59D; border:1px solid #E6DC8B; border-radius:2px; flex-shrink:0;"></div>`;
    }
    barsHtml += '</div>';
    return barsHtml;
  }

  function renderHomeProjectsLists(filterText = '') {
    // 1. Renderizar linha "Projetos recentes" na aba PÁGINA INICIAL
    recentProjectsRow.innerHTML = '';

    // Primeiro Card: Novo projeto (+) que cria um projeto do zero!
    const newItem = document.createElement('div');
    newItem.className = 'ev3-project-item';
    newItem.innerHTML = `
      <div class="ev3-project-square" title="Criar um novo projeto em branco do zero">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>
      <div class="ev3-project-name">Novo projeto</div>
    `;
    newItem.addEventListener('click', () => {
      createNewProjectFromScratch();
    });
    recentProjectsRow.appendChild(newItem);

    // Ordenar projetos do mais recente para o mais antigo
    const sortedProjects = Array.from(projectsMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    sortedProjects.forEach(proj => {
      const item = document.createElement('div');
      item.className = 'ev3-project-item';
      item.innerHTML = `
        <div class="ev3-project-square" style="align-items:flex-start; justify-content:center; padding:10px;">
          <button class="ev3-project-delete-mini" title="Excluir projeto">✕</button>
          ${buildProjectPreviewHTML(proj)}
        </div>
        <div class="ev3-project-name" title="${proj.name}">${proj.name}</div>
        <div class="ev3-project-time">${proj.timeLabel || 'recente'}</div>
      `;

      const delBtn = item.querySelector('.ev3-project-delete-mini');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteProjectFromStorage(proj.id);
      });

      item.addEventListener('click', () => {
        openProjectInTab(proj.id, true);
      });

      recentProjectsRow.appendChild(item);
    });

    // 2. Renderizar grade completa na aba "MEUS PROJETOS"
    if (!myProjectsGrid) return;
    myProjectsGrid.innerHTML = '';

    const query = filterText.trim().toLowerCase();
    const filtered = sortedProjects.filter(p => !query || p.name.toLowerCase().includes(query));

    filtered.forEach(proj => {
      const blockCount = (proj.data && proj.data.blocks) ? proj.data.blocks.length : 0;
      const card = document.createElement('div');
      card.className = 'ev3-myproject-card';
      card.innerHTML = `
        <div class="ev3-myproject-preview" title="Clique para abrir este projeto">
          ${buildProjectPreviewHTML(proj)}
        </div>
        <div>
          <div style="font-size:13.5px; font-weight:700; color:#222;">${proj.name}</div>
          <div style="font-size:11px; color:#777; margin-top:2px;">${blockCount} bloco(s) • ${proj.timeLabel || 'recente'}</div>
        </div>
        <div class="ev3-myproject-actions">
          <button class="ev3-mini-action-btn" data-mp-action="open">Abrir</button>
          <button class="ev3-mini-action-btn" data-mp-action="dup">Duplicar</button>
          <button class="ev3-mini-action-btn" data-mp-action="export">Exportar</button>
          <button class="ev3-mini-action-btn danger" data-mp-action="del">✕</button>
        </div>
      `;

      card.querySelector('.ev3-myproject-preview').addEventListener('click', () => {
        openProjectInTab(proj.id, true);
      });
      card.querySelector('[data-mp-action="open"]').addEventListener('click', () => {
        openProjectInTab(proj.id, true);
      });
      card.querySelector('[data-mp-action="dup"]').addEventListener('click', () => {
        duplicateProject(proj.id);
      });
      card.querySelector('[data-mp-action="export"]').addEventListener('click', () => {
        exportProjectJSON(proj.id);
      });
      card.querySelector('[data-mp-action="del"]').addEventListener('click', () => {
        deleteProjectFromStorage(proj.id);
      });

      myProjectsGrid.appendChild(card);
    });
  }

  if (searchProjectsInput) {
    searchProjectsInput.addEventListener('input', () => {
      renderHomeProjectsLists(searchProjectsInput.value);
    });
  }

  // ==================== 5. NAVEGAÇÃO ENTRE AS 5 ABAS DA TELA INICIAL ====================
  function switchHomeTab(viewId) {
    if (viewId === 'homeViewChallenges' || viewId === 'homeViewMain') {
      renderChallengesSection();
    }
    document.querySelectorAll('.ev3-home-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.homeTab === viewId);
    });
    document.querySelectorAll('.ev3-home-view').forEach(view => {
      view.classList.toggle('active', view.id === viewId);
    });
  }

  document.querySelectorAll('[data-home-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchHomeTab(btn.dataset.homeTab);
    });
  });

  // Botão "INICIAR" do banner "Comece aqui" leva para as 3 atividades divertidas da aba INICIAR
  document.getElementById('startFromHomeBtn').addEventListener('click', () => {
    switchHomeTab('homeViewStart');
  });

  // Link "Ver todos os projetos" leva para a aba MEUS PROJETOS
  document.getElementById('viewAllProjectsLinkBtn').addEventListener('click', () => {
    switchHomeTab('homeViewProjects');
  });

  // Card "Planos de Unidade" leva para a aba UNIDADES
  document.getElementById('cardOpenUnitsBtn').addEventListener('click', () => {
    switchHomeTab('homeViewUnits');
  });

  // Card "Desafios" na parte inferior da Página Inicial leva para a aba DESAFIOS
  const cardOpenChallengesBtn = document.getElementById('cardOpenChallengesBtn');
  if (cardOpenChallengesBtn) {
    cardOpenChallengesBtn.addEventListener('click', () => {
      renderChallengesSection();
      switchHomeTab('homeViewChallenges');
    });
  }

  // ==================== 5B. SISTEMA DE DESAFIOS GAMIFICADOS (16 CENÁRIOS PROGRESSIVOS) ====================
  const CHALLENGES_STORAGE_KEY = 'ev3_classroom_challenges_progress_v1';
  let activeChallengeFilter = 'all';
  let challengesProgress = {}; // scenarioId -> { stars: 1..3, completedAt }

  const CHALLENGES_CATALOG = [
    // ==================== NÍVEL 1: DESVIO DE OBSTÁCULOS SEM SENSORES (8 DESAFIOS) ====================
    {
      id: 'desafio_1_parada_barreira',
      number: 1,
      category: 'sem_sensores',
      levelBadge: 'NÍVEL 1 • SEM SENSORES',
      title: '1. Parada Segura Antes da Barreira',
      xpReward: 80,
      bannerGradient: 'linear-gradient(135deg, #00C853, #007E33)',
      description: 'Avance em linha reta calculando o número exato de rotações para frear na zona ESTACIONAR sem encostar na Barreira Frontal.',
      tags: ['Sem Sensores', 'Linha Reta', 'Frenagem de Precisão'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } },
        { type: 'move_for_rotations', params: { direction: 'forward', amount: 2, unit: 'rotations' } }
      ],
      noteText: '🏆 DESAFIO 1 (Parada Segura): Calcule a distância em linha reta até a zona verde ESTACIONAR! Passe pela Estrela Bônus (+★) e pare antes de bater na Barreira Frontal (obstáculos são fixos durante o teste).'
    },
    {
      id: 'desafio_2_desvio_lateral',
      number: 2,
      category: 'sem_sensores',
      levelBadge: 'NÍVEL 1 • SEM SENSORES',
      title: '2. Desvio Lateral Simples (1 Obstáculo)',
      xpReward: 110,
      bannerGradient: 'linear-gradient(135deg, #00BFA5, #004D40)',
      description: 'A faixa sul está bloqueada por um obstáculo. Faça uma troca de faixa em S para o norte, recolha a estrela bônus e alcance a CHEGADA.',
      tags: ['Sem Sensores', 'Troca de Faixa em S', '1 Obstáculo'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 2 (Desvio Lateral em S): O obstáculo bloqueia o caminho reto. Gire ligeiramente à esquerda para mudar para a faixa livre do norte, colete a Estrela (+★) e entre na CHEGADA sem encostar na barreira!'
    },
    {
      id: 'desafio_3_portao_duplo',
      number: 3,
      category: 'sem_sensores',
      levelBadge: 'NÍVEL 1 • SEM SENSORES',
      title: '3. Passagem Estreita entre Dois Obstáculos',
      xpReward: 140,
      bannerGradient: 'linear-gradient(135deg, #43A047, #1B5E20)',
      description: 'Dois obstáculos deixam apenas uma fresta central. Mantenha o robô perfeitamente alinhado e cruze o portão sem bater em nenhum dos lados.',
      tags: ['Sem Sensores', 'Passagem Estreita', 'Alinhamento Fino'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 45 } }
      ],
      noteText: '🏆 DESAFIO 3 (Portão Duplo): Atravesse o vão central entre o Muro Norte e o Muro Sul em velocidade moderada, pegue a Estrela (+★) no meio do portão e avance até a CHEGADA!'
    },
    {
      id: 'desafio_4_reta_alvo',
      number: 4,
      category: 'sem_sensores',
      levelBadge: 'NÍVEL 1 • SEM SENSORES',
      title: '4. Desvio em U (Contorno de Barreira Central)',
      xpReward: 160,
      bannerGradient: 'linear-gradient(135deg, #00C853, #007E33)',
      description: 'Contorne a barreira central usando apenas blocos de Movimento (motores B+C), pegue a estrela bônus no topo e estacione na zona CHEGADA.',
      tags: ['Sem Sensores', '2 Curvas em U', 'Barreira Central'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 4 (Desvio em U): Use blocos rosa de Movimento para desviar da Barreira Central, contornar pelo norte passando na Estrela (+★) e chegar na zona verde CHEGADA!'
    },
    {
      id: 'desafio_5_desvio_duplo_z',
      number: 5,
      category: 'sem_sensores',
      levelBadge: 'NÍVEL 1 • SEM SENSORES',
      title: '5. Desvio Duplo em Z (Dois Obstáculos Alternados)',
      xpReward: 190,
      bannerGradient: 'linear-gradient(135deg, #FF6D00, #BF360C)',
      description: 'Navegue entre dois obstáculos intercalados: desvie do Obstáculo 1 pela direita, passe pela estrela ao sul e contorne o Obstáculo 2 até a CHEGADA.',
      tags: ['Sem Sensores', 'Curvas em Z', '2 Obstáculos Fixos'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 5 (Desvio Duplo em Z): Obstáculo 1 bloqueia o norte e Obstáculo 2 bloqueia o sul. Faça uma manobra em zigue-zague para passar entre eles sem colidir!'
    },
    {
      id: 'desafio_6_slalom_sem_sensor',
      number: 6,
      category: 'sem_sensores',
      levelBadge: 'NÍVEL 1 • SEM SENSORES',
      title: '6. Slalom Duplo de Precisão (3 Curvas)',
      xpReward: 210,
      bannerGradient: 'linear-gradient(135deg, #EC407A, #AD1457)',
      description: 'Execute um zigue-zague preciso entre as barreiras Sul e Norte calculando rotações e 3 curvas sem usar sensores até a CHEGADA.',
      tags: ['Sem Sensores', '3 Curvas', 'Slalom'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 6 (Slalom 3 Curvas): Contorne a Barreira Sul por cima, colete a Estrela Bônus (+★) no centro e desça após a Barreira Norte até a CHEGADA sem encostar nos muros!'
    },
    {
      id: 'desafio_7_serpentina_curvas',
      number: 7,
      category: 'sem_sensores',
      levelBadge: 'NÍVEL 1 • SEM SENSORES',
      title: '7. Corredor Serpentina com 3 Divisórias (4 Curvas)',
      xpReward: 250,
      bannerGradient: 'linear-gradient(135deg, #26A69A, #00695C)',
      description: 'Atravesse 3 divisórias intercaladas fazendo 4 curvas fechadas em serpentina, valide o Checkpoint CURVA 2 e alcance a CHEGADA.',
      tags: ['Sem Sensores', '4 Curvas', 'Checkpoint 🚩'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 7 (Serpentina de 4 Curvas): Suba após a Divisória 1 (pegando a Estrela +★), desça entre as Divisórias 1 e 2 até o Checkpoint 🚩 CURVA 2 e suba após a Divisória 3 até a CHEGADA!'
    },
    {
      id: 'desafio_8_circuito_4_cantos',
      number: 8,
      category: 'sem_sensores',
      levelBadge: 'NÍVEL 1 • SEM SENSORES',
      title: '8. Volta Completa nos 4 Cantos (Circuito Fechado)',
      xpReward: 280,
      bannerGradient: 'linear-gradient(135deg, #D81B60, #880E4F)',
      description: 'Dê a volta completa ao redor da Ilha Central realizando 4 curvas de 90°, ativando os Checkpoints CANTO 1 e CANTO 2 até a CHEGADA.',
      tags: ['Sem Sensores', '4 Cantos 90°', '2 Checkpoints 🚩'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 55 } }
      ],
      noteText: '🏆 DESAFIO 8 (Circuito 4 Cantos): Contorne a Ilha Central pelo corredor externo! Passe pelo 🚩 CANTO 1 (nordeste), 🚩 CANTO 2 (noroeste), Estrela (+★) no oeste e chegue na CHEGADA ao sul (dica: use um bloco Repetir!).'
    },

    // ==================== NÍVEL 2: DESVIO COM SENSORES (4 DESAFIOS) ====================
    {
      id: 'desafio_9_sonar_parede',
      number: 9,
      category: 'com_sensores',
      levelBadge: 'NÍVEL 2 • COM SENSORES',
      title: '9. Alerta de Parede com Ultrassônico',
      xpReward: 200,
      bannerGradient: 'linear-gradient(135deg, #00B0FF, #0077C2)',
      description: 'Avance até o Sensor Ultrassônico (Porta 4) detectar o Muro Sonar (< 22 cm), faça uma curva de 90° à esquerda e suba até o ALVO SONAR.',
      tags: ['Ultrassônico (Porta 4)', '1 Parede', 'Desvio Autônomo'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } },
        { type: 'move_start_steer', params: { steering: 0 } },
        { type: 'sensor_wait_distance', params: { port: '4', comparator: 'lt', distance: 22 } },
        { type: 'move_stop' }
      ],
      noteText: '🏆 DESAFIO 9 (Alerta de Parede): O robô já inicia avançando até detectar o muro a menos de 22 cm. Adicione os blocos para girar 90° à esquerda e subir passando pela Estrela (+★) até o ALVO SONAR!'
    },
    {
      id: 'desafio_10_labirinto_sonar',
      number: 10,
      category: 'com_sensores',
      levelBadge: 'NÍVEL 2 • COM SENSORES',
      title: '10. Corredor Duplo com Sonar (2 Paredes)',
      xpReward: 260,
      bannerGradient: 'linear-gradient(135deg, #0084FF, #004ECB)',
      description: 'Navegue pelo corredor em Z detectando duas paredes em sequência com o Sensor Ultrassônico (Porta 4) até alcançar a SAÍDA LAB.',
      tags: ['Ultrassônico (Porta 4)', '2 Paredes', 'Corredor em Z'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 10 (Corredor Duplo): Use o bloco azul-claro "esperar até distância < X cm" na Porta 4 para detectar a Parede 1, virar à esquerda para subir, detectar a Parede Norte, virar à direita e chegar na SAÍDA LAB!'
    },
    {
      id: 'desafio_11_espiral_sonar',
      number: 11,
      category: 'com_sensores',
      levelBadge: 'NÍVEL 2 • COM SENSORES',
      title: '11. Labirinto em Espiral (4 Paredes)',
      xpReward: 320,
      bannerGradient: 'linear-gradient(135deg, #00ACC1, #006064)',
      description: 'Avance pelo caracol de 4 muros detectando cada parede com o Sensor Ultrassônico (Porta 4) e virando 90° à esquerda até o CENTRO ESPIRAL.',
      tags: ['Ultrassônico (Porta 4)', '4 Paredes', 'Loop Repetir 4x'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } },
        { type: 'control_repeat', params: { times: 4 } }
      ],
      noteText: '🏆 DESAFIO 11 (Espiral de 4 Paredes): Em cada parede (Leste, Norte, Oeste e Sul), avance até o Sensor Ultrassônico (Porta 4) medir < 20 cm, pare e vire 90° à esquerda até entrar no CENTRO ESPIRAL!'
    },
    {
      id: 'desafio_12_tunel_zigzag_sonar',
      number: 12,
      category: 'com_sensores',
      levelBadge: 'NÍVEL 2 • COM SENSORES',
      title: '12. Túnel Zig-Zag Escalonado (4 Paredes)',
      xpReward: 380,
      bannerGradient: 'linear-gradient(135deg, #1E88E5, #0D47A1)',
      description: 'Supere 4 anteparos escalonados alternando curvas à esquerda e à direita sempre que o Sensor Ultrassônico detectar parede à frente.',
      tags: ['Ultrassônico (Porta 4)', 'Zig-Zag 4 Curvas', 'Checkpoint 🚩'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 12 (Túnel Zig-Zag com Sonar): Detecte cada um dos 4 muros escalonados com o Sensor Ultrassônico (Porta 4): vire à esquerda no Muro 1, à direita no Muro 2, à direita no Muro 3 e à esquerda no Muro 4 até a SAÍDA ZIG-ZAG!'
    },

    // ==================== NÍVEL 3: SEGUIR E DETECTAR LINHAS (4 DESAFIOS) ====================
    {
      id: 'desafio_13_parar_na_linha',
      number: 13,
      category: 'seguir_linhas',
      levelBadge: 'NÍVEL 3 • SEGUIR LINHAS',
      title: '13. Frenagem de Precisão na Faixa Preta',
      xpReward: 220,
      bannerGradient: 'linear-gradient(135deg, #7C4DFF, #4527A0)',
      description: 'Avance passando pela estrela bônus e utilize o Sensor de Cor (Porta 3) para parar completamente em cima da faixa preta final!',
      tags: ['Sensor de Cor (Porta 3)', 'Parada na Linha'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 45 } },
        { type: 'move_start_steer', params: { steering: 0 } }
      ],
      noteText: '🏆 DESAFIO 13 (Sensor de Cor Porta 3): Use o bloco "esperar até cor ser Preto" (Porta 3) seguido de "parar de mover" para que o robô freie exatamente sobre a faixa preta dentro da zona PARAR AQUI!'
    },
    {
      id: 'desafio_14_circuito_linha',
      number: 14,
      category: 'seguir_linhas',
      levelBadge: 'NÍVEL 3 • SEGUIR LINHAS',
      title: '14. Trilha Preta em Z (2 Curvas)',
      xpReward: 290,
      bannerGradient: 'linear-gradient(135deg, #AB47BC, #6A1B9A)',
      description: 'Siga a trilha preta usando o Sensor de Cor (Porta 3): vire à esquerda no marcador Vermelho, à direita no Azul e pare no Verde!',
      tags: ['Sensor de Cor (Porta 3)', '2 Curvas', 'Trilha + Cores'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 45 } }
      ],
      noteText: '🏆 DESAFIO 14 (Trilha em Z): Avance pela linha preta até o Sensor de Cor (Porta 3) detectar Vermelho (1ª esquina), vire 90° à esquerda, colete a Estrela (+★) até detectar Azul (2ª esquina), vire à direita e vá até o marcador Verde!'
    },
    {
      id: 'desafio_15_linha_serpentina',
      number: 15,
      category: 'seguir_linhas',
      levelBadge: 'NÍVEL 3 • SEGUIR LINHAS',
      title: '15. Trilha Sinuosa de 4 Curvas',
      xpReward: 360,
      bannerGradient: 'linear-gradient(135deg, #5E35B1, #311B92)',
      description: 'Percorra a serpentina de linha preta com 4 esquinas demarcadas por cores (Vermelho, Amarelo, Azul e Vermelho) até a zona FIM DA LINHA.',
      tags: ['Sensor de Cor (Porta 3)', '4 Curvas na Linha', 'Checkpoint 🚩'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 45 } }
      ],
      noteText: '🏆 DESAFIO 15 (Serpentina de Linha 4 Curvas): Siga a linha preta e use o Sensor de Cor (Porta 3) nas 4 esquinas coloridas: 1ª Vermelho (esquerda), 2ª Amarelo (direita), 3ª Azul no 🚩 CURVA 3 (direita) e 4ª Vermelho (esquerda) até o Verde!'
    },
    {
      id: 'desafio_16_linha_autodromo',
      number: 16,
      category: 'seguir_linhas',
      levelBadge: 'NÍVEL 3 • SEGUIR LINHAS',
      title: '16. Autódromo Chicane (5 Curvas)',
      xpReward: 420,
      bannerGradient: 'linear-gradient(135deg, #3949AB, #1A237E)',
      description: 'Complete a volta completa no circuito de linha preta com 5 curvas de 90° e chicanes coloridas, passando pelo SETOR NORTE até o PIT-STOP!',
      tags: ['Sensor de Cor (Porta 3)', '5 Curvas', 'Autódromo Completo'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 16 (Autódromo 5 Curvas): Siga os trechos da pista preta guiando-se pelos marcadores de cor na Porta 3 (Vermelho → Amarelo → Azul → 🚩 SETOR NORTE → Vermelho → Amarelo) até estacionar no PIT-STOP 🏁!'
    },

    // ==================== NÍVEL 4: PEGAR E LEVAR CAIXAS (4 DESAFIOS) ====================
    {
      id: 'desafio_17_entrega_simples',
      number: 17,
      category: 'pegar_caixas',
      levelBadge: 'NÍVEL 4 • PEGAR CAIXAS',
      title: '17. Coleta e Entrega Direta (1 Caixa)',
      xpReward: 260,
      bannerGradient: 'linear-gradient(135deg, #FF8F00, #E65100)',
      description: 'Avance até a Caixa 1, feche a Garra (Motor A no sentido anti-horário) para agarrá-la e leve-a até a zona laranja ENTREGA 📦.',
      tags: ['Garra (Motor A)', '1 Caixa', 'Logística'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'motor_set_speed', params: { port: 'A', speed: 40 } },
        { type: 'move_set_speed', params: { speed: 45 } }
      ],
      noteText: '🏆 DESAFIO 17 (1 Caixa Direta): 1) Avance ~1 rotação até a Caixa 1; 2) Gire o Motor A no sentido anti-horário por 100 graus para fechar a garra; 3) Avance até a zona ENTREGA 📦 e abra a garra!'
    },
    {
      id: 'desafio_18_logistica_obstaculo',
      number: 18,
      category: 'pegar_caixas',
      levelBadge: 'NÍVEL 4 • PEGAR CAIXAS',
      title: '18. Entrega com Desvio de Obstáculo',
      xpReward: 340,
      bannerGradient: 'linear-gradient(135deg, #FB8C00, #BF360C)',
      description: 'Agarre a Carga VIP com a Garra (Motor A), contorne o Muro Logístico fazendo curvas com a caixa acoplada e entregue na DOCA NORTE 📦.',
      tags: ['Garra (Motor A)', '1 Caixa + Curvas', 'Desvio'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'motor_set_speed', params: { port: 'A', speed: 45 } },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 18 (Entrega com Obstáculo): Pegue a Carga VIP com a Garra (Motor A anti-horário 100°), contorne o Muro Logístico pelo norte coletando a Estrela Bônus (+★) e leve a caixa até a DOCA NORTE 📦!'
    },
    {
      id: 'desafio_19_duas_caixas_docas',
      number: 19,
      category: 'pegar_caixas',
      levelBadge: 'NÍVEL 4 • PEGAR CAIXAS',
      title: '19. Operação Dupla: 2 Caixas em 2 Docas',
      xpReward: 440,
      bannerGradient: 'linear-gradient(135deg, #F4511E, #B71C1C)',
      description: 'Colete a Caixa 1 e entregue na DOCA NORTE 📦; depois retorne para buscar a Caixa 2 (azul) e entregue na DOCA SUL 📦!',
      tags: ['Garra (Motor A)', '2 Caixas', '2 Docas de Entrega'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'motor_set_speed', params: { port: 'A', speed: 45 } },
        { type: 'move_set_speed', params: { speed: 50 } }
      ],
      noteText: '🏆 DESAFIO 19 (2 Caixas em 2 Docas): 1) Pegue a Caixa 1 à frente, leve até a DOCA NORTE 📦 e abra a garra (Motor A horário 100°); 2) Manobre até a Caixa 2 ao sul, feche a garra e entregue na DOCA SUL 📦!'
    },
    {
      id: 'desafio_20_tres_caixas_armazem',
      number: 20,
      category: 'pegar_caixas',
      levelBadge: 'NÍVEL 4 • PEGAR CAIXAS',
      title: '20. Mestre da Logística: 3 Caixas e 3 Docas',
      xpReward: 560,
      bannerGradient: 'linear-gradient(135deg, #D50000, #7F0000)',
      description: 'Desafio Supremo RoboSim: recolha as 3 cargas (Carga 1, Carga 2 e Carga 3), desvie do Pilar Central e distribua uma caixa em cada doca (DOCA A, DOCA B e DOCA C)!',
      tags: ['Garra (Motor A)', '3 Caixas + 3 Docas', 'Desafio Mestre'],
      starterItems: [
        { type: 'when_program_starts' },
        { type: 'motor_set_speed', params: { port: 'A', speed: 50 } },
        { type: 'move_set_speed', params: { speed: 55 } }
      ],
      noteText: '🏆 DESAFIO 20 (Mestre da Logística - 3 Caixas): Entregue as 3 caixas (Carga 1 vermelha, Carga 2 azul e Carga 3 roxa) nas 3 docas (DOCA A, DOCA B e DOCA C) contornando o Pilar Central sem colidir!'
    }
  ];

  function loadChallengesProgress() {
    try {
      const raw = localStorage.getItem(CHALLENGES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) || {};
        // Migra chaves antigas de campanhas anteriores (v1 de 8 desafios e v2 de 16 desafios)
        const legacyKeyMap = {
          // v1 (8 desafios)
          desafio_1_reta_alvo: 'desafio_4_reta_alvo',
          desafio_2_slalom_sem_sensor: 'desafio_6_slalom_sem_sensor',
          desafio_3_serpentina_curvas: 'desafio_7_serpentina_curvas',
          desafio_4_circuito_4_cantos: 'desafio_8_circuito_4_cantos',
          desafio_3_sonar_parede: 'desafio_9_sonar_parede',
          desafio_4_labirinto_sonar: 'desafio_10_labirinto_sonar',
          desafio_5_parar_na_linha: 'desafio_13_parar_na_linha',
          desafio_6_circuito_linha: 'desafio_14_circuito_linha',
          desafio_7_entrega_simples: 'desafio_17_entrega_simples',
          desafio_8_logistica_obstaculo: 'desafio_18_logistica_obstaculo',
          // v2 (16 desafios)
          desafio_5_sonar_parede: 'desafio_9_sonar_parede',
          desafio_6_labirinto_sonar: 'desafio_10_labirinto_sonar',
          desafio_7_espiral_sonar: 'desafio_11_espiral_sonar',
          desafio_8_tunel_zigzag_sonar: 'desafio_12_tunel_zigzag_sonar',
          desafio_9_parar_na_linha: 'desafio_13_parar_na_linha',
          desafio_10_circuito_linha: 'desafio_14_circuito_linha',
          desafio_11_linha_serpentina: 'desafio_15_linha_serpentina',
          desafio_12_linha_autodromo: 'desafio_16_linha_autodromo',
          desafio_13_entrega_simples: 'desafio_17_entrega_simples',
          desafio_14_logistica_obstaculo: 'desafio_18_logistica_obstaculo',
          desafio_15_duas_caixas_docas: 'desafio_19_duas_caixas_docas',
          desafio_16_tres_caixas_armazem: 'desafio_20_tres_caixas_armazem'
        };
        Object.keys(legacyKeyMap).forEach(oldKey => {
          const newKey = legacyKeyMap[oldKey];
          if (parsed[oldKey] && !parsed[newKey]) {
            parsed[newKey] = parsed[oldKey];
            delete parsed[oldKey];
          }
        });
        challengesProgress = parsed;
      }
    } catch (e) {
      challengesProgress = {};
    }
  }

  function saveChallengesProgress() {
    try {
      localStorage.setItem(CHALLENGES_STORAGE_KEY, JSON.stringify(challengesProgress));
    } catch (e) {
      // Ignorar quota
    }
  }

  function computeGamificationTotals() {
    let totalStars = 0;
    let totalXp = 0;
    let completedCount = 0;
    const maxStars = CHALLENGES_CATALOG.length * 3;

    CHALLENGES_CATALOG.forEach(ch => {
      const entry = challengesProgress[ch.id];
      if (entry && entry.stars > 0) {
        completedCount += 1;
        totalStars += entry.stars;
        totalXp += Math.round(ch.xpReward * (entry.stars / 3));
      }
    });

    let rank = '🤖 Cadete RoboSim';
    if (totalStars >= maxStars) rank = '👑 Mestre Supremo RoboSim';
    else if (totalStars >= 45) rank = '🚀 Engenheiro Sênior RoboSim';
    else if (totalStars >= 30) rank = '📦 Especialista Logístico';
    else if (totalStars >= 18) rank = '🧭 Navegador de Sensores';
    else if (totalStars >= 8) rank = '🏎️ Piloto de Precisão';
    else if (totalStars >= 1) rank = '⚙️ Piloto de Testes';

    return { totalStars, maxStars, totalXp, completedCount, rank };
  }

  function renderChallengesSection() {
    const { totalStars, maxStars, totalXp, completedCount, rank } = computeGamificationTotals();

    const homeBadge = document.getElementById('homeCardChallengeStatsBadge');
    if (homeBadge) {
      homeBadge.textContent = `🏆 ${CHALLENGES_CATALOG.length} MISSÕES • ${totalStars}/${maxStars} ⭐ • ${totalXp} XP`;
    }

    const rankEl = document.getElementById('challengePlayerRank');
    const starsEl = document.getElementById('challengeTotalStars');
    const xpEl = document.getElementById('challengeTotalXp');
    const progTextEl = document.getElementById('challengeProgressText');
    const progFillEl = document.getElementById('challengeProgressBarFill');

    if (rankEl) rankEl.textContent = rank;
    if (starsEl) starsEl.textContent = `${totalStars} / ${maxStars} ⭐`;
    if (xpEl) xpEl.textContent = `${totalXp} XP`;
    if (progTextEl) {
      progTextEl.textContent = `Progresso da Campanha: ${completedCount} / ${CHALLENGES_CATALOG.length} Desafios Concluídos`;
    }
    if (progFillEl) {
      const pct = Math.round((completedCount / CHALLENGES_CATALOG.length) * 100);
      progFillEl.style.width = `${pct}%`;
    }

    const gridEl = document.getElementById('challengesGrid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const list = CHALLENGES_CATALOG.filter(
      ch => activeChallengeFilter === 'all' || ch.category === activeChallengeFilter
    );

    list.forEach(ch => {
      const entry = challengesProgress[ch.id];
      const earnedStars = entry ? entry.stars : 0;
      const isDone = earnedStars > 0;

      const card = document.createElement('div');
      card.className = 'ev3-challenge-card' + (isDone ? ' completed' : '');

      let starsHtml = '';
      for (let s = 1; s <= 3; s++) {
        starsHtml += `<span class="ev3-star ${s <= earnedStars ? 'earned' : ''}">★</span>`;
      }

      const tagsHtml = ch.tags.map(t => `<span class="ev3-challenge-tag">${t}</span>`).join('');

      card.innerHTML = `
        <div class="ev3-challenge-card-banner" style="background: ${ch.bannerGradient};">
          <div class="ev3-challenge-top-row">
            <span class="ev3-challenge-level-pill">${ch.levelBadge}</span>
            <span class="ev3-challenge-xp-pill">+${ch.xpReward} XP</span>
          </div>
          <h3>${ch.title}</h3>
          <div class="ev3-challenge-stars-row" title="${earnedStars}/3 estrelas conquistadas">
            ${starsHtml}
          </div>
        </div>
        <div class="ev3-challenge-card-body">
          <p class="ev3-challenge-desc">${ch.description}</p>
          <div class="ev3-challenge-tags">${tagsHtml}</div>
          <div class="ev3-challenge-footer">
            <span class="ev3-challenge-status-text ${isDone ? 'done' : ''}">
              ${isDone ? `✅ Concluído (${earnedStars}/3 ⭐)` : '🎯 Pronto para jogar'}
            </span>
            <button type="button" class="ev3-challenge-play-btn">
              ${isDone ? 'Jogar Novamente →' : 'Iniciar Desafio →'}
            </button>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        startChallengeMission(ch.id);
      });

      gridEl.appendChild(card);
    });
  }

  function startChallengeMission(challengeId) {
    const ch = CHALLENGES_CATALOG.find(item => item.id === challengeId);
    if (!ch) return;

    const projId = 'proj_challenge_' + ch.id;
    if (!projectsMap.has(projId)) {
      projectsMap.set(projId, {
        id: projId,
        name: `Desafio ${ch.number}`,
        subtitle: ch.title,
        scenario: ch.id,
        timeLabel: 'Desafio RoboSim',
        updatedAt: Date.now(),
        data: buildSerializedTemplate([
          {
            x: 32,
            y: 135,
            items: ch.starterItems,
            note: {
              x: 380,
              y: 95,
              text: ch.noteText
            }
          }
        ])
      });
      saveProjectsToStorage();
    } else {
      // Garante que o cenário do desafio continue vinculado
      const existing = projectsMap.get(projId);
      existing.scenario = ch.id;
      existing.updatedAt = Date.now();
    }

    openProjectInTab(projId, true);
    if (statusLogText) {
      statusLogText.textContent = isEV3Connected
        ? `🏆 ${ch.title} carregado! Programe os blocos e clique em Play.`
        : `🏆 ${ch.title} carregado! Clique em "conectar" no canto inferior direito para abrir o Simulador 2D.`;
    }
  }

  function updateArenaChallengeHud(scenarioName) {
    const hudBanner = document.getElementById('challengeHudBanner');
    const levelBadge = document.getElementById('challengeHudLevelBadge');
    const titleEl = document.getElementById('challengeHudTitle');
    const wrapperEl = arenaCanvas ? arenaCanvas.parentElement : null;

    const ch = CHALLENGES_CATALOG.find(item => item.id === scenarioName);
    if (ch && hudBanner) {
      hudBanner.style.display = 'flex';
      if (levelBadge) levelBadge.textContent = `DESAFIO ${ch.number}`;
      if (titleEl) titleEl.textContent = ch.title;
      if (wrapperEl) wrapperEl.classList.add('has-challenge-hud');
    } else if (hudBanner) {
      hudBanner.style.display = 'none';
      if (wrapperEl) wrapperEl.classList.remove('has-challenge-hud');
    }
  }

  function hideVictoryOverlay() {
    const overlay = document.getElementById('challengeVictoryOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function playVictoryFanfare() {
    // Toca uma melodia alegre de vitória usando o sintetizador de áudio do runtime
    const notes = [
      { freq: 523.25, dur: 0.12, delay: 0 },
      { freq: 659.25, dur: 0.12, delay: 130 },
      { freq: 783.99, dur: 0.14, delay: 260 },
      { freq: 1046.5, dur: 0.32, delay: 410 }
    ];
    notes.forEach(n => {
      setTimeout(() => {
        if (runtime && typeof runtime.playTone === 'function') {
          runtime.playTone(n.freq, n.dur);
        }
      }, n.delay);
    });
  }

  arena.onChallengeComplete = (result) => {
    const ch = CHALLENGES_CATALOG.find(item => item.id === result.scenario);
    if (!ch) return;

    setTimeout(() => {
      if (runtime.isRunning) runtime.stopProgram();
    }, 180);

    playVictoryFanfare();

    const prev = challengesProgress[ch.id];
    const bestStars = Math.max(prev ? prev.stars : 0, result.stars);
    challengesProgress[ch.id] = {
      stars: bestStars,
      completedAt: Date.now()
    };
    saveChallengesProgress();
    renderChallengesSection();

    const earnedXp = Math.round(ch.xpReward * (result.stars / 3));
    const overlay = document.getElementById('challengeVictoryOverlay');
    const titleEl = document.getElementById('victoryChallengeTitle');
    const starsRowEl = document.getElementById('victoryStarsRow');
    const xpPillEl = document.getElementById('victoryXpPill');
    const checklistEl = document.getElementById('victoryChecklist');
    const nextBtn = document.getElementById('victoryNextChallengeBtn');

    if (titleEl) titleEl.textContent = `${ch.title} Concluído!`;
    if (starsRowEl) {
      let sHtml = '';
      for (let i = 1; i <= 3; i++) {
        sHtml += `<span class="v-star ${i <= result.stars ? 'earned' : ''}">★</span>`;
      }
      starsRowEl.innerHTML = sHtml;
    }
    if (xpPillEl) {
      xpPillEl.textContent = `+${earnedXp} XP GANHOS (${result.stars}/3 ⭐)`;
    }
    if (checklistEl) {
      checklistEl.innerHTML = `
        <li>✅ Objetivo principal alcançado na Zona Alvo (+1 ⭐)</li>
        <li>${!result.hadCollision ? '✅ Percurso perfeito sem colisões (+1 ⭐)' : '⚠️ Colidiu com obstáculo ou borda (0 ⭐)'}</li>
        <li>${result.bonusCollected ? '✅ Estrela Bônus coletada na pista (+1 ⭐)' : '⚠️ Estrela Bônus não coletada (0 ⭐)'}</li>
      `;
    }

    const currentIdx = CHALLENGES_CATALOG.findIndex(item => item.id === ch.id);
    const nextChallenge = CHALLENGES_CATALOG[currentIdx + 1] || CHALLENGES_CATALOG[0];
    if (nextBtn) {
      nextBtn.textContent = currentIdx + 1 < CHALLENGES_CATALOG.length
        ? `Próximo: Desafio ${nextChallenge.number} →`
        : 'Jogar Desafio 1 →';
      nextBtn.onclick = () => {
        hideVictoryOverlay();
        startChallengeMission(nextChallenge.id);
      };
    }

    if (overlay) {
      overlay.style.display = 'flex';
    }
    if (statusLogText) {
      statusLogText.textContent = `🎉 Parabéns! Você concluiu "${ch.title}" com ${result.stars} estrela(s) e ganhou +${earnedXp} XP!`;
    }
  };

  // Eventos dos filtros e botões de Desafios
  document.querySelectorAll('[data-challenge-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeChallengeFilter = btn.dataset.challengeFilter;
      document.querySelectorAll('[data-challenge-filter]').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      renderChallengesSection();
    });
  });

  const resetChallengesProgressBtn = document.getElementById('resetChallengesProgressBtn');
  if (resetChallengesProgressBtn) {
    resetChallengesProgressBtn.addEventListener('click', () => {
      challengesProgress = {};
      saveChallengesProgress();
      renderChallengesSection();
    });
  }

  const openChallengesFromArenaBtn = document.getElementById('openChallengesFromArenaBtn');
  if (openChallengesFromArenaBtn) {
    openChallengesFromArenaBtn.addEventListener('click', () => {
      renderChallengesSection();
      openHomePageModal('homeViewChallenges');
    });
  }

  const victoryRetryBtn = document.getElementById('victoryRetryBtn');
  if (victoryRetryBtn) {
    victoryRetryBtn.addEventListener('click', () => {
      hideVictoryOverlay();
      runtime.stopProgram();
      arena.resetRobotPose();
    });
  }

  const victoryAllChallengesBtn = document.getElementById('victoryAllChallengesBtn');
  if (victoryAllChallengesBtn) {
    victoryAllChallengesBtn.addEventListener('click', () => {
      hideVictoryOverlay();
      renderChallengesSection();
      openHomePageModal('homeViewChallenges');
    });
  }

  // Engrenagem superior abre MEUS PROJETOS
  document.getElementById('homeGearBtn').addEventListener('click', () => {
    switchHomeTab('homeViewProjects');
  });

  // Botões da TELA INICIAL ("IR PARA A PÁGINA INICIAL" | "NOVO PROJETO")
  const startScreenGoHomeBtn = document.getElementById('startScreenGoHomeBtn');
  if (startScreenGoHomeBtn) {
    startScreenGoHomeBtn.addEventListener('click', () => {
      openHomePageModal('homeViewMain');
    });
  }

  const startScreenNewProjectBtn = document.getElementById('startScreenNewProjectBtn');
  if (startScreenNewProjectBtn) {
    startScreenNewProjectBtn.addEventListener('click', () => {
      createNewProjectFromScratch();
    });
  }

  // Todos os botões "+ Novo Projeto do Zero" e "+" da barra de abas
  document.getElementById('newTabPlusBtn').addEventListener('click', () => {
    createNewProjectFromScratch();
  });
  document.getElementById('menuNewProjectBtn').addEventListener('click', () => {
    createNewProjectFromScratch();
  });
  document.querySelectorAll('[data-create-blank-project]').forEach(btn => {
    btn.addEventListener('click', () => {
      createNewProjectFromScratch();
    });
  });

  // Cartões de atividades/unidades na Página Inicial
  document.querySelectorAll('[data-open-template]').forEach(card => {
    card.addEventListener('click', () => {
      openTemplateActivity(card.dataset.openTemplate);
    });
  });

  // Botão Fechar (✕) da Página Inicial: fecha o modal (voltando para a Tela Inicial ou para a aba de projeto ativa)
  function closeHomeModalSafely() {
    homeModal.classList.remove('open');
    if (openTabIds.length === 0 || !activeProjectId) {
      showStartScreen();
    } else if (!isStartScreenActive) {
      setTimeout(() => arena.resizeCanvas(), 30);
    }
  }

  document.getElementById('closeHomeModalBtn').addEventListener('click', closeHomeModalSafely);
  homeModal.addEventListener('click', (e) => {
    if (e.target === homeModal) {
      closeHomeModalSafely();
    }
  });

  // Clique no ícone da Casinha (🏠) na barra de abas superior:
  // - Se estiver num projeto aberto, vai para a Tela Inicial (destacando a aba 🏠 em branco).
  // - Se já estiver na Tela Inicial, abre a Página Inicial ("Comece aqui").
  document.getElementById('openHomeModalBtn').addEventListener('click', () => {
    if (!isStartScreenActive) {
      showStartScreen();
    } else {
      openHomePageModal('homeViewMain');
    }
  });

  const menuOpenStartScreenBtn = document.getElementById('menuOpenStartScreenBtn');
  if (menuOpenStartScreenBtn) {
    menuOpenStartScreenBtn.addEventListener('click', () => {
      showStartScreen();
    });
  }

  document.getElementById('menuOpenHomeBtn').addEventListener('click', () => {
    openHomePageModal('homeViewMain');
  });

  // Menus de Arquivo (Duplicar, Exportar, Importar, Fechar Projeto)
  document.getElementById('menuDuplicateProjectBtn').addEventListener('click', () => {
    if (activeProjectId) duplicateProject(activeProjectId);
  });
  document.getElementById('menuExportProjectBtn').addEventListener('click', () => {
    if (activeProjectId) exportProjectJSON(activeProjectId);
  });
  document.getElementById('menuCloseProjectBtn').addEventListener('click', () => {
    if (activeProjectId) closeProjectTab(activeProjectId);
  });

  const triggerImport = () => importProjectFileInput.click();
  document.getElementById('menuImportProjectBtn').addEventListener('click', triggerImport);
  document.getElementById('myProjectsImportBtn').addEventListener('click', triggerImport);

  importProjectFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const id = 'proj_imp_' + Date.now();
        const importedProj = {
          id,
          name: parsed.name || file.name.replace(/\.json$/i, ''),
          subtitle: 'Projeto importado',
          scenario: parsed.scenario || 'pista_padrao',
          timeLabel: 'agora mesmo',
          updatedAt: Date.now(),
          data: parsed.data || parsed
        };
        projectsMap.set(id, importedProj);
        saveProjectsToStorage();
        openProjectInTab(id, true);
      } catch (err) {
        alert('Arquivo de projeto inválido.');
      }
    };
    reader.readAsText(file);
    importProjectFileInput.value = '';
  });

  // ==================== 6. ATUALIZAÇÃO DO PAINEL HUD EV3 (PORTAS A,B,C,D e 1,2,3,4) ====================
  const portValA = document.getElementById('portValA');
  const portSubA = document.getElementById('portSubA');
  const portValB = document.getElementById('portValB');
  const portSubB = document.getElementById('portSubB');
  const portValC = document.getElementById('portValC');
  const portSubC = document.getElementById('portSubC');
  const portValD = document.getElementById('portValD');
  const portSubD = document.getElementById('portSubD');

  const portVal1 = document.getElementById('portVal1');
  const portVal2 = document.getElementById('portVal2');
  const portVal3 = document.getElementById('portVal3');
  const portVal4 = document.getElementById('portVal4');

  function updateHUD(robot) {
    const mA = robot.motors.A;
    const mB = robot.motors.B;
    const mC = robot.motors.C;
    const mD = robot.motors.D;

    const rpmB = Math.round((mB.currentSpeedPct / 100) * arena.MAX_RPM);
    const rpmC = Math.round((mC.currentSpeedPct / 100) * arena.MAX_RPM);

    if (portValA) portValA.textContent = `${Math.round(mA.currentSpeedPct)}%`;
    if (portSubA) portSubA.textContent = `${Math.round(mA.degrees)}°`;

    if (portValB) portValB.textContent = `${Math.round(mB.currentSpeedPct)}% (${rpmB} RPM)`;
    if (portSubB) portSubB.textContent = `${(mB.degrees / 360).toFixed(1)} rot | ${Math.round(mB.degrees)}°`;

    if (portValC) portValC.textContent = `${Math.round(mC.currentSpeedPct)}% (${rpmC} RPM)`;
    if (portSubC) portSubC.textContent = `${(mC.degrees / 360).toFixed(1)} rot | ${Math.round(mC.degrees)}°`;

    if (portValD) portValD.textContent = `${Math.round(mD.currentSpeedPct)}%`;
    if (portSubD) portSubD.textContent = `${Math.round(mD.degrees)}°`;

    if (portVal1) portVal1.textContent = robot.sensors.touch ? '1 (Pressionado)' : '0 (Livre)';
    if (portVal2) portVal2.textContent = `${Math.round(robot.sensors.gyroAngleDeg)}°`;
    if (portVal3) portVal3.textContent = robot.sensors.colorLabel;
    if (portVal4) portVal4.textContent = `${robot.sensors.ultrasonicCm.toFixed(1)} cm`;
  }

  // ==================== 7. POP-UP DE CONEXÃO (Conectar.jpg / Bloco Robo.jpg) E CONTROLES DA ARENA ====================
  const floatingBrickBtn = document.getElementById('floatingBrickBtn');
  const floatingBrickLabel = document.getElementById('floatingBrickLabel');
  const resizer = document.getElementById('splitResizer');
  const simPanel = document.getElementById('simulationPanel');

  const ev3ConnectModal = document.getElementById('ev3ConnectModal');
  const closeConnectModalBtn = document.getElementById('closeConnectModalBtn');
  const toggleConnectModeBtn = document.getElementById('toggleConnectModeBtn');
  const connectModalTitle = document.getElementById('connectModalTitle');
  const connectStep2Text = document.getElementById('connectStep2Text');
  const confirmConnectSimBtn = document.getElementById('confirmConnectSimBtn');
  const connectBrickIllustration = document.getElementById('connectBrickIllustration');

  let isBluetoothMode = false;

  function openConnectModal() {
    isBluetoothMode = false;
    updateConnectModalModeUI();
    if (ev3ConnectModal) {
      ev3ConnectModal.classList.add('open');
    }
  }

  function closeConnectModal() {
    if (ev3ConnectModal) {
      ev3ConnectModal.classList.remove('open');
    }
  }

  function updateConnectModalModeUI() {
    if (!connectModalTitle || !connectStep2Text || !toggleConnectModeBtn) return;
    if (isBluetoothMode) {
      connectModalTitle.textContent = 'Conectar via Bluetooth';
      connectStep2Text.textContent = '2. Ative o Bluetooth no seu Bloco Inteligente e selecione-o para conectar.';
      toggleConnectModeBtn.textContent = 'CONECTAR VIA CABO USB';
    } else {
      connectModalTitle.textContent = 'Conectar Bloco Inteligente';
      connectStep2Text.textContent = '2. Use o cabo USB para conectar o seu Bloco Inteligente ao computador.';
      toggleConnectModeBtn.textContent = 'CONECTAR VIA BLUETOOTH';
    }
  }

  function connectEV3AndOpenSimulator() {
    isEV3Connected = true;
    closeConnectModal();

    floatingBrickBtn.classList.remove('disconnected');
    floatingBrickLabel.textContent = 'conectado';
    floatingBrickBtn.title = 'Robô Conectado (Clique para desconectar e recolher o Simulador)';

    if (resizer) resizer.classList.remove('hidden-sim');
    if (simPanel) simPanel.classList.remove('hidden-sim');

    setTimeout(() => {
      arena.resizeCanvas();
    }, 30);

    if (statusLogText) {
      statusLogText.textContent = 'Robô conectado! Arena de Simulação 2D pronta.';
    }
  }

  function disconnectEV3AndHideSimulator() {
    if (runtime.isRunning) runtime.stopProgram();
    isEV3Connected = false;

    floatingBrickBtn.classList.add('disconnected');
    floatingBrickLabel.textContent = 'conectar';
    floatingBrickBtn.title = 'Clique para conectar o Robô e abrir o Simulador';

    if (resizer) resizer.classList.add('hidden-sim');
    if (simPanel) simPanel.classList.add('hidden-sim');

    if (statusLogText) {
      statusLogText.textContent = 'Robô desconectado. Clique em "conectar" para abrir o Simulador.';
    }
  }

  floatingBrickBtn.addEventListener('click', () => {
    if (!isEV3Connected) {
      openConnectModal();
    } else {
      disconnectEV3AndHideSimulator();
    }
  });

  if (toggleConnectModeBtn) {
    toggleConnectModeBtn.addEventListener('click', () => {
      isBluetoothMode = !isBluetoothMode;
      updateConnectModalModeUI();
    });
  }

  if (closeConnectModalBtn) {
    closeConnectModalBtn.addEventListener('click', closeConnectModal);
  }

  if (ev3ConnectModal) {
    ev3ConnectModal.addEventListener('click', (e) => {
      if (e.target === ev3ConnectModal) {
        closeConnectModal();
      }
    });
  }

  if (confirmConnectSimBtn) {
    confirmConnectSimBtn.addEventListener('click', connectEV3AndOpenSimulator);
  }

  if (connectBrickIllustration) {
    connectBrickIllustration.addEventListener('click', connectEV3AndOpenSimulator);
  }

  playFabBtn.addEventListener('click', () => {
    if (!isEV3Connected) {
      openConnectModal();
      return;
    }
    hideVictoryOverlay();
    runtime.startProgram();
  });

  document.getElementById('resetArenaFabBtn').addEventListener('click', () => {
    if (!isEV3Connected) {
      openConnectModal();
      return;
    }
    hideVictoryOverlay();
    runtime.stopProgram();
    arena.resetRobotPose();
    statusLogText.textContent = 'Posição do robô e contadores de motores reiniciados.';
  });

  document.getElementById('scenarioSelect').addEventListener('change', (e) => {
    hideVictoryOverlay();
    runtime.stopProgram();
    arena.loadScenario(e.target.value);
    updateArenaChallengeHud(e.target.value);
    syncActiveProjectFromWorkspace();
    statusLogText.textContent = `Pista selecionada: ${e.target.options[e.target.selectedIndex].text}`;
  });

  document.getElementById('addObstacleBtn').addEventListener('click', () => {
    if (arena.isChallengeScenario()) {
      showToast('⚠️ Nos desafios oficiais, os obstáculos são fixos para avaliação do trajeto!');
      if (statusLogText) {
        statusLogText.textContent = 'Não é permitido adicionar ou mover obstáculos nos desafios oficiais.';
      }
      return;
    }
    arena.addCustomObstacle();
    statusLogText.textContent = 'Novo obstáculo adicionado! Arraste-o com o mouse na pista.';
  });

  arena.onObstacleDragBlocked = (obs) => {
    showToast('⚠️ Nos desafios oficiais, os obstáculos são fixos para testar a programação!');
    if (statusLogText) {
      statusLogText.textContent = `Aviso: Posição do obstáculo "${obs?.label || 'fixo'}" travada durante o desafio.`;
    }
  };

  const toggleConeBtn = document.getElementById('toggleConeBtn');
  toggleConeBtn.addEventListener('click', () => {
    arena.showUltrasonicCone = !arena.showUltrasonicCone;
    toggleConeBtn.classList.toggle('active', arena.showUltrasonicCone);
  });

  const toggleTrailBtn = document.getElementById('toggleTrailBtn');
  toggleTrailBtn.addEventListener('click', () => {
    arena.showTrail = !arena.showTrail;
    toggleTrailBtn.classList.toggle('active', arena.showTrail);
  });

  document.getElementById('rotateRobotBtn').addEventListener('click', () => {
    arena.robot.angle += Math.PI / 4;
    arena.updateSensors();
  });

  document.querySelectorAll('[data-brick-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isEV3Connected) {
        openConnectModal();
        return;
      }
      runtime.triggerBrickButton(btn.dataset.brickBtn);
    });
  });

  // Controles de Zoom, Enquadramento, Organização e Undo/Redo do Workspace
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  const zoomLevelBadge = document.getElementById('zoomLevelBadge');
  const zoomFitBtn = document.getElementById('zoomFitBtn');
  const cleanUpWorkspaceBtn = document.getElementById('cleanUpWorkspaceBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => workspace.zoomIn());
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => workspace.zoomOut());
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => workspace.resetZoom());
  if (zoomLevelBadge) zoomLevelBadge.addEventListener('click', () => workspace.resetZoom());
  if (zoomFitBtn) {
    zoomFitBtn.addEventListener('click', () => {
      workspace.fitAllBlocksInView();
      showToast('Área de programação enquadrada aos blocos!', '🔍');
    });
  }
  if (cleanUpWorkspaceBtn) {
    cleanUpWorkspaceBtn.addEventListener('click', () => {
      workspace.cleanUpBlocks();
      showToast('Blocos organizados e alinhados automaticamente!', '📐');
    });
  }
  if (undoBtn) undoBtn.addEventListener('click', () => workspace.undo());
  if (redoBtn) redoBtn.addEventListener('click', () => workspace.redo());

  // Menu Superior: Editar
  const menuUndoBtn = document.getElementById('menuUndoBtn');
  const menuRedoBtn = document.getElementById('menuRedoBtn');
  const menuSelectAllBtn = document.getElementById('menuSelectAllBtn');
  const menuCleanUpBtn = document.getElementById('menuCleanUpBtn');
  const menuCenterViewBtn = document.getElementById('menuCenterViewBtn');
  const menuDeleteSelectionBtn = document.getElementById('menuDeleteSelectionBtn');

  if (menuUndoBtn) menuUndoBtn.addEventListener('click', () => workspace.undo());
  if (menuRedoBtn) menuRedoBtn.addEventListener('click', () => workspace.redo());
  if (menuSelectAllBtn) {
    menuSelectAllBtn.addEventListener('click', () => {
      workspace.selectAll();
      showToast('Todos os blocos foram selecionados!', '✨');
    });
  }
  if (menuCleanUpBtn) {
    menuCleanUpBtn.addEventListener('click', () => {
      workspace.cleanUpBlocks();
      showToast('Blocos organizados na área de trabalho!', '📐');
    });
  }
  if (menuCenterViewBtn) {
    menuCenterViewBtn.addEventListener('click', () => {
      workspace.fitAllBlocksInView();
      showToast('Visão centralizada!', '🎯');
    });
  }
  if (menuDeleteSelectionBtn) {
    menuDeleteSelectionBtn.addEventListener('click', () => {
      workspace.deleteSelectedBlocks();
    });
  }

  // Controles Extras da Arena 2D: Reset Robô, Velocidade, Grade e Limpar Rastro
  const resetRobotArenaBtn = document.getElementById('resetRobotArenaBtn');
  const simSpeedSelect = document.getElementById('simSpeedSelect');
  const toggleGridBtn = document.getElementById('toggleGridBtn');
  const clearTrailBtn = document.getElementById('clearTrailBtn');

  if (resetRobotArenaBtn) {
    resetRobotArenaBtn.addEventListener('click', () => {
      arena.resetRobotToStart();
      showToast('Robô reposicionado na posição inicial!', '↺');
    });
  }

  if (simSpeedSelect) {
    simSpeedSelect.addEventListener('change', () => {
      arena.simulationSpeed = parseFloat(simSpeedSelect.value) || 1.0;
      showToast(`Velocidade da simulação: ${simSpeedSelect.value}x`, '⚡');
    });
  }

  if (toggleGridBtn) {
    toggleGridBtn.addEventListener('click', () => {
      arena.showGrid = !arena.showGrid;
      toggleGridBtn.classList.toggle('active', arena.showGrid);
      showToast(arena.showGrid ? 'Grade métrica de 5 cm / 10 cm ativada' : 'Grade métrica desativada', '📐');
    });
  }

  if (clearTrailBtn) {
    clearTrailBtn.addEventListener('click', () => {
      arena.clearTrail();
      showToast('Rastro do trajeto limpo!', '🗑');
    });
  }

  // Modal de Atalhos de Teclado
  const shortcutsModal = document.getElementById('shortcutsModal');
  const openShortcutsModalBtn = document.getElementById('openShortcutsModalBtn');
  const workspaceShortcutsBtn = document.getElementById('workspaceShortcutsBtn');
  const closeShortcutsModalBtn = document.getElementById('closeShortcutsModalBtn');
  const shortcutsGotItBtn = document.getElementById('shortcutsGotItBtn');

  function openShortcutsModal() {
    if (shortcutsModal) shortcutsModal.style.display = 'flex';
  }

  function closeShortcutsModal() {
    if (shortcutsModal) shortcutsModal.style.display = 'none';
  }

  if (openShortcutsModalBtn) openShortcutsModalBtn.addEventListener('click', openShortcutsModal);
  if (workspaceShortcutsBtn) workspaceShortcutsBtn.addEventListener('click', openShortcutsModal);
  if (closeShortcutsModalBtn) closeShortcutsModalBtn.addEventListener('click', closeShortcutsModal);
  if (shortcutsGotItBtn) shortcutsGotItBtn.addEventListener('click', closeShortcutsModal);
  if (shortcutsModal) {
    shortcutsModal.addEventListener('click', (e) => {
      if (e.target === shortcutsModal) closeShortcutsModal();
    });
  }

  // Atalhos Globais: Espaço para Play/Stop e F1/? para Atalhos
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isEditingField =
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'SELECT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable);

    if (isEditingField) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!isEV3Connected) {
        openConnectModal();
      } else {
        playFabBtn.click();
      }
    } else if (e.key === 'F1' || (e.shiftKey && e.key === '?')) {
      e.preventDefault();
      openShortcutsModal();
    } else if (e.key === 'Escape') {
      closeShortcutsModal();
    }
  });

  document.getElementById('addStickyNoteBtn').addEventListener('click', () => {
    workspace.addStickyNote('Pressione Play para testar sua pilha de programação na Arena 2D!', 370, 60);
  });

  // Divisor Redimensionável

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizer.classList.add('resizing');
    const startX = e.clientX;
    const startW = simPanel.getBoundingClientRect().width;

    const onMove = (ev) => {
      const newW = Math.max(340, Math.min(window.innerWidth * 0.62, startW - (ev.clientX - startX)));
      simPanel.style.width = `${newW}px`;
      arena.resizeCanvas();
    };

    const onUp = () => {
      resizer.classList.remove('resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // ==================== 8. VISUALIZADOR DE CONSTRUÇÃO EM TELA CHEIA ====================
  const builderOverlay = document.getElementById('builderOverlay');
  const builderSteps = [
    {
      src: 'modelo de robô 2.jpg',
      badge: 'Passo 1 / 2',
      title: '1. Base Motriz — Chassi e Rodas Laterais Sincronizadas (Portas B e C)'
    },
    {
      src: 'modelo de robô.jpg',
      badge: 'Passo 2 / 2',
      title: '2. Base Motriz — Instalação do Sensor Ultrassônico Frontal (Porta 4)'
    }
  ];
  let currentBuilderStep = 0;
  let builderZoom = 1.0;

  const builderStageImg = document.getElementById('builderStageImg');
  const builderStepSlider = document.getElementById('builderStepSlider');
  const builderStepBadge = document.getElementById('builderStepBadge');
  const builderStepTitle = document.getElementById('builderStepTitle');

  function updateBuilderView() {
    const step = builderSteps[currentBuilderStep];
    builderStageImg.src = step.src;
    builderStageImg.style.transform = `scale(${builderZoom})`;
    builderStepSlider.value = String(currentBuilderStep + 1);
    builderStepBadge.textContent = step.badge;
    builderStepTitle.textContent = step.title;
  }

  function openBuilderViewer(initialStep = 0) {
    currentBuilderStep = initialStep;
    builderZoom = 1.0;
    updateBuilderView();
    builderOverlay.classList.add('open');
  }

  document.getElementById('cardOpenBuilderBtn').addEventListener('click', () => openBuilderViewer(0));
  document.getElementById('openBuilderBtn').addEventListener('click', () => openBuilderViewer(0));
  document.getElementById('openBuilderFromMenuBtn').addEventListener('click', () => openBuilderViewer(0));
  document.getElementById('buildCardStep1').addEventListener('click', () => openBuilderViewer(0));
  document.getElementById('buildCardStep2').addEventListener('click', () => openBuilderViewer(1));

  document.getElementById('closeBuilderOverlayBtn').addEventListener('click', () => {
    builderOverlay.classList.remove('open');
  });

  document.getElementById('builderPrevBtn').addEventListener('click', () => {
    currentBuilderStep = (currentBuilderStep - 1 + builderSteps.length) % builderSteps.length;
    updateBuilderView();
  });

  document.getElementById('builderNextBtn').addEventListener('click', () => {
    currentBuilderStep = (currentBuilderStep + 1) % builderSteps.length;
    updateBuilderView();
  });

  builderStepSlider.addEventListener('input', () => {
    currentBuilderStep = Math.max(0, Math.min(builderSteps.length - 1, parseInt(builderStepSlider.value, 10) - 1));
    updateBuilderView();
  });

  document.getElementById('builderZoomInBtn').addEventListener('click', () => {
    builderZoom = Math.min(1.8, +(builderZoom + 0.15).toFixed(2));
    updateBuilderView();
  });
  document.getElementById('builderZoomOutBtn').addEventListener('click', () => {
    builderZoom = Math.max(0.6, +(builderZoom - 0.15).toFixed(2));
    updateBuilderView();
  });
  document.getElementById('builderZoomResetBtn').addEventListener('click', () => {
    builderZoom = 1.0;
    updateBuilderView();
  });

  // Menus superiores (Arquivo | Ajuda)
  document.querySelectorAll('[data-dropdown-trigger]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.dropdownTrigger;
      document.querySelectorAll('.dropdown-panel').forEach(p => {
        if (p.id !== targetId) p.classList.remove('open');
      });
      document.getElementById(targetId).classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('open'));
    tabContextMenu.classList.remove('open');
  });

  // ==================== 9. INICIALIZAÇÃO DO SISTEMA ====================
  loadProjectsFromStorage();
  loadChallengesProgress();
  renderChallengesSection();
  renderTabsBar();
  renderHomeProjectsLists();
});
