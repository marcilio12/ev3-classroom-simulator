/**
 * Interpretador / Runtime Assíncrono (async/await) - RoboSim
 * Percorre pilhas de blocos sequencialmente, envia comandos de física ao robô,
 * monitora rotações/graus/tempo/sensores e destaca o bloco ativo em tempo real.
 */

class EV3Runtime {
  constructor(workspace, arena, callbacks = {}) {
    this.workspace = workspace;
    this.arena = arena;
    this.onStateChange = callbacks.onStateChange || (() => {});
    this.onLog = callbacks.onLog || (() => {});

    this.isRunning = false;
    this.runToken = 0;
    this.audioCtx = null;
  }

  async startProgram() {
    if (this.isRunning) {
      this.stopProgram();
      return;
    }

    const startHats = this.workspace.getStartHatBlocks();
    if (startHats.length === 0) {
      this.onLog('Adicione o bloco amarelo "quando o programa iniciar" para executar.');
      return;
    }

    // Nos desafios, sempre volta o robô para a posição de início antes de rodar o código
    if (this.arena && typeof this.arena.isChallengeScenario === 'function' && this.arena.isChallengeScenario()) {
      this.arena.resetRobotPose();
    }

    this.runToken++;
    const token = this.runToken;
    this.isRunning = true;
    this.onStateChange(true);
    this.onLog('Executando programa RoboSim...');

    try {
      await Promise.all(startHats.map(hat => this.executeChain(hat.id, token)));
    } catch (err) {
      if (err && err.message !== 'EV3_ABORTED') {
        console.error(err);
      }
    } finally {
      if (this.runToken === token) {
        this.arena.stopAllMotors();
        this.workspace.setRunningBlock(null);
        this.isRunning = false;
        this.onStateChange(false);
        this.onLog('Programa finalizado.');
      }
    }
  }

  async triggerBrickButton(buttonName) {
    const hats = this.workspace.getButtonHatBlocks(buttonName, 'pressionado');
    if (hats.length === 0) {
      this.onLog(`Botão "${buttonName}" pressionado (nenhum bloco de evento associado).`);
      return;
    }

    if (!this.isRunning && this.arena && typeof this.arena.isChallengeScenario === 'function' && this.arena.isChallengeScenario()) {
      this.arena.resetRobotPose();
    }

    this.runToken++;
    const token = this.runToken;
    this.isRunning = true;
    this.onStateChange(true);
    this.onLog(`Executando evento: botão ${buttonName} pressionado...`);

    try {
      await Promise.all(hats.map(hat => this.executeChain(hat.id, token)));
    } catch (err) {
      if (err && err.message !== 'EV3_ABORTED') {
        console.error(err);
      }
    } finally {
      if (this.runToken === token) {
        this.arena.stopAllMotors();
        this.workspace.setRunningBlock(null);
        this.isRunning = false;
        this.onStateChange(false);
        this.onLog(`Evento do botão ${buttonName} concluído.`);
      }
    }
  }

  stopProgram() {
    this.runToken++;
    this.isRunning = false;
    this.arena.stopAllMotors();
    this.workspace.setRunningBlock(null);
    this.onStateChange(false);
    this.onLog('Execução interrompida pelo usuário.');
  }

  checkAborted(token) {
    if (!this.isRunning || this.runToken !== token) {
      throw new Error('EV3_ABORTED');
    }
  }

  async executeChain(firstBlockId, token) {
    let currId = firstBlockId;
    while (currId && this.workspace.blocks.has(currId)) {
      this.checkAborted(token);
      const block = this.workspace.blocks.get(currId);
      await this.executeBlock(block, token);
      currId = block.nextId;
    }
  }

  evaluateBooleanParam(parentBlock, paramName) {
    if (!parentBlock || !parentBlock.params) return false;
    const val = parentBlock.params[paramName];
    if (!val) return false;

    // Se for o ID de um bloco aninhado no slot (sensores, operadores, etc.)
    if (typeof val === 'string' && this.workspace.blocks.has(val)) {
      return this.evaluateBooleanBlock(this.workspace.blocks.get(val));
    }

    // Compatibilidade com códigos de condição legado (ex: 'dist_lt_20')
    return this.evaluateConditionCode(val);
  }

