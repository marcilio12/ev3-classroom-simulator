/**
 * Catálogo Completo e Fidedigno de Blocos - RoboSim
 * Modelado diretamente a partir das 8 imagens oficiais do diretório:
 * - Bloco motores.jpeg
 * - Bloco Movimento.jpeg
 * - Bloco Monitor.jpeg
 * - Bloco som.jpeg
 * - Bloco eventos.jpeg
 * - Bloco controle.jpeg
 * - Bloco Sensores.jpeg
 * - Bloco operadores.jpeg
 */

window.EV3_CATEGORIES = [
  { id: 'motors', label: 'MOTORES', title: 'Motores', color: '#0084FF', stroke: '#006ACC' },
  { id: 'movement', label: 'MOVIMENTO', title: 'Movimento', color: '#EC407A', stroke: '#C2185B' },
  { id: 'display', label: 'MONITOR', title: 'Monitor', color: '#8E44AD', stroke: '#6C3483' },
  { id: 'sound', label: 'SOM', title: 'Som', color: '#B554D3', stroke: '#8E39A8' },
  { id: 'events', label: 'EVENTOS', title: 'Eventos', color: '#F5B800', stroke: '#CC9900' },
  { id: 'control', label: 'CONTROLE', title: 'Controle', color: '#FF9800', stroke: '#D67E00' },
  { id: 'sensors', label: 'SENSORES', title: 'Sensores', color: '#18B2E8', stroke: '#0E8BB8' },
  { id: 'operators', label: 'OPERADO...', title: 'Operadores', color: '#14A850', stroke: '#0E803C' },
  { id: 'variables', label: 'VARIÁVEIS', title: 'Variáveis', color: '#FF6D00', stroke: '#CC5700' },
  { id: 'myblocks', label: 'MEUS BLO...', title: 'Meus Blocos', color: '#FF5252', stroke: '#D32F2F' }
];

/**
 * Ícones SVG fiéis aos blocos das capturas de tela oficiais
 */
