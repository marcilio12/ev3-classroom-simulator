# LEGO® MINDSTORMS® Education EV3 Classroom - Simulador Web

Simulador educacional e ambiente de programação em blocos (baseado no Scratch 3.0) 100% fiel à interface do **LEGO® MINDSTORMS® Education EV3 Classroom (v1.5.3)**, equipado com física 2D em tempo real, sensores integrados e desafios gamificados.

🌐 **Acesse online:** [https://marcilio12.github.io/ev3-classroom-simulator/](https://marcilio12.github.io/ev3-classroom-simulator/)

---

## 🚀 Recursos Principais

- **Ambiente de Programação em Blocos (Scratch 3.0 / EV3)**:
  - Blocos com encaixes suaves estilo quebra-cabeça (puzzle notch), cores e ícones oficiais.
  - Categorias completas: Motores, Movimento, Monitor, Som, Eventos, Controle, Sensores e Operadores.
  - Suporte a blocos empilháveis (*stack*), chapéus de eventos (*hat*), blocos de condição losangulares (*boolean slots*), repórteres ovais e blocos de loop e condicionais em C (*c-blocks*).
  - Seleção em lote, arrastar para excluir com destaque na barra lateral, comentários adesivos e atalhos de teclado (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+D`, `Ctrl+A`, `Delete`).

- **Arena de Física 2D e Robô Base Motriz**:
  - Modelo do robô com dois motores de tração independentes (portas B e C), garras (porta A), sensor de cor/luz (porta 3), sensor ultrassônico (porta 4), sensor de toque (porta 1) e giroscópio (porta 2).
  - Pop-up fiel de conexão do EV3 antes de iniciar a simulação na arena.
  - Obstáculos, linhas de rastreamento com curvas, caixas manipuláveis e zonas de entrega.

- **Aba de Desafios Gamificados**:
  - Trajetos simples sem sensores para treino de precisão de motores.
  - Desafios com desvio de obstáculos utilizando sensor ultrassônico.
  - Seguidor de linha com leitura de refletância e detecção de cor.
  - Coleta e transporte de caixas para zonas-alvo.

- **Gerenciador de Projetos Multi-Abas**:
  - Salva automaticamente no navegador (`localStorage`).
  - Importação e exportação de projetos no formato `.json`.

---

## 🛠️ Como Executar Localmente

Como o projeto é construído em HTML5, CSS3 e JavaScript puro (Vanilla JS), nenhuma etapa de compilação ou instalação de pacotes externos é necessária:

1. Clone o repositório:
   ```bash
   git clone https://github.com/marcilio12/ev3-classroom-simulator.git
   cd ev3-classroom-simulator
   ```

2. Abra o arquivo `index.html` em qualquer navegador moderno (Chrome, Edge, Firefox, Safari) ou use uma extensão de servidor local (ex.: *Live Server* do VS Code).

---

## 📄 Licença

Desenvolvido para fins educacionais e pedagógicos no ensino de robótica e programação.
LEGO® e MINDSTORMS® são marcas registradas do Grupo LEGO.
