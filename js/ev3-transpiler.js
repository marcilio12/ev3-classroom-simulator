/**
 * EV3Transpiler - RoboSim
 * Transpila blocos visuais do RoboSim para código MicroPython oficial do LEGO EV3
 * (compatível com Pybricks e LEGO MINDSTORMS EV3 MicroPython) e bytecode de comandos diretos.
 */

class EV3Transpiler {
  constructor(workspace) {
    this.workspace = workspace;
  }

  /**
   * Converte a programação atual do workspace em um script MicroPython limpo,
   * comentado e pronto para executar no Bloco Inteligente EV3.
   */
  toMicroPython(projectName = 'Programa RoboSim') {
    if (!this.workspace || !this.workspace.blocks) {
      return '# Nenhum workspace ativo.';
    }

    const startHats = this.workspace.getStartHatBlocks();
    const buttonHats = [];
    for (const blk of this.workspace.blocks.values()) {
      if (blk.type === 'when_brick_button') {
        buttonHats.push(blk);
      }
    }

    let code = `#!/usr/bin/env pybricks-micropython
# ==============================================================================
# ${projectName}
# Gerado automaticamente pelo RoboSim - Simulador Virtual de Robótica
# Compatível com LEGO MINDSTORMS EV3 & MicroPython (Pybricks)
# ==============================================================================

import sys
import time
from pybricks.hubs import EV3Brick
from pybricks.ev3devices import Motor, TouchSensor, ColorSensor, UltrasonicSensor, GyroSensor
from pybricks.parameters import Port, Stop, Direction, Button, Color
from pybricks.tools import wait, StopWatch
from pybricks.robotics import DriveBase

# Inicializa o Bloco Inteligente EV3
ev3 = EV3Brick()
ev3.speaker.set_volume(70)

# Motores da Base Motriz (Portas B e C)
try:
    motor_b = Motor(Port.B)
    motor_c = Motor(Port.C)
    # Roda padrão: 56 mm de diâmetro | Distância entre rodas: 114 mm
    robot = DriveBase(motor_b, motor_c, wheel_diameter=56, axle_track=114)
    robot.settings(straight_speed=200, turn_rate=100)
except Exception as e:
    motor_b = None
    motor_c = None
    robot = None
    print("Aviso: Motores B e C não conectados:", e)

# Motor Auxiliar / Garra (Porta A)
try:
    motor_a = Motor(Port.A)
except Exception:
    motor_a = None

# Sensores EV3 (Portas 1, 2, 3 e 4)
try:
    sensor_touch = TouchSensor(Port.S1)
except Exception:
    sensor_touch = None

try:
    sensor_gyro = GyroSensor(Port.S2)
    sensor_gyro.reset_angle(0)
except Exception:
    sensor_gyro = None

try:
    sensor_color = ColorSensor(Port.S3)
except Exception:
    sensor_color = None

try:
    sensor_ultrasonic = UltrasonicSensor(Port.S4)
except Exception:
    sensor_ultrasonic = None

# Variáveis globais do programa
velocidade_atual = 50
`;

    // Declaração de variáveis utilizadas no workspace
    const usedVars = new Set();
    for (const blk of this.workspace.blocks.values()) {
      if (blk.params && blk.params.variable) {
        usedVars.add(this.sanitizeVarName(blk.params.variable));
      }
    }
    if (usedVars.size > 0) {
      code += `\n# Variáveis criadas pelo usuário\n`;
      usedVars.forEach(v => {
        code += `${v} = 0\n`;
      });
    }

    code += `\ndef main():\n    global velocidade_atual\n`;
    if (usedVars.size > 0) {
      code += `    global ${Array.from(usedVars).join(', ')}\n`;
    }

    if (startHats.length === 0) {
      code += `    # Nenhum bloco "quando o programa iniciar" encontrado no workspace.\n`;
      code += `    ev3.speaker.beep(frequency=440, duration=300)\n`;
      code += `    ev3.screen.print("RoboSim: Sem blocos")\n`;
    } else {
      code += `    ev3.speaker.beep(frequency=523, duration=150)\n`;
      code += `    ev3.screen.print("RoboSim EV3 Rodando")\n`;

      startHats.forEach((hat, idx) => {
        if (startHats.length > 1) {
          code += `\n    # --- Pilha de Início ${idx + 1} ---\n`;
        }
        const bodyCode = this.transpileChain(hat.nextBlockId, 1);
        code += bodyCode || '    pass\n';
      });
    }

    // Gerar manipuladores de eventos de botões do bloco
    if (buttonHats.length > 0) {
      code += `\n# Verificação periódica de botões do bloco EV3\n`;
      buttonHats.forEach(hat => {
        const btn = hat.params && hat.params.button ? hat.params.button : 'centro';
        code += `# Evento: Quando o botão ${btn} for pressionado\n`;
      });
    }

    code += `
if __name__ == '__main__':
    try:
        main()
        if robot:
            robot.stop()
        ev3.speaker.beep(frequency=880, duration=200)
    except KeyboardInterrupt:
        if robot:
            robot.stop()
        sys.exit(0)
`;

    return code;
  }