  evaluateBooleanBlock(block, depth = 0) {
    if (!block || depth > 20) return false;
    const p = block.params || {};
    const s = this.arena.robot.sensors;

    switch (block.type) {
      // 1. Sensores de Distância Ultrassônico
      case 'sensor_is_distance': {
        const rawDist = Number(p.distance) !== undefined && p.distance !== '' ? Number(p.distance) : 15;
        const unit = p.unit || 'cm';
        const thresholdCm = unit === 'inch' ? rawDist * 2.54 : rawDist;
        const comp = p.comparator || 'lt';
        const d = s.ultrasonicCm;
        if (comp === 'eq') return Math.abs(d - thresholdCm) <= 1.5;
        if (comp === 'gt') return d > thresholdCm;
        return d < thresholdCm;
      }

      // 2. Sensores de Cor
      case 'sensor_is_color': {
        const targetColor = p.color || 'red';
        return s.colorName === targetColor;
      }

      case 'sensor_is_reflected_light': {
        const targetVal = Number(p.value) !== undefined && p.value !== '' ? Number(p.value) : 50;
        const comp = p.comparator || 'lt';
        const reflected = s.colorName === 'black' ? 12 : (s.colorName === 'white' ? 92 : (s.colorName === 'yellow' ? 68 : 45));
        if (comp === 'eq') return Math.abs(reflected - targetVal) <= 3;
        if (comp === 'gt') return reflected > targetVal;
        return reflected < targetVal;
      }

      // 3. Sensor de Toque
      case 'sensor_is_touch': {
        return Boolean(s.touchPressed || s.ultrasonicCm <= 10);
      }

      // 4. Sensor Giroscópio
      case 'sensor_is_gyro': {
        const targetAngle = Number(p.angle) || 45;
        const comp = p.comparator || 'lt';
        const deg = Math.round((this.arena.robot.angle * 180) / Math.PI);
        if (comp === 'eq') return Math.abs(deg - targetAngle) <= 3;
        if (comp === 'gt') return deg > targetAngle;
        return deg < targetAngle;
      }

      // 5. Botões do Bloco EV3
      case 'sensor_is_brick_button': {
        return false;
      }

      // 6. Operadores de Comparação (<, =, >)
      case 'op_lt': {
        const a = Number(p.a) || 0;
        const b = Number(p.b) || 0;
        return a < b;
      }
      case 'op_eq': {
        const a = String(p.a ?? '').trim().toLowerCase();
        const b = String(p.b ?? '').trim().toLowerCase();
        return a === b;
      }
      case 'op_gt': {
        const a = Number(p.a) || 0;
        const b = Number(p.b) || 0;
        return a > b;
      }

      // 7. Operadores Lógicos (E, OU, NÃO)
      case 'op_and': {
        const valA = this.evaluateBooleanParam(block, 'condA');
        const valB = this.evaluateBooleanParam(block, 'condB');
        return valA && valB;
      }
      case 'op_or': {
        const valA = this.evaluateBooleanParam(block, 'condA');
        const valB = this.evaluateBooleanParam(block, 'condB');
        return valA || valB;
      }
      case 'op_not': {
        const valA = this.evaluateBooleanParam(block, 'condA');
        return !valA;
      }

      default:
        return false;
    }
  }

  getBooleanParamDescription(parentBlock, paramName) {
    if (!parentBlock || !parentBlock.params) return 'vazio';
    const val = parentBlock.params[paramName];
    if (!val) return 'vazio';
    if (typeof val === 'string' && this.workspace.blocks.has(val)) {
      const child = this.workspace.blocks.get(val);
      if (child.type === 'sensor_is_distance') {
        const comp = child.params.comparator === 'gt' ? '>' : (child.params.comparator === 'eq' ? '=' : '<');
        return `Sensor Ultrassônico (${comp} ${child.params.distance || 15} ${child.params.unit || 'cm'})`;
      }
      if (child.type === 'sensor_is_color') {
        return `Sensor de Cor (= ${child.params.color || 'vermelho'})`;
      }
      if (child.type === 'sensor_is_touch') {
        return 'Sensor de Toque pressionado';
      }
      if (child.type === 'sensor_is_gyro') {
        return `Sensor Giroscópio (${child.params.angle || 45}°)`;
      }
      const def = window.EV3_BLOCK_DEFINITIONS[child.type];
      return def ? def.type : child.type;
    }
    return String(val);
  }

