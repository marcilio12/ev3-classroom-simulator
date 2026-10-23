/**
 * Workspace de Programação Baseado em Blocos SVG (Padrão Oficial LEGO MINDSTORMS EV3 Classroom v1.5.3)
 * Funcionalidades fidedignas ao software oficial:
 * 1. Seleção de bloco ou de todo o conjunto conectado ao clicar em qualquer bloco da pilha.
 * 2. Exclusão imediata do bloco/conjunto selecionado ao pressionar Delete ou Backspace (com suporte a Ctrl+Z).
 * 3. Arrasto fluido do menu lateral (Flyout) para a área de programação usando camada flutuante global
 *    (sem corte de overflow e mantendo o ponto exato de clique do cursor).
 * 4. Sombra fantasma de encaixe (Ghost Snap Preview) ao aproximar blocos (abaixo, acima ou dentro de loops C).
 * 5. Diferenciação precisa entre Clique (selecionar conjunto) e Arrasto (> 5px para mover/desencaixar).
 * 6. Menu de contexto com botão direito (Duplicar, Separar bloco, Comentar, Excluir).
 */

class EV3Workspace {
  constructor(options) {
    this.railEl = options.railEl;
    this.flyoutEl = options.flyoutEl;
    this.workspaceAreaEl = options.workspaceAreaEl;
    this.canvasEl = options.canvasEl;
    this.steeringPopoverEl = options.steeringPopoverEl;
    this.onChange = options.onChange || (() => {});
    this.onSelectionChange = options.onSelectionChange || (() => {});

    this.blocks = new Map(); // id -> blockState
    this.notes = new Map();  // id -> noteState
    this.selectedBlockIds = new Set(); // IDs dos blocos atualmente selecionados
    this.primarySelectedBlockId = null;

    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    this.undoStack = [];
    this.redoStack = [];
    this.activeCategory = 'motors';
    this.activeSteeringBlockId = null;
    this.activeSteeringField = null;
    this.audioCtx = null;

    this.ensureHelperLayers();
    this.initCategoryRail();
    this.initFlyout();
    this.initSteeringPopover();
    this.initWorkspaceEvents();
    this.initKeyboardShortcuts();
  }

  ensureHelperLayers() {
    // Camada global flutuante para arrastar blocos do menu sem recorte de overflow
    let dragLayer = document.getElementById('globalDragLayer');
    if (!dragLayer) {
      dragLayer = document.createElement('div');
      dragLayer.id = 'globalDragLayer';
      dragLayer.className = 'global-drag-layer';
      document.body.appendChild(dragLayer);
    }
    this.globalDragLayer = dragLayer;

    // Referência à barra lateral de blocos para destaque sutil ao arrastar blocos para fora
    this.paletteSidebarEl = this.flyoutEl ? this.flyoutEl.closest('.palette-sidebar') : document.querySelector('.palette-sidebar');

    // Menu de contexto (botão direito)
    let ctxMenu = document.getElementById('ev3ContextMenu');
    if (!ctxMenu) {
      ctxMenu = document.createElement('div');
      ctxMenu.id = 'ev3ContextMenu';
      ctxMenu.className = 'ev3-context-menu';
      document.body.appendChild(ctxMenu);
    }
    this.contextMenuEl = ctxMenu;
  }

  // ==================== INICIALIZAÇÃO DA PALETA LATERAL ====================
  initCategoryRail() {
    this.railEl.innerHTML = '';
    window.EV3_CATEGORIES.forEach((cat, idx) => {
      const btn = document.createElement('button');
      btn.className = 'category-btn' + (idx === 0 ? ' active' : '');
      btn.dataset.category = cat.id;
      btn.innerHTML = `
        <span class="category-dot" style="background:${cat.color}"></span>
        <span class="category-label">${cat.label}</span>
      `;
      btn.addEventListener('click', () => {
        this.railEl.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const section = this.flyoutEl.querySelector(`[data-cat-section="${cat.id}"]`);
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      this.railEl.appendChild(btn);
    });
  }

  initFlyout() {
    this.flyoutEl.innerHTML = '';
    window.EV3_CATEGORIES.forEach(cat => {
      const defs = Object.values(window.EV3_BLOCK_DEFINITIONS).filter(d => d.category === cat.id);
      if (defs.length === 0) return;

      const section = document.createElement('div');
      section.className = 'flyout-category-section';
      section.dataset.catSection = cat.id;

      const title = document.createElement('div');
      title.className = 'flyout-category-title';
      title.textContent = cat.title;
      section.appendChild(title);

      defs.forEach(def => {
        const item = document.createElement('div');
        item.className = 'flyout-block-item';
        const previewBlock = this.createDefaultBlockState(def.type, 0, 0);
        const dom = this.renderBlockElement(previewBlock, true);
        dom.style.position = 'relative';
        dom.style.left = '0px';
        dom.style.top = '0px';
        item.appendChild(dom);

        item.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          this.handleFlyoutMouseDown(def.type, item, e);
        });

        section.appendChild(item);
      });

      this.flyoutEl.appendChild(section);
    });
  }

  createDefaultBlockState(type, x = 80, y = 80, customParams = {}) {
    const def = window.EV3_BLOCK_DEFINITIONS[type];
    const params = {};
    def.tokens.forEach(tok => {
      if (tok.name) {
        params[tok.name] = customParams[tok.name] !== undefined ? customParams[tok.name] : tok.default;
      }
    });
    return {
      id: 'blk_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36),
      type,
      x,
      y,
      params,
      nextId: null,
      prevId: null,
      parentCId: null,
      substackId: null,
      substack2Id: null,
      parentSlot: null
    };
  }