window.EV3_ICONS = {
  // Roda Technic branca sólida grande com 4 furos circulares e cruzeta central (Bloco motores.jpeg)
  motor: `<svg width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="13.5" fill="white" stroke="rgba(0,0,0,0.12)" stroke-width="1.2"/>
    <circle cx="15" cy="6.5" r="2.4" fill="#0084FF"/>
    <circle cx="15" cy="23.5" r="2.4" fill="#0084FF"/>
    <circle cx="6.5" cy="15" r="2.4" fill="#0084FF"/>
    <circle cx="23.5" cy="15" r="2.4" fill="#0084FF"/>
    <path d="M12.5 15h5M15 12.5v5" stroke="#0084FF" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`,

  // Par de rodas sincronizadas Technic grande (Bloco Movimento.jpeg)
  movement: `<svg width="36" height="30" viewBox="0 0 36 30">
    <!-- Roda traseira superior direita -->
    <circle cx="23.5" cy="11" r="9.2" fill="rgba(255,255,255,0.92)" stroke="#EC407A" stroke-width="1.3"/>
    <circle cx="23.5" cy="6" r="1.7" fill="#EC407A"/>
    <circle cx="23.5" cy="16" r="1.7" fill="#EC407A"/>
    <circle cx="18.5" cy="11" r="1.7" fill="#EC407A"/>
    <circle cx="28.5" cy="11" r="1.7" fill="#EC407A"/>
    <path d="M22 11h3M23.5 9.5v3" stroke="#EC407A" stroke-width="1.4" stroke-linecap="round"/>
    <!-- Roda dianteira inferior esquerda -->
    <circle cx="12.5" cy="17.5" r="11.5" fill="white" stroke="#EC407A" stroke-width="1.5"/>
    <circle cx="12.5" cy="10.5" r="2.2" fill="#EC407A"/>
    <circle cx="12.5" cy="24.5" r="2.2" fill="#EC407A"/>
    <circle cx="5.5" cy="17.5" r="2.2" fill="#EC407A"/>
    <circle cx="19.5" cy="17.5" r="2.2" fill="#EC407A"/>
    <path d="M10.5 17.5h4M12.5 15.5v4" stroke="#EC407A" stroke-width="2" stroke-linecap="round"/>
  </svg>`,

  // Bloco Inteligente EV3 branco grande (Bloco Monitor.jpeg, Bloco som.jpeg, Bloco eventos.jpeg)
  brick: `<svg width="26" height="30" viewBox="0 0 26 30">
    <rect x="2.5" y="1.5" width="21" height="27" rx="4" fill="white" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>
    <!-- Tela LCD do EV3 -->
    <rect x="5.5" y="4.5" width="15" height="9.5" rx="1.5" fill="#455A64"/>
    <!-- Botão central e setas de navegação -->
    <circle cx="13" cy="20.5" r="2.4" fill="#455A64"/>
    <path d="M8.5 20.5h9M13 16.5v8" stroke="#455A64" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // Play branco grande para "quando o programa iniciar" (Bloco eventos.jpeg)
  eventPlay: `<svg width="24" height="24" viewBox="0 0 24 24" fill="white">
    <path d="M7 4.5v15l13-7.5z"/>
  </svg>`,

  // Sensor de Cor / Luz (Porta 3 - Bloco Sensores.jpeg e Bloco eventos.jpeg)
  sensorColor: `<svg width="28" height="28" viewBox="0 0 28 28">
    <rect x="2" y="2" width="24" height="24" rx="5" fill="white" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
    <circle cx="14" cy="11.5" r="5" fill="none" stroke="#18B2E8" stroke-width="2.2"/>
    <circle cx="14" cy="11.5" r="2.4" fill="#18B2E8"/>
    <path d="M11 18h6M11.5 21h5" stroke="#18B2E8" stroke-width="2" stroke-linecap="round"/>
  </svg>`,

  // Sensor de Toque (Porta 1 - Bloco Sensores.jpeg e Bloco eventos.jpeg)
  sensorTouch: `<svg width="28" height="28" viewBox="0 0 28 28">
    <rect x="2" y="2" width="24" height="24" rx="5" fill="white" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
    <circle cx="14" cy="14" r="3.2" fill="#18B2E8"/>
    <path d="M14 6v4M14 18v4M6 14h4M18 14h4" stroke="#18B2E8" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  // Sensor Ultrassônico (Porta 4 - Olhos duplos grandes - Bloco Sensores.jpeg e Bloco eventos.jpeg)
  sensorUltrasonic: `<svg width="34" height="26" viewBox="0 0 34 26">
    <rect x="1" y="2" width="32" height="22" rx="11" fill="white" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
    <circle cx="10" cy="13" r="6" fill="#18B2E8"/>
    <circle cx="10" cy="13" r="2.6" fill="white"/>
    <circle cx="24" cy="13" r="6" fill="#18B2E8"/>
    <circle cx="24" cy="13" r="2.6" fill="white"/>
    <path d="M14.5 13h5" stroke="#18B2E8" stroke-width="2.2"/>
  </svg>`,

  // Sensor Giroscópio (Porta 2 - Bloco Sensores.jpeg e Bloco eventos.jpeg)
  sensorGyro: `<svg width="28" height="28" viewBox="0 0 28 28">
    <rect x="2" y="2" width="24" height="24" rx="5" fill="white" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
    <circle cx="14" cy="14" r="3.2" fill="#18B2E8"/>
    <path d="M8.5 8.5a7.5 7.5 0 0 0 0 11M19.5 8.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="#18B2E8" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`,

  // Seta branca curva de repetição no canto inferior direito dos blocos C de Loop (Bloco controle.jpeg)
  loopArrow: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 7v6a5 5 0 0 1-5 5H6"/>
    <polyline points="10 14 6 18 10 22"/>
  </svg>`
};

// Opções reutilizáveis para dropdowns
const MOTOR_PORTS = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' }
];

const MOVE_UNITS = [
  { value: 'rotations', label: 'rotações' },
  { value: 'degrees', label: 'graus' },
  { value: 'seconds', label: 'segundos' }
];

const SENSE_OPTS = [
  { value: 'clockwise', label: 'horário' },
  { value: 'counterclockwise', label: 'anti-horário' }
];

const BRAKE_OPTS = [
  { value: 'hold', label: 'manter a posição' },
  { value: 'coast', label: 'flutuar' }
];

const COLOR_OPTS = [
  { value: 'red', label: 'vermelho' },
  { value: 'black', label: 'preto' },
  { value: 'blue', label: 'azul' },
  { value: 'green', label: 'verde' },
  { value: 'yellow', label: 'amarelo' },
  { value: 'white', label: 'branco' }
];

const BRICK_BUTTONS = [
  { value: 'centro', label: 'centro' },
  { value: 'esquerda', label: 'esquerda' },
  { value: 'direita', label: 'direita' },
  { value: 'cima', label: 'cima' },
  { value: 'baixo', label: 'baixo' }
];

const BUTTON_STATES = [
  { value: 'pressionado', label: 'pressionado' },
  { value: 'liberado', label: 'liberado' }
];

const COMP_LONG_OPTS = [
  { value: 'lt', label: 'menor que (<)' },
  { value: 'gt', label: 'maior que (>)' },
  { value: 'eq', label: 'igual a (=)' }
];

const COMP_SHORT_OPTS = [
  { value: 'lt', label: '<' },
  { value: 'eq', label: '=' },
  { value: 'gt', label: '>' }
];

const DIST_UNITS = [
  { value: 'cm', label: 'cm' },
  { value: 'inch', label: 'polegadas' }
];

window.EV3_BLOCK_DEFINITIONS = {
  // ============================================================================
  // 1. MOTORES (#0084FF) — Fiel a "Bloco motores.jpeg"
  // ============================================================================
  motor_run_for: {
    type: 'motor_run_for',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'executar sentido' },
      { kind: 'select', name: 'sense', default: 'clockwise', options: SENSE_OPTS },
      { kind: 'label', text: 'por' },
      { kind: 'number', name: 'amount', default: 1, min: 0, max: 3600, step: 1 },
      { kind: 'select', name: 'unit', default: 'rotations', options: MOVE_UNITS }
    ]
  },
  motor_start: {
    type: 'motor_start',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'iniciar motor sentido' },
      { kind: 'select', name: 'sense', default: 'clockwise', options: SENSE_OPTS }
    ]
  },
  motor_stop: {
    type: 'motor_stop',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'parar motor' }
    ]
  },
  motor_set_speed: {
    type: 'motor_set_speed',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'definir velocidade a' },
      { kind: 'number', name: 'speed', default: 75, min: -100, max: 100 },
      { kind: 'label', text: '%' }
    ]
  },
  motor_set_stop_action: {
    type: 'motor_set_stop_action',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'definir motor a' },
      { kind: 'select', name: 'brake', default: 'hold', options: BRAKE_OPTS },
      { kind: 'label', text: 'na parada' }
    ]
  },
  motor_run_for_at_speed: {
    type: 'motor_run_for_at_speed',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'executar por' },
      { kind: 'number', name: 'amount', default: 1, min: 0, max: 3600, step: 1 },
      { kind: 'select', name: 'unit', default: 'rotations', options: MOVE_UNITS },
      { kind: 'label', text: 'a' },
      { kind: 'number', name: 'speed', default: 75, min: -100, max: 100 },
      { kind: 'label', text: '% velocidade' }
    ]
  },
  motor_start_at_speed: {
    type: 'motor_start_at_speed',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'iniciar motor com velocidade de' },
      { kind: 'number', name: 'speed', default: 75, min: -100, max: 100 },
      { kind: 'label', text: '%' }
    ]
  },
  motor_start_at_power: {
    type: 'motor_start_at_power',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'iniciar motor com força de' },
      { kind: 'number', name: 'power', default: 100, min: -100, max: 100 },
      { kind: 'label', text: '%' }
    ]
  },
  motor_reset_degrees: {
    type: 'motor_reset_degrees',
    category: 'motors',
    shape: 'stack',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'reiniciar graus contabilizados' }
    ]
  },
  motor_get_degrees: {
    type: 'motor_get_degrees',
    category: 'motors',
    shape: 'reporter',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'graus contabilizados' }
    ]
  },
  motor_get_speed: {
    type: 'motor_get_speed',
    category: 'motors',
    shape: 'reporter',
    icon: 'motor',
    tokens: [
      { kind: 'select', name: 'port', default: 'A', options: MOTOR_PORTS },
      { kind: 'label', text: 'velocidade' }
    ]
  },

  // ============================================================================
  // 2. MOVIMENTO (#EC407A) — Fiel a "Bloco Movimento.jpeg"
  // ============================================================================
  move_direction_for: {
    type: 'move_direction_for',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'mover para' },
      {
        kind: 'select',
        name: 'direction',
        default: 'forward',
        options: [
          { value: 'forward', label: 'a frente' },
          { value: 'backward', label: 'trás' }
        ]
      },
      { kind: 'label', text: 'por' },
      { kind: 'number', name: 'amount', default: 1, min: 0, max: 999, step: 0.5 },
      { kind: 'select', name: 'unit', default: 'rotations', options: MOVE_UNITS }
    ]
  },
  move_steer_for: {
    type: 'move_steer_for',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'mover' },
      { kind: 'steering', name: 'steering', default: 0 },
      { kind: 'label', text: 'por' },
      { kind: 'number', name: 'amount', default: 1, min: 0, max: 999, step: 0.5 },
      { kind: 'select', name: 'unit', default: 'rotations', options: MOVE_UNITS }
    ]
  },
  move_start_steer: {
    type: 'move_start_steer',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'iniciar movimento' },
      { kind: 'steering', name: 'steering', default: 0 }
    ]
  },
  move_stop: {
    type: 'move_stop',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'parar de mover' }
    ]
  },
  move_set_speed: {
    type: 'move_set_speed',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'definir velocidade de movimento para' },
      { kind: 'number', name: 'speed', default: 50, min: -100, max: 100 },
      { kind: 'label', text: '%' }
    ]
  },
  move_set_motors: {
    type: 'move_set_motors',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'definir motores de movimento para' },
      { kind: 'select', name: 'leftPort', default: 'B', options: MOTOR_PORTS },
      { kind: 'label', text: 'e' },
      { kind: 'select', name: 'rightPort', default: 'C', options: MOTOR_PORTS }
    ]
  },
  move_set_stop_action: {
    type: 'move_set_stop_action',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'definir motores de movimento para' },
      { kind: 'select', name: 'brake', default: 'hold', options: BRAKE_OPTS },
      { kind: 'label', text: 'na parada' }
    ]
  },
  move_steer_for_at_speed: {
    type: 'move_steer_for_at_speed',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'mover' },
      { kind: 'steering', name: 'steering', default: 0 },
      { kind: 'label', text: 'por' },
      { kind: 'number', name: 'amount', default: 1, min: 0, max: 999, step: 0.5 },
      { kind: 'select', name: 'unit', default: 'rotations', options: MOVE_UNITS },
      { kind: 'label', text: 'com velocidade de' },
      { kind: 'number', name: 'speed', default: 50, min: -100, max: 100 },
      { kind: 'label', text: '%' }
    ]
  },
  move_tank_for_at_speeds: {
    type: 'move_tank_for_at_speeds',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'mover por' },
      { kind: 'number', name: 'amount', default: 1, min: 0, max: 999, step: 0.5 },
      { kind: 'select', name: 'unit', default: 'rotations', options: MOVE_UNITS },
      { kind: 'label', text: 'com velocidade de' },
      { kind: 'number', name: 'leftSpeed', default: 50, min: -100, max: 100 },
      { kind: 'number', name: 'rightSpeed', default: 50, min: -100, max: 100 },
      { kind: 'label', text: '%' }
    ]
  },
  move_start_steer_at_speed: {
    type: 'move_start_steer_at_speed',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'iniciar movimento' },
      { kind: 'steering', name: 'steering', default: 0 },
      { kind: 'label', text: 'com velocidade de' },
      { kind: 'number', name: 'speed', default: 50, min: -100, max: 100 },
      { kind: 'label', text: '%' }
    ]
  },
  move_start_tank_at_speeds: {
    type: 'move_start_tank_at_speeds',
    category: 'movement',
    shape: 'stack',
    icon: 'movement',
    tokens: [
      { kind: 'label', text: 'iniciar movimento com velocidade de' },
      { kind: 'number', name: 'leftSpeed', default: 50, min: -100, max: 100 },
      { kind: 'number', name: 'rightSpeed', default: 50, min: -100, max: 100 },
      { kind: 'label', text: '%' }
    ]
  },

  // ============================================================================
  // 3. MONITOR (#8E44AD) — Fiel a "Bloco Monitor.jpeg"
  // ============================================================================
  display_image_for: {
    type: 'display_image_for',
    category: 'display',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'monitor' },
      {
        kind: 'select',
        name: 'expression',
        default: 'neutral',
        options: [
          { value: 'neutral', label: 'Eyes / Neutral' },
          { value: 'smile', label: 'Eyes / Smile' },
          { value: 'angry', label: 'Eyes / Angry' },
          { value: 'love', label: 'Eyes / Love' }
        ]
      },
      { kind: 'label', text: 'por' },
      { kind: 'number', name: 'seconds', default: 2, min: 0.1, max: 30, step: 0.5 },
      { kind: 'label', text: 'segundos' }
    ]
  },
  display_image: {
    type: 'display_image',
    category: 'display',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'monitor' },
      {
        kind: 'select',
        name: 'expression',
        default: 'neutral',
        options: [
          { value: 'neutral', label: 'Eyes / Neutral' },
          { value: 'smile', label: 'Eyes / Smile' },
          { value: 'angry', label: 'Eyes / Angry' },
          { value: 'love', label: 'Eyes / Love' }
        ]
      }
    ]
  },
  display_write_line: {
    type: 'display_write_line',
    category: 'display',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'escrever' },
      { kind: 'text', name: 'text', default: 'RoboSim' },
      { kind: 'label', text: 'na linha' },
      { kind: 'number', name: 'line', default: 1, min: 1, max: 12, step: 1 }
    ]
  },
  display_write_xy: {
    type: 'display_write_xy',
    category: 'display',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'escrever' },
      { kind: 'text', name: 'text', default: 'RoboSim' },
      { kind: 'label', text: 'em' },
      { kind: 'number', name: 'x', default: 1, min: 0, max: 177, step: 1 },
      { kind: 'label', text: ',' },
      { kind: 'number', name: 'y', default: 1, min: 0, max: 127, step: 1 }
    ]
  },
  display_clear: {
    type: 'display_clear',
    category: 'display',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'limpar monitor' }
    ]
  },
  brick_status_light: {
    type: 'brick_status_light',
    category: 'display',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'definir luz de status para' },
      {
        kind: 'select',
        name: 'lightColor',
        default: 'green',
        options: [
          { value: 'green', label: 'verde' },
          { value: 'orange', label: 'laranja' },
          { value: 'red', label: 'vermelho' }
        ]
      }
    ]
  },

  // ============================================================================
  // 4. SOM (#B554D3) — Fiel a "Bloco som.jpeg"
  // ============================================================================
  sound_play_until_done: {
    type: 'sound_play_until_done',
    category: 'sound',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'reproduzir som' },
      {
        kind: 'select',
        name: 'soundName',
        default: 'hello',
        options: [
          { value: 'hello', label: 'Communication / Hello' },
          { value: 'bravo', label: 'Communication / Bravo' },
          { value: 'laser', label: 'Mechanical / Laser' },
          { value: 'fanfare', label: 'System / Fanfare' }
        ]
      },
      { kind: 'label', text: 'até terminar' }
    ]
  },
  sound_start: {
    type: 'sound_start',
    category: 'sound',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'iniciar som' },
      {
        kind: 'select',
        name: 'soundName',
        default: 'hello',
        options: [
          { value: 'hello', label: 'Communication / Hello' },
          { value: 'bravo', label: 'Communication / Bravo' },
          { value: 'laser', label: 'Mechanical / Laser' },
          { value: 'fanfare', label: 'System / Fanfare' }
        ]
      }
    ]
  },
  sound_beep: {
    type: 'sound_beep',
    category: 'sound',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'executar o bipe' },
      { kind: 'number', name: 'note', default: 60, min: 36, max: 96, step: 1 },
      { kind: 'label', text: 'por' },
      { kind: 'number', name: 'seconds', default: 0.2, min: 0.05, max: 10, step: 0.1 },
      { kind: 'label', text: 'segundos' }
    ]
  },
  sound_start_beep: {
    type: 'sound_start_beep',
    category: 'sound',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'começar a executar o bipe' },
      { kind: 'number', name: 'note', default: 60, min: 36, max: 96, step: 1 }
    ]
  },
  sound_stop_all: {
    type: 'sound_stop_all',
    category: 'sound',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'parar todos os sons' }
    ]
  },
  sound_set_volume: {
    type: 'sound_set_volume',
    category: 'sound',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'definir o volume para' },
      { kind: 'number', name: 'volume', default: 100, min: 0, max: 100, step: 10 },
      { kind: 'label', text: '%' }
    ]
  },

  // ============================================================================
  // 5. EVENTOS (#F5B800) — Fiel a "Bloco eventos.jpeg"
  // ============================================================================
  when_program_starts: {
    type: 'when_program_starts',
    category: 'events',
    shape: 'hat',
    icon: 'eventPlay',
    tokens: [
      { kind: 'label', text: 'quando o programa iniciar' }
    ]
  },
  when_color_is: {
    type: 'when_color_is',
    category: 'events',
    shape: 'hat',
    icon: 'sensorColor',
    tokens: [
      { kind: 'select', name: 'port', default: '3', options: [{ value: '3', label: '3' }] },
      { kind: 'label', text: 'quando a cor é' },
      { kind: 'select', name: 'color', default: 'red', options: COLOR_OPTS }
    ]
  },
  when_touch_is: {
    type: 'when_touch_is',
    category: 'events',
    shape: 'hat',
    icon: 'sensorTouch',
    tokens: [
      { kind: 'select', name: 'port', default: '1', options: [{ value: '1', label: '1' }] },
      { kind: 'label', text: 'quando' },
      { kind: 'select', name: 'state', default: 'pressionado', options: BUTTON_STATES }
    ]
  },
  when_distance_is: {
    type: 'when_distance_is',
    category: 'events',
    shape: 'hat',
    icon: 'sensorUltrasonic',
    tokens: [
      { kind: 'select', name: 'port', default: '4', options: [{ value: '4', label: '4' }] },
      { kind: 'label', text: 'quando a distância é' },
      { kind: 'select', name: 'comparator', default: 'lt', options: COMP_LONG_OPTS },
      { kind: 'number', name: 'distance', default: 15, min: 3, max: 250, step: 1 },
      { kind: 'select', name: 'unit', default: 'cm', options: DIST_UNITS }
    ]
  },
  when_angle_is: {
    type: 'when_angle_is',
    category: 'events',
    shape: 'hat',
    icon: 'sensorGyro',
    tokens: [
      { kind: 'select', name: 'port', default: '2', options: [{ value: '2', label: '2' }] },
      { kind: 'label', text: 'quando o ângulo é' },
      { kind: 'select', name: 'comparator', default: 'lt', options: COMP_LONG_OPTS },
      { kind: 'number', name: 'angle', default: 45, min: -360, max: 360, step: 5 },
      { kind: 'label', text: '°' }
    ]
  },
  when_brick_button: {
    type: 'when_brick_button',
    category: 'events',
    shape: 'hat',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'quando' },
      { kind: 'select', name: 'button', default: 'centro', options: BRICK_BUTTONS },
      { kind: 'label', text: 'botão' },
      { kind: 'select', name: 'action', default: 'pressionado', options: BUTTON_STATES }
    ]
  },
  when_condition: {
    type: 'when_condition',
    category: 'events',
    shape: 'hat',
    icon: null,
    tokens: [
      { kind: 'label', text: 'quando' },
      { kind: 'boolean_slot', name: 'condition', default: null }
    ]
  },
  when_receive_message: {
    type: 'when_receive_message',
    category: 'events',
    shape: 'hat',
    icon: null,
    tokens: [
      { kind: 'label', text: 'Quando receberes a mensagem' },
      {
        kind: 'select',
        name: 'message',
        default: 'Mensagem 1',
        options: [
          { value: 'Mensagem 1', label: 'Mensagem 1' },
          { value: 'Mensagem 2', label: 'Mensagem 2' }
        ]
      }
    ]
  },
  event_broadcast: {
    type: 'event_broadcast',
    category: 'events',
    shape: 'stack',
    icon: null,
    tokens: [
      { kind: 'label', text: 'difunde a mensagem' },
      {
        kind: 'select',
        name: 'message',
        default: 'Mensagem 1',
        options: [
          { value: 'Mensagem 1', label: 'Mensagem 1' },
          { value: 'Mensagem 2', label: 'Mensagem 2' }
        ]
      }
    ]
  },
  event_broadcast_wait: {
    type: 'event_broadcast_wait',
    category: 'events',
    shape: 'stack',
    icon: null,
    tokens: [
      { kind: 'label', text: 'difunde a mensagem' },
      {
        kind: 'select',
        name: 'message',
        default: 'Mensagem 1',
        options: [
          { value: 'Mensagem 1', label: 'Mensagem 1' },
          { value: 'Mensagem 2', label: 'Mensagem 2' }
        ]
      },
      { kind: 'label', text: 'e espera' }
    ]
  },
  when_timer_gt: {
    type: 'when_timer_gt',
    category: 'events',
    shape: 'hat',
    icon: null,
    tokens: [
      { kind: 'label', text: 'quando o temporizador >' },
      { kind: 'number', name: 'seconds', default: 10, min: 0, max: 600, step: 1 }
    ]
  },

  // ============================================================================
  // 6. CONTROLE (#FF9800) — Fiel a "Bloco controle.jpeg" (Sem ícone esquerdo, com seta ↩ nos loops)
  // ============================================================================
  control_wait: {
    type: 'control_wait',
    category: 'control',
    shape: 'stack',
    icon: null,
    tokens: [
      { kind: 'label', text: 'espera' },
      { kind: 'number', name: 'seconds', default: 1, min: 0.1, max: 60, step: 0.5 },
      { kind: 'label', text: 's' }
    ]
  },
  control_wait_until: {
    type: 'control_wait_until',
    category: 'control',
    shape: 'stack',
    icon: null,
    tokens: [
      { kind: 'label', text: 'espera até que' },
      { kind: 'boolean_slot', name: 'condition', default: null }
    ]
  },
  control_repeat: {
    type: 'control_repeat',
    category: 'control',
    shape: 'c_block',
    isLoop: true,
    icon: null,
    tokens: [
      { kind: 'label', text: 'repete' },
      { kind: 'number', name: 'times', default: 10, min: 1, max: 100, step: 1 },
      { kind: 'label', text: 'vezes' }
    ]
  },
  control_forever: {
    type: 'control_forever',
    category: 'control',
    shape: 'c_block',
    isLoop: true,
    isCap: true,
    icon: null,
    tokens: [
      { kind: 'label', text: 'repete para sempre' }
    ]
  },
  control_repeat_until: {
    type: 'control_repeat_until',
    category: 'control',
    shape: 'c_block',
    isLoop: true,
    icon: null,
    tokens: [
      { kind: 'label', text: 'até que' },
      { kind: 'boolean_slot', name: 'condition', default: null },
      { kind: 'label', text: ', repete' }
    ]
  },
  control_if: {
    type: 'control_if',
    category: 'control',
    shape: 'c_block',
    isLoop: false,
    icon: null,
    tokens: [
      { kind: 'label', text: 'se' },
      { kind: 'boolean_slot', name: 'condition', default: null },
      { kind: 'label', text: ', então' }
    ]
  },
  control_if_else: {
    type: 'control_if_else',
    category: 'control',
    shape: 'c_block',
    isLoop: false,
    elseLabel: 'senão,',
    icon: null,
    tokens: [
      { kind: 'label', text: 'se' },
      { kind: 'boolean_slot', name: 'condition', default: null },
      { kind: 'label', text: ', então' }
    ]
  },
  control_stop_other: {
    type: 'control_stop_other',
    category: 'control',
    shape: 'stack',
    icon: null,
    tokens: [
      { kind: 'label', text: 'parar outras pilhas' }
    ]
  },
  control_stop: {
    type: 'control_stop',
    category: 'control',
    shape: 'cap',
    icon: null,
    tokens: [
      { kind: 'label', text: 'parar' },
      {
        kind: 'select',
        name: 'stopTarget',
        default: 'all',
        options: [
          { value: 'all', label: 'e sair do programa' },
          { value: 'this', label: 'esta pilha' }
        ]
      }
    ]
  },

  // ============================================================================
  // 7. SENSORES (#18B2E8) — Fiel a "Bloco Sensores.jpeg"
  // ============================================================================
  sensor_Wait_distance: {
    type: 'sensor_wait_distance',
    category: 'sensors',
    shape: 'stack',
    icon: 'sensorUltrasonic',
    tokens: [
      { kind: 'select', name: 'port', default: '4', options: [{ value: '4', label: '4' }] },
      { kind: 'label', text: 'espere até que a distância seja' },
      { kind: 'select', name: 'comparator', default: 'lt', options: COMP_LONG_OPTS },
      { kind: 'number', name: 'distance', default: 15, min: 3, max: 250, step: 1 },
      { kind: 'select', name: 'unit', default: 'cm', options: DIST_UNITS }
    ]
  },
  sensor_is_distance: {
    type: 'sensor_is_distance',
    category: 'sensors',
    shape: 'boolean',
    icon: 'sensorUltrasonic',
    tokens: [
      { kind: 'select', name: 'port', default: '4', options: [{ value: '4', label: '4' }] },
      { kind: 'label', text: 'a distância é' },
      { kind: 'select', name: 'comparator', default: 'lt', options: COMP_SHORT_OPTS },
      { kind: 'number', name: 'distance', default: 15, min: 3, max: 250, step: 1 },
      { kind: 'select', name: 'unit', default: 'cm', options: DIST_UNITS },
      { kind: 'label', text: '?' }
    ]
  },
  sensor_get_distance: {
    type: 'sensor_get_distance',
    category: 'sensors',
    shape: 'reporter',
    icon: 'sensorUltrasonic',
    tokens: [
      { kind: 'select', name: 'port', default: '4', options: [{ value: '4', label: '4' }] },
      { kind: 'label', text: 'distância em' },
      { kind: 'select', name: 'unit', default: 'cm', options: DIST_UNITS }
    ]
  },
  sensor_wait_color: {
    type: 'sensor_wait_color',
    category: 'sensors',
    shape: 'stack',
    icon: 'sensorColor',
    tokens: [
      { kind: 'select', name: 'port', default: '3', options: [{ value: '3', label: '3' }] },
      { kind: 'label', text: 'espere até que a cor seja' },
      { kind: 'select', name: 'color', default: 'red', options: COLOR_OPTS }
    ]
  },
  sensor_is_color: {
    type: 'sensor_is_color',
    category: 'sensors',
    shape: 'boolean',
    icon: 'sensorColor',
    tokens: [
      { kind: 'select', name: 'port', default: '3', options: [{ value: '3', label: '3' }] },
      { kind: 'label', text: 'a cor é' },
      { kind: 'select', name: 'color', default: 'red', options: COLOR_OPTS },
      { kind: 'label', text: '?' }
    ]
  },
  sensor_get_color: {
    type: 'sensor_get_color',
    category: 'sensors',
    shape: 'reporter',
    icon: 'sensorColor',
    tokens: [
      { kind: 'select', name: 'port', default: '3', options: [{ value: '3', label: '3' }] },
      { kind: 'label', text: 'cor' }
    ]
  },
  sensor_is_reflected_light: {
    type: 'sensor_is_reflected_light',
    category: 'sensors',
    shape: 'boolean',
    icon: 'sensorColor',
    tokens: [
      { kind: 'select', name: 'port', default: '3', options: [{ value: '3', label: '3' }] },
      { kind: 'label', text: 'a intensidade da luz refletida é' },
      { kind: 'select', name: 'comparator', default: 'lt', options: COMP_SHORT_OPTS },
      { kind: 'number', name: 'value', default: 50, min: 0, max: 100, step: 5 },
      { kind: 'label', text: '%?' }
    ]
  },
  sensor_get_reflected_light: {
    type: 'sensor_get_reflected_light',
    category: 'sensors',
    shape: 'reporter',
    icon: 'sensorColor',
    tokens: [
      { kind: 'select', name: 'port', default: '3', options: [{ value: '3', label: '3' }] },
      { kind: 'label', text: 'intensidade da luz refletida' }
    ]
  },
  sensor_wait_touch: {
    type: 'sensor_wait_touch',
    category: 'sensors',
    shape: 'stack',
    icon: 'sensorTouch',
    tokens: [
      { kind: 'select', name: 'port', default: '1', options: [{ value: '1', label: '1' }] },
      { kind: 'label', text: 'espere até' },
      { kind: 'select', name: 'state', default: 'pressionado', options: BUTTON_STATES }
    ]
  },
  sensor_is_touch: {
    type: 'sensor_is_touch',
    category: 'sensors',
    shape: 'boolean',
    icon: 'sensorTouch',
    tokens: [
      { kind: 'select', name: 'port', default: '1', options: [{ value: '1', label: '1' }] },
      { kind: 'label', text: 'está pressionado?' }
    ]
  },
  sensor_wait_gyro: {
    type: 'sensor_wait_gyro',
    category: 'sensors',
    shape: 'stack',
    icon: 'sensorGyro',
    tokens: [
      { kind: 'select', name: 'port', default: '2', options: [{ value: '2', label: '2' }] },
      { kind: 'label', text: 'aguarde até que o ângulo seja' },
      { kind: 'select', name: 'comparator', default: 'lt', options: COMP_LONG_OPTS },
      { kind: 'number', name: 'angle', default: 45, min: -360, max: 360, step: 5 },
      { kind: 'label', text: '°' }
    ]
  },
  sensor_is_gyro: {
    type: 'sensor_is_gyro',
    category: 'sensors',
    shape: 'boolean',
    icon: 'sensorGyro',
    tokens: [
      { kind: 'select', name: 'port', default: '2', options: [{ value: '2', label: '2' }] },
      { kind: 'label', text: 'o ângulo é' },
      { kind: 'select', name: 'comparator', default: 'lt', options: COMP_SHORT_OPTS },
      { kind: 'number', name: 'angle', default: 45, min: -360, max: 360, step: 5 },
      { kind: 'label', text: '°?' }
    ]
  },
  sensor_get_gyro_angle: {
    type: 'sensor_get_gyro_angle',
    category: 'sensors',
    shape: 'reporter',
    icon: 'sensorGyro',
    tokens: [
      { kind: 'select', name: 'port', default: '2', options: [{ value: '2', label: '2' }] },
      { kind: 'label', text: 'ângulo' }
    ]
  },
  sensor_wait_brick_button: {
    type: 'sensor_wait_brick_button',
    category: 'sensors',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'espere até que' },
      { kind: 'select', name: 'button', default: 'centro', options: BRICK_BUTTONS },
      { kind: 'label', text: 'botão esteja' },
      { kind: 'select', name: 'state', default: 'pressionado', options: BUTTON_STATES }
    ]
  },
  sensor_is_brick_button: {
    type: 'sensor_is_brick_button',
    category: 'sensors',
    shape: 'boolean',
    icon: 'brick',
    tokens: [
      { kind: 'select', name: 'button', default: 'centro', options: BRICK_BUTTONS },
      { kind: 'label', text: 'botão está pressionado?' }
    ]
  },
  sensor_reset_timer: {
    type: 'sensor_reset_timer',
    category: 'sensors',
    shape: 'stack',
    icon: 'brick',
    tokens: [
      { kind: 'label', text: 'redefinir temporizador' }
    ]
  },

  // ============================================================================
  // 8. OPERADORES (#14A850) — Fiel a "Bloco operadores.jpeg"
  // ============================================================================
  op_random: {
    type: 'op_random',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'label', text: 'um valor ao acaso entre' },
      { kind: 'number', name: 'min', default: 1, step: 1 },
      { kind: 'label', text: 'e' },
      { kind: 'number', name: 'max', default: 10, step: 1 }
    ]
  },
  op_add: {
    type: 'op_add',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'number', name: 'a', default: '' },
      { kind: 'label', text: '+' },
      { kind: 'number', name: 'b', default: '' }
    ]
  },
  op_sub: {
    type: 'op_sub',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'number', name: 'a', default: '' },
      { kind: 'label', text: '−' },
      { kind: 'number', name: 'b', default: '' }
    ]
  },
  op_mul: {
    type: 'op_mul',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'number', name: 'a', default: '' },
      { kind: 'label', text: '×' },
      { kind: 'number', name: 'b', default: '' }
    ]
  },
  op_div: {
    type: 'op_div',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'number', name: 'a', default: '' },
      { kind: 'label', text: '/' },
      { kind: 'number', name: 'b', default: '' }
    ]
  },
  op_lt: {
    type: 'op_lt',
    category: 'operators',
    shape: 'boolean',
    icon: null,
    tokens: [
      { kind: 'number', name: 'a', default: '' },
      { kind: 'label', text: '<' },
      { kind: 'number', name: 'b', default: 100 }
    ]
  },
  op_eq: {
    type: 'op_eq',
    category: 'operators',
    shape: 'boolean',
    icon: null,
    tokens: [
      { kind: 'number', name: 'a', default: '' },
      { kind: 'label', text: '=' },
      { kind: 'number', name: 'b', default: 100 }
    ]
  },
  op_gt: {
    type: 'op_gt',
    category: 'operators',
    shape: 'boolean',
    icon: null,
    tokens: [
      { kind: 'number', name: 'a', default: '' },
      { kind: 'label', text: '>' },
      { kind: 'number', name: 'b', default: 100 }
    ]
  },
  op_and: {
    type: 'op_and',
    category: 'operators',
    shape: 'boolean',
    icon: null,
    tokens: [
      { kind: 'boolean_slot', name: 'condA', default: null },
      { kind: 'label', text: 'e' },
      { kind: 'boolean_slot', name: 'condB', default: null }
    ]
  },
  op_or: {
    type: 'op_or',
    category: 'operators',
    shape: 'boolean',
    icon: null,
    tokens: [
      { kind: 'boolean_slot', name: 'condA', default: null },
      { kind: 'label', text: 'ou' },
      { kind: 'boolean_slot', name: 'condB', default: null }
    ]
  },
  op_not: {
    type: 'op_not',
    category: 'operators',
    shape: 'boolean',
    icon: null,
    tokens: [
      { kind: 'label', text: 'é falso que' },
      { kind: 'boolean_slot', name: 'condA', default: null }
    ]
  },
  op_join: {
    type: 'op_join',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'label', text: 'a junção de' },
      { kind: 'text', name: 'strA', default: 'apple' },
      { kind: 'label', text: 'com' },
      { kind: 'text', name: 'strB', default: 'banana' }
    ]
  },
  op_length: {
    type: 'op_length',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'label', text: 'o comprimento de' },
      { kind: 'text', name: 'strA', default: 'apple' }
    ]
  },
  op_mod: {
    type: 'op_mod',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'label', text: 'o resto de' },
      { kind: 'number', name: 'a', default: '' },
      { kind: 'label', text: 'a dividir por' },
      { kind: 'number', name: 'b', default: '' }
    ]
  },
  op_round: {
    type: 'op_round',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      { kind: 'label', text: 'o arredondamento de' },
      { kind: 'number', name: 'a', default: '' }
    ]
  },
  op_math: {
    type: 'op_math',
    category: 'operators',
    shape: 'reporter',
    icon: null,
    tokens: [
      {
        kind: 'select',
        name: 'func',
        default: 'abs',
        options: [
          { value: 'abs', label: 'o valor absoluto' },
          { value: 'sqrt', label: 'a raiz quadrada' },
          { value: 'sin', label: 'sen' },
          { value: 'cos', label: 'cos' }
        ]
      },
      { kind: 'label', text: 'de' },
      { kind: 'number', name: 'a', default: '' }
    ]
  }
};

// Alias para compatibilidade com projetos existentes
window.EV3_BLOCK_DEFINITIONS.sensor_wait_distance = window.EV3_BLOCK_DEFINITIONS.sensor_Wait_distance;

window.formatEV3Steering = function (val) {
  const n = Number(val) || 0;
  if (n === 0) return 'reto: 0';
  if (n > 0) return `direita: ${n}`;
  return `esquerda: ${n}`;
};