  evaluateConditionCode(condCode) {
    const s = this.arena.robot.sensors;
    switch (condCode) {
      case 'dist_lt_20':
        return s.ultrasonicCm < 20;
      case 'dist_lt_30':
        return s.ultrasonicCm < 30;
      case 'color_black':
        return s.colorName === 'black';
      case 'color_red':
        return s.colorName === 'red';
      case 'touch_pressed':
        return Boolean(s.touchPressed || s.ultrasonicCm < 12);
      case 'false':
        return false;
      case 'true':
      default:
        return true;
    }
  }

  async executeBlock(block, token) {
    this.checkAborted(token);
    this.workspace.setRunningBlock(block.id);
    const p = block.params || {};

    switch (block.type) {
      case 'when_program_starts':
      case 'when_brick_button':
      case 'when_color_is':
      case 'when_touch_is':
      case 'when_distance_is':
      case 'when_gyro_angle':
      case 'when_condition':
      case 'when_timer_gt':
      case 'when_message_received': {
        await this.sleep(80, token);
        break;
      }

      // ==================== MOVIMENTO ====================
      case 'move_set_speed': {
        const spd = Math.max(-100, Math.min(100, Number(p.speed) || 50));
        this.arena.robot.defaultSpeedPct = spd;
        this.arena.robot.motors.B.speedPct = spd;
        this.arena.robot.motors.C.speedPct = spd;
        this.onLog(`Velocidade de movimento definida para ${spd}%`);
        await this.sleep(60, token);
        break;
      }

      case 'move_direction_for': {
        const dirSign = p.direction === 'backward' ? -1 : 1;
        const speed = (this.arena.robot.defaultSpeedPct || 50) * dirSign;
        const amount = Math.max(0, Number(p.amount) || 0);
        const unit = p.unit || 'rotations';
        this.onLog(`Movendo para ${p.direction === 'backward' ? 'trás' : 'a frente'} por ${amount} ${this.translateUnit(unit)}`);
        await this.runDriveFor(0, speed, amount, unit, token);
        break;
      }

      case 'move_steer_for': {
        const steering = Number(p.steering) || 0;
        const speed = this.arena.robot.defaultSpeedPct || 50;
        const amount = Math.max(0, Number(p.amount) || 0);
        const unit = p.unit || 'rotations';
        this.onLog(`Movendo (${window.formatEV3Steering(steering)}) por ${amount} ${this.translateUnit(unit)}`);
        await this.runDriveFor(steering, speed, amount, unit, token);
        break;
      }

      case 'move_steer_for_at_speed': {
        const steering = Number(p.steering) || 0;
        const speed = Number(p.speed) !== undefined ? Number(p.speed) : 50;
        const amount = Math.max(0, Number(p.amount) || 0);
        const unit = p.unit || 'rotations';
        this.onLog(`Movendo (${window.formatEV3Steering(steering)}) por ${amount} ${this.translateUnit(unit)} a ${speed}%`);
        await this.runDriveFor(steering, speed, amount, unit, token);
        break;
      }

      case 'move_tank_for_at_speeds': {
        const leftSpd = Math.max(-100, Math.min(100, Number(p.leftSpeed) || 0));
        const rightSpd = Math.max(-100, Math.min(100, Number(p.rightSpeed) || 0));
        const amount = Math.max(0, Number(p.amount) || 0);
        const unit = p.unit || 'rotations';
        this.onLog(`Movendo tanque (${leftSpd}%, ${rightSpd}%) por ${amount} ${this.translateUnit(unit)}`);
        await this.runTankDriveFor(leftSpd, rightSpd, amount, unit, token);
        break;
      }

      case 'move_start_steer': {
        const steering = Number(p.steering) || 0;
        const speed = this.arena.robot.defaultSpeedPct || 50;
        const { leftPct, rightPct } = this.arena.computeDifferentialSpeeds(steering, speed);
        this.arena.setDriveSpeed(leftPct, rightPct);
        this.onLog(`Movimento contínuo iniciado (${window.formatEV3Steering(steering)}) a ${speed}%`);
        await this.sleep(50, token);
        break;
      }

      case 'move_start_steer_at_speed': {
        const steering = Number(p.steering) || 0;
        const speed = Number(p.speed) !== undefined ? Number(p.speed) : 50;
        const { leftPct, rightPct } = this.arena.computeDifferentialSpeeds(steering, speed);
        this.arena.setDriveSpeed(leftPct, rightPct);
        this.onLog(`Movimento contínuo (${window.formatEV3Steering(steering)}) a ${speed}%`);
        await this.sleep(50, token);
        break;
      }

      case 'move_start_tank_at_speeds': {
        const leftSpd = Math.max(-100, Math.min(100, Number(p.leftSpeed) || 0));
        const rightSpd = Math.max(-100, Math.min(100, Number(p.rightSpeed) || 0));
        this.arena.setDriveSpeed(leftSpd, rightSpd);
        this.onLog(`Movimento tanque contínuo iniciado (${leftSpd}%, ${rightSpd}%)`);
        await this.sleep(50, token);
        break;
      }

      case 'move_stop': {
        this.arena.stopDriveMotors();
        this.onLog('Motores de movimento (B+C) parados.');
        await this.sleep(60, token);
        break;
      }

      case 'move_set_motors':
      case 'move_set_stop_action': {
        this.onLog(`Configuração de movimento atualizada.`);
        await this.sleep(50, token);
        break;
      }

      // ==================== MOTORES ====================
      case 'motor_set_speed': {
        const port = p.port || 'A';
        const spd = Math.max(-100, Math.min(100, Number(p.speed) || 75));
        if (this.arena.robot.motors[port]) {
          this.arena.robot.motors[port].speedPct = spd;
        }
        this.onLog(`Motor ${port}: velocidade definida para ${spd}%`);
        await this.sleep(50, token);
        break;
      }

      case 'motor_run_for': {
        const port = p.port || 'A';
        const senseSign = p.sense === 'counterclockwise' ? -1 : 1;
        const baseSpd = this.arena.robot.motors[port] ? this.arena.robot.motors[port].speedPct : 75;
        const speed = Math.abs(baseSpd) * senseSign;
        const amount = Math.max(0, Number(p.amount) || 0);
        const unit = p.unit || 'rotations';
        this.onLog(`Motor ${port}: executando sentido ${p.sense === 'counterclockwise' ? 'anti-horário' : 'horário'} por ${amount} ${this.translateUnit(unit)}`);
        await this.runSingleMotorFor(port, speed, amount, unit, token);
        break;
      }

      case 'motor_run_for_at_speed': {
        const port = p.port || 'A';
        const senseSign = p.sense === 'counterclockwise' ? -1 : 1;
        const speed = Math.abs(Number(p.speed) || 75) * senseSign;
        const amount = Math.max(0, Number(p.amount) || 0);
        const unit = p.unit || 'rotations';
        this.onLog(`Motor ${port}: executando por ${amount} ${this.translateUnit(unit)} a ${p.speed}%`);
        await this.runSingleMotorFor(port, speed, amount, unit, token);
        break;
      }

      case 'motor_start': {
        const port = p.port || 'A';
        const senseSign = p.sense === 'counterclockwise' ? -1 : 1;
        const baseSpd = this.arena.robot.motors[port] ? this.arena.robot.motors[port].speedPct : 75;
        this.arena.setSingleMotorSpeed(port, Math.abs(baseSpd) * senseSign);
        this.onLog(`Motor ${port} iniciado.`);
        await this.sleep(50, token);
        break;
      }

      case 'motor_start_at_speed':
      case 'motor_start_at_power': {
        const port = p.port || 'A';
        const senseSign = p.sense === 'counterclockwise' ? -1 : 1;
        const val = Number(p.speed !== undefined ? p.speed : p.power) || 75;
        this.arena.setSingleMotorSpeed(port, val * senseSign);
        this.onLog(`Motor ${port} iniciado a ${val}%`);
        await this.sleep(50, token);
        break;
      }

      case 'motor_stop': {
        const port = p.port || 'A';
        this.arena.setSingleMotorSpeed(port, 0);
        this.onLog(`Motor ${port} parado.`);
        await this.sleep(50, token);
        break;
      }

      case 'motor_reset_degrees': {
        const port = p.port || 'A';
        if (this.arena.robot.motors[port]) {
          this.arena.robot.motors[port].degrees = 0;
        }
        this.onLog(`Motor ${port}: graus contabilizados redefinidos para 0°`);
        await this.sleep(50, token);
        break;
      }

      case 'motor_set_stop_action': {
        this.onLog(`Motor ${p.port || 'A'}: parada definida para ${p.action}`);
        await this.sleep(50, token);
        break;
      }

      // ==================== MONITOR ====================
      case 'display_write_line': {
        this.onLog(`Monitor (Linha ${p.line}): "${p.text}"`);
        await this.sleep(80, token);
        break;
      }

      case 'display_write_xy': {
        this.onLog(`Monitor (${p.x}, ${p.y}): "${p.text}"`);
        await this.sleep(80, token);
        break;
      }

      case 'display_image_for': {
        const secs = Math.max(0.1, Number(p.seconds) || 2);
        this.onLog(`Monitor exibindo "${p.image}" por ${secs} s`);
        await this.sleep(secs * 1000, token);
        break;
      }

      case 'display_image': {
        this.onLog(`Monitor exibindo "${p.image}"`);
        await this.sleep(80, token);
        break;
      }

      case 'display_clear': {
        this.onLog('Monitor apagado.');
        await this.sleep(60, token);
        break;
      }

      case 'brick_status_light': {
        const colorStr = String(p.lightColor || 'green').replace('_pulse', '');
        this.arena.robot.statusLight = colorStr;
        this.onLog(`Luz de status definida para ${p.lightColor}`);
        await this.sleep(60, token);
        break;
      }

      case 'brick_status_light_off': {
        this.arena.robot.statusLight = 'off';
        this.onLog('Luz de status desligada.');
        await this.sleep(60, token);
        break;
      }

      // ==================== SOM ====================
      case 'sound_play_until_done': {
        this.onLog(`Tocando som "${p.sound}" até concluir...`);
        this.playEV3Tone(64, 0.35);
        await this.sleep(380, token);
        break;
      }

      case 'sound_play_start': {
        this.onLog(`Som iniciado: "${p.sound}"`);
        this.playEV3Tone(67, 0.22);
        await this.sleep(60, token);
        break;
      }

      case 'sound_beep_for': {
        const note = Number(p.note) || 60;
        const secs = Math.max(0.05, Number(p.seconds) || 0.2);
        this.onLog(`Tocando bip (nota MIDI ${note}) por ${secs} s`);
        this.playEV3Tone(note, secs);
        await this.sleep(secs * 1000, token);
        break;
      }

      case 'sound_beep': {
        const note = Number(p.note) || 60;
        const secs = Math.max(0.05, Number(p.seconds) || 0.2);
        this.onLog(`Tocando bip (nota MIDI ${note})`);
        this.playEV3Tone(note, secs);
        await this.sleep(200, token);
        break;
      }

      case 'sound_stop_all': {
        this.onLog('Todos os sons parados.');
        await this.sleep(50, token);
        break;
      }

      case 'sound_set_volume': {
        this.onLog(`Volume ajustado para ${p.volume}%`);
        await this.sleep(50, token);
        break;
      }

      // ==================== CONTROLE ====================
      case 'control_wait': {
        const secs = Math.max(0, Number(p.seconds) || 1);
        this.onLog(`Aguardando ${secs} s...`);
        await this.sleep(secs * 1000, token);
        break;
      }

      case 'control_repeat': {
        const times = Math.max(0, Math.floor(Number(p.times) || 1));
        for (let i = 0; i < times; i++) {
          this.checkAborted(token);
          this.onLog(`Loop repete (${i + 1}/${times})`);
          if (block.substackId) {
            await this.executeChain(block.substackId, token);
          } else {
            await this.sleep(50, token);
          }
        }
        break;
      }

      case 'control_forever': {
        while (true) {
          this.checkAborted(token);
          if (block.substackId) {
            await this.executeChain(block.substackId, token);
          }
          await this.sleep(30, token);
        }
      }

      case 'control_if': {
        const cond = this.evaluateBooleanParam(block, 'condition');
        if (cond && block.substackId) {
          await this.executeChain(block.substackId, token);
        } else {
          await this.sleep(40, token);
        }
        break;
      }

      case 'control_if_else': {
        const cond = this.evaluateBooleanParam(block, 'condition');
        if (cond) {
          if (block.substackId) {
            await this.executeChain(block.substackId, token);
          }
        } else if (block.substack2Id) {
          await this.executeChain(block.substack2Id, token);
        }
        await this.sleep(40, token);
        break;
      }

      case 'control_wait_until': {
        const desc = this.getBooleanParamDescription(block, 'condition');
        this.onLog(`Aguardando condição (${desc})...`);
        await this.waitUntilCondition(() => this.evaluateBooleanParam(block, 'condition'), token);
        break;
      }

      case 'control_repeat_until': {
        while (!this.evaluateBooleanParam(block, 'condition')) {
          this.checkAborted(token);
          if (block.substackId) {
            await this.executeChain(block.substackId, token);
          }
          await this.sleep(30, token);
        }
        break;
      }

      case 'control_stop': {
        this.onLog('Comando parar executado.');
        this.stopProgram();
        break;
      }

      // ==================== SENSORES ====================
      case 'sensor_wait_distance': {
        const rawDist = Number(p.distance) || 15;
        const unit = p.unit || 'cm';
        const thresholdCm = unit === 'inch' ? rawDist * 2.54 : rawDist;
        const comp = p.comparator || 'lt';
        this.onLog(`Sensor Ultrassônico (Porta 4): aguardando distância ${comp === 'eq' ? '=' : '<'} ${rawDist} ${unit}...`);
        await this.waitUntilCondition(() => {
          const d = this.arena.robot.sensors.ultrasonicCm;
          if (comp === 'eq') return Math.abs(d - thresholdCm) <= 1.5;
          if (comp === 'gt') return d > thresholdCm;
          return d < thresholdCm;
        }, token);
        this.onLog(`Sensor Ultrassônico detectou ${this.arena.robot.sensors.ultrasonicCm} cm!`);
        break;
      }

      case 'sensor_wait_color': {
        const targetColor = p.color || 'red';
        this.onLog(`Sensor de Cor (Porta 3): aguardando cor "${targetColor}"...`);
        await this.waitUntilCondition(() => {
          return this.arena.robot.sensors.colorName === targetColor;
        }, token);
        this.onLog(`Sensor de Cor detectou ${this.arena.robot.sensors.colorLabel}!`);
        break;
      }

      case 'sensor_wait_touch': {
        this.onLog(`Sensor de Toque (Porta ${p.port || 1}): aguardando ${p.state}...`);
        await this.waitUntilCondition(() => {
          return this.arena.robot.sensors.ultrasonicCm <= 10;
        }, token);
        break;
      }

      case 'sensor_wait_gyro': {
        const targetAngle = Number(p.angle) || 90;
        this.onLog(`Sensor Giroscópio (Porta ${p.port || 2}): aguardando ${targetAngle}°...`);
        await this.waitUntilCondition(() => {
          const deg = Math.round((this.arena.robot.angle * 180) / Math.PI);
          return Math.abs(deg) >= Math.abs(targetAngle);
        }, token);
        break;
      }

      case 'sensor_reset_gyro': {
        this.onLog(`Giroscópio (Porta ${p.port || 2}): ângulo redefinido.`);
        await this.sleep(50, token);
        break;
      }

      case 'sensor_reset_timer': {
        this.onLog('Cronômetro redefinido para 0.0 s.');
        await this.sleep(50, token);
        break;
      }

      case 'sensor_wait_brick_button': {
        this.onLog(`Aguardando botão "${p.button}" ser ${p.action}...`);
        await this.sleep(500, token);
        break;
      }

      case 'broadcast_message':
      case 'broadcast_message_wait': {
        this.onLog(`Mensagem transmitida: "${p.message}"`);
        await this.sleep(80, token);
        break;
      }

      default:
        await this.sleep(50, token);
    }
  }