  /**
   * Transpila uma cadeia encadeada de blocos para Python com a indentação correta.
   */
  transpileChain(firstBlockId, indentLevel = 1) {
    if (!firstBlockId) return '';
    const indent = '    '.repeat(indentLevel);
    let out = '';
    let currId = firstBlockId;
    let guard = 0;

    while (currId && guard < 1000) {
      guard++;
      const blk = this.workspace.blocks.get(currId);
      if (!blk) break;

      out += this.transpileBlock(blk, indentLevel);
      currId = blk.nextBlockId;
    }

    return out;
  }

  /**
   * Transpila um único bloco para código Python.
   */
  transpileBlock(blk, indentLevel = 1) {
    const indent = '    '.repeat(indentLevel);
    const p = blk.params || {};

    switch (blk.type) {
      // ==================== MOVIMENTO (MOTORES B + C) ====================
      case 'move_set_speed': {
        const spd = this.resolveValueExpression(p.speed, 50);
        return `${indent}velocidade_atual = int(${spd})\n${indent}if robot:\n${indent}    robot.settings(straight_speed=velocidade_atual * 4)\n`;
      }

      case 'move_direction_for': {
        const dir = p.direction || 'forward';
        const amount = this.resolveValueExpression(p.amount, 1);
        const unit = p.unit || 'rotations';

        if (dir === 'forward' || dir === 'backward') {
          const sign = dir === 'forward' ? '' : '-';
          if (unit === 'rotations') {
            return `${indent}if robot:\n${indent}    robot.straight(int(${sign}(${amount}) * 176))  # 1 rot ~ 17.6 cm\n`;
          } else if (unit === 'degrees') {
            return `${indent}if robot:\n${indent}    robot.straight(int(${sign}(${amount}) * 176 / 360))\n`;
          } else {
            return `${indent}if robot:\n${indent}    robot.drive(${sign}velocidade_atual * 4, 0)\n${indent}    wait(int((${amount}) * 1000))\n${indent}    robot.stop()\n`;
          }
        } else if (dir === 'left') {
          return `${indent}if robot:\n${indent}    robot.turn(-90)  # Curva de 90° à esquerda\n`;
        } else if (dir === 'right') {
          return `${indent}if robot:\n${indent}    robot.turn(90)   # Curva de 90° à direita\n`;
        }
        return `${indent}pass\n`;
      }

      case 'move_steer_for': {
        const steer = Number(p.steering) || 0;
        const amount = this.resolveValueExpression(p.amount, 1);
        const unit = p.unit || 'rotations';

        if (steer === 0) {
          if (unit === 'rotations') {
            return `${indent}if robot:\n${indent}    robot.straight(int((${amount}) * 176))\n`;
          } else if (unit === 'degrees') {
            return `${indent}if robot:\n${indent}    robot.straight(int((${amount}) * 176 / 360))\n`;
          } else {
            return `${indent}if robot:\n${indent}    robot.drive(velocidade_atual * 4, 0)\n${indent}    wait(int((${amount}) * 1000))\n${indent}    robot.stop()\n`;
          }
        } else {
          // Direção com curva (steering de -100 a +100)
          const turnRate = Math.round(steer * 1.8);
          if (unit === 'seconds') {
            return `${indent}if robot:\n${indent}    robot.drive(velocidade_atual * 3, ${turnRate})\n${indent}    wait(int((${amount}) * 1000))\n${indent}    robot.stop()\n`;
          } else {
            const ms = `int((${amount}) * 1000)`;
            return `${indent}if robot:\n${indent}    robot.drive(velocidade_atual * 3, ${turnRate})\n${indent}    wait(${ms})\n${indent}    robot.stop()\n`;
          }
        }
      }

      case 'move_start_steer': {
        const steer = Number(p.steering) || 0;
        const turnRate = Math.round(steer * 1.8);
        return `${indent}if robot:\n${indent}    robot.drive(velocidade_atual * 4, ${turnRate})\n`;
      }

      case 'move_stop': {
        return `${indent}if robot:\n${indent}    robot.stop()\n`;
      }

      // ==================== MOTORES INDIVIDUAIS (MOTOR A / GARRA) ====================
      case 'motor_set_speed': {
        const port = (p.motor || 'A').toLowerCase();
        const spd = this.resolveValueExpression(p.speed, 50);
        return `${indent}# Ajuste de velocidade do motor ${port.toUpperCase()}\n`;
      }

      case 'motor_run_for': {
        const port = (p.motor || 'A').toLowerCase();
        const amount = this.resolveValueExpression(p.amount, 1);
        const unit = p.unit || 'rotations';
        const motorVar = `motor_${port}`;

        if (unit === 'rotations') {
          return `${indent}if ${motorVar}:\n${indent}    ${motorVar}.run_angle(speed=velocidade_atual * 5, rotation_angle=int((${amount}) * 360))\n`;
        } else if (unit === 'degrees') {
          return `${indent}if ${motorVar}:\n${indent}    ${motorVar}.run_angle(speed=velocidade_atual * 5, rotation_angle=int(${amount}))\n`;
        } else {
          return `${indent}if ${motorVar}:\n${indent}    ${motorVar}.run_time(speed=velocidade_atual * 5, time=int((${amount}) * 1000))\n`;
        }
      }

      case 'motor_start': {
        const port = (p.motor || 'A').toLowerCase();
        const motorVar = `motor_${port}`;
        return `${indent}if ${motorVar}:\n${indent}    ${motorVar}.run(speed=velocidade_atual * 5)\n`;
      }

      case 'motor_stop': {
        const port = (p.motor || 'A').toLowerCase();
        const motorVar = `motor_${port}`;
        return `${indent}if ${motorVar}:\n${indent}    ${motorVar}.stop()\n`;
      }

      // ==================== CONTROLE & REPETIÇÃO ====================
      case 'control_wait': {
        const dur = this.resolveValueExpression(p.duration, 1);
        return `${indent}wait(int((${dur}) * 1000))\n`;
      }

      case 'control_repeat': {
        const times = this.resolveValueExpression(p.times, 4);
        const sub = this.transpileChain(blk.firstSubstackBlockId, indentLevel + 1) || `${indent}    pass\n`;
        return `${indent}for _ in range(int(${times})):\n${sub}`;
      }

      case 'control_forever': {
        const sub = this.transpileChain(blk.firstSubstackBlockId, indentLevel + 1) || `${indent}    wait(50)\n`;
        return `${indent}while True:\n${sub}`;
      }

      case 'control_if': {
        const cond = this.transpileBooleanCondition(blk, 'condition');
        const sub = this.transpileChain(blk.firstSubstackBlockId, indentLevel + 1) || `${indent}    pass\n`;
        return `${indent}if ${cond}:\n${sub}`;
      }

      case 'control_if_else': {
        const cond = this.transpileBooleanCondition(blk, 'condition');
        const sub1 = this.transpileChain(blk.firstSubstackBlockId, indentLevel + 1) || `${indent}    pass\n`;
        const sub2 = this.transpileChain(blk.secondSubstackBlockId, indentLevel + 1) || `${indent}    pass\n`;
        return `${indent}if ${cond}:\n${sub1}${indent}else:\n${sub2}`;
      }

      case 'control_wait_until': {
        const cond = this.transpileBooleanCondition(blk, 'condition');
        return `${indent}while not (${cond}):\n${indent}    wait(20)\n`;
      }

      case 'control_repeat_until': {
        const cond = this.transpileBooleanCondition(blk, 'condition');
        const sub = this.transpileChain(blk.firstSubstackBlockId, indentLevel + 1) || `${indent}    wait(20)\n`;
        return `${indent}while not (${cond}):\n${sub}`;
      }

      case 'control_stop':
      case 'control_stop_all': {
        return `${indent}if robot:\n${indent}    robot.stop()\nsys.exit(0)\n`;
      }

      // ==================== SENSORES (ESPERA DIRETA) ====================
      case 'sensor_wait_distance': {
        const dist = this.resolveValueExpression(p.distance, 20);
        const comp = p.comparator === 'gt' ? '>' : (p.comparator === 'eq' ? '==' : '<');
        return `${indent}# Aguarda Sensor Ultrassônico (Porta 4) ${comp} ${dist} cm\n${indent}while True:\n${indent}    if sensor_ultrasonic and (sensor_ultrasonic.distance() / 10) ${comp} (${dist}):\n${indent}        break\n${indent}    wait(20)\n`;
      }

      case 'sensor_wait_color': {
        const targetColor = p.color || 'black';
        const pyColor = this.mapColorToPybricks(targetColor);
        return `${indent}# Aguarda Sensor de Cor (Porta 3) detectar ${targetColor}\n${indent}while True:\n${indent}    if sensor_color and sensor_color.color() == ${pyColor}:\n${indent}        break\n${indent}    wait(20)\n`;
      }

      case 'sensor_wait_reflected_light': {
        const targetPct = this.resolveValueExpression(p.intensity, 50);
        const comp = p.comparator === 'gt' ? '>' : '<';
        return `${indent}# Aguarda Luz Refletida (Porta 3) ${comp} ${targetPct}%\n${indent}while True:\n${indent}    if sensor_color and sensor_color.reflection() ${comp} (${targetPct}):\n${indent}        break\n${indent}    wait(20)\n`;
      }

      case 'sensor_wait_touch': {
        return `${indent}# Aguarda Sensor de Toque (Porta 1) ser pressionado\n${indent}while True:\n${indent}    if sensor_touch and sensor_touch.pressed():\n${indent}        break\n${indent}    wait(20)\n`;
      }

      // ==================== VARIÁVEIS ====================
      case 'var_set':
      case 'variable_set': {
        const vname = this.sanitizeVarName(p.variable || 'var');
        const val = this.resolveValueExpression(p.value, 0);
        return `${indent}${vname} = ${val}\n`;
      }

      case 'var_change':
      case 'variable_change_by': {
        const vname = this.sanitizeVarName(p.variable || 'var');
        const val = this.resolveValueExpression(p.value, 1);
        return `${indent}${vname} += ${val}\n`;
      }

      // ==================== SOM E DISPLAY ====================
      case 'sound_beep':
      case 'sound_start_beep': {
        const freq = this.resolveValueExpression(p.frequency, 440);
        const dur = this.resolveValueExpression(p.duration, 0.5);
        return `${indent}ev3.speaker.beep(frequency=int(${freq}), duration=int((${dur}) * 1000))\n`;
      }

      case 'display_write_line':
      case 'display_write_xy': {
        const text = this.resolveValueExpression(p.text, 'RoboSim');
        return `${indent}ev3.screen.print(str(${text}))\n`;
      }

      case 'display_clear': {
        return `${indent}ev3.screen.clear()\n`;
      }

      default:
        return `${indent}# Bloco ${blk.type}\n`;
    }
  }

