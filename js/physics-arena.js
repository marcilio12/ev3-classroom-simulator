/**
 * Motor de Simulação 2D e Cinemática Diferencial - RoboSim
 * - Escala métrica calibrada: 4 pixels = 1 cm (Roda EV3 = 5.6 cm diâmetro -> 17.6 cm por rotação)
 * - Cinemática diferencial oficial EV3 para motores B (esquerdo) e C (direito)
 * - Braço/Garra frontal motorizado na porta A (interage com cuboide)
 * - Sensor Ultrassônico na porta 4 com Raycasting em tempo real (cm)
 * - Sensor de Cor na porta 3 (detecta linhas pretas e zonas coloridas no piso)
 */

class EV3PhysicsArena {
  constructor(canvas, onTelemetryUpdate) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTelemetryUpdate = onTelemetryUpdate || (() => {});

    this.PX_PER_CM = 4.0;
    this.WHEEL_DIAMETER_CM = 5.6;
    this.WHEEL_CIRCUMFERENCE_CM = Math.PI * this.WHEEL_DIAMETER_CM; // ~17.59 cm / rotação
    this.WHEELBASE_CM = 12.2; // Distância entre rodas B e C
    this.MAX_RPM = 170; // Velocidade máxima do motor grande EV3 a 100%

    this.showUltrasonicCone = true;
    this.showTrail = true;
    this.showGrid = false;
    this.simulationSpeed = 1.0;
    this.currentScenario = 'pista_padrao';

    // Estado do Robô EV3
    this.robot = {
      x: 160,
      y: 260,
      angle: 0, // radianos (0 = apontando para a direita)
      defaultSpeedPct: 50,
      statusLight: 'green', // green | orange | red
      clawAngleDeg: 0,      // 0 = aberta, -90..90 = fechada/abaixada
      grabbedCuboid: null,
      // Motores A, B, C, D
      motors: {
        A: { speedPct: 75, currentSpeedPct: 0, degrees: 0, targetDegrees: null },
        B: { speedPct: 50, currentSpeedPct: 0, degrees: 0, tirePhase: 0 },
        C: { speedPct: 50, currentSpeedPct: 0, degrees: 0, tirePhase: 0 },
        D: { speedPct: 50, currentSpeedPct: 0, degrees: 0 }
      },
      // Sensores 1, 2, 3, 4
      sensors: {
        touch: false,
        gyroAngleDeg: 0,
        colorName: 'white',
        colorLabel: 'Branco',
        ultrasonicCm: 255.0
      }
    };

    this.trailPoints = [];
    this.obstacles = [];
    this.colorZones = [];
    this.trackLines = [];
    this.cuboid = null;
    this.cuboids = [];
    this.startPad = null;
    this.goalZone = null;
    this.goalZones = [];
    this.checkpoints = [];
    this.bonusStar = null;
    this.hadCollision = false;
    this.challengeCompleted = false;
    this.isGameOver = false;
    this.isGameOver = false;
    this.onChallengeComplete = null;
    this.onChallengeGameOver = null;

    this.dragTarget = null;
    this.lastFrameTime = performance.now();

    this.resizeCanvas();
    this.loadScenario(this.currentScenario);
    this.initMouseInteractions();