  // ==================== EXECUÇÃO PRECISA POR ROTAÇÕES, GRAUS OU SEGUNDOS ====================
  async runDriveFor(steering, speedPct, amount, unit, token) {
    if (amount <= 0 || Math.abs(speedPct) < 0.01) {
      this.arena.stopDriveMotors();
      return;
    }

    const { leftPct, rightPct } = this.arena.computeDifferentialSpeeds(steering, speedPct);
    await this.runTankDriveFor(leftPct, rightPct, amount, unit, token);
  }

  async runTankDriveFor(leftPct, rightPct, amount, unit, token) {
    if (amount <= 0 || (Math.abs(leftPct) < 0.01 && Math.abs(rightPct) < 0.01)) {
      this.arena.stopDriveMotors();
      return;
    }

    if (unit === 'seconds') {
      this.arena.setDriveSpeed(leftPct, rightPct);
      await this.sleep(amount * 1000, token);
      this.arena.stopDriveMotors();
      return;
    }

    const targetDegrees = unit === 'rotations' ? amount * 360 : amount;
    const startDegB = this.arena.robot.motors.B.degrees;
    const startDegC = this.arena.robot.motors.C.degrees;

    this.arena.setDriveSpeed(leftPct, rightPct);

    await this.waitUntilCondition(() => {
      const movedB = Math.abs(this.arena.robot.motors.B.degrees - startDegB);
      const movedC = Math.abs(this.arena.robot.motors.C.degrees - startDegC);
      const dominantMoved = Math.max(movedB, movedC);
      return dominantMoved >= targetDegrees;
    }, token);

    this.arena.stopDriveMotors();
  }