  // ==================== SELEÇÃO DE BLOCOS E CONJUNTOS DE BLOCOS ====================
  /**
   * Retorna o bloco raiz (topo da pilha) do conjunto ao qual `blockId` pertence.
   */
  getRootBlockOfStack(blockId) {
    let curr = this.blocks.get(blockId);
    const visited = new Set();
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      if (curr.parentSlot && this.blocks.has(curr.parentSlot.parentId)) {
        curr = this.blocks.get(curr.parentSlot.parentId);
      } else if (curr.prevId && this.blocks.has(curr.prevId)) {
        curr = this.blocks.get(curr.prevId);
      } else if (curr.parentCId && this.blocks.has(curr.parentCId)) {
        curr = this.blocks.get(curr.parentCId);
      } else {
        break;
      }
    }
    return curr;
  }

  /**
   * Retorna todos os IDs dos blocos que pertencem ao mesmo conjunto conectado (pilha inteira).
   */
  getEntireStackIds(blockId) {
    const root = this.getRootBlockOfStack(blockId);
    if (!root) return [];
    return this.getChainIds(root.id);
  }

  /**
   * Seleciona um bloco. Se `selectWholeStack` for true (padrão ao clicar),
   * seleciona todo o conjunto de blocos conectado a ele.
   */
  selectBlock(blockId, selectWholeStack = true) {
    this.selectedBlockIds.clear();
    this.primarySelectedBlockId = blockId;

    if (blockId && this.blocks.has(blockId)) {
      if (selectWholeStack) {
        const allIds = this.getEntireStackIds(blockId);
        allIds.forEach(id => this.selectedBlockIds.add(id));
      } else {
        this.selectedBlockIds.add(blockId);
      }
    }

    this.updateSelectionVisuals();
    this.onSelectionChange(this.getSelectionInfo());
  }

  clearSelection() {
    if (this.selectedBlockIds.size === 0) return;
    this.selectedBlockIds.clear();
    this.primarySelectedBlockId = null;
    this.updateSelectionVisuals();
    this.onSelectionChange(this.getSelectionInfo());
  }

  getSelectionInfo() {
    return {
      count: this.selectedBlockIds.size,
      primaryId: this.primarySelectedBlockId,
      ids: Array.from(this.selectedBlockIds)
    };
  }

  updateSelectionVisuals() {
    this.canvasEl.querySelectorAll('.block-node').forEach(el => {
      const id = el.dataset.blockId;
      if (this.selectedBlockIds.has(id)) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  /**
   * Apaga o bloco ou todo o conjunto de blocos atualmente selecionado (tecla Delete / Backspace).
   */
  deleteSelectedBlocks() {
    if (this.selectedBlockIds.size === 0) return false;
    this.saveUndoSnapshot();

    // Se houver blocos selecionados que estão conectados a blocos não-selecionados acima/abaixo, reconecta-os
    for (const id of this.selectedBlockIds) {
      const blk = this.blocks.get(id);
      if (!blk) continue;

      if (blk.parentSlot && !this.selectedBlockIds.has(blk.parentSlot.parentId) && this.blocks.has(blk.parentSlot.parentId)) {
        const parent = this.blocks.get(blk.parentSlot.parentId);
        if (parent && parent.params[blk.parentSlot.slotName] === blk.id) {
          parent.params[blk.parentSlot.slotName] = null;
        }
      }
      if (blk.prevId && !this.selectedBlockIds.has(blk.prevId) && this.blocks.has(blk.prevId)) {
        const prev = this.blocks.get(blk.prevId);
        prev.nextId = null;
      }
      if (blk.parentCId && !this.selectedBlockIds.has(blk.parentCId) && this.blocks.has(blk.parentCId)) {
        const parentC = this.blocks.get(blk.parentCId);
        if (parentC.substackId === blk.id) {
          parentC.substackId = null;
        }
        if (parentC.substack2Id === blk.id) {
          parentC.substack2Id = null;
        }
      }
      if (blk.nextId && !this.selectedBlockIds.has(blk.nextId) && this.blocks.has(blk.nextId)) {
        const next = this.blocks.get(blk.nextId);
        next.prevId = null;
      }
    }

    // Remove notas ancoradas aos blocos excluídos ou limpa a âncora
    for (const note of this.notes.values()) {
      if (note.anchorBlockId && this.selectedBlockIds.has(note.anchorBlockId)) {
        note.anchorBlockId = null;
      }
    }

    for (const id of this.selectedBlockIds) {
      this.blocks.delete(id);
    }

    this.selectedBlockIds.clear();
    this.primarySelectedBlockId = null;
    this.renderWorkspace();
    this.onSelectionChange(this.getSelectionInfo());
    this.playAudioFeedback('trash');
    this.onChange();
    return true;
  }

  /**
   * Exclui apenas um único bloco específico, reconectando o bloco de cima ao bloco de baixo.
   */
  deleteSingleBlock(blockId) {
    const blk = this.blocks.get(blockId);
    if (!blk) return;
    this.saveUndoSnapshot();

    if (blk.parentSlot && this.blocks.has(blk.parentSlot.parentId)) {
      const parent = this.blocks.get(blk.parentSlot.parentId);
      if (parent && parent.params[blk.parentSlot.slotName] === blk.id) {
        parent.params[blk.parentSlot.slotName] = null;
      }
      blk.parentSlot = null;
    }

    const prev = blk.prevId ? this.blocks.get(blk.prevId) : null;
    const next = blk.nextId ? this.blocks.get(blk.nextId) : null;
    const parentC = blk.parentCId ? this.blocks.get(blk.parentCId) : null;

    if (prev) {
      prev.nextId = next ? next.id : null;
      if (next) next.prevId = prev.id;
    } else if (parentC && parentC.substackId === blk.id) {
      parentC.substackId = next ? next.id : null;
      if (next) {
        next.prevId = null;
        next.parentCId = parentC.id;
      }
    } else if (parentC && parentC.substack2Id === blk.id) {
      parentC.substack2Id = next ? next.id : null;
      if (next) {
        next.prevId = null;
        next.parentCId = parentC.id;
      }
    } else if (next) {
      next.prevId = null;
    }

    // Se for um bloco C e tiver substack interna, solta a substack no canvas
    if (blk.substackId && this.blocks.has(blk.substackId)) {
      const sub = this.blocks.get(blk.substackId);
      sub.parentCId = null;
    }
    if (blk.substack2Id && this.blocks.has(blk.substack2Id)) {
      const sub2 = this.blocks.get(blk.substack2Id);
      sub2.parentCId = null;
    }

    this.blocks.delete(blockId);
    this.selectedBlockIds.delete(blockId);
    this.renderWorkspace();
    this.onSelectionChange(this.getSelectionInfo());
    this.playAudioFeedback('trash');
    this.onChange();
  }

  /**
   * Duplica todo o conjunto (ou a partir do bloco clicado) deslocando 28px para baixo/direita.
   */
  duplicateStackFrom(blockId) {
    const root = this.blocks.get(blockId);
    if (!root) return;
    this.saveUndoSnapshot();

    const cloneChain = (startId, offsetX, offsetY) => {
      let curr = this.blocks.get(startId);
      let firstClone = null;
      let prevClone = null;

      while (curr) {
        const copy = this.createDefaultBlockState(
          curr.type,
          curr.x + offsetX,
          curr.y + offsetY,
          JSON.parse(JSON.stringify(curr.params))
        );
        this.blocks.set(copy.id, copy);

        if (!firstClone) firstClone = copy;
        if (prevClone) {
          prevClone.nextId = copy.id;
          copy.prevId = prevClone.id;
        }

        if (curr.substackId && this.blocks.has(curr.substackId)) {
          const clonedSub = cloneChain(curr.substackId, offsetX, offsetY);
          if (clonedSub) {
            copy.substackId = clonedSub.id;
            clonedSub.parentCId = copy.id;
          }
        }
        if (curr.substack2Id && this.blocks.has(curr.substack2Id)) {
          const clonedSub2 = cloneChain(curr.substack2Id, offsetX, offsetY);
          if (clonedSub2) {
            copy.substack2Id = clonedSub2.id;
            clonedSub2.parentCId = copy.id;
          }
        }

        // Clona blocos aninhados em slots booleanos
        const def = window.EV3_BLOCK_DEFINITIONS[curr.type];
        if (def && def.tokens) {
          def.tokens.forEach(tok => {
            if (tok.kind === 'boolean_slot' && curr.params[tok.name]) {
              const childId = curr.params[tok.name];
              if (this.blocks.has(childId)) {
                const childClone = cloneChain(childId, offsetX, offsetY);
                if (childClone) {
                  copy.params[tok.name] = childClone.id;
                  childClone.parentSlot = {
                    parentId: copy.id,
                    slotName: tok.name
                  };
                }
              }
            }
          });
        }

        prevClone = copy;
        curr = curr.nextId ? this.blocks.get(curr.nextId) : null;
      }
      return firstClone;
    };

    const newRoot = cloneChain(root.id, 30, 30);
    this.renderWorkspace();
    if (newRoot) {
      this.selectBlock(newRoot.id, true);
    }
    this.playAudioFeedback('duplicate');
    this.onChange();
  }

  /**
   * Feedback de áudio sintético Web Audio API (Lego click, snap, trash, chime)
   */
  playAudioFeedback(type = 'snap') {
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.audioCtx = new AudioContext();
      }
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'snap') {
        // Lego snap click
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.035);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        osc.start(now);
        osc.stop(now + 0.038);
      } else if (type === 'trash') {
        // Pop de exclusão
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.055);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'duplicate') {
        // Chime de duplicação
        osc.type = 'sine';
        osc.frequency.setValueAtTime(640, now);
        osc.frequency.setValueAtTime(920, now + 0.04);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.095);
      }
    } catch (e) {
      // Ignorar caso navegador bloqueie autoplay
    }
  }

  // ==================== ATALHOS DE TECLADO (DELETE, BACKSPACE, CTRL+Z, CTRL+D, CTRL+A, ESC) ====================
  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignora atalhos se o usuário estiver digitando em um input, select ou nota
      const active = document.activeElement;
      const isEditingField =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'SELECT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);

      if (isEditingField) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedBlockIds.size > 0) {
          e.preventDefault();
          this.deleteSelectedBlocks();
        }
      } else if (e.key === 'Escape') {
        this.clearSelection();
        this.closeContextMenu();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (this.primarySelectedBlockId) {
          e.preventDefault();
          const root = this.getRootBlockOfStack(this.primarySelectedBlockId);
          if (root) this.duplicateStackFrom(root.id);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.selectAll();
      }
    });
  }

  // ==================== GEOMETRIA SVG DOS BLOCOS (SCRATCH 3 / EV3) ====================
  estimateBlockWidth(block, visited = new Set()) {
    const def = window.EV3_BLOCK_DEFINITIONS[block.type];
    const hasIcon = Boolean(def.icon && window.EV3_ICONS[def.icon]);
    let width = hasIcon ? (def.icon === 'movement' || def.icon === 'sensorUltrasonic' ? 70 : 64) : 28;

    if (def.shape === 'boolean') width += 24;
    if (def.shape === 'reporter') width += 16;

    def.tokens.forEach(tok => {
      if (tok.kind === 'label') {
        width += tok.text.length * 7.2 + 8;
      } else if (tok.kind === 'number') {
        const numVal = String(block.params[tok.name] !== undefined ? block.params[tok.name] : (tok.default ?? 0));
        width += Math.max(48, numVal.length * 8.5 + 24);
      } else if (tok.kind === 'text') {
        const val = String(block.params[tok.name] !== undefined ? block.params[tok.name] : (tok.default || ''));
        width += Math.max(54, val.length * 7.5 + 24);
      } else if (tok.kind === 'boolean_slot') {
        const childId = block.params[tok.name];
        if (childId && this.blocks.has(childId) && !visited.has(childId)) {
          const nextVisited = new Set(visited);
          nextVisited.add(block.id);
          const childBlock = this.blocks.get(childId);
          width += this.estimateBlockWidth(childBlock, nextVisited) + 8;
        } else {
          width += 56;
        }
      } else if (tok.kind === 'select') {
        const val = block.params[tok.name];
        const opt = tok.options.find(o => String(o.value) === String(val)) || tok.options[0];
        const optLen = opt ? opt.label.length : 5;
        const extraPad = tok.options.length <= 1 ? 20 : 28;
        width += optLen * 7.2 + extraPad;
      } else if (tok.kind === 'steering') {
        const txt = window.formatEV3Steering(block.params[tok.name]);
        width += txt.length * 7.2 + 28;
      }
    });

    if (def.shape === 'reporter' || def.shape === 'boolean') {
      return Math.max(96, Math.ceil(width));
    }
    return Math.max(148, Math.ceil(width));
  }

  getBooleanSlotLabel(condCode, isFlyoutPreview = false) {
    if (isFlyoutPreview && (!condCode || condCode === 'dist_lt_20')) {
      return '';
    }
    const map = {
      dist_lt_20: 'dist < 20cm',
      dist_lt_30: 'dist < 30cm',
      color_black: 'cor = preto',
      color_red: 'cor = vermelho',
      touch_pressed: 'toque = 1',
      true: 'verdadeiro',
      false: 'falso'
    };
    return map[condCode] || '';
  }

  getSubstackHeight(firstBlockId) {
    let total = 0;
    let currId = firstBlockId;
    const visited = new Set();
    while (currId && this.blocks.has(currId) && !visited.has(currId)) {
      visited.add(currId);
      const b = this.blocks.get(currId);
      total += this.getBlockTotalHeight(b);
      currId = b.nextId;
    }
    return Math.max(40, total);
  }

  getBlockTotalHeight(block) {
    const def = window.EV3_BLOCK_DEFINITIONS[block.type];
    if (def.shape === 'hat') {
      return 56;
    }
    if (def.shape === 'reporter' || def.shape === 'boolean') {
      return 40;
    }
    if (def.shape === 'c_block') {
      const innerH = this.getSubstackHeight(block.substackId);
      if (def.elseLabel) {
        const inner2H = this.getSubstackHeight(block.substack2Id);
        return 46 + innerH + 32 + inner2H + 30;
      }
      return 46 + innerH + 30;
    }
    return 48;
  }

  buildSVGPath(shape, width, innerMouthHeight = 40, options = {}) {
    const w = width;

    // 1. Bloco Chapéu (Hat - Eventos)
    if (shape === 'hat') {
      const h = 56;
      return `M 0 16
              c 25 -22, 71 -22, 96 0
              L ${w - 6} 16
              a 6 6 0 0 1 6 6
              L ${w} ${h - 6}
              a 6 6 0 0 1 -6 6
              L 52 ${h}
              c -2 0, -3 1, -4 2
              l -4 4
              c -1 1, -2 2, -4 2
              h -12
              c -2 0, -3 -1, -4 -2
              l -4 -4
              c -1 -1, -2 -2, -4 -2
              L 6 ${h}
              a 6 6 0 0 1 -6 -6
              Z`;
    }

    // 2. Bloco Oval (Reporter - Operadores / Sensores / Motores)
    if (shape === 'reporter') {
      const h = 40;
      const r = h / 2;
      return `M ${r} 0
              L ${w - r} 0
              a ${r} ${r} 0 0 1 ${r} ${r}
              a ${r} ${r} 0 0 1 -${r} ${r}
              L ${r} ${h}
              a ${r} ${r} 0 0 1 -${r} -${r}
              a ${r} ${r} 0 0 1 ${r} -${r}
              Z`;
    }

    // 3. Bloco Hexagonal (Boolean - Sensores / Operadores)
    if (shape === 'boolean') {
      const h = 40;
      const tip = 16;
      return `M ${tip} 0
              L ${w - tip} 0
              L ${w} ${h / 2}
              L ${w - tip} ${h}
              L ${tip} ${h}
              L 0 ${h / 2}
              Z`;
    }

    // 4. Bloco C (Loops e Condicionais: repete, repete para sempre, se...então, se...então/senão)
    if (shape === 'c_block') {
      const topH = 46;
      const spineW = 18;
      const mouth1H = Math.max(40, innerMouthHeight);
      const botH = 30;
      const footW = Math.min(w, 140);

      if (options.elseLabel) {
        const midH = 32;
        const mouth2H = Math.max(40, options.innerMouth2Height || 40);
        const yMidTop = topH + mouth1H;
        const yMidBot = yMidTop + midH;
        const yBotTop = yMidBot + mouth2H;
        const yTotal = yBotTop + botH;

        return `M 0 6
                a 6 6 0 0 1 6 -6
                L 16 0
                c 2 0, 3 1, 4 2
                l 4 4
                c 1 1, 2 2, 4 2
                h 12
                c 2 0, 3 -1, 4 -2
                l 4 -4
                c 1 -1, 2 -2, 4 -2
                L ${w - 6} 0
                a 6 6 0 0 1 6 6
                L ${w} ${topH - 6}
                a 6 6 0 0 1 -6 6
                L ${spineW + 52} ${topH}
                c -2 0, -3 1, -4 2
                l -4 4
                c -1 1, -2 2, -4 2
                h -12
                c -2 0, -3 -1, -4 -2
                l -4 -4
                c -1 -1, -2 -2, -4 -2
                L ${spineW + 4} ${topH}
                a 4 4 0 0 0 -4 4
                L ${spineW} ${yMidTop - 4}
                a 4 4 0 0 0 4 4
                L ${footW - 6} ${yMidTop}
                a 6 6 0 0 1 6 6
                L ${footW} ${yMidBot - 6}
                a 6 6 0 0 1 -6 6
                L ${spineW + 52} ${yMidBot}
                c -2 0, -3 1, -4 2
                l -4 4
                c -1 1, -2 2, -4 2
                h -12
                c -2 0, -3 -1, -4 -2
                l -4 -4
                c -1 -1, -2 -2, -4 -2
                L ${spineW + 4} ${yMidBot}
                a 4 4 0 0 0 -4 4
                L ${spineW} ${yBotTop - 4}
                a 4 4 0 0 0 4 4
                L ${footW - 6} ${yBotTop}
                a 6 6 0 0 1 6 6
                L ${footW} ${yTotal - 6}
                a 6 6 0 0 1 -6 6
                L 52 ${yTotal}
                c -2 0, -3 1, -4 2
                l -4 4
                c -1 1, -2 2, -4 2
                h -12
                c -2 0, -3 -1, -4 -2
                l -4 -4
                c -1 -1, -2 -2, -4 -2
                L 6 ${yTotal}
                a 6 6 0 0 1 -6 -6
                Z`;
      }

      const yMouthBottom = topH + mouth1H;
      const yTotal = yMouthBottom + botH;

      const bottomEdgePath = options.isCap
        ? `L 6 ${yTotal}`
        : `L 52 ${yTotal}
           c -2 0, -3 1, -4 2
           l -4 4
           c -1 1, -2 2, -4 2
           h -12
           c -2 0, -3 -1, -4 -2
           l -4 -4
           c -1 -1, -2 -2, -4 -2
           L 6 ${yTotal}`;

      return `M 0 6
              a 6 6 0 0 1 6 -6
              L 16 0
              c 2 0, 3 1, 4 2
              l 4 4
              c 1 1, 2 2, 4 2
              h 12
              c 2 0, 3 -1, 4 -2
              l 4 -4
              c 1 -1, 2 -2, 4 -2
              L ${w - 6} 0
              a 6 6 0 0 1 6 6
              L ${w} ${topH - 6}
              a 6 6 0 0 1 -6 6
              L ${spineW + 52} ${topH}
              c -2 0, -3 1, -4 2
              l -4 4
              c -1 1, -2 2, -4 2
              h -12
              c -2 0, -3 -1, -4 -2
              l -4 -4
              c -1 -1, -2 -2, -4 -2
              L ${spineW + 4} ${topH}
              a 4 4 0 0 0 -4 4
              L ${spineW} ${yMouthBottom - 4}
              a 4 4 0 0 0 4 4
              L ${footW - 6} ${yMouthBottom}
              a 6 6 0 0 1 6 6
              L ${footW} ${yTotal - 6}
              a 6 6 0 0 1 -6 6
              ${bottomEdgePath}
              a 6 6 0 0 1 -6 -6
              Z`;
    }

    // 5. Bloco Cap (Finalizador sem aba inferior, ex: `parar [e sair do programa]`)
    if (shape === 'cap') {
      const h = 48;
      return `M 0 6
              a 6 6 0 0 1 6 -6
              L 16 0
              c 2 0, 3 1, 4 2
              l 4 4
              c 1 1, 2 2, 4 2
              h 12
              c 2 0, 3 -1, 4 -2
              l 4 -4
              c 1 -1, 2 -2, 4 -2
              L ${w - 6} 0
              a 6 6 0 0 1 6 6
              L ${w} ${h - 6}
              a 6 6 0 0 1 -6 6
              L 6 ${h}
              a 6 6 0 0 1 -6 -6
              Z`;
    }

    // 6. Bloco Stack Padrão
    const h = 48;
    return `M 0 6
            a 6 6 0 0 1 6 -6
            L 16 0
            c 2 0, 3 1, 4 2
            l 4 4
            c 1 1, 2 2, 4 2
            h 12
            c 2 0, 3 -1, 4 -2
            l 4 -4
            c 1 -1, 2 -2, 4 -2
            L ${w - 6} 0
            a 6 6 0 0 1 6 6
            L ${w} ${h - 6}
            a 6 6 0 0 1 -6 6
            L 52 ${h}
            c -2 0, -3 1, -4 2
            l -4 4
            c -1 1, -2 2, -4 2
            h -12
            c -2 0, -3 -1, -4 -2
            l -4 -4
            c -1 -1, -2 -2, -4 -2
            L 6 ${h}
            a 6 6 0 0 1 -6 -6
            Z`;
  }

  renderBlockElement(block, isFlyoutPreview = false) {
    const def = window.EV3_BLOCK_DEFINITIONS[block.type];
    const cat = window.EV3_CATEGORIES.find(c => c.id === def.category);
    const width = this.estimateBlockWidth(block);
    const innerMouthH = def.shape === 'c_block' ? this.getSubstackHeight(block.substackId) : 0;
    const innerMouth2H = (def.shape === 'c_block' && def.elseLabel) ? this.getSubstackHeight(block.substack2Id) : 0;
    const totalH = this.getBlockTotalHeight(block);
    const svgH = totalH + 8;

    const el = document.createElement('div');
    el.className = 'block-node';
    if (!isFlyoutPreview && this.selectedBlockIds.has(block.id)) {
      el.classList.add('selected');
    }
    el.dataset.blockId = block.id;
    el.style.width = `${width}px`;
    el.style.height = `${totalH}px`;
    el.style.left = `${block.x}px`;
    el.style.top = `${block.y}px`;

    const pathD = this.buildSVGPath(def.shape, width, innerMouthH, {
      isCap: Boolean(def.isCap),
      isLoop: Boolean(def.isLoop),
      elseLabel: def.elseLabel || null,
      innerMouth2Height: innerMouth2H
    });

    const headerTopOffset = def.shape === 'hat' ? 14 : 0;
    const headerHeight =
      def.shape === 'hat'
        ? 42
        : def.shape === 'c_block'
        ? 46
        : def.shape === 'reporter' || def.shape === 'boolean'
        ? 40
        : 48;

    const hasIcon = Boolean(def.icon && window.EV3_ICONS[def.icon]);
    const leftPad = hasIcon ? 10 : (def.shape === 'boolean' ? 18 : 14);

    const iconHtml = hasIcon
      ? `<span class="block-icon-badge" style="color:${cat.color}">${window.EV3_ICONS[def.icon]}</span>`
      : '';

    const elseLabelHtml =
      def.shape === 'c_block' && def.elseLabel
        ? `<span class="block-else-label" style="top:${46 + innerMouthH + 7}px">${def.elseLabel}</span>`
        : '';

    const footW = Math.min(width, 140);
    const loopArrowHtml =
      def.shape === 'c_block' && def.isLoop
        ? `<span class="block-loop-arrow" style="left:${footW - 28}px; top:${totalH - 26}px;">${window.EV3_ICONS.loopArrow || ''}</span>`
        : '';

    el.innerHTML = `
      <svg width="${width}" height="${svgH}" viewBox="0 0 ${width} ${svgH}" style="overflow:visible; display:block;">
        <path class="block-bg-path" d="${pathD}" fill="${cat.color}" stroke="${cat.stroke}" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>
      <div class="block-foreign-body" style="position:absolute; top:${headerTopOffset}px; left:0; width:${width}px; height:${headerHeight}px; padding-left:${leftPad}px;">
        ${iconHtml}
      </div>
      ${elseLabelHtml}
      ${loopArrowHtml}
    `;

    const bodyEl = el.querySelector('.block-foreign-body');

    def.tokens.forEach(tok => {
      if (tok.kind === 'label') {
        const span = document.createElement('span');
        span.textContent = tok.text;
        bodyEl.appendChild(span);
      } else if (tok.kind === 'number') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = 'decimal';
        inp.className = 'block-input-pill';
        const numVal = block.params[tok.name] !== undefined ? block.params[tok.name] : (tok.default ?? 0);
        inp.value = numVal;

        // Desativa completamente qualquer menu suspenso nativo de autocomplete/autofill do navegador
        inp.setAttribute('autocomplete', 'off');
        inp.setAttribute('autocorrect', 'off');
        inp.setAttribute('autocapitalize', 'off');
        inp.setAttribute('spellcheck', 'false');
        inp.setAttribute('data-lpignore', 'true');
        inp.setAttribute('data-form-type', 'other');
        inp.setAttribute('aria-autocomplete', 'none');

        const updateWidth = () => {
          const valLen = String(inp.value || '').length;
          inp.style.width = `${Math.max(38, Math.min(84, valLen * 9 + 18))}px`;
        };
        updateWidth();

        if (isFlyoutPreview) {
          inp.readOnly = true;
          inp.style.pointerEvents = 'none';
        } else {
          inp.addEventListener('mousedown', e => e.stopPropagation());
          inp.addEventListener('focus', () => {
            inp.select();
          });
          inp.addEventListener('input', () => {
            updateWidth();
          });
          inp.addEventListener('change', () => {
            this.saveUndoSnapshot();
            let parsed = parseFloat(inp.value);
            if (isNaN(parsed)) parsed = tok.default ?? 0;
            if (tok.min !== undefined) parsed = Math.max(tok.min, parsed);
            if (tok.max !== undefined) parsed = Math.min(tok.max, parsed);
            block.params[tok.name] = parsed;
            inp.value = parsed;
            updateWidth();
            this.renderWorkspace();
            this.onChange();
          });
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') inp.blur();
          });
        }
        bodyEl.appendChild(inp);
      } else if (tok.kind === 'text') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'block-text-pill';
        inp.value = block.params[tok.name] !== undefined ? block.params[tok.name] : (tok.default || '');

        inp.setAttribute('autocomplete', 'off');
        inp.setAttribute('autocorrect', 'off');
        inp.setAttribute('autocapitalize', 'off');
        inp.setAttribute('spellcheck', 'false');
        inp.setAttribute('data-lpignore', 'true');
        inp.setAttribute('aria-autocomplete', 'none');

        const updateWidth = () => {
          const valLen = String(inp.value || '').length;
          inp.style.width = `${Math.max(48, Math.min(130, valLen * 8 + 22))}px`;
        };
        updateWidth();

        if (isFlyoutPreview) {
          inp.readOnly = true;
          inp.style.pointerEvents = 'none';
        } else {
          inp.addEventListener('mousedown', e => e.stopPropagation());
          inp.addEventListener('focus', () => inp.select());
          inp.addEventListener('input', () => updateWidth());
          inp.addEventListener('change', () => {
            this.saveUndoSnapshot();
            block.params[tok.name] = inp.value;
            this.renderWorkspace();
            this.onChange();
          });
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') inp.blur();
          });
        }
        bodyEl.appendChild(inp);
      } else if (tok.kind === 'boolean_slot') {
        const slotEl = document.createElement('div');
        slotEl.className = 'block-boolean-slot';
        slotEl.dataset.slotName = tok.name;
        slotEl.dataset.parentBlockId = block.id;

        const childId = block.params[tok.name];
        const childBlock = childId && this.blocks.has(childId) ? this.blocks.get(childId) : null;

        if (childBlock) {
          slotEl.classList.add('filled');
          const childDom = this.renderBlockElement(childBlock, isFlyoutPreview);
          slotEl.appendChild(childDom);
        } else {
          slotEl.classList.add('empty');
          slotEl.title = 'Espaço para encaixar bloco losango (sensor ou operador)';
          slotEl.innerHTML = `
            <svg class="boolean-slot-empty-svg" width="48" height="28" viewBox="0 0 48 28">
              <polygon points="12,1 36,1 47,14 36,27 12,27 1,14"/>
            </svg>
          `;
        }
        bodyEl.appendChild(slotEl);
      } else if (tok.kind === 'select') {
        // Exibe menu suspenso APENAS onde é necessário (múltiplas opções).
        // Se houver apenas 1 opção (como portas de sensores fixas no simulador), exibe distintivo estático sem dropdown.
        if (tok.options.length <= 1) {
          const badge = document.createElement('span');
          badge.className = 'block-select-pill single-value';
          const opt = tok.options[0] || { label: String(block.params[tok.name] || tok.default || '') };
          badge.textContent = opt.label;
          bodyEl.appendChild(badge);
        } else {
          const sel = document.createElement('select');
          sel.className = 'block-select-pill';
          tok.options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (String(block.params[tok.name]) === String(opt.value)) o.selected = true;
            sel.appendChild(o);
          });
          if (isFlyoutPreview) {
            sel.disabled = true;
            sel.style.pointerEvents = 'none';
          } else {
            sel.addEventListener('mousedown', e => e.stopPropagation());
            sel.addEventListener('change', () => {
              this.saveUndoSnapshot();
              block.params[tok.name] = sel.value;
              this.renderWorkspace();
              this.onChange();
            });
          }
          bodyEl.appendChild(sel);
        }
      } else if (tok.kind === 'steering') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'block-steer-pill';
        btn.textContent = window.formatEV3Steering(block.params[tok.name]);
        if (isFlyoutPreview) {
          btn.style.pointerEvents = 'none';
        } else {
          btn.addEventListener('mousedown', e => e.stopPropagation());
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openSteeringPopover(block.id, tok.name, btn);
          });
        }
        bodyEl.appendChild(btn);
      }
    });

    if (!isFlyoutPreview) {
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.closeContextMenu();
        this.handleWorkspaceBlockMouseDown(block.id, el, e);
      });

      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectBlock(block.id, true);
        this.openContextMenuForBlock(block.id, e.clientX, e.clientY);
      });
    }

    return el;
  }

  // ==================== ARRASTAR DO MENU LATERAL (FLYOUT) PARA O WORKSPACE ====================
  /**
   * Quando o usuário clica e arrasta um bloco a partir do menu lateral (Flyout):
   * - Usa `#globalDragLayer` para flutuar por cima de toda a tela sem ser cortado pelo overflow da paleta.
   * - Mantém o ponto exato onde o mouse pegou o bloco (`grabOffsetX`, `grabOffsetY`).
   * - Mostra a silhueta de encaixe (`.snap-ghost-node`) no workspace em tempo real.
   */
  handleFlyoutMouseDown(type, flyoutItemEl, mouseEvent) {
    this.closeContextMenu();
    const itemRect = flyoutItemEl.getBoundingClientRect();
    const grabOffsetX = mouseEvent.clientX - itemRect.left;
    const grabOffsetY = mouseEvent.clientY - itemRect.top;
    const startClientX = mouseEvent.clientX;
    const startClientY = mouseEvent.clientY;

    const tempBlock = this.createDefaultBlockState(type, 0, 0);
    let floatingEl = null;
    let isDragging = false;
    let snapCandidate = null;

    const createFloatingClone = () => {
      floatingEl = this.renderBlockElement(tempBlock, true);
      floatingEl.classList.add('dragging');
      floatingEl.style.position = 'fixed';
      floatingEl.style.transform = `scale(${this.zoom})`;
      floatingEl.style.transformOrigin = '0 0';
      floatingEl.style.pointerEvents = 'none';
      this.globalDragLayer.innerHTML = '';
      this.globalDragLayer.appendChild(floatingEl);
    };

    const updateFloatingPosition = (clientX, clientY) => {
      if (!floatingEl) return;
      const fx = clientX - grabOffsetX * this.zoom;
      const fy = clientY - grabOffsetY * this.zoom;
      floatingEl.style.left = `${fx}px`;
      floatingEl.style.top = `${fy}px`;

      // Converter coordenada da tela para coordenada interna do workspaceCanvas
      const wsRect = this.workspaceAreaEl.getBoundingClientRect();
      if (clientX >= wsRect.left && clientX <= wsRect.right && clientY >= wsRect.top && clientY <= wsRect.bottom) {
        tempBlock.x = (clientX - wsRect.left - this.panX) / this.zoom - grabOffsetX;
        tempBlock.y = (clientY - wsRect.top - this.panY) / this.zoom - grabOffsetY;
        snapCandidate = this.findNearestSnapTarget(tempBlock, []);
        this.renderSnapGhost(tempBlock, snapCandidate);
      } else {
        snapCandidate = null;
        this.clearSnapGhost();
      }
    };

    const onMouseMove = (ev) => {
      const dist = Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY);
      if (!isDragging && dist > 3) {
        isDragging = true;
        createFloatingClone();
      }
      if (isDragging) {
        updateFloatingPosition(ev.clientX, ev.clientY);
      }
    };

    const onMouseUp = (ev) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.globalDragLayer.innerHTML = '';
      this.clearSnapGhost();

      const wsRect = this.workspaceAreaEl.getBoundingClientRect();

      if (isDragging) {
        // Soltou dentro da área de programação
        if (ev.clientX >= wsRect.left && ev.clientX <= wsRect.right && ev.clientY >= wsRect.top && ev.clientY <= wsRect.bottom) {
          this.saveUndoSnapshot();
          tempBlock.x = Math.max(12, (ev.clientX - wsRect.left - this.panX) / this.zoom - grabOffsetX);
          tempBlock.y = Math.max(12, (ev.clientY - wsRect.top - this.panY) / this.zoom - grabOffsetY);
          this.blocks.set(tempBlock.id, tempBlock);

          if (snapCandidate) {
            this.applySnap(tempBlock, snapCandidate);
          }

          this.renderWorkspace();
          this.selectBlock(tempBlock.id, true);
          this.onChange();
        }
      } else {
        // Clique rápido num item do menu: insere na área de programação de forma prática
        this.saveUndoSnapshot();
        const offsetCount = (this.blocks.size % 6) * 24;
        tempBlock.x = Math.max(30, (120 - this.panX) / this.zoom + offsetCount);
        tempBlock.y = Math.max(40, (120 - this.panY) / this.zoom + offsetCount);
        this.blocks.set(tempBlock.id, tempBlock);
        this.renderWorkspace();
        this.selectBlock(tempBlock.id, true);
        this.onChange();
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // ==================== CLIQUE (SELEÇÃO) VS ARRASTO DE BLOCO NO WORKSPACE ====================
  /**
   * Diferencia um Clique (< 5px) de um Arrasto (>= 5px):
   * - Clique (< 5px): Seleciona o bloco e todo o conjunto de blocos ao qual está associado (sem desencaixar!).
   * - Arrasto (>= 5px): Move a pilha (se arrastado pelo topo) ou destaca a sub-pilha a partir do bloco clicado.
   */
  handleWorkspaceBlockMouseDown(blockId, blockDomEl, mouseEvent) {
    const block = this.blocks.get(blockId);
    if (!block) return;

    const startClientX = mouseEvent.clientX;
    const startClientY = mouseEvent.clientY;

    let hasStartedDrag = false;
    let movingIds = [];
    const initialPositions = new Map();
    let snapCandidate = null;
    let dragWrapper = null;
    const dragDoms = [];

    const beginDragOperation = () => {
      hasStartedDrag = true;
      this.saveUndoSnapshot();

      if (block.parentSlot) {
        // Se o bloco estava aninhado num slot, calcula sua posição no canvas antes de desencaixar
        const rect = blockDomEl.getBoundingClientRect();
        const wsRect = this.workspaceAreaEl.getBoundingClientRect();
        block.x = (rect.left - (wsRect.left + this.panX)) / this.zoom;
        block.y = (rect.top - (wsRect.top + this.panY)) / this.zoom;
      }

      // Desencaixa do bloco pai somente quando o usuário realmente inicia o arrasto
      this.detachBlockFromParent(block);

      // Seleciona todo o conjunto que está sendo movido
      movingIds = this.getChainIds(blockId);
      this.selectedBlockIds.clear();
      movingIds.forEach(id => this.selectedBlockIds.add(id));
      this.primarySelectedBlockId = blockId;

      this.renderWorkspace();
      this.onSelectionChange(this.getSelectionInfo());

      // Container flutuante global no z-index máximo para flutuar POR CIMA do menu e de toda a interface
      const wsRect = this.workspaceAreaEl.getBoundingClientRect();
      dragWrapper = document.createElement('div');
      dragWrapper.className = 'workspace-drag-wrapper';
      dragWrapper.style.left = `${wsRect.left + this.panX}px`;
      dragWrapper.style.top = `${wsRect.top + this.panY}px`;
      dragWrapper.style.transform = `scale(${this.zoom})`;

      if (this.globalDragLayer) {
        this.globalDragLayer.innerHTML = '';
        this.globalDragLayer.appendChild(dragWrapper);
      }

      dragDoms.length = 0;
      movingIds.forEach(id => {
        const b = this.blocks.get(id);
        // Se o bloco b for um filho aninhado dentro de um slot de um bloco sendo arrastado,
        // ele já faz parte da árvore DOM do bloco pai no dragWrapper
        if (b.parentSlot && movingIds.includes(b.parentSlot.parentId)) {
          return;
        }
        initialPositions.set(id, { x: b.x, y: b.y });
        const dom = this.canvasEl.querySelector(`[data-block-id="${id}"]`);
        if (dom) {
          dom.classList.add('dragging');
          dragWrapper.appendChild(dom);
          dragDoms.push({ b, dom });
        }
      });
    };

    const onMouseMove = (ev) => {
      const dist = Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY);
      if (!hasStartedDrag && dist >= 5) {
        beginDragOperation();
      }

      if (!hasStartedDrag) return;

      const dx = (ev.clientX - startClientX) / this.zoom;
      const dy = (ev.clientY - startClientY) / this.zoom;

      dragDoms.forEach(({ b, dom }) => {
        const init = initialPositions.get(b.id);
        b.x = init.x + dx;
        b.y = init.y + dy;
        if (dom) {
          dom.style.left = `${b.x}px`;
          dom.style.top = `${b.y}px`;
        }
      });

      // Atualiza linhas conectoras das notas adesivas em tempo real
      this.updateConnectorLinesLive();

      // Verifica se está sobre a barra lateral esquerda (paleta de blocos) para descarte
      const wsRect = this.workspaceAreaEl.getBoundingClientRect();
      const overTrash = ev.clientX < wsRect.left;
      const sidebar = this.paletteSidebarEl || (this.flyoutEl ? this.flyoutEl.closest('.palette-sidebar') : null);
      if (sidebar) {
        sidebar.classList.toggle('discard-highlight', overTrash);
      }

      if (!overTrash) {
        snapCandidate = this.findNearestSnapTarget(block, movingIds);
        this.renderSnapGhost(block, snapCandidate);
      } else {
        snapCandidate = null;
        this.clearSnapGhost();
      }
    };

    const onMouseUp = (ev) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const sidebar = this.paletteSidebarEl || (this.flyoutEl ? this.flyoutEl.closest('.palette-sidebar') : null);
      if (sidebar) {
        sidebar.classList.remove('discard-highlight');
      }
      this.clearSnapGhost();

      if (this.globalDragLayer) {
        this.globalDragLayer.innerHTML = '';
      }

      if (!hasStartedDrag) {
        // Foi um CLIQUE! Seleciona o bloco (ou todo o conjunto se conectado)
        // Se segurar Alt/Shift, seleciona apenas o bloco individual; caso contrário, seleciona todo o conjunto!
        const selectWholeStack = !ev.altKey && !ev.shiftKey;
        this.selectBlock(blockId, selectWholeStack);
        return;
      }

      // Se soltar sobre a barra de blocos (paleta lateral esquerda), exclui os blocos arrastados com pop de áudio
      const wsRect = this.workspaceAreaEl.getBoundingClientRect();
      if (ev.clientX < wsRect.left) {
        this.playAudioFeedback('trash');
        movingIds.forEach(id => this.blocks.delete(id));
        this.selectedBlockIds.clear();
        this.primarySelectedBlockId = null;
        this.renderWorkspace();
        this.onSelectionChange(this.getSelectionInfo());
        this.onChange();
        return;
      }

      if (snapCandidate) {
        this.applySnap(block, snapCandidate);
      }

      this.renderWorkspace();
      // Se encaixou em outro conjunto, seleciona todo o conjunto resultante!
      this.selectBlock(block.id, true);
      this.onChange();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // ==================== SOMBRA FANTASMA DE ENCAIXE (GHOST SNAP PREVIEW) ====================
  renderSnapGhost(draggedBlock, snapCandidate) {
    this.clearSnapGhost();
    if (!snapCandidate) return;

    const target = this.blocks.get(snapCandidate.targetId);
    if (!target) return;

    const def = window.EV3_BLOCK_DEFINITIONS[draggedBlock.type];
    const width = this.estimateBlockWidth(draggedBlock);

    if (snapCandidate.mode === 'boolean_slot') {
      const ghostEl = document.createElement('div');
      ghostEl.className = 'snap-ghost-node boolean-ghost';
      ghostEl.style.left = `${snapCandidate.slotCanvasX}px`;
      ghostEl.style.top = `${snapCandidate.slotCanvasY}px`;
      ghostEl.style.width = `${width}px`;
      ghostEl.style.height = `40px`;
      const pathD = this.buildSVGPath('boolean', width, 40);
      ghostEl.innerHTML = `
        <svg width="${width}" height="40" viewBox="0 0 ${width} 40" style="overflow:visible;">
          <path d="${pathD}"/>
        </svg>
      `;
      this.canvasEl.appendChild(ghostEl);

      if (snapCandidate.slotEl) {
        snapCandidate.slotEl.classList.add('snap-hover');
      }
      return;
    }

    const totalH = this.getBlockTotalHeight(draggedBlock);
    const pathD = this.buildSVGPath(def.shape === 'c_block' ? 'c_block' : (def.shape === 'cap' ? 'cap' : 'stack'), width, 40, {
      isCap: Boolean(def.isCap),
      elseLabel: def.elseLabel || null
    });

    let ghostX = target.x;
    let ghostY = target.y;

    if (snapCandidate.mode === 'after') {
      ghostX = target.x;
      ghostY = target.y + this.getBlockTotalHeight(target);
    } else if (snapCandidate.mode === 'before') {
      ghostX = target.x;
      ghostY = target.y - totalH;
    } else if (snapCandidate.mode === 'mouth') {
      ghostX = target.x + 18;
      ghostY = target.y + 46;
    } else if (snapCandidate.mode === 'mouth2') {
      const inner1H = this.getSubstackHeight(target.substackId);
      ghostX = target.x + 18;
      ghostY = target.y + 46 + inner1H + 32;
    }

    const ghostEl = document.createElement('div');
    ghostEl.className = 'snap-ghost-node';
    ghostEl.style.left = `${ghostX}px`;
    ghostEl.style.top = `${ghostY}px`;
    ghostEl.style.width = `${width}px`;
    ghostEl.style.height = `${totalH}px`;
    ghostEl.innerHTML = `
      <svg width="${width}" height="${totalH + 8}" viewBox="0 0 ${width} ${totalH + 8}" style="overflow:visible;">
        <path d="${pathD}"/>
      </svg>
    `;
    this.canvasEl.appendChild(ghostEl);
  }

  clearSnapGhost() {
    this.canvasEl.querySelectorAll('.snap-ghost-node').forEach(el => el.remove());
    this.canvasEl.querySelectorAll('.block-boolean-slot.snap-hover').forEach(el => el.classList.remove('snap-hover'));
  }

  /**
   * Verifica se `targetId` é o próprio `ancestorId` ou descende dele
   */
  isDescendantOf(targetId, ancestorId) {
    if (!targetId || !ancestorId) return false;
    let curr = this.blocks.get(targetId);
    const visited = new Set();
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      if (curr.id === ancestorId) return true;
      if (curr.parentSlot && this.blocks.has(curr.parentSlot.parentId)) {
        curr = this.blocks.get(curr.parentSlot.parentId);
      } else if (curr.parentCId && this.blocks.has(curr.parentCId)) {
        curr = this.blocks.get(curr.parentCId);
      } else if (curr.prevId && this.blocks.has(curr.prevId)) {
        curr = this.blocks.get(curr.prevId);
      } else {
        break;
      }
    }
    return false;
  }

  findNearestSnapTarget(draggedBlock, movingIds) {
    const draggedDef = window.EV3_BLOCK_DEFINITIONS[draggedBlock.type];
    // Blocos ovais (reporter) não encaixam como pilha vertical nem em slots booleanos
    if (draggedDef.shape === 'reporter') {
      return null;
    }

    // 1. Blocos hexagonais (boolean) encaixam em slots/ranhuras losangos de outros blocos
    if (draggedDef.shape === 'boolean') {
      let best = null;
      let bestDist = 70; // raio magnético confortável
      const wsRect = this.workspaceAreaEl.getBoundingClientRect();

      for (const target of this.blocks.values()) {
        if (movingIds.includes(target.id)) continue;
        if (target.id === draggedBlock.id) continue;
        if (this.isDescendantOf(target.id, draggedBlock.id)) continue;

        const targetDef = window.EV3_BLOCK_DEFINITIONS[target.type];
        if (!targetDef || !targetDef.tokens) continue;

        targetDef.tokens.forEach(tok => {
          if (tok.kind === 'boolean_slot') {
            const slotEl = this.canvasEl.querySelector(`[data-block-id="${target.id}"] .block-boolean-slot[data-slot-name="${tok.name}"]`);
            if (slotEl) {
              const slotRect = slotEl.getBoundingClientRect();
              const slotCanvasX = (slotRect.left - (wsRect.left + this.panX)) / this.zoom;
              const slotCanvasY = (slotRect.top - (wsRect.top + this.panY)) / this.zoom;

              const slotCenterX = slotCanvasX + slotRect.width / (2 * this.zoom);
              const slotCenterY = slotCanvasY + slotRect.height / (2 * this.zoom);
              const draggedW = this.estimateBlockWidth(draggedBlock);
              const draggedCenterX = draggedBlock.x + draggedW / 2;
              const draggedCenterY = draggedBlock.y + 20;

              const dist = Math.hypot(draggedCenterX - slotCenterX, draggedCenterY - slotCenterY);
              if (dist < bestDist) {
                bestDist = dist;
                best = {
                  targetId: target.id,
                  slotName: tok.name,
                  slotEl,
                  slotCanvasX,
                  slotCanvasY,
                  mode: 'boolean_slot'
                };
              }
            }
          }
        });
      }
      return best;
    }

    let best = null;
    let bestDist = 48; // raio magnético confortável

    for (const target of this.blocks.values()) {
      if (movingIds.includes(target.id)) continue;
      const targetDef = window.EV3_BLOCK_DEFINITIONS[target.type];
      if (targetDef.shape === 'reporter' || targetDef.shape === 'boolean') continue;

      // 1. Se o bloco arrastado NÃO for um bloco chapéu (hat), pode encaixar abaixo de `target` (se `target` não for cap) ou dentro de C-block
      if (draggedDef.shape !== 'hat') {
        if (targetDef.shape !== 'cap' && !targetDef.isCap) {
          const targetBottomX = target.x;
          const targetBottomY = target.y + this.getBlockTotalHeight(target);
          const distBottom = Math.hypot(draggedBlock.x - targetBottomX, draggedBlock.y - targetBottomY);
          if (distBottom < bestDist) {
            bestDist = distBottom;
            best = { targetId: target.id, mode: 'after' };
          }
        }

        if (targetDef.shape === 'c_block') {
          const mouthX = target.x + 18;
          const mouthY = target.y + 46;
          const distMouth = Math.hypot(draggedBlock.x - mouthX, draggedBlock.y - mouthY);
          if (distMouth < bestDist) {
            bestDist = distMouth;
            best = { targetId: target.id, mode: 'mouth' };
          }

          if (targetDef.elseLabel) {
            const inner1H = this.getSubstackHeight(target.substackId);
            const mouth2X = target.x + 18;
            const mouth2Y = target.y + 46 + inner1H + 32;
            const distMouth2 = Math.hypot(draggedBlock.x - mouth2X, draggedBlock.y - mouth2Y);
            if (distMouth2 < bestDist) {
              bestDist = distMouth2;
              best = { targetId: target.id, mode: 'mouth2' };
            }
          }
        }
      }

      // 2. Encaixar ACIMA do topo de uma pilha (se `target` não tiver bloco anterior, não for chapéu e o arrastado não for cap)
      if (!target.prevId && !target.parentCId && targetDef.shape !== 'hat' && draggedDef.shape !== 'cap' && !draggedDef.isCap) {
        const targetTopX = target.x;
        const targetTopY = target.y - this.getBlockTotalHeight(draggedBlock);
        const distTop = Math.hypot(draggedBlock.x - targetTopX, draggedBlock.y - targetTopY);
        if (distTop < bestDist) {
          bestDist = distTop;
          best = { targetId: target.id, mode: 'before' };
        }
      }
    }

    return best;
  }

  getLastBlockInChain(startBlockId) {
    let curr = this.blocks.get(startBlockId);
    while (curr && curr.nextId && this.blocks.has(curr.nextId)) {
      curr = this.blocks.get(curr.nextId);
    }
    return curr;
  }

  applySnap(draggedBlock, snapCandidate) {
    const target = this.blocks.get(snapCandidate.targetId);
    if (!target) return;

    if (snapCandidate.mode === 'boolean_slot') {
      const slotName = snapCandidate.slotName;
      // Se já houver um bloco no slot, desaloja o antigo para que fique livre ao lado
      const oldChildId = target.params[slotName];
      if (oldChildId && this.blocks.has(oldChildId)) {
        const oldChild = this.blocks.get(oldChildId);
        oldChild.parentSlot = null;
        oldChild.x = target.x + 36;
        oldChild.y = target.y + 36;
      }
      target.params[slotName] = draggedBlock.id;
      draggedBlock.parentSlot = {
        parentId: target.id,
        slotName: slotName
      };
      draggedBlock.prevId = null;
      draggedBlock.nextId = null;
      draggedBlock.parentCId = null;
      this.playAudioFeedback('snap');
      return;
    }

    const lastDragged = this.getLastBlockInChain(draggedBlock.id);
    const lastDef = window.EV3_BLOCK_DEFINITIONS[lastDragged.type];
    const canHaveNext = lastDef.shape !== 'cap' && !lastDef.isCap;

    if (snapCandidate.mode === 'after') {
      const oldNextId = target.nextId;
      target.nextId = draggedBlock.id;
      draggedBlock.prevId = target.id;
      draggedBlock.parentCId = null;

      if (canHaveNext && oldNextId && this.blocks.has(oldNextId)) {
        const oldNext = this.blocks.get(oldNextId);
        lastDragged.nextId = oldNext.id;
        oldNext.prevId = lastDragged.id;
      }
    } else if (snapCandidate.mode === 'before') {
      draggedBlock.x = target.x;
      draggedBlock.y = Math.max(12, target.y - this.getBlockTotalHeight(draggedBlock));
      draggedBlock.prevId = null;
      draggedBlock.parentCId = null;
      lastDragged.nextId = target.id;
      target.prevId = lastDragged.id;
    } else if (snapCandidate.mode === 'mouth') {
      const oldSubId = target.substackId;
      target.substackId = draggedBlock.id;
      draggedBlock.parentCId = target.id;
      draggedBlock.prevId = null;

      if (canHaveNext && oldSubId && this.blocks.has(oldSubId)) {
        const oldSub = this.blocks.get(oldSubId);
        oldSub.parentCId = null;
        lastDragged.nextId = oldSub.id;
        oldSub.prevId = lastDragged.id;
      }
    } else if (snapCandidate.mode === 'mouth2') {
      const oldSub2Id = target.substack2Id;
      target.substack2Id = draggedBlock.id;
      draggedBlock.parentCId = target.id;
      draggedBlock.prevId = null;

      if (canHaveNext && oldSub2Id && this.blocks.has(oldSub2Id)) {
        const oldSub2 = this.blocks.get(oldSub2Id);
        oldSub2.parentCId = null;
        lastDragged.nextId = oldSub2.id;
        oldSub2.prevId = lastDragged.id;
      }
    }
    this.playAudioFeedback('snap');
  }

  detachBlockFromParent(block) {
    if (block.parentSlot && this.blocks.has(block.parentSlot.parentId)) {
      const parent = this.blocks.get(block.parentSlot.parentId);
      if (parent && parent.params[block.parentSlot.slotName] === block.id) {
        parent.params[block.parentSlot.slotName] = null;
      }
      block.parentSlot = null;
    }
    if (block.prevId && this.blocks.has(block.prevId)) {
      const prev = this.blocks.get(block.prevId);
      prev.nextId = null;
      block.prevId = null;
    }
    if (block.parentCId && this.blocks.has(block.parentCId)) {
      const parentC = this.blocks.get(block.parentCId);
      if (parentC.substackId === block.id) {
        parentC.substackId = null;
      }
      if (parentC.substack2Id === block.id) {
        parentC.substack2Id = null;
      }
      block.parentCId = null;
    }
  }

  getChainIds(rootId) {
    const ids = [];
    const collect = (id) => {
      let curr = id;
      while (curr && this.blocks.has(curr)) {
        if (ids.includes(curr)) break;
        ids.push(curr);
        const b = this.blocks.get(curr);
        if (b.substackId) collect(b.substackId);
        if (b.substack2Id) collect(b.substack2Id);
        const def = window.EV3_BLOCK_DEFINITIONS[b.type];
        if (def && def.tokens) {
          def.tokens.forEach(tok => {
            if (tok.kind === 'boolean_slot' && b.params[tok.name]) {
              const childId = b.params[tok.name];
              if (this.blocks.has(childId)) {
                collect(childId);
              }
            }
          });
        }
        curr = b.nextId;
      }
    };
    collect(rootId);
    return ids;
  }

  // ==================== MENU DE CONTEXTO (BOTÃO DIREITO) ====================
  openContextMenuForBlock(blockId, clientX, clientY) {
    const blk = this.blocks.get(blockId);
    if (!blk) return;

    const stackIds = this.getEntireStackIds(blockId);
    const isPartOfMultiStack = stackIds.length > 1;

    this.contextMenuEl.innerHTML = `
      <button class="ev3-context-item" data-ctx-action="duplicate">
        <span>Duplicar conjunto</span>
        <small style="color:#888;">Ctrl+D</small>
      </button>
      <button class="ev3-context-item" data-ctx-action="comment">
        <span>Adicionar comentário</span>
      </button>
      ${isPartOfMultiStack ? `
      <button class="ev3-context-item" data-ctx-action="select-single">
        <span>Selecionar apenas este bloco</span>
        <small style="color:#888;">Alt+Clique</small>
      </button>
      <button class="ev3-context-item danger" data-ctx-action="delete-single">
        <span>Excluir apenas este bloco</span>
      </button>
      ` : ''}
      <div class="dropdown-divider"></div>
      <button class="ev3-context-item danger" data-ctx-action="delete-stack">
        <span>${isPartOfMultiStack ? `Excluir conjunto (${stackIds.length} blocos)` : 'Excluir bloco'}</span>
        <small>Delete</small>
      </button>
    `;

    this.contextMenuEl.style.left = `${Math.min(window.innerWidth - 225, clientX)}px`;
    this.contextMenuEl.style.top = `${Math.min(window.innerHeight - 180, clientY)}px`;
    this.contextMenuEl.classList.add('open');

    this.contextMenuEl.querySelectorAll('[data-ctx-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = btn.dataset.ctxAction;
        this.closeContextMenu();
        if (act === 'duplicate') {
          const root = this.getRootBlockOfStack(blockId);
          if (root) this.duplicateStackFrom(root.id);
        } else if (act === 'comment') {
          this.addStickyNote('Comentário do bloco EV3...', blk.x + 280, blk.y, blk.id);
        } else if (act === 'select-single') {
          this.selectBlock(blockId, false);
        } else if (act === 'delete-single') {
          this.deleteSingleBlock(blockId);
        } else if (act === 'delete-stack') {
          this.selectBlock(blockId, true);
          this.deleteSelectedBlocks();
        }
      });
    });
  }

  closeContextMenu() {
    if (this.contextMenuEl) {
      this.contextMenuEl.classList.remove('open');
    }
  }

  // ==================== POPOVER DE DIREÇÃO ====================
  initSteeringPopover() {
    if (!this.steeringPopoverEl) return;
    const slider = this.steeringPopoverEl.querySelector('#steeringSliderInput');
    const title = this.steeringPopoverEl.querySelector('#steeringPopoverTitle');
    const presets = this.steeringPopoverEl.querySelectorAll('[data-steer-preset]');
    if (!slider || !title) return;

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10) || 0;
      title.textContent = window.formatEV3Steering(val);
      if (this.activeSteeringBlockId && this.blocks.has(this.activeSteeringBlockId)) {
        const blk = this.blocks.get(this.activeSteeringBlockId);
        blk.params[this.activeSteeringField] = val;
        this.renderWorkspace();
      }
    });

    presets.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.steerPreset, 10) || 0;
        slider.value = val;
        title.textContent = window.formatEV3Steering(val);
        if (this.activeSteeringBlockId && this.blocks.has(this.activeSteeringBlockId)) {
          this.saveUndoSnapshot();
          const blk = this.blocks.get(this.activeSteeringBlockId);
          blk.params[this.activeSteeringField] = val;
          this.steeringPopoverEl.classList.remove('open');
          this.renderWorkspace();
          this.onChange();
        }
      });
    });

    document.addEventListener('mousedown', (e) => {
      if (this.steeringPopoverEl.classList.contains('open') && !this.steeringPopoverEl.contains(e.target)) {
        this.steeringPopoverEl.classList.remove('open');
      }
      if (this.contextMenuEl && this.contextMenuEl.classList.contains('open') && !this.contextMenuEl.contains(e.target)) {
        this.closeContextMenu();
      }
    });
  }

  openSteeringPopover(blockId, fieldName, anchorEl) {
    if (!this.steeringPopoverEl) return;
    if (this.steeringPopoverEl.classList.contains('open') && this.activeSteeringBlockId === blockId) {
      this.steeringPopoverEl.classList.remove('open');
      return;
    }
    const blk = this.blocks.get(blockId);
    if (!blk) return;
    this.activeSteeringBlockId = blockId;
    this.activeSteeringField = fieldName;

    const val = Number(blk.params[fieldName]) || 0;
    const slider = this.steeringPopoverEl.querySelector('#steeringSliderInput');
    const title = this.steeringPopoverEl.querySelector('#steeringPopoverTitle');
    slider.value = val;
    title.textContent = window.formatEV3Steering(val);

    const rect = anchorEl.getBoundingClientRect();
    this.steeringPopoverEl.style.left = `${Math.min(window.innerWidth - 230, rect.left)}px`;
    this.steeringPopoverEl.style.top = `${rect.bottom + 6}px`;
    this.steeringPopoverEl.classList.add('open');
  }

  // ==================== LAYOUT AUTOMÁTICO DE PILHAS E BLOCOS C ====================
  reflowAllStacks() {
    for (const blk of this.blocks.values()) {
      if (!blk.prevId && !blk.parentCId && !blk.parentSlot) {
        this.reflowChain(blk.id, blk.x, blk.y);
      }
    }
  }

  reflowChain(startBlockId, startX, startY) {
    let currId = startBlockId;
    let currX = startX;
    let currY = startY;
    const visited = new Set();

    while (currId && this.blocks.has(currId) && !visited.has(currId)) {
      visited.add(currId);
      const blk = this.blocks.get(currId);
      blk.x = currX;
      blk.y = currY;

      const def = window.EV3_BLOCK_DEFINITIONS[blk.type];
      if (def.shape === 'c_block') {
        if (blk.substackId) {
          this.reflowChain(blk.substackId, currX + 18, currY + 46);
        }
        if (def.elseLabel && blk.substack2Id) {
          const inner1H = this.getSubstackHeight(blk.substackId);
          this.reflowChain(blk.substack2Id, currX + 18, currY + 46 + inner1H + 32);
        }
      }

      currY += this.getBlockTotalHeight(blk);
      currId = blk.nextId;
    }
  }

  updateConnectorLinesLive() {
    const svg = this.canvasEl.querySelector('.connectors-svg-layer');
    if (!svg) return;
    svg.innerHTML = '';
    for (const note of this.notes.values()) {
      if (note.anchorBlockId && this.blocks.has(note.anchorBlockId)) {
        const blk = this.blocks.get(note.anchorBlockId);
        const w = this.estimateBlockWidth(blk);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(blk.x + w));
        line.setAttribute('y1', String(blk.y + 26));
        line.setAttribute('x2', String(note.x));
        line.setAttribute('y2', String(note.y + 12));
        line.setAttribute('stroke', '#E2D276');
        line.setAttribute('stroke-width', '1.5');
        svg.appendChild(line);
      }
    }
  }

  renderWorkspace(highlightBlockId = null) {
    this.reflowAllStacks();
    this.canvasEl.innerHTML = '';

    // Camada SVG para linhas conectoras de notas
    const connectorsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connectorsSvg.setAttribute('class', 'connectors-svg-layer');
    connectorsSvg.setAttribute('width', '2600');
    connectorsSvg.setAttribute('height', '2600');
    connectorsSvg.style.position = 'absolute';
    connectorsSvg.style.top = '0';
    connectorsSvg.style.left = '0';
    connectorsSvg.style.pointerEvents = 'none';
    this.canvasEl.appendChild(connectorsSvg);

    // Renderizar Notas Adesivas (Sticky Notes)
    for (const note of this.notes.values()) {
      const noteEl = document.createElement('div');
      noteEl.className = 'ev3-sticky-note';
      noteEl.style.left = `${note.x}px`;
      noteEl.style.top = `${note.y}px`;
      noteEl.innerHTML = `
        <div class="ev3-sticky-header">
          <span>▾</span>
          <span class="note-close-btn" style="cursor:pointer; font-weight:bold;">✕</span>
        </div>
        <div class="ev3-sticky-body" contenteditable="true">${note.text}</div>
      `;

      const header = noteEl.querySelector('.ev3-sticky-header');
      const closeBtn = noteEl.querySelector('.note-close-btn');
      const body = noteEl.querySelector('.ev3-sticky-body');

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.notes.delete(note.id);
        this.renderWorkspace();
      });

      body.addEventListener('mousedown', e => e.stopPropagation());
      body.addEventListener('blur', () => {
        note.text = body.innerText;
      });

      header.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = note.x;
        const origY = note.y;
        const onMove = (ev) => {
          note.x = origX + (ev.clientX - startX) / this.zoom;
          note.y = origY + (ev.clientY - startY) / this.zoom;
          noteEl.style.left = `${note.x}px`;
          noteEl.style.top = `${note.y}px`;
          this.updateConnectorLinesLive();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      this.canvasEl.appendChild(noteEl);
    }

    this.updateConnectorLinesLive();

    // Renderizar todos os blocos
    for (const blk of this.blocks.values()) {
      if (blk.parentSlot) continue;
      const dom = this.renderBlockElement(blk, false);
      if (highlightBlockId && blk.id === highlightBlockId) {
        dom.classList.add('running');
      }
      this.canvasEl.appendChild(dom);
    }
  }

  setRunningBlock(blockId) {
    this.canvasEl.querySelectorAll('.block-node').forEach(el => {
      if (el.dataset.blockId === blockId) {
        el.classList.add('running');
      } else {
        el.classList.remove('running');
      }
    });
  }

  // ==================== EVENTOS DO WORKSPACE (CLIQUE NO FUNDO + PAN + MARQUEE BOX SELECTION + ZOOM) ====================
  initWorkspaceEvents() {
    this.updateCanvasTransform();

    const marqueeEl = document.getElementById('selectionMarquee');

    // Clicar no fundo vazio limpa a seleção; arrastar o fundo vazio faz Pan ou Seleção em Caixa (Shift)
    this.workspaceAreaEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target !== this.workspaceAreaEl && e.target !== this.canvasEl) return;

      this.closeContextMenu();
      const startX = e.clientX;
      const startY = e.clientY;
      const origPanX = this.panX;
      const origPanY = this.panY;
      const isBoxSelect = e.shiftKey;
      let moved = false;

      const wsRect = this.workspaceAreaEl.getBoundingClientRect();

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > 5) {
          moved = true;
          if (!isBoxSelect) {
            this.workspaceAreaEl.classList.add('panning');
          }
        }

        if (moved) {
          if (isBoxSelect && marqueeEl) {
            marqueeEl.style.display = 'block';
            const left = Math.min(startX, ev.clientX) - wsRect.left;
            const top = Math.min(startY, ev.clientY) - wsRect.top;
            const width = Math.abs(dx);
            const height = Math.abs(dy);
            marqueeEl.style.left = `${left}px`;
            marqueeEl.style.top = `${top}px`;
            marqueeEl.style.width = `${width}px`;
            marqueeEl.style.height = `${height}px`;

            // Encontrar blocos contidos na caixa de seleção
            const mLeft = (left - this.panX) / this.zoom;
            const mTop = (top - this.panY) / this.zoom;
            const mRight = (left + width - this.panX) / this.zoom;
            const mBottom = (top + height - this.panY) / this.zoom;

            this.selectedBlockIds.clear();
            for (const b of this.blocks.values()) {
              const bw = this.estimateBlockWidth(b);
              const bh = this.getBlockTotalHeight(b);
              if (b.x + bw >= mLeft && b.x <= mRight && b.y + bh >= mTop && b.y <= mBottom) {
                this.selectedBlockIds.add(b.id);
              }
            }
            this.primarySelectedBlockId = this.selectedBlockIds.values().next().value || null;
            this.updateSelectionVisuals();
            this.onSelectionChange(this.getSelectionInfo());
          } else {
            this.panX = origPanX + dx;
            this.panY = origPanY + dy;
            this.updateCanvasTransform();
          }
        }
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        this.workspaceAreaEl.classList.remove('panning');
        if (marqueeEl) marqueeEl.style.display = 'none';

        if (!moved) {
          // Clique simples no fundo pontilhado: desmarca qualquer bloco/conjunto selecionado
          this.clearSelection();
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  updateCanvasTransform() {
    this.canvasEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.workspaceAreaEl.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
    const badge = document.getElementById('zoomLevelBadge');
    if (badge) {
      badge.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  zoomIn() {
    this.zoom = Math.min(1.4, +(this.zoom + 0.1).toFixed(2));
    this.updateCanvasTransform();
  }

  zoomOut() {
    this.zoom = Math.max(0.65, +(this.zoom - 0.1).toFixed(2));
    this.updateCanvasTransform();
  }

  resetZoom() {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.updateCanvasTransform();
  }

  fitAllBlocksInView() {
    if (this.blocks.size === 0) {
      this.resetZoom();
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const b of this.blocks.values()) {
      const w = this.estimateBlockWidth(b);
      const h = this.getBlockTotalHeight(b);
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + w);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y + h);
    }

    for (const n of this.notes.values()) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + 220);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + 120);
    }

    const pad = 50;
    const contentW = maxX - minX + pad * 2;
    const contentH = maxY - minY + pad * 2;

    const areaW = this.workspaceAreaEl.clientWidth || 800;
    const areaH = this.workspaceAreaEl.clientHeight || 600;

    const scaleX = areaW / contentW;
    const scaleY = areaH / contentH;
    this.zoom = Math.min(1.2, Math.max(0.65, Math.min(scaleX, scaleY)));

    this.panX = (areaW - contentW * this.zoom) / 2 - (minX - pad) * this.zoom;
    this.panY = (areaH - contentH * this.zoom) / 2 - (minY - pad) * this.zoom;

    this.updateCanvasTransform();
  }

  cleanUpBlocks() {
    if (this.blocks.size === 0) return;
    this.saveUndoSnapshot();

    const roots = [];
    for (const b of this.blocks.values()) {
      if (!b.prevId && !b.parentCId) {
        roots.push(b);
      }
    }

    if (roots.length === 0) return;

    roots.sort((a, b) => {
      const defA = window.EV3_BLOCK_DEFINITIONS[a.type];
      const defB = window.EV3_BLOCK_DEFINITIONS[b.type];
      const aIsHat = defA && defA.shape === 'hat' ? 0 : 1;
      const bIsHat = defB && defB.shape === 'hat' ? 0 : 1;
      if (aIsHat !== bIsHat) return aIsHat - bIsHat;
      return a.y - b.y;
    });

    let currentX = 40;
    let currentY = 70;
    const maxHeight = Math.max(700, (this.workspaceAreaEl.clientHeight || 600) * 1.3);

    roots.forEach(root => {
      const stackHeight = this.getStackHeight(root.id);
      if (currentY + stackHeight > maxHeight && currentY > 70) {
        currentX += 450;
        currentY = 70;
      }
      root.x = currentX;
      root.y = currentY;

      // Alinha notas conectadas
      const stackIds = new Set(this.getEntireStackIds(root.id));
      for (const note of this.notes.values()) {
        if (note.anchorBlockId && stackIds.has(note.anchorBlockId)) {
          const anchorBlk = this.blocks.get(note.anchorBlockId);
          const w = this.estimateBlockWidth(anchorBlk);
          note.x = anchorBlk.x + w + 30;
          note.y = anchorBlk.y;
        }
      }

      currentY += stackHeight + 36;
    });

    this.reflowAllStacks();
    this.renderWorkspace();
    this.onChange();
    this.playAudioFeedback('duplicate');
  }

  selectAll() {
    this.selectedBlockIds.clear();
    for (const id of this.blocks.keys()) {
      this.selectedBlockIds.add(id);
    }
    this.primarySelectedBlockId = this.blocks.keys().next().value || null;
    this.updateSelectionVisuals();
    this.onSelectionChange(this.getSelectionInfo());
  }

  addStickyNote(text, x = 440, y = 70, anchorBlockId = null) {
    const id = 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this.notes.set(id, { id, x, y, text, anchorBlockId });
    this.renderWorkspace();
  }

  serialize() {
    return JSON.stringify({
      blocks: Array.from(this.blocks.values()),
      notes: Array.from(this.notes.values())
    });
  }

  deserialize(jsonStr) {
    try {
      const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      this.blocks.clear();
      this.notes.clear();
      this.selectedBlockIds.clear();
      this.primarySelectedBlockId = null;
      (data.blocks || []).forEach(b => this.blocks.set(b.id, JSON.parse(JSON.stringify(b))));
      (data.notes || []).forEach(n => this.notes.set(n.id, JSON.parse(JSON.stringify(n))));
      this.renderWorkspace();
      this.onSelectionChange(this.getSelectionInfo());
    } catch (err) {
      console.error('Erro ao carregar projeto:', err);
    }
  }

  saveUndoSnapshot() {
    this.undoStack.push(this.serialize());
    if (this.undoStack.length > 35) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this.serialize());
    const prev = this.undoStack.pop();
    this.deserialize(prev);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(this.serialize());
    const next = this.redoStack.pop();
    this.deserialize(next);
  }

  getStartHatBlocks() {
    const hats = [];
    for (const blk of this.blocks.values()) {
      if (blk.type === 'when_program_starts') {
        hats.push(blk);
      }
    }
    return hats;
  }

  getButtonHatBlocks(buttonName, action = 'pressionado') {
    const hats = [];
    for (const blk of this.blocks.values()) {
      if (
        blk.type === 'when_brick_button' &&
        blk.params.button === buttonName &&
        blk.params.action === action
      ) {
        hats.push(blk);
      }
    }
    return hats;
  }
}

window.EV3Workspace = EV3Workspace;