    window.addEventListener('resize', () => this.resizeCanvas());
    this.startLoop();
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const prevW = this.width;
    const prevH = this.height;
    this.width = Math.max(460, rect.width);
    this.height = Math.max(380, rect.height);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (
      prevW &&
      (Math.abs(prevW - this.width) > 20 || Math.abs(prevH - this.height) > 20) &&
      Math.abs(this.robot.motors.B.degrees) < 5 &&
      Math.abs(this.robot.motors.C.degrees) < 5
    ) {
      this.loadScenario(this.currentScenario);
    }
  }

  isChallengeScenario() {
    return typeof this.currentScenario === 'string' && this.currentScenario.startsWith('desafio_');
  }

  // ==================== CENÁRIOS DE PISTA E 20 DESAFIOS GAMIFICADOS ====================
  loadScenario(scenarioName) {
    this.trailPoints = [];
    const w = this.width || 500;
    const h = this.height || 460;

    this.obstacles = [];
    this.colorZones = [];
    this.trackLines = [];
    this.cuboid = null;
    this.cuboids = [];
    this.startPad = null;
    this.goalZone = null;
    this.goalZones = [];
    this.checkpoints = [];
    this.bonusStar = null;
    this.hadCollision = false;
    this.challengeCompleted = false;
    this.isGameOver = false;
    this.robot.grabbedCuboid = null;
    this.robot.clawAngleDeg = 0;

    // Compatibilidade caso projetos ou estados no localStorage usem IDs de versões anteriores
    const legacyMap = {
      // De 8 desafios antigos (v1)
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

      // De 16 desafios antigos (v2)
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
    const scen = legacyMap[scenarioName] || scenarioName;
    this.currentScenario = scen;

    if (scen === 'pista_padrao') {
      this.robot.x = 125;
      this.robot.y = h * 0.5;
      this.robot.angle = 0;

      this.trackLines = [
        { type: 'rounded_rect', x: 75, y: 75, w: w - 150, h: h - 150, r: 55, color: '#1A1A1A', lineWidth: 14 }
      ];

      this.colorZones = [
        { x: w * 0.5 - 24, y: 63, w: 48, h: 24, color: '#E53935', name: 'red', label: 'Vermelho' },
        { x: w * 0.5 - 24, y: h - 87, w: 48, h: 24, color: '#1E88E5', name: 'blue', label: 'Azul' },
        { x: 63, y: h * 0.5 - 24, w: 24, h: 48, color: '#43A047', name: 'green', label: 'Verde' }
      ];

      this.obstacles = [
        {
          id: 'obs_1',
          x: Math.min(w - 110, 355),
          y: h * 0.5 - 45,
          w: 36,
          h: 90,
          color: '#E65100',
          label: 'Obstáculo'
        },
        {
          id: 'obs_2',
          x: Math.min(w - 180, 250),
          y: h - 140,
          w: 75,
          h: 32,
          color: '#37474F',
          label: 'Parede'
        }
      ];

      this.cuboids = [
        { id: 'cub_1', x: 235, y: h * 0.5 - 95, size: 26, color: '#D32F2F', label: 'Cuboide' }
      ];
    } else if (scen === 'obstaculos') {
      this.robot.x = 100;
      this.robot.y = h * 0.5;
      this.robot.angle = 0;

      this.obstacles = [
        { id: 'obs_a', x: 265, y: h * 0.5 - 60, w: 38, h: 120, color: '#E65100', label: 'Parede 1' },
        { id: 'obs_b', x: 160, y: 70, w: 110, h: 34, color: '#37474F', label: 'Barreira Norte' },
        { id: 'obs_c', x: 350, y: h - 140, w: 40, h: 95, color: '#37474F', label: 'Barreira Sul' }
      ];
    } else if (scen === 'cuboide') {
      this.robot.x = 120;
      this.robot.y = h * 0.5;
      this.robot.angle = 0;

      this.cuboids = [
        { id: 'cub_main', x: 192, y: h * 0.5, size: 28, color: '#E53935', label: 'Cuboide' }
      ];

      this.colorZones = [
        { x: 174, y: h * 0.5 - 24, w: 36, h: 48, color: '#FDD835', name: 'yellow', label: 'Amarelo' }
      ];

      this.obstacles = [
        { id: 'obs_meta', x: 370, y: h * 0.5 - 45, w: 34, h: 90, color: '#0084FF', label: 'Base Alvo' }
      ];
    } else if (scen === 'livre') {
      this.robot.x = w * 0.35;
      this.robot.y = h * 0.55;
      this.robot.angle = 0;

    // ==================== NÍVEL 1: DESVIO DE OBSTÁCULOS SEM SENSORES (8 DESAFIOS) ====================
    } else if (scen === 'desafio_1_parada_barreira') {
      // Desafio 1: Parada Segura Antes da Barreira Frontal (Avanço linear sem colisão)
      this.robot.x = 80;
      this.robot.y = Math.round(h * 0.50);
      this.robot.angle = 0;

      this.startPad = { x: 40, y: Math.round(h * 0.50 - 35), w: 76, h: 70, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d1_stop', x: w - 78, y: Math.round(h * 0.50 - 58), w: 32, h: 116, color: '#E65100', label: 'Barreira Frontal' }
      ];
      this.bonusStar = { x: Math.round(w * 0.48), y: Math.round(h * 0.50), r: 14, collected: false };
      this.goalZones = [
        { x: w - 168, y: Math.round(h * 0.50 - 42), w: 80, h: 84, type: 'robot', label: 'ESTACIONAR', color: '#00C853' }
      ];
    } else if (scen === 'desafio_2_desvio_lateral') {
      // Desafio 2: Desvio Lateral em S (1 Obstáculo na faixa sul)
      this.robot.x = 80;
      this.robot.y = Math.round(h * 0.70);
      this.robot.angle = 0;

      this.startPad = { x: 40, y: Math.round(h * 0.70 - 35), w: 76, h: 70, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d2_block', x: Math.round(w * 0.44), y: Math.round(h * 0.52), w: 36, h: Math.round(h * 0.44), color: '#E65100', label: 'Barreira Faixa Sul' }
      ];
      this.bonusStar = { x: Math.round(w * 0.46), y: Math.round(h * 0.28), r: 14, collected: false };
      this.goalZones = [
        { x: w - 112, y: Math.round(h * 0.28 - 42), w: 78, h: 84, type: 'robot', label: 'CHEGADA', color: '#00C853' }
      ];
    } else if (scen === 'desafio_3_portao_duplo') {
      // Desafio 3: Passagem Estreita entre Dois Obstáculos (Portão Central)
      this.robot.x = 80;
      this.robot.y = Math.round(h * 0.50);
      this.robot.angle = 0;

      this.startPad = { x: 40, y: Math.round(h * 0.50 - 35), w: 76, h: 70, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d3_top', x: Math.round(w * 0.48), y: 20, w: 34, h: Math.round(h * 0.36), color: '#37474F', label: 'Barreira Norte' },
        { id: 'obs_d3_bot', x: Math.round(w * 0.48), y: Math.round(h * 0.64), w: 34, h: Math.round(h * 0.34), color: '#37474F', label: 'Barreira Sul' }
      ];
      this.bonusStar = { x: Math.round(w * 0.495), y: Math.round(h * 0.50), r: 14, collected: false };
      this.goalZones = [
        { x: w - 110, y: Math.round(h * 0.50 - 42), w: 78, h: 84, type: 'robot', label: 'CHEGADA', color: '#00C853' }
      ];
    } else if (scen === 'desafio_4_reta_alvo') {
      // Desafio 4: Desvio em U (Contorno de Barreira Central)
      this.robot.x = 85;
      this.robot.y = h * 0.5;
      this.robot.angle = 0;

      this.startPad = { x: 45, y: h * 0.5 - 35, w: 76, h: 70, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d4', x: Math.round(w * 0.46), y: Math.round(h * 0.5 - 55), w: 36, h: 110, color: '#E65100', label: 'Barreira Central' }
      ];
      this.bonusStar = { x: Math.round(w * 0.49), y: Math.round(h * 0.22), r: 14, collected: false };
      this.goalZones = [
        { x: w - 115, y: Math.round(h * 0.5 - 42), w: 80, h: 84, type: 'robot', label: 'CHEGADA', color: '#00C853' }
      ];
    } else if (scen === 'desafio_5_desvio_duplo_z') {
      // Desafio 5: Desvio Duplo em Z (Dois Obstáculos Alternados)
      this.robot.x = 80;
      this.robot.y = Math.round(h * 0.50);
      this.robot.angle = 0;

      this.startPad = { x: 40, y: Math.round(h * 0.50 - 35), w: 76, h: 70, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d5_1', x: Math.round(w * 0.36), y: 22, w: 34, h: Math.round(h * 0.50), color: '#E65100', label: 'Obstáculo 1 (Norte)' },
        { id: 'obs_d5_2', x: Math.round(w * 0.64), y: Math.round(h * 0.48), w: 34, h: Math.round(h * 0.48), color: '#37474F', label: 'Obstáculo 2 (Sul)' }
      ];
      this.bonusStar = { x: Math.round(w * 0.50), y: Math.round(h * 0.76), r: 14, collected: false };
      this.goalZones = [
        { x: w - 110, y: Math.round(h * 0.24 - 38), w: 78, h: 76, type: 'robot', label: 'CHEGADA', color: '#00C853' }
      ];
    } else if (scen === 'desafio_6_slalom_sem_sensor') {
      // Desafio 6: Slalom Duplo de Precisão (3 curvas)
      this.robot.x = 82;
      this.robot.y = h * 0.72;
      this.robot.angle = 0;

      this.startPad = { x: 44, y: h * 0.72 - 35, w: 74, h: 70, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d6_1', x: Math.round(w * 0.35), y: Math.round(h * 0.42), w: 34, h: Math.round(h * 0.50), color: '#E65100', label: 'Barreira Sul' },
        { id: 'obs_d6_2', x: Math.round(w * 0.63), y: 24, w: 34, h: Math.round(h * 0.52), color: '#37474F', label: 'Barreira Norte' }
      ];
      this.bonusStar = { x: Math.round(w * 0.49), y: Math.round(h * 0.24), r: 14, collected: false };
      this.goalZones = [
        { x: w - 112, y: Math.round(h * 0.72 - 42), w: 78, h: 84, type: 'robot', label: 'CHEGADA', color: '#00C853' }
      ];
    } else if (scen === 'desafio_7_serpentina_curvas') {
      // Desafio 7: Corredor Serpentina com 3 Divisórias (4 Curvas)
      this.robot.x = 76;
      this.robot.y = h * 0.80;
      this.robot.angle = -Math.PI / 2; // Apontando para cima

      this.startPad = { x: 40, y: h * 0.80 - 34, w: 72, h: 68, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d7_1', x: Math.round(w * 0.28), y: 22, w: 30, h: Math.round(h * 0.64), color: '#E65100', label: 'Divisória 1' },
        { id: 'obs_d7_2', x: Math.round(w * 0.52), y: Math.round(h * 0.34), w: 30, h: Math.round(h * 0.60), color: '#37474F', label: 'Divisória 2' },
        { id: 'obs_d7_3', x: Math.round(w * 0.75), y: 22, w: 30, h: Math.round(h * 0.64), color: '#E65100', label: 'Divisória 3' }
      ];
      this.checkpoints = [
        { x: Math.round(w * 0.36), y: Math.round(h * 0.72), w: 66, h: 62, label: 'CURVA 2', visited: false }
      ];
      this.bonusStar = { x: Math.round(w * 0.65), y: Math.round(h * 0.20), r: 14, collected: false };
      this.goalZones = [
        { x: w - 98, y: 36, w: 74, h: 74, type: 'robot', label: 'CHEGADA', color: '#00C853' }
      ];
    } else if (scen === 'desafio_8_circuito_4_cantos') {
      // Desafio 8: Volta Completa nos 4 Cantos (Circuito Fechado)
      this.robot.x = 86;
      this.robot.y = h * 0.80;
      this.robot.angle = 0;

      this.startPad = { x: 46, y: h * 0.80 - 33, w: 76, h: 66, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d8_center', x: Math.round(w * 0.30), y: Math.round(h * 0.30), w: Math.round(w * 0.42), h: Math.round(h * 0.38), color: '#37474F', label: 'Ilha Central' },
        { id: 'obs_d8_block', x: 20, y: Math.round(h * 0.52), w: Math.round(w * 0.28), h: 28, color: '#E65100', label: 'Bloqueio Direto' }
      ];
      this.checkpoints = [
        { x: w - 105, y: Math.round(h * 0.72), w: 74, h: 66, label: 'CANTO 1', visited: false },
        { x: w - 105, y: 34, w: 74, h: 66, label: 'CANTO 2', visited: false }
      ];
      this.bonusStar = { x: Math.round(w * 0.50), y: Math.round(h * 0.14), r: 14, collected: false };
      this.goalZones = [
        { x: 46, y: Math.round(h * 0.20), w: 78, h: 72, type: 'robot', label: 'CHEGADA', color: '#00C853' }
      ];

    // ==================== NÍVEL 2: DESVIO COM SENSORES (4 DESAFIOS) ====================
    } else if (scen === 'desafio_9_sonar_parede') {
      // Desafio 9: Alerta de Parede com Ultrassônico (1 muro)
      this.robot.x = 88;
      this.robot.y = h * 0.76;
      this.robot.angle = 0;

      this.startPad = { x: 48, y: h * 0.76 - 35, w: 76, h: 70, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d9_wall', x: w - 78, y: Math.round(h * 0.16), w: 36, h: Math.round(h * 0.74), color: '#E65100', label: 'Muro Sonar' },
        { id: 'obs_d9_guide', x: 40, y: Math.round(h * 0.44), w: Math.round(w * 0.54), h: 32, color: '#37474F', label: 'Divisória' }
      ];
      this.bonusStar = { x: w - 145, y: Math.round(h * 0.48), r: 14, collected: false };
      this.goalZones = [
        { x: w - 185, y: 38, w: 84, h: 74, type: 'robot', label: 'ALVO SONAR', color: '#00B0FF' }
      ];
    } else if (scen === 'desafio_10_labirinto_sonar') {
      // Desafio 10: Corredor Duplo de Sensores (2 paredes)
      this.robot.x = 82;
      this.robot.y = h * 0.78;
      this.robot.angle = 0;

      this.startPad = { x: 44, y: h * 0.78 - 34, w: 74, h: 68, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d10_1', x: Math.round(w * 0.56), y: Math.round(h * 0.38), w: 34, h: Math.round(h * 0.54), color: '#E65100', label: 'Parede 1' },
        { id: 'obs_d10_2', x: Math.round(w * 0.25), y: 20, w: Math.round(w * 0.62), h: 30, color: '#E65100', label: 'Parede Norte' },
        { id: 'obs_d10_3', x: 24, y: Math.round(h * 0.46), w: Math.round(w * 0.26), h: 30, color: '#37474F', label: 'Guia' }
      ];
      this.bonusStar = { x: Math.round(w * 0.42), y: Math.round(h * 0.24), r: 14, collected: false };
      this.goalZones = [
        { x: w - 115, y: Math.round(h * 0.18), w: 80, h: 76, type: 'robot', label: 'SAÍDA LAB', color: '#00B0FF' }
      ];
    } else if (scen === 'desafio_11_espiral_sonar') {
      // Desafio 11: Espiral Autônoma de 4 Paredes (Ultrassônico Porta 4 em loop)
      this.robot.x = 80;
      this.robot.y = h * 0.82;
      this.robot.angle = 0;

      this.startPad = { x: 42, y: h * 0.82 - 32, w: 72, h: 64, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d11_east', x: w - 58, y: 24, w: 28, h: h - 48, color: '#E65100', label: 'Muro Leste' },
        { id: 'obs_d11_north', x: 50, y: 24, w: w - 108, h: 28, color: '#E65100', label: 'Muro Norte' },
        { id: 'obs_d11_west', x: 50, y: 52, w: 28, h: Math.round(h * 0.54), color: '#E65100', label: 'Muro Oeste' },
        { id: 'obs_d11_inner', x: 165, y: Math.round(h * 0.55), w: Math.round(w * 0.48), h: 28, color: '#37474F', label: 'Espiral Interna' }
      ];
      this.bonusStar = { x: Math.round(w * 0.50), y: 92, r: 14, collected: false };
      this.goalZones = [
        { x: Math.round(w * 0.42), y: Math.round(h * 0.34), w: 82, h: 74, type: 'robot', label: 'CENTRO ESPIRAL', color: '#00B0FF' }
      ];
    } else if (scen === 'desafio_12_tunel_zigzag_sonar') {
      // Desafio 12: Túnel Zig-Zag de 4 Paredes Escalonadas
      this.robot.x = 76;
      this.robot.y = h * 0.82;
      this.robot.angle = 0;

      this.startPad = { x: 40, y: h * 0.82 - 32, w: 72, h: 64, label: 'SAÍDA' };
      this.obstacles = [
        { id: 'obs_d12_1', x: Math.round(w * 0.40), y: Math.round(h * 0.58), w: 30, h: Math.round(h * 0.36), color: '#E65100', label: 'Degrau 1' },
        { id: 'obs_d12_2', x: 24, y: Math.round(h * 0.36), w: Math.round(w * 0.38), h: 28, color: '#37474F', label: 'Teto 1' },
        { id: 'obs_d12_3', x: Math.round(w * 0.68), y: Math.round(h * 0.26), w: 30, h: Math.round(h * 0.48), color: '#E65100', label: 'Degrau 2' },
        { id: 'obs_d12_4', x: Math.round(w * 0.38), y: 20, w: Math.round(w * 0.56), h: 26, color: '#E65100', label: 'Teto Norte' }
      ];
      this.bonusStar = { x: Math.round(w * 0.53), y: Math.round(h * 0.48), r: 14, collected: false };
      this.goalZones = [
        { x: w - 108, y: Math.round(h * 0.16), w: 76, h: 72, type: 'robot', label: 'SAÍDA TÚNEL', color: '#00B0FF' }
      ];

    // ==================== NÍVEL 3: SEGUIR E DETECTAR LINHAS (4 DESAFIOS) ====================
    } else if (scen === 'desafio_13_parar_na_linha') {
      // Desafio 13: Frenagem de Precisão na Faixa Preta
      this.robot.x = 85;
      this.robot.y = h * 0.5;
      this.robot.angle = 0;

      this.startPad = { x: 45, y: h * 0.5 - 35, w: 76, h: 70, label: 'SAÍDA' };
      this.trackLines = [
        { type: 'segment', x1: w - 115, y1: 55, x2: w - 115, y2: h - 55, color: '#1A1A1A', lineWidth: 22 }
      ];
      this.colorZones = [
        { x: Math.round(w * 0.45), y: Math.round(h * 0.5 - 26), w: 32, h: 52, color: '#FDD835', name: 'yellow', label: 'Amarelo' }
      ];
      this.bonusStar = { x: Math.round(w * 0.465), y: Math.round(h * 0.5), r: 14, collected: false };
      this.goalZones = [
        { x: w - 152, y: Math.round(h * 0.5 - 45), w: 74, h: 90, type: 'robot', mustStop: true, label: 'PARAR AQUI', color: '#7C4DFF' }
      ];
    } else if (scen === 'desafio_14_circuito_linha') {
      // Desafio 14: Trilha Preta em Z com 2 Curvas e Marcadores de Cor
      this.robot.x = 85;
      this.robot.y = h * 0.76;
      this.robot.angle = 0;

      const cornerX = Math.round(w * 0.64);
      const topY = Math.round(h * 0.24);

      this.startPad = { x: 45, y: h * 0.76 - 35, w: 76, h: 70, label: 'SAÍDA' };
      this.trackLines = [
        { type: 'segment', x1: 85, y1: h * 0.76, x2: cornerX, y2: h * 0.76, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: cornerX, y1: h * 0.76, x2: cornerX, y2: topY, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: cornerX, y1: topY, x2: w - 75, y2: topY, color: '#1A1A1A', lineWidth: 18 }
      ];
      this.colorZones = [
        { x: cornerX - 22, y: Math.round(h * 0.76 - 22), w: 44, h: 44, color: '#E53935', name: 'red', label: 'Vermelho' },
        { x: cornerX - 22, y: topY - 22, w: 44, h: 44, color: '#1E88E5', name: 'blue', label: 'Azul' },
        { x: w - 108, y: topY - 28, w: 56, h: 56, color: '#43A047', name: 'green', label: 'Verde' }
      ];
      this.bonusStar = { x: cornerX, y: Math.round(h * 0.50), r: 14, collected: false };
      this.goalZones = [
        { x: w - 118, y: topY - 38, w: 78, h: 76, type: 'robot', label: 'FIM DA LINHA', color: '#7C4DFF' }
      ];
    } else if (scen === 'desafio_15_linha_serpentina') {
      // Desafio 15: Linha Preta Sinuosa com 4 Curvas (Serpentina Completa)
      this.robot.x = 78;
      this.robot.y = h * 0.78;
      this.robot.angle = 0;

      const x1 = Math.round(w * 0.36);
      const x2 = Math.round(w * 0.66);
      const yLow = Math.round(h * 0.78);
      const yHigh = Math.round(h * 0.22);

      this.startPad = { x: 42, y: yLow - 34, w: 72, h: 68, label: 'SAÍDA' };
      this.trackLines = [
        { type: 'segment', x1: 78, y1: yLow, x2: x1, y2: yLow, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: x1, y1: yLow, x2: x1, y2: yHigh, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: x1, y1: yHigh, x2: x2, y2: yHigh, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: x2, y1: yHigh, x2: x2, y2: yLow, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: x2, y1: yLow, x2: w - 75, y2: yLow, color: '#1A1A1A', lineWidth: 18 }
      ];
      this.colorZones = [
        { x: x1 - 20, y: yLow - 20, w: 40, h: 40, color: '#E53935', name: 'red', label: 'Vermelho' },
        { x: x1 - 20, y: yHigh - 20, w: 40, h: 40, color: '#1E88E5', name: 'blue', label: 'Azul' },
        { x: x2 - 20, y: yHigh - 20, w: 40, h: 40, color: '#FDD835', name: 'yellow', label: 'Amarelo' },
        { x: x2 - 20, y: yLow - 20, w: 40, h: 40, color: '#E53935', name: 'red', label: 'Vermelho' },
        { x: w - 106, y: yLow - 26, w: 52, h: 52, color: '#43A047', name: 'green', label: 'Verde' }
      ];
      this.checkpoints = [
        { x: x1 - 32, y: yHigh - 30, w: 64, h: 60, label: 'CURVA 2', visited: false }
      ];
      this.bonusStar = { x: Math.round((x1 + x2) / 2), y: yHigh, r: 14, collected: false };
      this.goalZones = [
        { x: w - 116, y: yLow - 38, w: 76, h: 76, type: 'robot', label: 'CHEGADA', color: '#7C4DFF' }
      ];
    } else if (scen === 'desafio_16_linha_autodromo') {
      // Desafio 16: Autódromo Chicane de 5 Curvas e Retorno
      this.robot.x = 80;
      this.robot.y = h * 0.80;
      this.robot.angle = 0;

      const xMid = Math.round(w * 0.50);
      const xRight = w - 76;
      const yBot = Math.round(h * 0.80);
      const yMid = Math.round(h * 0.50);
      const yTop = Math.round(h * 0.20);

      this.startPad = { x: 42, y: yBot - 33, w: 72, h: 66, label: 'SAÍDA' };
      this.trackLines = [
        { type: 'segment', x1: 80, y1: yBot, x2: xMid, y2: yBot, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: xMid, y1: yBot, x2: xMid, y2: yMid, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: xMid, y1: yMid, x2: xRight, y2: yMid, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: xRight, y1: yMid, x2: xRight, y2: yTop, color: '#1A1A1A', lineWidth: 18 },
        { type: 'segment', x1: xRight, y1: yTop, x2: 85, y2: yTop, color: '#1A1A1A', lineWidth: 18 }
      ];
      this.colorZones = [
        { x: xMid - 20, y: yBot - 20, w: 40, h: 40, color: '#E53935', name: 'red', label: 'Vermelho' },
        { x: xMid - 20, y: yMid - 20, w: 40, h: 40, color: '#FDD835', name: 'yellow', label: 'Amarelo' },
        { x: xRight - 20, y: yMid - 20, w: 40, h: 40, color: '#1E88E5', name: 'blue', label: 'Azul' },
        { x: xRight - 20, y: yTop - 20, w: 40, h: 40, color: '#E53935', name: 'red', label: 'Vermelho' },
        { x: 58, y: yTop - 26, w: 54, h: 52, color: '#43A047', name: 'green', label: 'Verde' }
      ];
      this.checkpoints = [
        { x: xRight - 34, y: yMid - 32, w: 68, h: 64, label: 'CHICANE', visited: false }
      ];
      this.bonusStar = { x: xMid, y: yTop, r: 14, collected: false };
      this.goalZones = [
        { x: 46, y: yTop - 36, w: 78, h: 72, type: 'robot', label: 'PIT-STOP', color: '#7C4DFF' }
      ];

    // ==================== NÍVEL 4: PEGAR E LEVAR CAIXAS (4 DESAFIOS — 1, 2 E 3 CAIXAS) ====================
    } else if (scen === 'desafio_17_entrega_simples') {
      // Desafio 17: Coleta e Entrega Direta (1 Caixa)
      this.robot.x = 88;
      this.robot.y = h * 0.5;
      this.robot.angle = 0;

      this.startPad = { x: 48, y: h * 0.5 - 35, w: 76, h: 70, label: 'SAÍDA' };
      this.cuboids = [
        { id: 'cub_d17_1', x: 182, y: h * 0.5, size: 28, color: '#E53935', label: 'Caixa 1' }
      ];
      this.colorZones = [
        { x: 164, y: Math.round(h * 0.5 - 22), w: 36, h: 44, color: '#FDD835', name: 'yellow', label: 'Amarelo' }
      ];
      this.bonusStar = { x: Math.round(w * 0.54), y: Math.round(h * 0.5), r: 14, collected: false };
      this.goalZones = [
        { x: w - 125, y: Math.round(h * 0.5 - 45), w: 86, h: 90, type: 'cuboid', label: 'ENTREGA 📦', color: '#FF6D00' }
      ];
    } else if (scen === 'desafio_18_logistica_obstaculo') {
      // Desafio 18: Entrega com Desvio de Obstáculo (1 Caixa + Curva)
      this.robot.x = 85;
      this.robot.y = h * 0.74;
      this.robot.angle = 0;

      this.startPad = { x: 45, y: h * 0.74 - 35, w: 76, h: 70, label: 'SAÍDA' };
      this.cuboids = [
        { id: 'cub_d18_1', x: 175, y: h * 0.74, size: 28, color: '#D32F2F', label: 'Carga VIP' }
      ];
      this.obstacles = [
        { id: 'obs_d18_1', x: Math.round(w * 0.50), y: Math.round(h * 0.38), w: 36, h: Math.round(h * 0.54), color: '#37474F', label: 'Muro Logístico' }
      ];
      this.bonusStar = { x: Math.round(w * 0.42), y: Math.round(h * 0.24), r: 14, collected: false };
      this.goalZones = [
        { x: w - 125, y: Math.round(h * 0.24 - 42), w: 88, h: 86, type: 'cuboid', label: 'DOCA NORTE 📦', color: '#FF6D00' }
      ];
    } else if (scen === 'desafio_19_duas_caixas_docas') {
      // Desafio 19: Operação Dupla — 2 Caixas para 2 Docas Diferentes (Norte e Sul)
      this.robot.x = 82;
      this.robot.y = h * 0.50;
      this.robot.angle = 0;

      this.startPad = { x: 44, y: h * 0.50 - 35, w: 74, h: 70, label: 'SAÍDA' };
      this.cuboids = [
        { id: 'cub_d19_1', x: 178, y: Math.round(h * 0.34), size: 28, color: '#E53935', label: 'Caixa 1' },
        { id: 'cub_d19_2', x: 178, y: Math.round(h * 0.68), size: 28, color: '#1E88E5', label: 'Caixa 2' }
      ];
      this.bonusStar = { x: Math.round(w * 0.52), y: Math.round(h * 0.50), r: 14, collected: false };
      this.goalZones = [
        { x: w - 122, y: Math.round(h * 0.24 - 38), w: 86, h: 78, type: 'cuboid', label: 'DOCA NORTE 📦', color: '#FF6D00' },
        { x: w - 122, y: Math.round(h * 0.76 - 38), w: 86, h: 78, type: 'cuboid', label: 'DOCA SUL 📦', color: '#0084FF' }
      ];
    } else if (scen === 'desafio_20_tres_caixas_armazem') {
      // Desafio 20: Mestre da Logística — 3 Caixas e 3 Docas com Obstáculo Central
      this.robot.x = 78;
      this.robot.y = h * 0.50;
      this.robot.angle = 0;

      this.startPad = { x: 40, y: h * 0.50 - 34, w: 72, h: 68, label: 'SAÍDA' };
      this.cuboids = [
        { id: 'cub_d20_1', x: 172, y: Math.round(h * 0.22), size: 26, color: '#E53935', label: 'Carga 1' },
        { id: 'cub_d20_2', x: 172, y: Math.round(h * 0.50), size: 26, color: '#FB8C00', label: 'Carga 2' },
        { id: 'cub_d20_3', x: 172, y: Math.round(h * 0.78), size: 26, color: '#1E88E5', label: 'Carga 3' }
      ];
      this.obstacles = [
        { id: 'obs_d20_1', x: Math.round(w * 0.50), y: Math.round(h * 0.34), w: 30, h: Math.round(h * 0.32), color: '#37474F', label: 'Pilar Central' }
      ];
      this.bonusStar = { x: Math.round(w * 0.52), y: Math.round(h * 0.16), r: 14, collected: false };
      this.goalZones = [
        { x: w - 118, y: Math.round(h * 0.20 - 34), w: 82, h: 68, type: 'cuboid', label: 'DOCA A 📦', color: '#FF6D00' },
        { x: w - 118, y: Math.round(h * 0.50 - 34), w: 82, h: 68, type: 'cuboid', label: 'DOCA B 📦', color: '#00C853' },
        { x: w - 118, y: Math.round(h * 0.80 - 34), w: 82, h: 68, type: 'cuboid', label: 'DOCA C 📦', color: '#0084FF' }
      ];
    }

    // Sincronizar referências singulares para retrocompatibilidade
    this.cuboid = this.cuboids[0] || null;
    this.goalZone = this.goalZones[0] || null;

    this.resetTelemetryCounters();
  }

  resetRobotPose() {
    this.stopAllMotors();
    this.loadScenario(this.currentScenario);
  }

  resetTelemetryCounters() {
    this.robot.motors.A.degrees = 0;
    this.robot.motors.B.degrees = 0;
    this.robot.motors.C.degrees = 0;
    this.robot.motors.D.degrees = 0;
    this.robot.sensors.gyroAngleDeg = 0;
    this.robot.statusLight = 'green';
    this.trailPoints = [{ x: this.robot.x, y: this.robot.y }];
    this.updateSensors();
  }

  addCustomObstacle() {
    const id = 'obs_' + Date.now();
    this.obstacles.push({
      id,
      x: Math.min(this.width - 90, this.robot.x + 130),
      y: Math.max(50, Math.min(this.height - 110, this.robot.y - 35)),
      w: 38,
      h: 76,
      color: '#E65100',
      label: 'Bloco'
    });
    this.updateSensors();
  }

  // ==================== CONTROLE DOS MOTORES E CINEMÁTICA ====================
  /**
   * Calcula as velocidades individuais das rodas B (esquerda) e C (direita)
   * a partir do parâmetro de direção `steering` (-100 a 100) e velocidade `speedPct` (-100 a 100).
   */
  computeDifferentialSpeeds(steering, speedPct) {
    const s = Math.max(-100, Math.min(100, Number(steering) || 0));
    const v = Math.max(-100, Math.min(100, Number(speedPct) || 0));
    let leftPct = v;
    let rightPct = v;

    if (s > 0) {
      // Virar à direita: roda direita (C) reduz ou inverte
      rightPct = v * ((50 - s) / 50);
    } else if (s < 0) {
      // Virar à esquerda: roda esquerda (B) reduz ou inverte
      leftPct = v * ((50 - Math.abs(s)) / 50);
    }
    return { leftPct, rightPct };
  }

  setDriveSpeed(leftPct, rightPct) {
    this.robot.motors.B.currentSpeedPct = Math.max(-100, Math.min(100, leftPct));
    this.robot.motors.C.currentSpeedPct = Math.max(-100, Math.min(100, rightPct));
  }

  stopDriveMotors() {
    this.robot.motors.B.currentSpeedPct = 0;
    this.robot.motors.C.currentSpeedPct = 0;
  }

  stopAllMotors() {
    this.robot.motors.A.currentSpeedPct = 0;
    this.robot.motors.B.currentSpeedPct = 0;
    this.robot.motors.C.currentSpeedPct = 0;
    this.robot.motors.D.currentSpeedPct = 0;
  }

  setSingleMotorSpeed(port, speedPct) {
    if (!this.robot.motors[port]) return;
    this.robot.motors[port].currentSpeedPct = Math.max(-100, Math.min(100, speedPct));
  }

  // ==================== LOOP DE FÍSICA EM TEMPO REAL ====================
  startLoop() {
    const step = (now) => {
      const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;
      this.updatePhysics(dt);
      this.render();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  updatePhysics(dt) {
    dt = dt * (this.simulationSpeed || 1.0);
    const mA = this.robot.motors.A;
    const mB = this.robot.motors.B;
    const mC = this.robot.motors.C;
    const mD = this.robot.motors.D;

    // 1. Atualizar motor A (Garra/Braço frontal) e D
    [mA, mD].forEach((m, idx) => {
      if (Math.abs(m.currentSpeedPct) > 0.01) {
        const rotPerSec = (m.currentSpeedPct / 100) * (this.MAX_RPM / 60);
        const degDelta = rotPerSec * 360 * dt;
        m.degrees += degDelta;

        if (idx === 0) {
          // Porta A controla a garra frontal
          this.robot.clawAngleDeg = Math.max(-95, Math.min(95, this.robot.clawAngleDeg + degDelta * 0.65));
          this.checkClawCuboidInteraction();
        }
      }
    });

    // 2. Cinemática Diferencial para os motores B ( roda esquerda ) e C ( roda direita )
    if (Math.abs(mB.currentSpeedPct) > 0.01 || Math.abs(mC.currentSpeedPct) > 0.01) {
      const rotPerSecL = (mB.currentSpeedPct / 100) * (this.MAX_RPM / 60);
      const rotPerSecR = (mC.currentSpeedPct / 100) * (this.MAX_RPM / 60);

      const degDeltaL = rotPerSecL * 360 * dt;
      const degDeltaR = rotPerSecR * 360 * dt;

      mB.degrees += degDeltaL;
      mC.degrees += degDeltaR;

      mB.tirePhase = (mB.tirePhase + degDeltaL * 0.15) % 360;
      mC.tirePhase = (mC.tirePhase + degDeltaR * 0.15) % 360;

      // Distância linear percorrida por cada roda em cm e em px
      const distCmL = (degDeltaL / 360) * this.WHEEL_CIRCUMFERENCE_CM;
      const distCmR = (degDeltaR / 360) * this.WHEEL_CIRCUMFERENCE_CM;

      const distPxL = distCmL * this.PX_PER_CM;
      const distPxR = distCmR * this.PX_PER_CM;

      const linearPx = (distPxL + distPxR) * 0.5;
      const wheelbasePx = this.WHEELBASE_CM * this.PX_PER_CM;
      // Cinemática diferencial correta para sistema Canvas (+Y para baixo, +X para frente):
      // Quando a roda esquerda (B) avança mais rápido que a direita (C), o robô gira no sentido horário (direita, +dTheta).
      // Quando a roda direita (C) avança mais rápido que a esquerda (B), o robô gira no sentido anti-horário (esquerda, -dTheta).
      const dTheta = (distPxL - distPxR) / wheelbasePx;

      const nextX = this.robot.x + linearPx * Math.cos(this.robot.angle + dTheta * 0.5);
      const nextY = this.robot.y + linearPx * Math.sin(this.robot.angle + dTheta * 0.5);
      const nextAngle = this.robot.angle + dTheta;

      // Verificar colisão com as bordas da arena e obstáculos
      const col = this.checkRobotCollision(nextX, nextY);
      if (!col) {
        this.robot.x = nextX;
        this.robot.y = nextY;
        this.robot.sensors.touch = false;
      } else {
        this.robot.sensors.touch = true;
        this.hadCollision = true;
        if (this.isChallengeScenario() && !this.challengeCompleted && !this.isGameOver) {
          this.triggerGameOver(col);
        }
      }

      this.robot.angle = nextAngle;
      this.robot.sensors.gyroAngleDeg += (dTheta * 180) / Math.PI;

      // Se algum cuboide estiver agarrado pela garra A, move junto com a frente do robô
      if (this.robot.grabbedCuboid) {
        const frontDist = 42;
        this.robot.grabbedCuboid.x = this.robot.x + Math.cos(this.robot.angle) * frontDist;
        this.robot.grabbedCuboid.y = this.robot.y + Math.sin(this.robot.angle) * frontDist;
      }

      // Verificar coleta de estrela bônus durante movimento autônomo
      if (this.bonusStar && !this.bonusStar.collected && !this.dragTarget) {
        if (Math.hypot(this.robot.x - this.bonusStar.x, this.robot.y - this.bonusStar.y) <= 32) {
          this.bonusStar.collected = true;
        }
      }

      // Verificar passagem por Checkpoints de curvas durante movimento autônomo
      if (this.checkpoints && this.checkpoints.length > 0 && !this.dragTarget) {
        for (const cp of this.checkpoints) {
          if (
            !cp.visited &&
            this.robot.x >= cp.x &&
            this.robot.x <= cp.x + cp.w &&
            this.robot.y >= cp.y &&
            this.robot.y <= cp.y + cp.h
          ) {
            cp.visited = true;
          }
        }
      }

      // Adicionar ponto ao rastro
      const lastPt = this.trailPoints[this.trailPoints.length - 1];
      if (!lastPt || Math.hypot(this.robot.x - lastPt.x, this.robot.y - lastPt.y) > 4) {
        this.trailPoints.push({ x: this.robot.x, y: this.robot.y });
        if (this.trailPoints.length > 600) this.trailPoints.shift();
      }
    }

    // Verificar conclusão de Desafio Gamificado (somente se os motores giraram autonomamente)
    this.checkChallengeCompletion();

    this.updateSensors();
    this.onTelemetryUpdate(this.robot);
  }

  isCuboidInsideZone(box, gz) {
    return (
      box.x >= gz.x &&
      box.x <= gz.x + gz.w &&
      box.y >= gz.y &&
      box.y <= gz.y + gz.h
    );
  }

  checkChallengeCompletion() {
    if (!this.goalZones || this.goalZones.length === 0 || this.challengeCompleted || this.dragTarget || this.isGameOver) return;
    const mB = this.robot.motors.B;
    const mC = this.robot.motors.C;
    const hasDriven = Math.abs(mB.degrees) > 25 || Math.abs(mC.degrees) > 25;
    if (!hasDriven) return;

    // Se houver checkpoints de curva no mapa, todos precisam ter sido visitados
    if (this.checkpoints && this.checkpoints.some(cp => !cp.visited)) {
      return;
    }

    let allGoalsSatisfied = true;

    for (const gz of this.goalZones) {
      if (gz.type === 'robot') {
        const inside =
          this.robot.x >= gz.x &&
          this.robot.x <= gz.x + gz.w &&
          this.robot.y >= gz.y &&
          this.robot.y <= gz.y + gz.h;
        if (!inside) {
          allGoalsSatisfied = false;
          break;
        }
        if (gz.mustStop && (Math.abs(mB.currentSpeedPct) >= 0.5 || Math.abs(mC.currentSpeedPct) >= 0.5)) {
          allGoalsSatisfied = false;
          break;
        }
      } else if (gz.type === 'cuboid') {
        const hasBox = this.cuboids.some(box => this.isCuboidInsideZone(box, gz));
        if (!hasBox) {
          allGoalsSatisfied = false;
          break;
        }
      }
    }

    if (allGoalsSatisfied) {
      this.challengeCompleted = true;
      let stars = 1;
      if (!this.hadCollision) stars += 1;
      if (!this.bonusStar || this.bonusStar.collected) stars += 1;
      if (typeof this.onChallengeComplete === 'function') {
        this.onChallengeComplete({
          scenario: this.currentScenario,
          stars,
          bonusCollected: this.bonusStar ? this.bonusStar.collected : true,
          hadCollision: this.hadCollision
        });
      }
    }
  }

  checkClawCuboidInteraction() {
    if (!this.cuboids || this.cuboids.length === 0) return;
    const clawX = this.robot.x + Math.cos(this.robot.angle) * 42;
    const clawY = this.robot.y + Math.sin(this.robot.angle) * 42;

    // Sentido anti-horário agarra o cuboide mais próximo da garra; sentido horário libera
    if (this.robot.clawAngleDeg < -25) {
      if (!this.robot.grabbedCuboid) {
        let closestBox = null;
        let minDist = 36;
        for (const box of this.cuboids) {
          const dist = Math.hypot(box.x - clawX, box.y - clawY);
          if (dist < minDist) {
            minDist = dist;
            closestBox = box;
          }
        }
        if (closestBox) {
          this.robot.grabbedCuboid = closestBox;
        }
      }
    } else if (this.robot.clawAngleDeg >= -10) {
      this.robot.grabbedCuboid = null;
    }
  }

  checkRobotCollision(x, y) {
    const radius = 26;
    const margin = 16;
    if (
      x - radius < margin ||
      x + radius > this.width - margin ||
      y - radius < margin ||
      y + radius > this.height - margin
    ) {
      return { type: 'boundary', label: 'Borda da Pista' };
    }

    for (const obs of this.obstacles) {
      const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.w));
      const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.h));
      if (Math.hypot(x - closestX, y - closestY) < radius - 2) {
        return { type: 'obstacle', label: obs.label || 'Obstáculo', obstacle: obs };
      }
    }
    return null;
  }

  triggerGameOver(col) {
    this.isGameOver = true;
    this.stopAllMotors();
    if (typeof this.onChallengeGameOver === 'function') {
      this.onChallengeGameOver({
        scenario: this.currentScenario,
        collision: col
      });
    }
  }

  // ==================== LEITURA DOS SENSORES (ULTRASSÔNICO E COR) ====================
  updateSensors() {
    // 1. Sensor Ultrassônico na Porta 4 (Raycasting em cone frontal de 5 feixes)
    const sensorOffsetPx = 30;
    const sx = this.robot.x + Math.cos(this.robot.angle) * sensorOffsetPx;
    const sy = this.robot.y + Math.sin(this.robot.angle) * sensorOffsetPx;

    const maxRangeCm = 250;
    const maxRangePx = maxRangeCm * this.PX_PER_CM;
    const rayAngles = [-0.14, -0.07, 0, 0.07, 0.14];
    let minHitPx = maxRangePx;

    for (const offsetAng of rayAngles) {
      const rayAngle = this.robot.angle + offsetAng;
      const hitDistPx = this.castRay(sx, sy, rayAngle, maxRangePx);
      if (hitDistPx < minHitPx) {
        minHitPx = hitDistPx;
      }
    }

    const cm = Math.max(3.0, Math.min(255.0, minHitPx / this.PX_PER_CM));
    this.robot.sensors.ultrasonicCm = +cm.toFixed(1);

    // 2. Sensor de Cor na Porta 3 (Amostragem de piso logo abaixo da frente do robô)
    const cx = this.robot.x + Math.cos(this.robot.angle) * 22;
    const cy = this.robot.y + Math.sin(this.robot.angle) * 22;
    const detected = this.sampleFloorColor(cx, cy);
    this.robot.sensors.colorName = detected.name;
    this.robot.sensors.colorLabel = detected.label;
  }

  castRay(sx, sy, angle, maxDistPx) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const stepPx = 3;
    const margin = 16;

    for (let d = 0; d <= maxDistPx; d += stepPx) {
      const px = sx + cos * d;
      const py = sy + sin * d;

      // Bordas da arena
      if (
        px <= margin ||
        px >= this.width - margin ||
        py <= margin ||
        py >= this.height - margin
      ) {
        return d;
      }

      // Obstáculos retangulares
      for (const obs of this.obstacles) {
        if (px >= obs.x && px <= obs.x + obs.w && py >= obs.y && py <= obs.y + obs.h) {
          return d;
        }
      }

      // Cuboides (se não estiverem agarrados pela garra)
      for (const box of this.cuboids) {
        if (box !== this.robot.grabbedCuboid) {
          const half = box.size / 2;
          if (
            px >= box.x - half &&
            px <= box.x + half &&
            py >= box.y - half &&
            py <= box.y + half
          ) {
            return d;
          }
        }
      }
    }
    return maxDistPx;
  }

  sampleFloorColor(px, py) {
    // Primeiro verifica zonas coloridas
    for (const z of this.colorZones) {
      if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) {
        return { name: z.name, label: z.label };
      }
    }

    // Verifica linhas pretas (retângulo arredondado ou segmento de reta)
    for (const line of this.trackLines) {
      if (line.type === 'rounded_rect') {
        const onLeftOrRight =
          (Math.abs(px - line.x) <= line.lineWidth * 0.65 ||
            Math.abs(px - (line.x + line.w)) <= line.lineWidth * 0.65) &&
          py >= line.y &&
          py <= line.y + line.h;
        const onTopOrBottom =
          (Math.abs(py - line.y) <= line.lineWidth * 0.65 ||
            Math.abs(py - (line.y + line.h)) <= line.lineWidth * 0.65) &&
          px >= line.x &&
          px <= line.x + line.w;
        if (onLeftOrRight || onTopOrBottom) {
          return { name: 'black', label: 'Preto (Linha)' };
        }
      } else if (line.type === 'segment') {
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const lenSq = dx * dx + dy * dy;
        let t = 0;
        if (lenSq > 0) {
          t = Math.max(0, Math.min(1, ((px - line.x1) * dx + (py - line.y1) * dy) / lenSq));
        }
        const projX = line.x1 + t * dx;
        const projY = line.y1 + t * dy;
        if (Math.hypot(px - projX, py - projY) <= (line.lineWidth || 16) * 0.68) {
          return { name: 'black', label: 'Preto (Linha)' };
        }
      }
    }

    return { name: 'white', label: 'Branco' };
  }

  // ==================== INTERAÇÃO COM O MOUSE (ARRASTAR ROBÔ, CAIXAS E OBSTÁCULOS) ====================
  initMouseInteractions() {
    const getPos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      const pos = getPos(e);

      // 1. Verificar clique no robô
      if (Math.hypot(pos.x - this.robot.x, pos.y - this.robot.y) <= 34) {
        this.dragTarget = {
          type: 'robot',
          offsetX: pos.x - this.robot.x,
          offsetY: pos.y - this.robot.y
        };
        return;
      }

      // 2. Verificar clique em qualquer um dos cuboides (caixas)
      for (let i = this.cuboids.length - 1; i >= 0; i--) {
        const box = this.cuboids[i];
        if (Math.hypot(pos.x - box.x, pos.y - box.y) <= 20) {
          this.dragTarget = {
            type: 'cuboid',
            box,
            offsetX: pos.x - box.x,
            offsetY: pos.y - box.y
          };
          return;
        }
      }

      // 3. Verificar clique nos obstáculos
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        if (pos.x >= obs.x && pos.x <= obs.x + obs.w && pos.y >= obs.y && pos.y <= obs.y + obs.h) {
          if (this.isChallengeScenario()) {
            if (typeof this.onObstacleDragBlocked === 'function') {
              this.onObstacleDragBlocked(obs);
            }
            return;
          }
          this.dragTarget = {
            type: 'obstacle',
            obs,
            offsetX: pos.x - obs.x,
            offsetY: pos.y - obs.y
          };
          return;
        }
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.dragTarget) {
        this.canvas.style.cursor = 'grabbing';
        return;
      }
      const pos = getPos(e);
      if (Math.hypot(pos.x - this.robot.x, pos.y - this.robot.y) <= 34) {
        this.canvas.style.cursor = 'grab';
        return;
      }
      for (let i = this.cuboids.length - 1; i >= 0; i--) {
        const box = this.cuboids[i];
        if (Math.hypot(pos.x - box.x, pos.y - box.y) <= 20) {
          this.canvas.style.cursor = 'grab';
          return;
        }
      }
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        if (pos.x >= obs.x && pos.x <= obs.x + obs.w && pos.y >= obs.y && pos.y <= obs.y + obs.h) {
          this.canvas.style.cursor = this.isChallengeScenario() ? 'not-allowed' : 'move';
          return;
        }
      }
      this.canvas.style.cursor = 'default';
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (!this.dragTarget) {
        this.canvas.style.cursor = 'default';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.dragTarget) return;
      const pos = getPos(e);
      if (this.dragTarget.type === 'robot') {
        this.robot.x = Math.max(36, Math.min(this.width - 36, pos.x - this.dragTarget.offsetX));
        this.robot.y = Math.max(36, Math.min(this.height - 36, pos.y - this.dragTarget.offsetY));
        this.trailPoints = [{ x: this.robot.x, y: this.robot.y }];
      } else if (this.dragTarget.type === 'cuboid' && this.dragTarget.box) {
        const box = this.dragTarget.box;
        box.x = Math.max(28, Math.min(this.width - 28, pos.x - this.dragTarget.offsetX));
        box.y = Math.max(28, Math.min(this.height - 28, pos.y - this.dragTarget.offsetY));
      } else if (this.dragTarget.type === 'obstacle') {
        const obs = this.dragTarget.obs;
        obs.x = Math.max(20, Math.min(this.width - obs.w - 20, pos.x - this.dragTarget.offsetX));
        obs.y = Math.max(20, Math.min(this.height - obs.h - 20, pos.y - this.dragTarget.offsetY));
      }
      this.updateSensors();
    });

    window.addEventListener('mouseup', () => {
      this.dragTarget = null;
      if (this.canvas) this.canvas.style.cursor = 'default';
    });

    // Roda do mouse sobre a arena gira a orientação inicial do robô
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const deltaDeg = e.deltaY > 0 ? 15 : -15;
      this.robot.angle += (deltaDeg * Math.PI) / 180;
      this.updateSensors();
    }, { passive: false });
  }

  // ==================== RENDERIZAÇÃO 2D DA ARENA E DO ROBÔ EV3 ====================
  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Piso da Pista com Grade Métrica (cada quadrado = 10 cm = 40 px)
    ctx.fillStyle = '#F8F9FA';
    ctx.fillRect(0, 0, w, h);

    const gridStep = 10 * this.PX_PER_CM; // 40px = 10cm
    ctx.strokeStyle = '#E6E9EF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 16; x < w - 16; x += gridStep) {
      ctx.moveTo(x, 16);
      ctx.lineTo(x, h - 16);
    }
    for (let y = 16; y < h - 16; y += gridStep) {
      ctx.moveTo(16, y);
      ctx.lineTo(w - 16, y);
    }
    ctx.stroke();

    // 2. Bordas da Mesa de Competição
    ctx.strokeStyle = '#343A40';
    ctx.lineWidth = 6;
    ctx.strokeRect(13, 13, w - 26, h - 26);

    // Régua métrica discreta na borda superior
    ctx.fillStyle = '#868E96';
    ctx.font = '600 9px Segoe UI, sans-serif';
    for (let cm = 10; cm * this.PX_PER_CM < w - 40; cm += 20) {
      const px = 16 + cm * this.PX_PER_CM;
      ctx.fillText(`${cm}cm`, px - 10, 27);
    }

    // Grade métrica (5cm e 10cm) ativável pelo aluno
    if (this.showGrid) {
      ctx.save();
      // Linhas finas a cada 5cm (20px)
      ctx.strokeStyle = 'rgba(0, 132, 255, 0.10)';
      ctx.lineWidth = 1;
      for (let x = 16; x < w - 16; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 16);
        ctx.lineTo(x, h - 16);
        ctx.stroke();
      }
      for (let y = 16; y < h - 16; y += 20) {
        ctx.beginPath();
        ctx.moveTo(16, y);
        ctx.lineTo(w - 16, y);
        ctx.stroke();
      }

      // Linhas principais a cada 10cm (40px) com coordenadas
      ctx.strokeStyle = 'rgba(0, 132, 255, 0.24)';
      ctx.lineWidth = 1.3;
      ctx.fillStyle = '#0077C2';
      ctx.font = '700 9px Segoe UI, sans-serif';
      for (let x = 16; x < w - 16; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 16);
        ctx.lineTo(x, h - 16);
        ctx.stroke();
        const cmVal = Math.round((x - 16) / this.PX_PER_CM);
        if (cmVal > 0) ctx.fillText(`${cmVal}cm`, x + 3, h - 20);
      }
      for (let y = 16; y < h - 16; y += 40) {
        ctx.beginPath();
        ctx.moveTo(16, y);
        ctx.lineTo(w - 16, y);
        ctx.stroke();
        const cmVal = Math.round((y - 16) / this.PX_PER_CM);
        if (cmVal > 0) ctx.fillText(`${cmVal}cm`, 20, y - 4);
      }
      ctx.restore();
    }

    // 2.5 Base de Saída (Start Pad) nos Desafios
    if (this.startPad) {
      const sp = this.startPad;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 163, 255, 0.08)';
      ctx.strokeStyle = 'rgba(0, 132, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.roundRect(sp.x, sp.y, sp.w, sp.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#0077C2';
      ctx.font = '700 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sp.label || 'SAÍDA', sp.x + sp.w / 2, sp.y - 5);
      ctx.restore();
    }

    // 2.55 Checkpoints de Curva (para circuitos com múltiplas curvas)
    if (this.checkpoints && this.checkpoints.length > 0) {
      for (const cp of this.checkpoints) {
        ctx.save();
        ctx.fillStyle = cp.visited ? 'rgba(0, 200, 83, 0.14)' : 'rgba(0, 176, 255, 0.10)';
        ctx.strokeStyle = cp.visited ? '#00C853' : '#00B0FF';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.roundRect(cp.x, cp.y, cp.w, cp.h, 8);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cp.visited ? '#00A844' : '#0077C2';
        ctx.font = '800 9px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cp.visited ? `✅ ${cp.label}` : `🚩 ${cp.label}`, cp.x + cp.w / 2, cp.y - 4);
        ctx.restore();
      }
    }

    // 2.6 Zonas Alvo / Docas de Entrega (Goal Zones) nos Desafios
    if (this.goalZones && this.goalZones.length > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
      for (const gz of this.goalZones) {
        const boxDelivered = gz.type === 'cuboid' && this.cuboids.some(b => this.isCuboidInsideZone(b, gz));
        ctx.save();
        ctx.fillStyle = boxDelivered
          ? 'rgba(0, 200, 83, 0.22)'
          : gz.type === 'cuboid'
          ? `rgba(255, 109, 0, ${0.12 + pulse * 0.10})`
          : `rgba(0, 200, 83, ${0.12 + pulse * 0.10})`;
        ctx.strokeStyle = boxDelivered ? '#00C853' : (gz.color || '#00C853');
        ctx.lineWidth = 2.5;
        ctx.setLineDash(boxDelivered ? [] : [7, 4]);
        ctx.beginPath();
        ctx.roundRect(gz.x, gz.y, gz.w, gz.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = boxDelivered ? '#00A844' : (gz.color || '#00C853');
        ctx.font = '800 10px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(boxDelivered ? `✅ ${gz.label}` : `🏁 ${gz.label || 'CHEGADA'}`, gz.x + gz.w / 2, gz.y - 6);

        ctx.font = '700 10px Segoe UI, sans-serif';
        ctx.fillStyle = boxDelivered ? '#007E33' : 'rgba(33, 37, 41, 0.55)';
        ctx.fillText(
          boxDelivered ? 'ENTREGUE!' : (gz.type === 'cuboid' ? 'SOLTE A CAIXA' : 'ALVO'),
          gz.x + gz.w / 2,
          gz.y + gz.h / 2 + 4
        );
        ctx.restore();
      }
    }

    // 3. Linhas Pretas no Piso
    for (const line of this.trackLines) {
      if (line.type === 'rounded_rect') {
        ctx.save();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.lineWidth;
        ctx.beginPath();
        ctx.roundRect(line.x, line.y, line.w, line.h, line.r);
        ctx.stroke();
        ctx.restore();
      } else if (line.type === 'segment') {
        ctx.save();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.lineWidth || 16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. Zonas Coloridas
    for (const z of this.colorZones) {
      ctx.save();
      ctx.fillStyle = z.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(z.x, z.y, z.w, z.h, 4);
      ctx.fill();
      ctx.restore();
    }

    // 4.5 Estrela Bônus Colecionável (Gamificação)
    if (this.bonusStar && !this.bonusStar.collected) {
      const bs = this.bonusStar;
      const bounce = Math.sin(performance.now() * 0.006) * 2.5;
      ctx.save();
      ctx.translate(bs.x, bs.y + bounce);
      ctx.fillStyle = 'rgba(255, 179, 0, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFD600';
      ctx.strokeStyle = '#FF8F00';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outerAng = ((i * 72 - 90) * Math.PI) / 180;
        const innerAng = (((i * 72 + 36) - 90) * Math.PI) / 180;
        const ox = Math.cos(outerAng) * 12;
        const oy = Math.sin(outerAng) * 12;
        const ix = Math.cos(innerAng) * 5.5;
        const iy = Math.sin(innerAng) * 5.5;
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#E65100';
      ctx.font = '800 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+★ BÔNUS', 0, 24);
      ctx.restore();
    }

    // 5. Rastro da Trajetória do Robô
    if (this.showTrail && this.trailPoints.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 64, 129, 0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(this.trailPoints[0].x, this.trailPoints[0].y);
      for (let i = 1; i < this.trailPoints.length; i++) {
        ctx.lineTo(this.trailPoints[i].x, this.trailPoints[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 6. Feixe do Sensor Ultrassônico (Porta 4)
    if (this.showUltrasonicCone) {
      this.drawUltrasonicBeam(ctx);
    }

    // 7. Obstáculos / Paredes Posicionáveis
    for (const obs of this.obstacles) {
      ctx.save();
      ctx.fillStyle = obs.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let sx = obs.x + 10; sx < obs.x + obs.w - 6; sx += 14) {
        for (let sy = obs.y + 10; sy < obs.y + obs.h - 6; sy += 14) {
          ctx.beginPath();
          ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Indicador visual de obstáculo fixo durante desafios oficiais
      if (this.isChallengeScenario() && obs.w >= 24 && obs.h >= 24) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
        const badgeX = obs.x + obs.w - 11;
        const badgeY = obs.y + 11;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '10px "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔒', badgeX, badgeY + 1);
      }
      ctx.restore();
    }

    // 8. Cuboides (1, 2 ou 3 Caixas Interativas)
    for (const box of this.cuboids) {
      ctx.save();
      const s = box.size || 28;
      ctx.fillStyle = box.color || '#E53935';
      ctx.strokeStyle = 'rgba(0,0,0,0.38)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(box.x - s / 2, box.y - s / 2, s, s, 4);
      ctx.fill();
      ctx.stroke();

      // Pinos no topo do cuboide
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      [-5, 5].forEach(dx => {
        [-5, 5].forEach(dy => {
          ctx.beginPath();
          ctx.arc(box.x + dx, box.y + dy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      if (box.label) {
        ctx.fillStyle = '#212529';
        ctx.font = '700 9px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(box.label, box.x, box.y - s / 2 - 4);
      }
      ctx.restore();
    }

    // 9. Desenhar Base Motriz EV3 Top-Down
    this.drawEV3Robot(ctx);
  }

  drawUltrasonicBeam(ctx) {
    const sensorOffsetPx = 30;
    const sx = this.robot.x + Math.cos(this.robot.angle) * sensorOffsetPx;
    const sy = this.robot.y + Math.sin(this.robot.angle) * sensorOffsetPx;
    const distPx = this.robot.sensors.ultrasonicCm * this.PX_PER_CM;

    ctx.save();
    const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, Math.max(20, distPx));
    grad.addColorStop(0, 'rgba(0, 176, 255, 0.34)');
    grad.addColorStop(1, 'rgba(0, 176, 255, 0.04)');

    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(0, 176, 255, 0.65)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, distPx, this.robot.angle - 0.16, this.robot.angle + 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Etiqueta flutuante com a leitura em cm
    const labelX = sx + Math.cos(this.robot.angle) * Math.min(distPx * 0.65, 95);
    const labelY = sy + Math.sin(this.robot.angle) * Math.min(distPx * 0.65, 95);
    ctx.fillStyle = 'rgba(0, 110, 180, 0.9)';
    ctx.beginPath();
    ctx.roundRect(labelX - 24, labelY - 10, 48, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 10px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.robot.sensors.ultrasonicCm} cm`, labelX, labelY - 1);
    ctx.restore();
  }

  drawEV3Robot(ctx) {
    ctx.save();
    ctx.translate(this.robot.x, this.robot.y);
    ctx.rotate(this.robot.angle);

    const wheelbaseHalf = (this.WHEELBASE_CM * this.PX_PER_CM) / 2; // 24.4 px

    // Braços / Garra Frontal (Porta A - inspirada em modelo de robô.jpg)
    const clawSpread = this.robot.clawAngleDeg < -20 ? 9 : 16;
    ctx.strokeStyle = '#B0BEC5';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    // Haste superior esquerda da garra
    ctx.beginPath();
    ctx.moveTo(16, -15);
    ctx.lineTo(39, -clawSpread);
    ctx.lineTo(44, -clawSpread + 4);
    ctx.stroke();
    // Haste inferior direita da garra
    ctx.beginPath();
    ctx.moveTo(16, 15);
    ctx.lineTo(39, clawSpread);
    ctx.lineTo(44, clawSpread - 4);
    ctx.stroke();

    // Roda Esquerda (Porta B) e Roda Direita (Porta C)
    this.drawWheel(ctx, -4, -wheelbaseHalf - 4, 24, 10, this.robot.motors.B.tirePhase, 'B');
    this.drawWheel(ctx, -4, wheelbaseHalf - 6, 24, 10, this.robot.motors.C.tirePhase, 'C');

    // Moldura Technic Cinza e Detalhes Vermelhos EV3
    ctx.fillStyle = '#CFD8DC';
    ctx.strokeStyle = '#607D8B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-24, -20, 48, 40, 6);
    ctx.fill();
    ctx.stroke();

    // Detalhes vermelhos Technic
    ctx.fillStyle = '#E3000B';
    ctx.fillRect(-20, -18, 6, 36);

    // Bloco Inteligente EV3 Central (Brick Branco/Cinza)
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#455A64';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-18, -15, 36, 30, 4);
    ctx.fill();
    ctx.stroke();

    // Tela LCD do EV3
    ctx.fillStyle = '#90A4AE';
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth = 1;
    ctx.fillRect(-2, -10, 14, 20);
    ctx.strokeRect(-2, -10, 14, 20);

    // Botões do EV3 com Luz de Status (Verde / Laranja / Vermelho)
    const ledMap = {
      green: '#00E676',
      orange: '#FF9100',
      red: '#FF1744'
    };
    ctx.fillStyle = ledMap[this.robot.statusLight] || '#00E676';
    ctx.beginPath();
    ctx.arc(-10, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#546E7A';
    ctx.beginPath();
    ctx.arc(-10, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Sensor de Cor (Porta 3) com janela óptica frontal
    ctx.fillStyle = '#37474F';
    ctx.fillRect(18, -12, 7, 7);
    ctx.fillStyle = '#00E5FF';
    ctx.beginPath();
    ctx.arc(22, -8.5, 2, 0, Math.PI * 2);
    ctx.fill();

    // Sensor Ultrassônico Frontal (Porta 4 - Dois "olhos" vermelhos/pretos)
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.roundRect(22, -11, 10, 22, 4);
    ctx.fill();

    // Olho esquerdo e direito do sensor ultrassônico
    [-5.5, 5.5].forEach(ey => {
      ctx.fillStyle = '#E3000B';
      ctx.beginPath();
      ctx.arc(31, ey, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(31.5, ey, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  drawWheel(ctx, x, y, w, h, phase, label) {
    ctx.save();
    ctx.fillStyle = '#212529';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, h, 3);
    ctx.fill();
    ctx.stroke();

    // Ranhuras do pneu animadas conforme a roda gira
    ctx.strokeStyle = '#495057';
    ctx.lineWidth = 1.5;
    const offset = ((phase % 360) / 360) * 6;
    for (let tx = x - w / 2 + 3 + (offset % 6); tx < x + w / 2 - 2; tx += 6) {
      ctx.beginPath();
      ctx.moveTo(tx, y + 1);
      ctx.lineTo(tx, y + h - 1);
      ctx.stroke();
    }

    // Identificação visual clara da porta do motor (B = Esq, C = Dir)
    if (label) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 8px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + h / 2);
    }
    ctx.restore();
  }

  resetRobotToStart() {
    this.stopAllMotors();
    this.robot.motors.B.degrees = 0;
    this.robot.motors.C.degrees = 0;
    this.robot.motors.B.tirePhase = 0;
    this.robot.motors.C.tirePhase = 0;
    this.robot.sensors.gyroAngleDeg = 0;
    this.hadCollision = false;
    this.challengeCompleted = false;
    this.isGameOver = false;

    if (this.startPad) {
      this.robot.x = this.startPad.x + this.startPad.w / 2;
      this.robot.y = this.startPad.y + this.startPad.h / 2;
      this.robot.angle = this.startPad.initialAngle !== undefined ? this.startPad.initialAngle : 0;
    } else {
      this.robot.x = 160;
      this.robot.y = 260;
      this.robot.angle = 0;
    }

    if (this.checkpoints) {
      this.checkpoints.forEach(cp => (cp.visited = false));
    }
    if (this.bonusStar) {
      this.bonusStar.collected = false;
    }

    this.trailPoints = [{ x: this.robot.x, y: this.robot.y }];
    this.updateSensors();
  }

  clearTrail() {
    this.trailPoints = [{ x: this.robot.x, y: this.robot.y }];
  }
}

window.EV3PhysicsArena = EV3PhysicsArena;
