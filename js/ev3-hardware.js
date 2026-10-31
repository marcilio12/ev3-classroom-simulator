/**
 * EV3HardwareManager - RoboSim
 * Gerencia a comunicação direta com o Bloco Inteligente LEGO MINDSTORMS EV3 físico
 * através de WebHID (Cabo USB oficial) e Web Serial (Bluetooth Serial RFCOMM / COM).
 *
 * Características e Especificações:
 * - LEGO System A/S: Vendor ID = 0x0694, Product ID = 0x0005 (EV3 Brick).
 * - Protocolo USB HID: pacotes de saída devem ter exatamente 1024 bytes (OutputReportByteLength).
 * - Leitura bidirecional via 'inputreport' (Bateria, Firmware, Nome do Bloco).
 * - Compilação e envio de Bytecode autônomo (opOUTPUT_STEP_SPEED, opOUTPUT_READY, opSOUND, etc.).
 * - Gravação de arquivos no sistema de arquivos do EV3 via BEGIN_DOWNLOAD (0x92).
 */

class EV3HardwareManager {
  constructor(callbacks = {}) {
    this.onStateChange = callbacks.onStateChange || (() => {});
    this.onLog = callbacks.onLog || (() => {});

    this.connectionType = 'none'; // 'none' | 'usb' | 'bluetooth'
    this.device = null;
    this.serialPort = null;
    this.serialWriter = null;
    this.serialReader = null;
    this.msgCounter = 1;
    this.isConnected = false;
    this.deviceName = 'LEGO EV3';
    this.batteryLevel = null; // 0-100%
    this.firmwareVersion = null; // ex: 'V1.09E'
    this.brickName = 'EV3';

    this.pendingReplies = new Map();
    this.boundHandleInputReport = this.handleInputReport.bind(this);
  }

  isWebHIDSupported() {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  isWebSerialSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  isWebBluetoothSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * Conecta ao Bloco EV3 físico via Cabo USB usando a WebHID API.
   */
  async connectUSB() {
    if (!this.isWebHIDSupported()) {
      throw new Error('A WebHID API não é suportada neste navegador. Utilize Google Chrome, Microsoft Edge ou Opera.');
    }

    try {
      this.onLog('Procurando Bloco Inteligente LEGO EV3 conectado via USB...', 'info');

      let dev = null;

      // 1. Verifica se já temos autorização prévia para o EV3
      const existingDevices = await navigator.hid.getDevices();
      const existingEV3 = existingDevices.find(d => 
        d.vendorId === 0x0694 && (d.productId === 0x0005 || d.productId === 0x0006)
      );

      if (existingEV3) {
        dev = existingEV3;
        this.onLog('Bloco EV3 detectado nas permissões existentes.', 'info');
      } else {
        this.onLog('Selecione "EV3" ou "Dispositivo de Entrada USB" na janela do navegador...', 'info');
        let devices = [];
        try {
          devices = await navigator.hid.requestDevice({
            filters: [
              { vendorId: 0x0694, productId: 0x0005 },
              { vendorId: 0x0694 }
            ]
          });
        } catch (filterErr) {
          console.warn('Filtro restrito falhou, tentando seletor amplo:', filterErr);
          devices = await navigator.hid.requestDevice({ filters: [] });
        }

        if (!devices || devices.length === 0) {
          throw new Error('Nenhum dispositivo EV3 foi selecionado na janela de permissão.');
        }

        dev = devices[0];
      }

      if (!dev.opened) {
        await dev.open();
      }

      this.device = dev;
      this.connectionType = 'usb';
      this.isConnected = true;
      this.deviceName = dev.productName || 'LEGO EV3';

      this.device.removeEventListener('inputreport', this.boundHandleInputReport);
      this.device.addEventListener('inputreport', this.boundHandleInputReport);

      this.onLog(`Bloco EV3 USB conectado com sucesso! Identificando robô...`, 'success');

      try {
        await this.queryDeviceInfo();
      } catch (infoErr) {
        console.warn('Não foi possível ler todos os dados de telemetria do EV3:', infoErr);
      }

      // Sinal sonoro de boas-vindas no Bloco físico (Fanfarra rápida E5 -> A5)
      try {
        await this.sendBeep(659, 140);
        await new Promise(r => setTimeout(r, 140));
        await this.sendBeep(880, 200);
        await this.sendLED(1); // LED verde aceso
      } catch (beepErr) {
        console.warn('Beep de inicialização falhou:', beepErr);
      }

      const statusObj = {
        connected: true,
        type: 'usb',
        name: this.brickName ? `LEGO EV3 (${this.brickName})` : this.deviceName,
        port: 'USB HID (Porta PC)',
        battery: this.batteryLevel,
        firmware: this.firmwareVersion,
        brickName: this.brickName
      };

      this.onStateChange(statusObj);

      const battText = this.batteryLevel !== null ? ` | Bateria: ${this.batteryLevel}%` : '';
      const fwText = this.firmwareVersion ? ` | FW: ${this.firmwareVersion}` : '';
      this.onLog(`EV3 Conectado e Pronto! Nome: ${this.brickName}${battText}${fwText}`, 'success');

      return { success: true, type: 'usb', details: statusObj };
    } catch (err) {
      this.onLog(`Falha na conexão USB: ${err.message}`, 'error');
      throw err;
    }
  }

  /**
   * Conecta ao Bloco EV3 físico pareado via Bluetooth usando a Web Serial API.
   */
  async connectBluetooth() {
    if (!this.isWebSerialSupported()) {
      throw new Error('A Web Serial API não é suportada neste navegador. Utilize Google Chrome, Microsoft Edge ou Opera.');
    }

    try {
      this.onLog('Solicitando porta Serial / Bluetooth do EV3 ao usuário...', 'info');
      const port = await navigator.serial.requestPort();

      await port.open({ baudRate: 115200 });

      this.serialPort = port;
      this.serialWriter = port.writable ? port.writable.getWriter() : null;
      this.connectionType = 'bluetooth';
      this.isConnected = true;
      this.deviceName = 'LEGO EV3 (Bluetooth)';

      this.onLog('Bloco EV3 conectado via Bluetooth com sucesso!', 'success');

      try {
        await this.sendBeep(880, 200);
        await this.sendLED(1);
      } catch (e) {
        console.warn('Erro ao enviar sinal inicial via Bluetooth:', e);
      }

      const statusObj = {
        connected: true,
        type: 'bluetooth',
        name: this.deviceName,
        port: 'Bluetooth Serial (RFCOMM)',
        battery: this.batteryLevel,
        firmware: this.firmwareVersion,
        brickName: this.brickName
      };

      this.onStateChange(statusObj);
      return { success: true, type: 'bluetooth', details: statusObj };
    } catch (err) {
      this.onLog(`Falha ao conectar via Bluetooth: ${err.message}`, 'error');
      throw err;
    }
  }

  /**
   * Trata pacotes de resposta recebidos do Bloco EV3 (USB HID Input Report).
   */
  handleInputReport(event) {
    const { data } = event;
    if (!data || data.byteLength < 5) return;

    const counter = data.getUint8(2) | (data.getUint8(3) << 8);
    const replyType = data.getUint8(4);

    if (this.pendingReplies.has(counter)) {
      const resolver = this.pendingReplies.get(counter);
      this.pendingReplies.delete(counter);
      resolver({ success: replyType === 0x02 || replyType === 0x03, data, replyType });
    }
  }

  /**
   * Envia um Comando Direto sem esperar resposta (0x80).
   * O buffer enviado pelo WebHID no Windows PRECISA ter exatamente 1024 bytes.
   */
  async sendDirectCommand(bytecodeArray, localBytes = 0, globalBytes = 0) {
    if (!this.isConnected) {
      throw new Error('Nenhum robô EV3 físico está conectado no momento.');
    }

    const payloadLen = 2 + 1 + 2 + bytecodeArray.length;
    const packet = new Uint8Array(2 + payloadLen);

    // 2 bytes tamanho (Little-Endian)
    packet[0] = payloadLen & 0xff;
    packet[1] = (payloadLen >> 8) & 0xff;

    // 2 bytes contador de mensagem
    const counter = this.msgCounter++ & 0xffff;
    packet[2] = counter & 0xff;
    packet[3] = (counter >> 8) & 0xff;

    // 1 byte tipo de comando (0x80: Direct Command sem resposta)
    packet[4] = 0x80;

    // 2 bytes alocação de variáveis globais e locais:
    // bits 0-7 de globais em byte 5, bits 8-9 de globais em bits 0-1 de byte 6, bits 0-5 de locais em bits 2-7 de byte 6
    packet[5] = globalBytes & 0xff;
    packet[6] = ((localBytes & 0x3f) << 2) | ((globalBytes >> 8) & 0x03);

    // Bytecode
    packet.set(bytecodeArray, 7);

    if (this.connectionType === 'usb' && this.device) {
      const hidBuffer = new Uint8Array(1024);
      hidBuffer.set(packet, 0);
      await this.device.sendReport(0, hidBuffer);
    } else if (this.connectionType === 'bluetooth' && this.serialWriter) {
      await this.serialWriter.write(packet);
    }
  }

  /**
   * Envia um Comando Direto que requer resposta (0x00) e aguarda o retorno.
   */
  async sendDirectCommandWithReply(bytecodeArray, globalAllocBytes = 32, timeoutMs = 1500) {
    if (!this.isConnected) {
      throw new Error('Nenhum robô EV3 físico está conectado.');
    }

    const payloadLen = 2 + 1 + 2 + bytecodeArray.length;
    const packet = new Uint8Array(2 + payloadLen);

    packet[0] = payloadLen & 0xff;
    packet[1] = (payloadLen >> 8) & 0xff;

    const counter = this.msgCounter++ & 0xffff;
    packet[2] = counter & 0xff;
    packet[3] = (counter >> 8) & 0xff;

    // 0x00 = Direct Command COM Resposta
    packet[4] = 0x00;

    packet[5] = globalAllocBytes & 0xff;
    packet[6] = (globalAllocBytes >> 8) & 0xff;

    packet.set(bytecodeArray, 7);

    const replyPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingReplies.delete(counter);
        resolve(null);
      }, timeoutMs);