  async runSingleMotorFor(port, speedPct, amount, unit, token) {
    const motor = this.arena.robot.motors[port];
    if (!motor || amount <= 0 || Math.abs(speedPct) < 0.01) {
      this.arena.setSingleMotorSpeed(port, 0);
      return;
    }

    if (unit === 'seconds') {
      this.arena.setSingleMotorSpeed(port, speedPct);
      await this.sleep(amount * 1000, token);
      this.arena.setSingleMotorSpeed(port, 0);
      return;
    }

    const targetDegrees = unit === 'rotations' ? amount * 360 : amount;
    const startDeg = motor.degrees;
    this.arena.setSingleMotorSpeed(port, speedPct);

    await this.waitUntilCondition(() => {
      return Math.abs(motor.degrees - startDeg) >= targetDegrees;
    }, token);

    this.arena.setSingleMotorSpeed(port, 0);
  }

  translateUnit(unit) {
    if (unit === 'rotations') return 'rotações';
    if (unit === 'degrees') return 'graus';
    return 'segundos';
  }

  sleep(ms, token) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const check = (now) => {
        if (!this.isRunning || this.runToken !== token) {
          reject(new Error('EV3_ABORTED'));
          return;
        }
        if (now - start >= ms) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
  }

  waitUntilCondition(predicate, token) {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!this.isRunning || this.runToken !== token) {
          reject(new Error('EV3_ABORTED'));
          return;
        }
        if (predicate()) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
  }

  playEV3Tone(midiNote, durationSec) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + durationSec);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + durationSec);
    } catch (e) {
      // Silencioso caso o navegador bloqueie áudio
    }
  }
}

window.EV3Runtime = EV3Runtime;