  /**
   * Converte uma condição booleana do bloco para expressão lógica Python.
   */
  transpileBooleanCondition(parentBlock, paramName) {
    if (!parentBlock || !parentBlock.params) return 'True';
    const val = parentBlock.params[paramName];
    if (!val) return 'True';

    if (typeof val === 'string' && this.workspace.blocks.has(val)) {
      return this.transpileBooleanBlock(this.workspace.blocks.get(val));
    }

    // Compatibilidade com códigos de condição legado (ex: dist_lt_20)
    if (typeof val === 'string') {
      if (val.startsWith('dist_lt_')) {
        const d = val.replace('dist_lt_', '');
        return `(sensor_ultrasonic and (sensor_ultrasonic.distance() / 10) < ${d})`;
      }
      if (val.startsWith('color_eq_')) {
        const c = val.replace('color_eq_', '');
        return `(sensor_color and sensor_color.color() == ${this.mapColorToPybricks(c)})`;
      }
    }

    return 'True';
  }

  transpileBooleanBlock(block, depth = 0) {
    if (!block || depth > 20) return 'True';
    const p = block.params || {};

    switch (block.type) {
      case 'sensor_is_distance': {
        const dist = this.resolveValueExpression(p.distance, 15);
        const comp = p.comparator === 'gt' ? '>' : (p.comparator === 'eq' ? '==' : '<');
        return `(sensor_ultrasonic and (sensor_ultrasonic.distance() / 10) ${comp} (${dist}))`;
      }

      case 'sensor_is_color': {
        const targetColor = p.color || 'red';
        return `(sensor_color and sensor_color.color() == ${this.mapColorToPybricks(targetColor)})`;
      }

      case 'sensor_is_reflected_light': {
        const intens = this.resolveValueExpression(p.intensity, 50);
        const comp = p.comparator === 'gt' ? '>' : '<';
        return `(sensor_color and sensor_color.reflection() ${comp} (${intens}))`;
      }

      case 'sensor_is_touch': {
        return `(sensor_touch and sensor_touch.pressed())`;
      }

      case 'sensor_is_gyro': {
        const ang = this.resolveValueExpression(p.angle, 90);
        const comp = p.comparator === 'gt' ? '>' : (p.comparator === 'eq' ? '==' : '<');
        return `(sensor_gyro and sensor_gyro.angle() ${comp} (${ang}))`;
      }

      case 'op_lt': {
        const a = this.resolveValueExpression(p.a, 0);
        const b = this.resolveValueExpression(p.b, 10);
        return `(${a} < ${b})`;
      }

      case 'op_eq': {
        const a = this.resolveValueExpression(p.a, 0);
        const b = this.resolveValueExpression(p.b, 0);
        return `(${a} == ${b})`;
      }

      case 'op_gt': {
        const a = this.resolveValueExpression(p.a, 0);
        const b = this.resolveValueExpression(p.b, 10);
        return `(${a} > ${b})`;
      }

      case 'op_and': {
        const condA = this.transpileBooleanCondition(block, 'condA');
        const condB = this.transpileBooleanCondition(block, 'condB');
        return `(${condA} and ${condB})`;
      }

      case 'op_or': {
        const condA = this.transpileBooleanCondition(block, 'condA');
        const condB = this.transpileBooleanCondition(block, 'condB');
        return `(${condA} or ${condB})`;
      }

      case 'op_not': {
        const condA = this.transpileBooleanCondition(block, 'condA');
        return `(not (${condA}))`;
      }

      default:
        return 'True';
    }
  }