      this.pendingReplies.set(counter, (res) => {
        clearTimeout(timer);
        resolve(res);
      });
    });

    if (this.connectionType === 'usb' && this.device) {
      const hidBuffer = new Uint8Array(1024);
      hidBuffer.set(packet, 0);
      await this.device.sendReport(0, hidBuffer);
    } else if (this.connectionType === 'bluetooth' && this.serialWriter) {
      await this.serialWriter.write(packet);
    }

    return await replyPromise;
  }

  /**
   * Envia um Comando de Sistema (0x01) com resposta (usado para transferência de arquivos).
   */
  async sendSystemCommandWithReply(payloadBytes, timeoutMs = 2000) {
    if (!this.isConnected) {
      throw new Error('Nenhum robô EV3 físico está conectado.');
    }

    const payloadLen = 2 + 1 + payloadBytes.length;
    const packet = new Uint8Array(2 + payloadLen);

    packet[0] = payloadLen & 0xff;
    packet[1] = (payloadLen >> 8) & 0xff;

    const counter = this.msgCounter++ & 0xffff;
    packet[2] = counter & 0xff;
    packet[3] = (counter >> 8) & 0xff;

    // 0x01 = System Command COM Resposta
    packet[4] = 0x01;

    packet.set(payloadBytes, 5);

    const replyPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingReplies.delete(counter);
        resolve(null);
      }, timeoutMs);

      this.pendingReplies.set(counter, (res) => {
        clearTimeout(timer);
        resolve(res);
      });
    });

    if (this.connectionType === 'usb' && this.device) {
      const hidBuffer = new Uint8Array(1024);
      hidBuffer.set(packet, 0);
      await this.device.sendReport(0, hidBuffer);
    } else if (this.connectionType === 'bluetooth' && this.serialWriter) {
      await this.serialWriter.write(packet);
    }

    return await replyPromise;
  }

  /**
   * Consulta Nome do Bloco, Versão de Firmware e Nível da Bateria do EV3.
   */
  async queryDeviceInfo() {
    if (!this.isConnected || this.connectionType !== 'usb') return;

    // 1. Nome do Bloco (opCOM_GET, GET_BRICKNAME)
    try {
      const cmdName = [0xD3, 0x0D, 0x20, 0x60];
      const repName = await this.sendDirectCommandWithReply(cmdName, 32, 1000);
      if (repName && repName.data && repName.data.byteLength >= 6) {
        let nameStr = '';
        for (let i = 5; i < Math.min(37, repName.data.byteLength); i++) {
          const code = repName.data.getUint8(i);
          if (code === 0) break;
          nameStr += String.fromCharCode(code);
        }
        if (nameStr) this.brickName = nameStr.trim();
      }
    } catch (e) {
      console.warn('Erro ao consultar nome do bloco:', e);
    }

    // 2. Versão do Firmware (opUI_READ, GET_FW_VERS)
    try {
      const cmdFw = [0x81, 0x0A, 0x10, 0x60];
      const repFw = await this.sendDirectCommandWithReply(cmdFw, 16, 1000);
      if (repFw && repFw.data && repFw.data.byteLength >= 6) {
        let fwStr = '';
        for (let i = 5; i < Math.min(21, repFw.data.byteLength); i++) {
          const code = repFw.data.getUint8(i);
          if (code === 0) break;
          fwStr += String.fromCharCode(code);
        }
        if (fwStr) this.firmwareVersion = fwStr.trim();
      }
    } catch (e) {
      console.warn('Erro ao consultar versão do firmware:', e);
    }

    // 3. Nível da Bateria (opUI_READ, GET_LBATT)
    try {
      const cmdBatt = [0x81, 0x12, 0x60];
      const repBatt = await this.sendDirectCommandWithReply(cmdBatt, 1, 1000);
      if (repBatt && repBatt.data && repBatt.data.byteLength >= 6) {
        this.batteryLevel = repBatt.data.getUint8(5);
      }
    } catch (e) {
      console.warn('Erro ao consultar bateria:', e);
    }
  }

  /**
   * Toca um tom sonoro no Bloco Inteligente EV3 físico.
   */
  async sendBeep(frequency = 523, durationMs = 250, volume = 50) {
    if (!this.isConnected) return;
    try {
      const vol = Math.max(0, Math.min(100, volume));
      const freqLow = frequency & 0xff;
      const freqHigh = (frequency >> 8) & 0xff;
      const durLow = durationMs & 0xff;
      const durHigh = (durationMs >> 8) & 0xff;

      const bytes = [
        0x94, 0x01,              // opSOUND, TONE
        0x81, vol,               // Volume
        0x82, freqLow, freqHigh, // Frequência (2 bytes)
        0x82, durLow, durHigh,   // Duração ms (2 bytes)
        0x96                     // opSOUND_READY (aguarda término do tom)
      ];

      await this.sendDirectCommand(new Uint8Array(bytes));
    } catch (e) {
      console.warn('Falha ao enviar som ao EV3:', e);
    }
  }

  /**
   * Controla os LEDs frontais do Bloco EV3 físico.
   * Suporta números (0 a 6) ou nomes: 'green', 'red', 'orange', 'green_pulse', 'red_pulse', 'orange_pulse', 'off'.
   */
  async sendLED(pattern = 1) {
    if (!this.isConnected) return;
    let code = pattern;
    if (typeof pattern === 'string') {
      const p = pattern.toLowerCase();
      if (p === 'off' || p === '0') code = 0;
      else if (p.includes('red')) code = p.includes('pulse') ? 5 : 2;
      else if (p.includes('orange') || p.includes('yellow')) code = p.includes('pulse') ? 6 : 3;
      else code = p.includes('pulse') ? 4 : 1;
    }
    try {
      const bytes = [0x82, 0x1B, Number(code) & 0x07];
      await this.sendDirectCommand(new Uint8Array(bytes));
    } catch (e) {
      console.warn('Falha ao acionar LED no EV3:', e);
    }
  }

  /**
   * Move os motores B e C por rotações (com codificação exata EV3 Bytecode).
   */
  async sendMoveForRotations(direction = 'forward', rotations = 1, speed = 50) {
    if (!this.isConnected) return;
    try {
      const s = Math.max(1, Math.min(100, Math.round(speed)));
      const signedSpeed = direction === 'backward' ? -s : s;
      const totalDegrees = Math.max(1, Math.round(Math.abs(rotations) * 360));

      const degLow = totalDegrees & 0xff;
      const degHigh = (totalDegrees >> 8) & 0xff;

      // opOUTPUT_STEP_SYNC (0xB0):
      // layer 0, ports 6 (B+C), speed, turn 0 (reto sincronizado), degrees, brake 1
      const bytes = [
        0xB0, 0x00, 0x06, 0x81, signedSpeed & 0xff, 0x82, 0x00, 0x00, 0x82, degLow, degHigh, 0x01,
        0xA6, 0x00, 0x06
      ];

      await this.sendDirectCommand(new Uint8Array(bytes));
    } catch (e) {
      console.warn('Falha ao mover motores no EV3:', e);
    }
  }

  /**
   * Aciona movimentação estilo Tanque para Portas B e C com graus específicos.
   */
  /**
   * Aciona movimentação com curva (Steering) por graus/rotações nos motores B+C com sincronismo por hardware.
   */
  async sendSteerFor(steering = 0, speed = 50, degrees = 360) {
    if (!this.isConnected) return;
    try {
      const spd = Math.max(-100, Math.min(100, Math.round(speed)));
      const steer = Math.max(-100, Math.min(100, Math.round(steering)));
      const deg = Math.max(1, Math.round(Math.abs(degrees)));
      const degLow = deg & 0xff;
      const degHigh = (deg >> 8) & 0xff;

      const turnVal = Math.max(-200, Math.min(200, Math.round(steer * 2)));
      const turnLow = turnVal & 0xff;
      const turnHigh = (turnVal >> 8) & 0xff;

      // opOUTPUT_STEP_SYNC (0xB0): layer 0, nos 6 (B+C), speed, turn, step, brake 1
      const bytes = [
        0xB0, 0x00, 0x06, 0x81, spd & 0xff, 0x82, turnLow, turnHigh, 0x82, degLow, degHigh, 0x01,
        0xA6, 0x00, 0x06
      ];

      await this.sendDirectCommand(new Uint8Array(bytes));
    } catch (e) {
      console.warn('Falha no comando Steer For EV3:', e);
    }
  }

  /**
   * Aciona movimentação estilo Tanque para Portas B e C com graus específicos.
   */
  async sendTankDriveFor(leftPct = 50, rightPct = 50, degrees = 360) {
    if (!this.isConnected) return;
    try {
      const deg = Math.max(1, Math.round(Math.abs(degrees)));
      const degLow = deg & 0xff;
      const degHigh = (deg >> 8) & 0xff;

      const sB = Math.max(-100, Math.min(100, Math.round(leftPct)));
      const sC = Math.max(-100, Math.min(100, Math.round(rightPct)));

      if (sB === sC) {
        // Movimento perfeitamente reto sincronizado via PID LMS2012
        const bytes = [
          0xB0, 0x00, 0x06, 0x81, sB & 0xff, 0x82, 0x00, 0x00, 0x82, degLow, degHigh, 0x01,
          0xA6, 0x00, 0x06
        ];
        await this.sendDirectCommand(new Uint8Array(bytes));
      } else {
        const maxSpd = Math.max(Math.abs(sB), Math.abs(sC));
        const dominantSpeed = Math.abs(sB) >= Math.abs(sC) ? sB : sC;
        let turnVal = 0;
        if (maxSpd > 0) {
          turnVal = Math.round(100 * (sB - sC) / maxSpd);
        }
        turnVal = Math.max(-200, Math.min(200, turnVal));
        const turnLow = turnVal & 0xff;
        const turnHigh = (turnVal >> 8) & 0xff;

        const bytes = [
          0xB0, 0x00, 0x06, 0x81, dominantSpeed & 0xff, 0x82, turnLow, turnHigh, 0x82, degLow, degHigh, 0x01,
          0xA6, 0x00, 0x06
        ];
        await this.sendDirectCommand(new Uint8Array(bytes));
      }
    } catch (e) {
      console.warn('Falha no comando Tank Drive EV3:', e);
    }
  }

  /**
   * Aciona movimentação contínua estilo Tanque para Portas B e C com velocidade percentual.
   */
  async sendTankDriveSpeed(leftPct = 50, rightPct = 50) {
    if (!this.isConnected) return;
    try {
      const sB = Math.max(-100, Math.min(100, Math.round(leftPct)));
      const sC = Math.max(-100, Math.min(100, Math.round(rightPct)));

      const bytes = [
        0xA5, 0x00, 0x02, 0x81, sB & 0xff, // Speed Motor B
        0xA5, 0x00, 0x04, 0x81, sC & 0xff, // Speed Motor C
        0xA6, 0x00, 0x06                   // Start B+C
      ];

      await this.sendDirectCommand(new Uint8Array(bytes));
    } catch (e) {
      console.warn('Falha ao definir velocidades tanque no EV3:', e);
    }
  }

  /**
   * Move os motores com direção (Curva / Steering).
   */
  async sendSteer(steering = 0, speed = 50) {
    if (!this.isConnected) return;
    try {
      const spd = Math.max(-100, Math.min(100, Math.round(speed)));
      const steer = Math.max(-100, Math.min(100, Math.round(steering)));

      let speedB = spd;
      let speedC = spd;

      if (steer > 0) {
        speedC = Math.round(spd * (1 - (steer / 50)));
      } else if (steer < 0) {
        speedB = Math.round(spd * (1 - (Math.abs(steer) / 50)));
      }

      const bytes = [
        0xA5, 0x00, 0x02, 0x81, speedB & 0xff, // Speed Motor B
        0xA5, 0x00, 0x04, 0x81, speedC & 0xff, // Speed Motor C
        0xA6, 0x00, 0x06                       // Start B+C
      ];

      await this.sendDirectCommand(new Uint8Array(bytes));
    } catch (e) {
      console.warn('Falha ao enviar curva ao EV3:', e);
    }
  }

  /**
   * Aciona o motor da garra / acessório na Porta A.
   */
  async sendClaw(rotations = 0.5, speed = 40) {
    if (!this.isConnected) return;
    try {
      const s = Math.max(1, Math.min(100, Math.round(speed)));
      const totalDegrees = Math.max(1, Math.round(Math.abs(rotations) * 360));
      const degLow = totalDegrees & 0xff;
      const degHigh = (totalDegrees >> 8) & 0xff;

      const bytes = [
        0xAE, 0x00, 0x01, 0x81, s & 0xff, 0x00, 0x82, degLow, degHigh, 0x00, 0x01,
        0xA6, 0x00, 0x01
      ];

      await this.sendDirectCommand(new Uint8Array(bytes));
    } catch (e) {
      console.warn('Falha ao acionar garra no EV3:', e);
    }
  }

  /**
   * Para os motores da Base Motriz e Portas auxiliares no robô físico,
   * e interrompe qualquer programa em execução no Bloco EV3.
   */
  async sendStopMotors() {
    if (!this.isConnected) return;
    try {
      const bytes = [0xA3, 0x00, 0x0F, 0x01]; // Para portas A, B, C, D (0x0F)
      await this.sendDirectCommand(new Uint8Array(bytes));
      await this.sendProgramStop();
    } catch (e) {
      console.warn('Falha ao parar motores no EV3:', e);
    }
  }

  /**
   * Interrompe a execução do programa em execução no Bloco EV3 (Slot 1).
   */
  async sendProgramStop() {
    if (!this.isConnected) return;
    try {
      const bytes = [0x02, 0x01]; // opPROGRAM_STOP (0x02), SLOT 1 (0x01)
      await this.sendDirectCommand(new Uint8Array(bytes), 0, 0);
    } catch (e) {
      console.warn('Falha ao interromper programa no EV3:', e);
    }
  }

  /**
   * Carrega e inicia a execução de um arquivo de programa .rbf gravado no Bloco EV3.
   * Utiliza opFILE LOAD_IMAGE (0xC0, 0x08) seguido de opPROGRAM_START (0x03) com slot 1.
   */
  async startRBFProgram(remotePath) {
    if (!this.isConnected) return false;
    try {
      await this.sendProgramStop();
      const pathEncoded = new TextEncoder().encode(remotePath + '\0');
      const lcs = [0x84, ...pathEncoded];
      const cmd = [
        0xC0, 0x08, 0x01,
        ...lcs,
        0xC0, 0xC4,
        0x03, 0x01, 0xC0, 0xC4, 0x00
      ];
      // Aloca 8 bytes locais (LV0 e LV4) para o carregador de imagem
      await this.sendDirectCommand(new Uint8Array(cmd), 8, 0);
      return true;
    } catch (e) {
      console.warn('Falha ao iniciar programa .rbf no EV3:', e);
      return false;
    }
  }

  /**
   * Converte um número decimal float32 para array de 4 bytes Little-Endian.
   */
  float32ToBytes(val) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, Number(val) || 0, true);
    return Array.from(new Uint8Array(buffer));
  }

  /**
   * Lê a distância medida pelo Sensor Ultrassônico físico em centímetros.
   */
  async readUltrasonicDistance(port = 4) {
    if (!this.isConnected) return null;
    try {
      const portNum = Math.max(0, Math.min(3, (parseInt(port, 10) || 4) - 1));
      // opINPUT_READSI (0x9D), LAYER 0, NO portNum, TYPE 0, MODE 0 (Distance CM), DEST global 0 (0x60)
      const cmd = [0x9D, 0x00, portNum, 0x00, 0x00, 0x60];
      const rep = await this.sendDirectCommandWithReply(cmd, 4, 300);
      if (rep && rep.data && rep.data.byteLength >= 9) {
        return rep.data.getFloat32(5, true);
      }
    } catch (e) {
      console.warn('Erro ao ler distância ultrassônica do EV3:', e);
    }
    return null;
  }

  /**
   * Lê a cor detectada pelo Sensor de Cor físico (Porta 3 padrão).
   */
  async readColorSensor(port = 3) {
    if (!this.isConnected) return null;
    try {
      const portNum = Math.max(0, Math.min(3, (parseInt(port, 10) || 3) - 1));
      // opINPUT_READ (0x9A), LAYER 0, NO portNum, TYPE 0, MODE 2 (Color ID), DEST global 0 (0x60)
      const cmd = [0x9A, 0x00, portNum, 0x00, 0x02, 0x60];
      const rep = await this.sendDirectCommandWithReply(cmd, 1, 300);
      if (rep && rep.data && rep.data.byteLength >= 6) {
        const colorId = rep.data.getUint8(5);
        const colorNames = ['none', 'black', 'blue', 'green', 'yellow', 'red', 'white', 'brown'];
        return colorNames[colorId] || 'none';
      }
    } catch (e) {}
    return null;
  }

  /**
   * Lê o estado do Sensor de Toque físico (Porta 1 padrão: true se pressionado).
   */
  async readTouchSensor(port = 1) {
    if (!this.isConnected) return false;
    try {
      const portNum = Math.max(0, Math.min(3, (parseInt(port, 10) || 1) - 1));
      const cmd = [0x9A, 0x00, portNum, 0x00, 0x00, 0x60];
      const rep = await this.sendDirectCommandWithReply(cmd, 1, 300);
      if (rep && rep.data && rep.data.byteLength >= 6) {
        return rep.data.getUint8(5) === 1;
      }
    } catch (e) {}
    return false;
  }

  /**
   * Lê o ângulo do Sensor Giroscópio físico em graus (Porta 2 padrão).
   */
  async readGyroAngle(port = 2) {
    if (!this.isConnected) return null;
    try {
      const portNum = Math.max(0, Math.min(3, (parseInt(port, 10) || 2) - 1));
      const cmd = [0x9D, 0x00, portNum, 0x00, 0x00, 0x60];
      const rep = await this.sendDirectCommandWithReply(cmd, 4, 300);
      if (rep && rep.data && rep.data.byteLength >= 9) {
        return rep.data.getFloat32(5, true);
      }
    } catch (e) {}
    return null;
  }

  /**
   * Converte o nome do botão do EV3 no código numérico oficial LMS2012:
   * 1: Cima (Up), 2: Centro (Enter), 3: Baixo (Down), 4: Direita (Right), 5: Esquerda (Left), 6: Voltar (Back), 7: Qualquer (Any)
   */
  getButtonCode(name) {
    const s = String(name || '').toLowerCase();
    if (s.includes('cima') || s.includes('up')) return 1;
    if (s.includes('centro') || s.includes('center') || s.includes('enter') || s.includes('meio')) return 2;
    if (s.includes('baixo') || s.includes('down')) return 3;
    if (s.includes('direita') || s.includes('right')) return 4;
    if (s.includes('esquerda') || s.includes('left')) return 5;
    if (s.includes('voltar') || s.includes('back')) return 6;
    return 7; // ANY_BUTTON
  }

  /**
   * Consulta o estado atual de um botão físico do Bloco EV3 (retorna true se pressionado).
   */
  async readBrickButton(button = 'centro') {
    if (!this.isConnected) return false;
    try {
      const code = this.getButtonCode(button);
      // opUI_BUTTON (0x83), PRESSED (0x09), buttonCode (1 byte), globalAlloc 0 (0x60)
      const cmd = [0x83, 0x09, code, 0x60];
      const rep = await this.sendDirectCommandWithReply(cmd, 1, 300);
      if (rep && rep.data && rep.data.byteLength >= 6) {
        return rep.data.getUint8(5) === 1;
      }
    } catch (e) {}
    return false;
  }

  /**
   * Teste de movimento: gira os motores B e C por 1 volta.
   */
  async testMotors() {
    if (!this.isConnected) {
      throw new Error('Conecte o Bloco EV3 antes de testar os motores.');
    }
    this.onLog('Executando teste dos motores B+C (1 rotação a 35%)...', 'info');
    await this.sendBeep(784, 150);
    await this.sendMoveForRotations('forward', 1, 35);
  }

  /**
   * Cria um diretório no sistema de arquivos do Bloco EV3 usando opCREATE_DIR (0x9B).
   */
  async createDirectory(dirPath) {
    if (!this.isConnected) return false;
    try {
      const cleanPath = dirPath.replace(/\/+$/, '');
      const pathEncoded = new TextEncoder().encode(cleanPath + '\0');
      const payload = new Uint8Array(1 + pathEncoded.length);
      payload[0] = 0x9B; // CREATE_DIR
      payload.set(pathEncoded, 1);

      const reply = await this.sendSystemCommandWithReply(payload, 1500);
      return reply !== null;
    } catch (e) {
      console.warn('Falha ao criar diretório no EV3:', e);
      return false;
    }
  }

  /**
   * Grava um arquivo no sistema de arquivos do Bloco EV3 usando BEGIN_DOWNLOAD (0x92) e CONTINUE_DOWNLOAD (0x93).
   */
  async downloadFileToBrick(remotePath, fileBytes, onProgress = () => {}) {
    if (!this.isConnected) return false;

    try {
      // 1. Assegura criação de pastas pai se existirem
      const lastSlash = remotePath.lastIndexOf('/');
      if (lastSlash > 0) {
        const parentDir = remotePath.substring(0, lastSlash);
        await this.createDirectory(parentDir);
      }

      const fileSize = fileBytes.length;
      const pathEncoded = new TextEncoder().encode(remotePath + '\0');

      const beginPayload = new Uint8Array(1 + 4 + pathEncoded.length);
      beginPayload[0] = 0x92; // BEGIN_DOWNLOAD
      beginPayload[1] = fileSize & 0xff;
      beginPayload[2] = (fileSize >> 8) & 0xff;
      beginPayload[3] = (fileSize >> 16) & 0xff;
      beginPayload[4] = (fileSize >> 24) & 0xff;
      beginPayload.set(pathEncoded, 5);

      const reply = await this.sendSystemCommandWithReply(beginPayload, 2500);
      if (!reply || !reply.success || reply.data.byteLength < 8) {
        this.onLog(`Tentativa de criar arquivo ${remotePath} respondeu: ${reply ? 'erro de status' : 'tempo esgotado'}`, 'warning');
        return false;
      }

      const status = reply.data.getUint8(6);
      if (status !== 0x00) {
        this.onLog(`Aviso: EV3 retornou status ${status} ao iniciar download de ${remotePath}`, 'warning');
        return false;
      }

      const handle = reply.data.getUint8(7);

      // Envia os dados em chunks de 900 bytes
      const chunkSize = 900;
      let offset = 0;

      while (offset < fileSize) {
        const chunk = fileBytes.subarray(offset, Math.min(offset + chunkSize, fileSize));
        const continuePayload = new Uint8Array(2 + chunk.length);
        continuePayload[0] = 0x93; // CONTINUE_DOWNLOAD
        continuePayload[1] = handle;
        continuePayload.set(chunk, 2);

        await this.sendSystemCommandWithReply(continuePayload, 2000);
        offset += chunkSize;
        const pct = Math.min(100, Math.round((offset / fileSize) * 100));
        onProgress(pct, `Gravando ${pct}%...`);
      }

      return true;
    } catch (e) {
      console.warn('Falha ao transferir arquivo para o EV3:', e);
      return false;
    }
  }

  /**
   * Gera um arquivo executável nativo do LEGO EV3 (.rbf - Robot Bytecode File)
   * que aparece diretamente no menu LCD do Bloco EV3 na pasta de projetos.
   */
  generateRBF(workspace, projectName = 'RoboSim') {
    const bytecodes = this.compileWorkspaceToEV3Bytecode(workspace, true);
    if (!bytecodes || bytecodes.length === 0) {
      // Bytecode padrão caso nenhum bloco esteja encadeado
      bytecodes.push(
        0x94, 0x01, 0x81, 0x32, 0x82, 0x70, 0x03, 0x82, 0xC8, 0x00, 0x96,
        0x0A
      );
    }

    const headerLen = 16 + 12; // IMGHEAD (16) + OBJHEAD (12) = 28 bytes
    const totalSize = headerLen + bytecodes.length;
    const rbf = new Uint8Array(totalSize);

    // IMGHEAD (16 bytes)
    // 0..3: 'LEGO'
    rbf[0] = 0x4C; rbf[1] = 0x45; rbf[2] = 0x47; rbf[3] = 0x4F;
    // 4..7: ImageSize (uint32 Little-Endian)
    rbf[4] = totalSize & 0xFF;
    rbf[5] = (totalSize >> 8) & 0xFF;
    rbf[6] = (totalSize >> 16) & 0xFF;
    rbf[7] = (totalSize >> 24) & 0xFF;
    // 8..9: VersionInfo = 0x0101 (1.01)
    rbf[8] = 0x01; rbf[9] = 0x01;
    // 10..11: NumberOfObjects = 1
    rbf[10] = 0x01; rbf[11] = 0x00;
    // 12..15: GlobalBytes = 0
    rbf[12] = 0x00; rbf[13] = 0x00; rbf[14] = 0x00; rbf[15] = 0x00;

    // OBJHEAD (12 bytes)
    // 16..19: OffsetToInstructions = 28
    rbf[16] = 28; rbf[17] = 0; rbf[18] = 0; rbf[19] = 0;
    // 20..21: OwnerObjectId = 0
    rbf[20] = 0; rbf[21] = 0;
    // 22..23: TriggerCount = 0
    rbf[22] = 0; rbf[23] = 0;
    // 24..27: LocalBytes = 8 (aloca 8 bytes para temporizadores LV0 e LV4)
    rbf[24] = 8; rbf[25] = 0; rbf[26] = 0; rbf[27] = 0;

    // Bytecodes das instruções a partir do byte 28
    rbf.set(bytecodes, 28);

    return rbf;
  }

  /**
   * Compila o workspace atual em uma sequência de bytecodes EV3 pronta para execução.
   * Se forRbf = true, adiciona opOBJECT_END (0x0A) no final.
   */
  compileWorkspaceToEV3Bytecode(workspace, forRbf = false) {
    const bytecodes = [];
    if (!workspace) return bytecodes;

    let startFirstId = null;
    const startHats = typeof workspace.getStartHatBlocks === 'function' ? workspace.getStartHatBlocks() : [];
    if (startHats && startHats.length > 0) {
      const firstHat = startHats[0];
      // Se for when_brick_button, deve executar o próprio hat para esperar pelo botão antes de continuar!
      startFirstId = (firstHat.type === 'when_brick_button') ? firstHat.id : firstHat.nextId;
    } else {
      // Procura primeiro bloco no topo sem bloco anterior
      if (workspace.blocks && workspace.blocks instanceof Map) {
        for (const [id, blk] of workspace.blocks) {
          if (!blk.prevId && !blk.parentCId && (blk.type && (blk.type.startsWith('when_') || blk.shape === 'hat'))) {
            startFirstId = (blk.type === 'when_brick_button') ? blk.id : blk.nextId;
            break;
          }
        }
        if (!startFirstId) {
          for (const [id, blk] of workspace.blocks) {
            if (!blk.prevId && !blk.parentCId) {
              startFirstId = id;
              break;
            }
          }
        }
      }
    }

    if (!startFirstId) return bytecodes;

    // Beep inicial de início de programa (dois tons rápidos 523Hz -> 784Hz)
    bytecodes.push(
      0x94, 0x01, 0x81, 0x32, 0x82, 0x0B, 0x02, 0x82, 0x64, 0x00, 0x96,
      0x94, 0x01, 0x81, 0x32, 0x82, 0x10, 0x03, 0x82, 0x96, 0x00, 0x96
    );

    let defaultSpeed = 50;

    const compileChain = (firstId) => {
      let currId = firstId;
      while (currId && workspace.blocks && workspace.blocks.has(currId)) {
        const blk = workspace.blocks.get(currId);
        const p = blk.params || {};

        switch (blk.type) {
          case 'move_set_speed': {
            defaultSpeed = Math.max(1, Math.min(100, Number(p.speed) || 50));
            break;
          }

          case 'move_direction_for': {
            const dir = p.direction === 'backward' ? 'backward' : 'forward';
            const s = Math.max(1, Math.min(100, Math.round(defaultSpeed)));
            const signedSpeed = dir === 'backward' ? -s : s;
            const amt = Math.max(0, Number(p.amount) || 1);
            let degrees = 360;
            if (p.unit === 'degrees') degrees = Math.round(amt);
            else if (p.unit === 'seconds') degrees = Math.round(amt * s * 7.2);
            else degrees = Math.round(amt * 360);

            const degL = degrees & 0xff;
            const degH = (degrees >> 8) & 0xff;

            // opOUTPUT_STEP_SYNC (0xB0): layer 0, nos 6 (B+C), speed, turn 0 (reto rigoroso), step, brake 1
            bytecodes.push(
              0xB0, 0x00, 0x06, 0x81, signedSpeed & 0xff, 0x82, 0x00, 0x00, 0x82, degL, degH, 0x01,
              0xA6, 0x00, 0x06,
              0xAA, 0x00, 0x06
            );
            break;
          }

          case 'move_steer_for':
          case 'move_steer_for_at_speed': {
            const steer = Number(p.steering) || 0;
            const spd = blk.type === 'move_steer_for_at_speed' ? (Number(p.speed) || defaultSpeed) : defaultSpeed;
            const amt = Math.max(0, Number(p.amount) || 1);
            let degrees = Math.round(amt * 360);
            if (p.unit === 'degrees') degrees = Math.round(amt);

            const degL = degrees & 0xff;
            const degH = (degrees >> 8) & 0xff;

            // Turn no LMS2012: -200 a +200. No simulador steering vai de -100 a +100.
            // steer * 2 converte com precisão: 0 = reto, 100 = curva de raio fixo, 200 = rotação no próprio eixo.
            const turnVal = Math.max(-200, Math.min(200, Math.round(steer * 2)));
            const turnL = turnVal & 0xff;
            const turnH = (turnVal >> 8) & 0xff;

            // opOUTPUT_STEP_SYNC (0xB0): layer 0, nos 6 (B+C), speed, turn, step, brake 1
            // Sincroniza via hardware PID os motores B e C; quando atingir o passo, freia ambos imediatamente.
            bytecodes.push(
              0xB0, 0x00, 0x06, 0x81, spd & 0xff, 0x82, turnL, turnH, 0x82, degL, degH, 0x01,
              0xA6, 0x00, 0x06,
              0xAA, 0x00, 0x06
            );
            break;
          }

          case 'move_start_steer':
          case 'move_start_steer_at_speed': {
            const steer = Number(p.steering) || 0;
            const spd = blk.type === 'move_start_steer_at_speed' ? (Number(p.speed) || defaultSpeed) : defaultSpeed;
            let spdB = spd;
            let spdC = spd;
            if (steer > 0) spdC = Math.round(spd * (1 - (steer / 50)));
            else if (steer < 0) spdB = Math.round(spd * (1 - (Math.abs(steer) / 50)));

            bytecodes.push(
              0xA5, 0x00, 0x02, 0x81, spdB & 0xff,
              0xA5, 0x00, 0x04, 0x81, spdC & 0xff,
              0xA6, 0x00, 0x06
            );
            break;
          }

          case 'move_start': {
            const dir = p.direction === 'backward' ? 'backward' : 'forward';
            const s = Math.max(1, Math.min(100, Math.round(defaultSpeed)));
            const signedSpeed = dir === 'backward' ? -s : s;

            bytecodes.push(
              0xA5, 0x00, 0x06, 0x81, signedSpeed & 0xff,
              0xA6, 0x00, 0x06
            );
            break;
          }

          case 'move_tank_for_at_speeds': {
            const leftSpd = Math.max(-100, Math.min(100, Number(p.leftSpeed) || 0));
            const rightSpd = Math.max(-100, Math.min(100, Number(p.rightSpeed) || 0));
            const amt = Math.max(0, Number(p.amount) || 1);
            let degrees = Math.round(amt * 360);
            if (p.unit === 'degrees') degrees = Math.round(amt);
            const degL = degrees & 0xff;
            const degH = (degrees >> 8) & 0xff;

            if (leftSpd === rightSpd) {
              bytecodes.push(
                0xB0, 0x00, 0x06, 0x81, leftSpd & 0xff, 0x82, 0x00, 0x00, 0x82, degL, degH, 0x01,
                0xA6, 0x00, 0x06,
                0xAA, 0x00, 0x06
              );
            } else {
              const maxSpd = Math.max(Math.abs(leftSpd), Math.abs(rightSpd));
              const dominantSpeed = Math.abs(leftSpd) >= Math.abs(rightSpd) ? leftSpd : rightSpd;
              let turnVal = 0;
              if (maxSpd > 0) {
                turnVal = Math.round(100 * (leftSpd - rightSpd) / maxSpd);
              }
              turnVal = Math.max(-200, Math.min(200, turnVal));
              const turnL = turnVal & 0xff;
              const turnH = (turnVal >> 8) & 0xff;

              bytecodes.push(
                0xB0, 0x00, 0x06, 0x81, dominantSpeed & 0xff, 0x82, turnL, turnH, 0x82, degL, degH, 0x01,
                0xA6, 0x00, 0x06,
                0xAA, 0x00, 0x06
              );
            }
            break;
          }

          case 'move_start_tank_at_speeds': {
            const leftSpd = Math.max(-100, Math.min(100, Number(p.leftSpeed) || 0));
            const rightSpd = Math.max(-100, Math.min(100, Number(p.rightSpeed) || 0));

            bytecodes.push(
              0xA5, 0x00, 0x02, 0x81, leftSpd & 0xff,
              0xA5, 0x00, 0x04, 0x81, rightSpd & 0xff,
              0xA6, 0x00, 0x06
            );
            break;
          }

          case 'move_stop': {
            bytecodes.push(0xA3, 0x00, 0x06, 0x01);
            break;
          }

          case 'sound_beep':
          case 'sound_beep_for': {
            let note = Number(p.note) || 60;
            if (note < 130) {
              note = Math.round(440 * Math.pow(2, (note - 69) / 12));
            }
            const durMs = Math.round((Number(p.duration || p.seconds) || 0.25) * 1000);
            const fL = note & 0xff;
            const fH = (note >> 8) & 0xff;
            const dL = durMs & 0xff;
            const dH = (durMs >> 8) & 0xff;
            bytecodes.push(
              0x94, 0x01, 0x81, 0x32, 0x82, fL, fH, 0x82, dL, dH,
              0x96
            );
            break;
          }

          case 'sound_play_start': {
            let note = Number(p.note) || 659;
            if (note < 130) {
              note = Math.round(440 * Math.pow(2, (note - 69) / 12));
            }
            const fL = note & 0xff;
            const fH = (note >> 8) & 0xff;
            bytecodes.push(
              0x94, 0x01, 0x81, 0x32, 0x82, fL, fH, 0x82, 0xC8, 0x00
            );
            break;
          }

          case 'motor_run_for':
          case 'motor_run_for_at_speed': {
            const port = (p.port || 'A').toUpperCase();
            const portBit = port === 'A' ? 0x01 : (port === 'B' ? 0x02 : (port === 'C' ? 0x04 : 0x08));
            const spd = Number(p.speed) || 40;
            const amt = Math.max(0, Number(p.amount) || 1);
            const degrees = Math.round(amt * 360);
            const degL = degrees & 0xff;
            const degH = (degrees >> 8) & 0xff;
            bytecodes.push(
              0xAE, 0x00, portBit, 0x81, spd & 0xff, 0x00, 0x82, degL, degH, 0x00, 0x01,
              0xA6, 0x00, portBit,
              0xAA, 0x00, portBit
            );
            break;
          }

          case 'motor_start':
          case 'motor_start_at_speed': {
            const port = (p.port || 'A').toUpperCase();
            const portBit = port === 'A' ? 0x01 : (port === 'B' ? 0x02 : (port === 'C' ? 0x04 : 0x08));
            const spd = Number(p.speed) || 40;
            bytecodes.push(
              0xA5, 0x00, portBit, 0x81, spd & 0xff,
              0xA6, 0x00, portBit
            );
            break;
          }

          case 'motor_stop': {
            const port = (p.port || 'A').toUpperCase();
            const portBit = port === 'A' ? 0x01 : (port === 'B' ? 0x02 : (port === 'C' ? 0x04 : 0x08));
            bytecodes.push(0xA3, 0x00, portBit, 0x01);
            break;
          }

          case 'brick_status_light': {
            const col = String(p.lightColor || p.color || 'green').toLowerCase();
            let pattern = 1;
            if (col.includes('red')) pattern = col.includes('pulse') ? 5 : 2;
            else if (col.includes('orange') || col.includes('yellow')) pattern = col.includes('pulse') ? 6 : 3;
            else pattern = col.includes('pulse') ? 4 : 1;
            bytecodes.push(0x82, 0x1B, pattern);
            break;
          }

          case 'brick_status_light_off': {
            bytecodes.push(0x82, 0x1B, 0x00);
            break;
          }

          case 'control_wait': {
            const secs = Math.max(0.05, Number(p.seconds) || 1);
            const ms = Math.round(secs * 1000);
            const msL = ms & 0xff;
            const msH = (ms >> 8) & 0xff;
            // opTIMER_WAIT (0x85), LC2(ms), LV0 (0xC0)
            // opTIMER_READY (0x86), LV0 (0xC0)
            bytecodes.push(
              0x85, 0x82, msL, msH, 0xC0,
              0x86, 0xC0
            );
            break;
          }

          case 'control_repeat': {
            const times = Math.max(1, Math.min(20, Math.round(Number(p.times) || 1)));
            for (let r = 0; r < times; r++) {
              if (blk.substackId) {
                compileChain(blk.substackId);
              }
            }
            break;
          }

          // ==================== SENSORES (ESPERA NO BLOCO EV3) ====================
          case 'sensor_wait_distance': {
            const portNum = Math.max(0, Math.min(3, (parseInt(p.port, 10) || 4) - 1));
            const rawDist = Number(p.distance) !== undefined && p.distance !== '' ? Number(p.distance) : 15;
            const threshCm = p.unit === 'inch' ? rawDist * 2.54 : rawDist;
            const fBytes = this.float32ToBytes(threshCm);
            const jumpOp = p.comparator === 'gt' ? 0x77 : (p.comparator === 'eq' ? 0x73 : 0x7B);

            // Loop de espera a cada 40ms:
            // a. opTIMER_WAIT 40ms no LV4 (5 bytes)
            // b. opTIMER_READY no LV4 (2 bytes)
            // c. opINPUT_READSI (0x9D), LAYER 0, PORT portNum, TYPE 0, MODE 0, DEST LV0 (6 bytes)
            // d. jumpOp, LEFT LV0, RIGHT float LC4, OFFSET LC2 (-23) (10 bytes)
            // Total = 23 bytes. Salto de -23 bytes: 0xE9, 0xFF
            bytecodes.push(
              0x85, 0x82, 0x28, 0x00, 0xC4,
              0x86, 0xC4,
              0x9D, 0x00, portNum, 0x00, 0x00, 0xC0,
              jumpOp, 0xC0, 0x83, fBytes[0], fBytes[1], fBytes[2], fBytes[3], 0x82, 0xE9, 0xFF
            );
            break;
          }

          case 'sensor_wait_color': {
            const portNum = Math.max(0, Math.min(3, (parseInt(p.port, 10) || 3) - 1));
            const colorMap = { black: 1, blue: 2, green: 3, yellow: 4, red: 5, white: 6, brown: 7 };
            const targetId = colorMap[String(p.color || 'black').toLowerCase()] || 1;

            // Loop de espera: opINPUT_READ (0x9A) em modo 2 (Color ID)
            // Total = 20 bytes. Salto de -20 bytes: 0xEC, 0xFF
            bytecodes.push(
              0x85, 0x82, 0x28, 0x00, 0xC4,
              0x86, 0xC4,
              0x9A, 0x00, portNum, 0x00, 0x02, 0xC0,
              0x70, 0xC0, 0x81, targetId, 0x82, 0xEC, 0xFF
            );
            break;
          }

          case 'sensor_wait_touch': {
            const portNum = Math.max(0, Math.min(3, (parseInt(p.port, 10) || 1) - 1));
            // Loop enquanto não pressionado (LV0 == 0)
            bytecodes.push(
              0x85, 0x82, 0x28, 0x00, 0xC4,
              0x86, 0xC4,
              0x9A, 0x00, portNum, 0x00, 0x00, 0xC0,
              0x6C, 0xC0, 0x00, 0x82, 0xEC, 0xFF
            );
            break;
          }

          case 'sensor_wait_gyro': {
            const portNum = Math.max(0, Math.min(3, (parseInt(p.port, 10) || 2) - 1));
            const targetAngle = Number(p.angle) || 90;
            const fBytes = this.float32ToBytes(targetAngle);
            const jumpOp = p.comparator === 'lt' ? 0x7B : 0x77;

            bytecodes.push(
              0x85, 0x82, 0x28, 0x00, 0xC4,
              0x86, 0xC4,
              0x9D, 0x00, portNum, 0x00, 0x00, 0xC0,
              jumpOp, 0xC0, 0x83, fBytes[0], fBytes[1], fBytes[2], fBytes[3], 0x82, 0xE9, 0xFF
            );
            break;
          }

          case 'sensor_reset_gyro': {
            const portNum = Math.max(0, Math.min(3, (parseInt(p.port, 10) || 2) - 1));
            bytecodes.push(0x9A, 0x00, portNum, 0x00, 0x01, 0xC0);
            break;
          }

          // ==================== BOTÕES DO BLOCO EV3 ====================
          case 'when_brick_button':
          case 'sensor_wait_brick_button': {
            const btn = p.button || 'centro';
            const action = (blk.type === 'when_brick_button' ? p.action : (p.state || p.action)) || 'pressionado';
            const btnCode = this.getButtonCode(btn);

            // Flush inicial de eventos residuais do teclado do EV3
            bytecodes.push(0x83, 0x04);

            if (action === 'pressionado') {
              // 1. Se o botão já estiver pressionado (ex: o usuário clicou para rodar o arquivo no menu EV3),
              // espera o usuário soltar o botão antes de monitorar o novo clique (LV0 != 0)
              bytecodes.push(
                0x85, 0x82, 0x28, 0x00, 0xC4,
                0x86, 0xC4,
                0x83, 0x09, btnCode, 0xC0,
                0x70, 0xC0, 0x00, 0x82, 0xEF, 0xFF
              );

              // 2. Aguarda o botão ser pressionado (LV0 == 0)
              bytecodes.push(
                0x85, 0x82, 0x28, 0x00, 0xC4,
                0x86, 0xC4,
                0x83, 0x09, btnCode, 0xC0,
                0x6C, 0xC0, 0x00, 0x82, 0xEF, 0xFF
              );
            } else {
              // Aguarda ser liberado (LV0 != 0)
              bytecodes.push(
                0x85, 0x82, 0x28, 0x00, 0xC4,
                0x86, 0xC4,
                0x83, 0x09, btnCode, 0xC0,
                0x70, 0xC0, 0x00, 0x82, 0xEF, 0xFF
              );
            }

            // Beep sonoro de confirmação (880Hz, 80ms) e flush final
            bytecodes.push(
              0x94, 0x01, 0x81, 0x32, 0x82, 0x70, 0x03, 0x82, 0x50, 0x00, 0x96,
              0x83, 0x04
            );
            break;
          }

          // ==================== CONTROLE AVANÇADO ====================
          case 'control_wait_until': {
            const condId = p.condition;
            const condBlk = condId && workspace.blocks ? workspace.blocks.get(condId) : null;
            if (condBlk) {
              if (condBlk.type === 'sensor_is_distance') {
                const cp = condBlk.params || {};
                const portNum = Math.max(0, Math.min(3, (parseInt(cp.port, 10) || 4) - 1));
                const rawDist = Number(cp.distance) !== undefined && cp.distance !== '' ? Number(cp.distance) : 15;
                const threshCm = cp.unit === 'inch' ? rawDist * 2.54 : rawDist;
                const fBytes = this.float32ToBytes(threshCm);
                const jumpOp = cp.comparator === 'gt' ? 0x77 : (cp.comparator === 'eq' ? 0x73 : 0x7B);

                bytecodes.push(
                  0x85, 0x82, 0x28, 0x00, 0xC4,
                  0x86, 0xC4,
                  0x9D, 0x00, portNum, 0x00, 0x00, 0xC0,
                  jumpOp, 0xC0, 0x83, fBytes[0], fBytes[1], fBytes[2], fBytes[3], 0x82, 0xE9, 0xFF
                );
              } else if (condBlk.type === 'sensor_is_color') {
                const cp = condBlk.params || {};
                const portNum = Math.max(0, Math.min(3, (parseInt(cp.port, 10) || 3) - 1));
                const colorMap = { black: 1, blue: 2, green: 3, yellow: 4, red: 5, white: 6, brown: 7 };
                const targetId = colorMap[String(cp.color || 'black').toLowerCase()] || 1;

                bytecodes.push(
                  0x85, 0x82, 0x28, 0x00, 0xC4,
                  0x86, 0xC4,
                  0x9A, 0x00, portNum, 0x00, 0x02, 0xC0,
                  0x70, 0xC0, 0x81, targetId, 0x82, 0xEC, 0xFF
                );
              } else if (condBlk.type === 'sensor_is_touch') {
                const cp = condBlk.params || {};
                const portNum = Math.max(0, Math.min(3, (parseInt(cp.port, 10) || 1) - 1));

                bytecodes.push(
                  0x85, 0x82, 0x28, 0x00, 0xC4,
                  0x86, 0xC4,
                  0x9A, 0x00, portNum, 0x00, 0x00, 0xC0,
                  0x6C, 0xC0, 0x00, 0x82, 0xEC, 0xFF
                );
              } else if (condBlk.type === 'sensor_is_gyro') {
                const cp = condBlk.params || {};
                const portNum = Math.max(0, Math.min(3, (parseInt(cp.port, 10) || 2) - 1));
                const targetAngle = Number(cp.angle) || 90;
                const fBytes = this.float32ToBytes(targetAngle);
                const jumpOp = cp.comparator === 'lt' ? 0x7B : 0x77;

                bytecodes.push(
                  0x85, 0x82, 0x28, 0x00, 0xC4,
                  0x86, 0xC4,
                  0x9D, 0x00, portNum, 0x00, 0x00, 0xC0,
                  jumpOp, 0xC0, 0x83, fBytes[0], fBytes[1], fBytes[2], fBytes[3], 0x82, 0xE9, 0xFF
                );
              } else if (condBlk.type === 'sensor_is_brick_button') {
                const cp = condBlk.params || {};
                const btnCode = this.getButtonCode(cp.button || 'centro');
                bytecodes.push(
                  0x85, 0x82, 0x28, 0x00, 0xC4,
                  0x86, 0xC4,
                  0x83, 0x09, btnCode, 0xC0,
                  0x6C, 0xC0, 0x00, 0x82, 0xEF, 0xFF
                );
              }
            }
            break;
          }

          case 'control_forever': {
            const startIdx = bytecodes.length;
            if (blk.substackId) {
              compileChain(blk.substackId);
            }
            bytecodes.push(
              0x85, 0x82, 0x19, 0x00, 0xC4,
              0x86, 0xC4
            );
            const loopLen = bytecodes.length - startIdx;
            const offset = -(loopLen + 3);
            bytecodes.push(0x40, 0x82, offset & 0xff, (offset >> 8) & 0xff);
            break;
          }

          case 'control_repeat_until': {
            const condId = p.condition;
            const condBlk = condId && workspace.blocks ? workspace.blocks.get(condId) : null;
            const startIdx = bytecodes.length;
            if (blk.substackId) {
              compileChain(blk.substackId);
            }
            if (condBlk && condBlk.type === 'sensor_is_distance') {
              const cp = condBlk.params || {};
              const portNum = Math.max(0, Math.min(3, (parseInt(cp.port, 10) || 4) - 1));
              const rawDist = Number(cp.distance) !== undefined && cp.distance !== '' ? Number(cp.distance) : 15;
              const threshCm = cp.unit === 'inch' ? rawDist * 2.54 : rawDist;
              const fBytes = this.float32ToBytes(threshCm);
              const jumpOp = cp.comparator === 'gt' ? 0x77 : (cp.comparator === 'eq' ? 0x73 : 0x7B);

              bytecodes.push(
                0x85, 0x82, 0x19, 0x00, 0xC4,
                0x86, 0xC4,
                0x9D, 0x00, portNum, 0x00, 0x00, 0xC0
              );
              const loopLen = bytecodes.length - startIdx;
              const offset = -(loopLen + 10);
              bytecodes.push(
                jumpOp, 0xC0, 0x83, fBytes[0], fBytes[1], fBytes[2], fBytes[3],
                0x82, offset & 0xff, (offset >> 8) & 0xff
              );
            }
            break;
          }

          case 'control_stop': {
            bytecodes.push(0xA3, 0x00, 0x0F, 0x01, 0x0A);
            break;
          }
        }

        currId = blk.nextId;
      }
    };

    compileChain(startFirstId);

    // Beep final de sucesso e parada dos motores
    bytecodes.push(
      0x94, 0x01, 0x81, 0x32, 0x82, 0x16, 0x04, 0x82, 0x2C, 0x01, 0x96,
      0xA3, 0x00, 0x0F, 0x01
    );

    if (forRbf) {
      // Finalizador de thread para arquivos binários .rbf
      bytecodes.push(0x0A); // opOBJECT_END
    }

    return bytecodes;
  }

  /**
   * Desconecta do Bloco EV3 físico.
   */
  async disconnect() {
    try {
      if (this.connectionType === 'usb' && this.device) {
        this.device.removeEventListener('inputreport', this.boundHandleInputReport);
        if (this.device.opened) {
          await this.sendLED(0);
          await this.device.close();
        }
      } else if (this.connectionType === 'bluetooth' && this.serialPort) {
        if (this.serialWriter) {
          this.serialWriter.releaseLock();
          this.serialWriter = null;
        }
        await this.serialPort.close();
      }
    } catch (err) {
      console.warn('Erro ao fechar conexão EV3:', err);
    } finally {
      this.device = null;
      this.serialPort = null;
      this.serialWriter = null;
      this.connectionType = 'none';
      this.isConnected = false;
      this.batteryLevel = null;
      this.firmwareVersion = null;
      this.pendingReplies.clear();
      this.onStateChange({ connected: false, type: 'none', name: 'Desconectado', port: null });
      this.onLog('Robô EV3 físico desconectado.', 'info');
    }
  }

  /**
   * Transfere o programa para o Robô EV3 e salva no sistema de arquivos do bloco.
   * Se autoRun for false (padrão), apenas salva na pasta de projetos sem executar.
   */
  async uploadProgram(programPayload, onProgress = () => {}, autoRun = false) {
    if (!this.isConnected) {
      throw new Error('Conecte o Bloco EV3 físico via USB antes de enviar a programação.');
    }

    if (this.connectionType === 'usb' && this.device && !this.device.opened) {
      await this.device.open();
    }

    const projName = programPayload.name || 'RoboSim';
    const safeName = projName.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 16) || 'RoboSim';

    this.onLog(`Iniciando compilação e download de "${projName}" para o Bloco EV3...`, 'info');
    onProgress(10, 'Compilando blocos em Bytecode LEGO EV3 (.rbf)...');

    // 1. Confirmação instantânea no robô físico: sinal sonoro duplo e LED piscante
    try {
      await this.sendLED(4); // Pisca em verde durante a transferência
      await this.sendBeep(659, 100);
      await new Promise(r => setTimeout(r, 110));
      await this.sendBeep(880, 160);
    } catch (e) {}

    // 2. Gera o arquivo nativo .rbf executável para o Bloco EV3
    const rbfBytes = this.generateRBF(programPayload.workspace, safeName);
    this.onLog(`Arquivo .rbf gerado com ${rbfBytes.length} bytes.`, 'info');

    onProgress(35, `Gravando ${safeName}.rbf na memória do Bloco EV3...`);

    // 3. Grava o .rbf no sistema de arquivos do EV3 na pasta de projetos
    const rbfRemotePath = `../prjs/RoboSim/${safeName}.rbf`;
    let fileUploaded = false;
    try {
      fileUploaded = await this.downloadFileToBrick(rbfRemotePath, rbfBytes, (pct, msg) => {
        onProgress(35 + Math.round(pct * 0.5), msg);
      });
      if (safeName !== 'RoboSim') {
        await this.downloadFileToBrick('../prjs/RoboSim/RoboSim.rbf', rbfBytes);
      }
      if (fileUploaded) {
        this.onLog(`Arquivo ${rbfRemotePath} gravado com sucesso no Bloco EV3!`, 'success');
      }
    } catch (fErr) {
      console.warn('Gravação flash retornou aviso:', fErr);
    }

    // 4. Se solicitado autoRun, inicia a execução do programa no robô
    if (autoRun) {
      onProgress(90, 'Iniciando execução do programa no Bloco EV3...');
      try {
        await this.startRBFProgram(rbfRemotePath);
      } catch (startErr) {
        console.warn('Falha ao iniciar .rbf no EV3:', startErr);
      }
    } else {
      onProgress(90, 'Programa gravado na pasta de projetos do Bloco EV3!');
    }

    // 5. Sinal sonoro de celebração de download concluído (Fanfarra C5 -> E5 -> G5 -> C6)
    try {
      await this.sendBeep(523, 100);
      await new Promise(r => setTimeout(r, 110));
      await this.sendBeep(659, 100);
      await new Promise(r => setTimeout(r, 110));
      await this.sendBeep(784, 100);
      await new Promise(r => setTimeout(r, 110));
      await this.sendBeep(1046, 220);
    } catch (bErr) {}

    await this.sendLED(1); // Verde fixo (Pronto)

    const finalMsg = autoRun
      ? `🎉 Programa "${projName}" gravado e em execução no Robô EV3!`
      : `💾 Programa "${projName}" salvo com sucesso na pasta do Robô EV3!`;

    onProgress(100, finalMsg);
    this.onLog(finalMsg, 'success');

    return { success: true, rbfSize: rbfBytes.length, fileUploaded, rbfRemotePath };
  }
}

window.EV3HardwareManager = EV3HardwareManager;