  /**
   * Converte valores numéricos, blocos ovais de operadores ou variáveis para expressão Python.
   */
  resolveValueExpression(val, fallback = 0) {
    if (val === undefined || val === null || val === '') {
      return String(fallback);
    }

    if (typeof val === 'string' && this.workspace && this.workspace.blocks.has(val)) {
      const child = this.workspace.blocks.get(val);
      const cp = child.params || {};

      switch (child.type) {
        case 'op_add':
          return `(${this.resolveValueExpression(cp.a, 0)} + ${this.resolveValueExpression(cp.b, 0)})`;
        case 'op_sub':
          return `(${this.resolveValueExpression(cp.a, 0)} - ${this.resolveValueExpression(cp.b, 0)})`;
        case 'op_mul':
          return `(${this.resolveValueExpression(cp.a, 0)} * ${this.resolveValueExpression(cp.b, 0)})`;
        case 'op_div':
          return `(${this.resolveValueExpression(cp.a, 0)} / max(0.0001, ${this.resolveValueExpression(cp.b, 1)}))`;
        case 'op_mod':
          return `(${this.resolveValueExpression(cp.a, 0)} % max(1, ${this.resolveValueExpression(cp.b, 1)}))`;
        case 'op_round':
          return `round(${this.resolveValueExpression(cp.num, 0)})`;
        case 'op_random':
          return `__import__('random').randint(${this.resolveValueExpression(cp.from, 1)}, ${this.resolveValueExpression(cp.to, 10)})`;
        case 'sensor_distance':
        case 'sensor_val_distance':
          return `(sensor_ultrasonic.distance() / 10 if sensor_ultrasonic else 250)`;
        case 'sensor_reflected_light':
        case 'sensor_val_reflectance':
          return `(sensor_color.reflection() if sensor_color else 50)`;
        case 'sensor_gyro_angle':
        case 'sensor_val_gyro':
          return `(sensor_gyro.angle() if sensor_gyro else 0)`;
        case 'var_get':
        case 'variable_get':
          return this.sanitizeVarName(cp.variable || 'var');
        default:
          return String(fallback);
      }
    }

    const n = Number(val);
    if (!isNaN(n)) return String(n);
    return JSON.stringify(String(val));
  }

  mapColorToPybricks(color) {
    const c = String(color).toLowerCase();
    switch (c) {
      case 'black':
      case 'preto': return 'Color.BLACK';
      case 'blue':
      case 'azul': return 'Color.BLUE';
      case 'green':
      case 'verde': return 'Color.GREEN';
      case 'yellow':
      case 'amarelo': return 'Color.YELLOW';
      case 'red':
      case 'vermelho': return 'Color.RED';
      case 'white':
      case 'branco': return 'Color.WHITE';
      case 'brown':
      case 'marrom': return 'Color.BROWN';
      default: return 'None';
    }
  }

  sanitizeVarName(name) {
    if (!name) return 'minha_variavel';
    let clean = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    if (/^[0-9]/.test(clean)) clean = 'var_' + clean;
    return clean;
  }
}

window.EV3Transpiler = EV3Transpiler;
